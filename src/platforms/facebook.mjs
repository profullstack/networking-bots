import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import axios from 'axios';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

let browser;
let page;
let fbApiAccessToken;

// Initialize Facebook API client
async function initFacebookAPI() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  
  if (!appId || !appSecret) {
    logger.warn('Facebook API credentials not found in environment variables');
    return null;
  }
  
  try {
    // Get app access token
    const response = await axios.get(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`
    );
    
    if (response.data && response.data.access_token) {
      logger.log('Facebook API access token obtained successfully');
      return response.data.access_token;
    } else {
      logger.warn('Failed to obtain Facebook API access token');
      return null;
    }
  } catch (error) {
    logger.error(`Error initializing Facebook API: ${error.message}`);
    return null;
  }
}

/**
 * Initialize Facebook platform
 */
export async function initialize() {
  try {
    // Initialize Facebook API
    fbApiAccessToken = await initFacebookAPI();
    
    // Apply stealth plugin to avoid detection
    puppeteer.use(StealthPlugin());
    
    // Get a proxy for the session
    const proxy = await proxyManager.getNextProxy();
    
    // Launch browser with proxy and stealth settings
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        `--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
      ]
    };
    
    // Add proxy if available
    if (proxy) {
      launchOptions.args.push(`--proxy-server=${proxy.proxy_address}:${proxy.port}`);
      logger.log(`Using proxy: ${proxy.proxy_address}:${proxy.port}`);
    }
    
    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();
    
    // Set proxy authentication if needed
    if (proxy && proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      });
    }
    
    // Set viewport to simulate a real device
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });
    
    // Enable request interception to modify headers
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Modify headers to look more like a real browser
      const headers = request.headers();
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['sec-ch-ua'] = '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"';
      headers['sec-ch-ua-mobile'] = '?0';
      headers['sec-ch-ua-platform'] = '"macOS"';
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'none';
      headers['Sec-Fetch-User'] = '?1';
      headers['Upgrade-Insecure-Requests'] = '1';
      
      request.continue({ headers });
    });
    
    // Visit Facebook to warm up the session
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    logger.log('Facebook initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize Facebook: ${error.message}`);
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Find potential users based on search terms
 * @param {Array<string>} searchTerms - List of search terms to find users
 * @returns {Promise<Array<string>>} - List of usernames or profile IDs
 */
export async function findPotentialUsers(searchTerms) {
  if (!browser || !page) {
    throw new Error('Facebook browser not initialized');
  }
  
  const users = [];
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('facebook_search');
    if (!canProceed) {
      logger.warn('Rate limit reached for Facebook search');
      return users;
    }
    
    // Process each search term
    for (const term of searchTerms) {
      logger.log(`Searching Facebook for term: ${term}`);
      
      // Wait before each search to avoid detection
      await rateLimiter.waitForNextAction();
      
      try {
        // Navigate to Facebook search page
        const encodedTerm = encodeURIComponent(term);
        await page.goto(`https://www.facebook.com/search/people/?q=${encodedTerm}`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        // Simulate human behavior
        await humanBehavior.simulatePageView(page);
        
        // Scroll to load more content
        await humanBehavior.simulateScroll(page);
        
        // Wait for user results to load
        await page.waitForSelector('div[role="article"]', { timeout: 10000 })
          .catch(() => logger.warn(`No user results found for "${term}"`));
        
        // Extract profile IDs from search results
        const foundUsers = await page.evaluate(() => {
          const userElements = document.querySelectorAll('div[role="article"]');
          return Array.from(userElements).map(el => {
            // Find the profile link
            const profileLink = el.querySelector('a[href*="/user/"], a[href*="/profile.php?id="], a[href*="facebook.com/"]');
            if (!profileLink) return null;
            
            const href = profileLink.getAttribute('href');
            if (!href) return null;
            
            // Extract profile ID or username
            if (href.includes('/profile.php?id=')) {
              // Extract numeric ID
              const match = href.match(/id=(\d+)/);
              return match ? match[1] : null;
            } else {
              // Extract username
              const parts = href.split('/');
              return parts[parts.length - 1] || parts[parts.length - 2] || null;
            }
          }).filter(Boolean);
        });
        
        if (foundUsers.length > 0) {
          logger.log(`Found ${foundUsers.length} potential users for term "${term}"`);
          users.push(...foundUsers);
        }
        
        // Increment search count
        await rateLimiter.incrementActionCount('facebook_search');
        
      } catch (error) {
        logger.error(`Error searching Facebook for term "${term}": ${error.message}`);
        
        // Check if we're being rate limited
        const isRateLimited = await rateLimiter.checkForRateLimit(page);
        if (isRateLimited) {
          // If rate limited, break the loop and return current results
          break;
        }
      }
      
      // Random delay between searches
      await wait(5000 + Math.random() * 5000);
    }
    
    // Remove duplicates and filter out obvious bot accounts
    const filteredUsers = [...new Set(users)].filter(userId => {
      // If it's a numeric ID, we can't filter by name
      if (/^\d+$/.test(userId)) return true;
      
      const lowerUserId = userId.toLowerCase();
      return !lowerUserId.includes('bot') && 
             !lowerUserId.includes('official') && 
             !lowerUserId.includes('facebook') &&
             !lowerUserId.includes('page');
    });
    
    return filteredUsers;
    
  } catch (error) {
    logger.error(`Error finding Facebook users: ${error.message}`);
    return [];
  }
}

/**
 * Message a Facebook user
 * @param {string} userId - Facebook user ID or username to message
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
export async function messageUser(userId, message) {
  if (!browser || !page) {
    throw new Error('Facebook browser not initialized');
  }
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('facebook_message');
    if (!canProceed) {
      logger.warn('Rate limit reached for Facebook messaging');
      return false;
    }
    
    logger.log(`Attempting to message Facebook user: ${userId}`);
    
    // Determine the profile URL based on the userId format
    let profileUrl;
    if (/^\d+$/.test(userId)) {
      profileUrl = `https://www.facebook.com/profile.php?id=${userId}`;
    } else {
      profileUrl = `https://www.facebook.com/${userId}`;
    }
    
    // Navigate to the user's profile
    await page.goto(profileUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    
    // Look for the message button
    const messageButtonExists = await page.evaluate(() => {
      const messageButtons = Array.from(document.querySelectorAll('div[role="button"], a[role="button"], button'));
      return messageButtons.some(button => {
        const text = button.textContent.toLowerCase();
        return text.includes('message') || text.includes('send message');
      });
    });
    
    if (!messageButtonExists) {
      logger.warn(`Could not find message button for user ${userId}`);
      return false;
    }
    
    // Click the message button
    await page.evaluate(() => {
      const messageButtons = Array.from(document.querySelectorAll('div[role="button"], a[role="button"], button'));
      const messageButton = messageButtons.find(button => {
        const text = button.textContent.toLowerCase();
        return text.includes('message') || text.includes('send message');
      });
      if (messageButton) messageButton.click();
    });
    
    // Wait for the message dialog to appear
    await wait(3000);
    
    // Check if the message dialog is open
    const messageDialogOpen = await page.evaluate(() => {
      return document.querySelector('div[role="dialog"]') !== null;
    });
    
    if (!messageDialogOpen) {
      logger.warn(`Message dialog did not open for user ${userId}`);
      return false;
    }
    
    // Type the message
    await page.evaluate((msg) => {
      const textareas = document.querySelectorAll('div[contenteditable="true"], textarea');
      if (textareas.length > 0) {
        textareas[0].focus();
        textareas[0].textContent = msg;
      }
    }, message);
    
    await wait(1000);
    
    // Click the send button
    await page.evaluate(() => {
      const sendButtons = Array.from(document.querySelectorAll('div[role="button"], button'));
      const sendButton = sendButtons.find(button => {
        const text = button.textContent.toLowerCase();
        return text.includes('send');
      });
      if (sendButton) sendButton.click();
    });
    
    // Wait for the message to be sent
    await wait(2000);
    
    // If we have Facebook API access, use it for messaging
    if (fbApiAccessToken) {
      logger.log(`Using Facebook API for messaging with token ${fbApiAccessToken.substring(0, 10)}...`);
      
      try {
        // Handle the OAuth flow for Facebook messaging
        // For messaging, Facebook requires a Page Access Token with proper permissions
        // 1. Check if we have a valid token, if not initiate the OAuth flow
        // 2. Verify token permissions and refresh if needed
        // 3. Get page access token which has the required permissions for messaging
        
        // Check if token is valid or expired
        const tokenInfo = await this.verifyAccessToken(fbApiAccessToken);
        if (!tokenInfo.isValid) {
          logger.warn('Facebook access token is invalid or expired, refreshing...');
          fbApiAccessToken = await this.refreshAccessToken();
          if (!fbApiAccessToken) {
            throw new Error('Failed to refresh Facebook access token');
          }
        }
        
        // Get the page ID associated with the app
        const pagesResponse = await axios.get(
          `https://graph.facebook.com/v18.0/me/accounts?access_token=${fbApiAccessToken}`
        );
        
        let pageAccessToken = fbApiAccessToken;
        let pageId = null;
        
        if (pagesResponse.data && pagesResponse.data.data && pagesResponse.data.data.length > 0) {
          // Use the first page associated with the app
          pageId = pagesResponse.data.data[0].id;
          pageAccessToken = pagesResponse.data.data[0].access_token;
          logger.log(`Using page ID: ${pageId} for messaging`);
        } else {
          logger.warn('No Facebook pages found associated with this app. Using app access token instead.');
        }
        
        // Send the message using the Facebook Graph API
        const response = await axios.post(
          `https://graph.facebook.com/v18.0/me/messages?access_token=${pageAccessToken}`,
          {
            recipient: { id: userId },
            message: { 
              text: message,
              // You can also add quick replies, templates, or attachments here
              // quick_replies: [
              //   {
              //     content_type: "text",
              //     title: "Yes, I'm interested",
              //     payload: "YES_INTERESTED"
              //   },
              //   {
              //     content_type: "text",
              //     title: "Tell me more",
              //     payload: "TELL_MORE"
              //   }
              // ]
            }
          }
        );
        
        if (response.data && response.data.message_id) {
          logger.log(`Message sent successfully via Facebook API. Message ID: ${response.data.message_id}`);
          return true;
        } else {
          logger.warn('Message sent via Facebook API but no message ID returned. Falling back to browser method.');
          // Continue with browser-based messaging as fallback
        }
      } catch (apiError) {
        logger.error(`Error using Facebook API for messaging: ${apiError.message}`);
        logger.log('Falling back to browser-based messaging method');
        // Continue with browser-based messaging as fallback
      }
    }
    
    // Increment message count
    await rateLimiter.incrementActionCount('facebook_message');
    
    logger.log(`Message sent to Facebook user ${userId}`);
    return true;
    
  } catch (error) {
    logger.error(`Error messaging Facebook user ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * Close the Facebook browser instance
 */
export async function cleanup() {
  if (browser) {
    try {
      await browser.close();
      browser = null;
      page = null;
      logger.log('Facebook browser closed');
    } catch (error) {
      logger.error(`Error closing Facebook browser: ${error.message}`);
    }
  }
}

/**
 * Verify if the Facebook access token is valid and has the required permissions
 * @param {string} accessToken - The Facebook access token to verify
 * @returns {Promise<Object>} - Object containing validity status and permissions
 */
export async function verifyAccessToken(accessToken) {
  try {
    // Check token debug info using Graph API
    const response = await axios.get(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    );
    
    if (response.data && response.data.data) {
      const tokenData = response.data.data;
      const isValid = tokenData.is_valid === true;
      const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at * 1000) : null;
      const isExpired = expiresAt ? new Date() > expiresAt : false;
      const scopes = tokenData.scopes || [];
      
      // Check if token has required permissions for messaging
      const hasMessagingPermissions = scopes.includes('pages_messaging') || 
                                     scopes.includes('pages_messaging_subscriptions');
      
      return {
        isValid: isValid && !isExpired,
        isExpired,
        expiresAt,
        hasMessagingPermissions,
        scopes
      };
    }
    
    return { isValid: false };
  } catch (error) {
    logger.error(`Error verifying Facebook access token: ${error.message}`);
    return { isValid: false, error: error.message };
  }
}

/**
 * Refresh the Facebook access token using the app credentials and refresh token
 * @returns {Promise<string|null>} - New access token or null if refresh failed
 */
export async function refreshAccessToken() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const refreshToken = process.env.FACEBOOK_REFRESH_TOKEN;
  
  if (!appId || !appSecret) {
    logger.error('Facebook API credentials not found in environment variables');
    return null;
  }
  
  try {
    // If we have a refresh token, use it to get a new access token
    if (refreshToken) {
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${refreshToken}`
      );
      
      if (response.data && response.data.access_token) {
        logger.log('Facebook access token refreshed successfully');
        return response.data.access_token;
      }
    }
    
    // If no refresh token or refresh failed, try to get a new app access token
    return await initFacebookAPI();
  } catch (error) {
    logger.error(`Error refreshing Facebook access token: ${error.message}`);
    return null;
  }
}

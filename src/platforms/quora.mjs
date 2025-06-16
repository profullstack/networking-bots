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
let isLoggedIn = false;

/**
 * Initialize Quora API client if credentials are available
 * Note: Quora doesn't have an official public API, so this is mainly for future expansion
 */
async function initQuoraAPI() {
  const apiKey = process.env.QUORA_API_KEY;
  const apiSecret = process.env.QUORA_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    logger.warn('Quora API credentials not found in environment variables');
    return null;
  }
  
  try {
    logger.log('Quora API credentials found - initializing API client');
    // This is a placeholder for future API implementation
    // Currently, Quora doesn't offer a public API
    
    return {
      apiKey,
      apiSecret,
      initialized: true
    };
  } catch (error) {
    logger.error(`Error initializing Quora API: ${error.message}`);
    return null;
  }
}

/**
 * Attempt to login to Quora with provided credentials
 * @returns {Promise<boolean>} Login success status
 */
async function loginToQuora() {
  const username = process.env.QUORA_USERNAME;
  const password = process.env.QUORA_PASSWORD;
  
  if (!username || !password) {
    logger.warn('Quora login credentials not found in environment variables');
    return false;
  }
  
  try {
    logger.log('Attempting to log in to Quora...');
    
    // Navigate to Quora login page
    await page.goto('https://www.quora.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Check if already logged in by looking for user menu
    const alreadyLoggedIn = await page.evaluate(() => {
      return document.querySelector('[aria-label="Your profile"]') !== null;
    });
    
    if (alreadyLoggedIn) {
      logger.log('Already logged in to Quora');
      return true;
    }
    
    // Wait for login options to appear
    await page.waitForSelector('button[type="submit"], a.login_form_login_button', { timeout: 10000 });
    
    // Click on email login option if available
    const emailLoginButton = await page.$('button:has-text("Continue with Email")');
    if (emailLoginButton) {
      await emailLoginButton.click();
      await wait(1000);
    }
    
    // Enter email/username
    await humanBehavior.simulateTyping(page, 'input[type="email"], input[name="email"]', username);
    
    // Check if we need to click a "Next" button
    const nextButton = await page.$('button:has-text("Next")');
    if (nextButton) {
      await nextButton.click();
      await wait(2000);
    }
    
    // Enter password
    const passwordSelector = 'input[type="password"], input[name="password"]';
    await page.waitForSelector(passwordSelector, { visible: true, timeout: 10000 });
    await humanBehavior.simulateTyping(page, passwordSelector, password);
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for navigation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
      .catch(() => logger.warn('Navigation timeout after login - continuing anyway'));
    
    // Verify login success
    const loginSuccessful = await page.evaluate(() => {
      return document.querySelector('[aria-label="Your profile"]') !== null;
    });
    
    if (loginSuccessful) {
      logger.log('Successfully logged in to Quora');
      return true;
    } else {
      logger.warn('Failed to log in to Quora - check credentials');
      return false;
    }
    
  } catch (error) {
    logger.error(`Error logging in to Quora: ${error.message}`);
    return false;
  }
}

/**
 * Initialize Quora platform
 * @returns {Promise<boolean>} Initialization success status
 */
export async function initialize() {
  try {
    // Initialize puppeteer with stealth plugin to avoid detection
    puppeteer.use(StealthPlugin());
    
    // Get a proxy for the session
    let proxy = null;
    try {
      proxy = await proxyManager.getNextProxy();
    } catch (error) {
      logger.warn(`Unable to get proxy: ${error.message}`);
      logger.warn('Will continue without proxy');
    }
    
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
    } else {
      logger.info('No proxy available, continuing without proxy');
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
    
    // Visit Quora to warm up the session
    await page.goto('https://www.quora.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    // Try logging in if credentials are available
    isLoggedIn = await loginToQuora();
    
    logger.log(`Quora initialized successfully. Login status: ${isLoggedIn ? 'Logged in' : 'Not logged in'}`);
    return true;
  } catch (error) {
    logger.error(`Failed to initialize Quora: ${error.message}`);
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Find potential users based on search terms
 * @param {Array<string>} searchTerms - List of search terms to find users
 * @returns {Promise<Array<string>>} - List of usernames
 */
export async function findPotentialUsers(searchTerms) {
  if (!browser || !page) {
    throw new Error('Quora browser not initialized');
  }
  
  const users = [];
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('quora_search');
    if (!canProceed) {
      logger.warn('Rate limit reached for Quora search');
      return users;
    }
    
    // Process each search term
    for (const term of searchTerms) {
      logger.log(`Searching Quora for term: ${term}`);
      
      // Wait before each search to avoid detection
      await rateLimiter.waitForNextAction();
      
      try {
        // Navigate to Quora search page
        const encodedTerm = encodeURIComponent(term);
        await page.goto(`https://www.quora.com/search?q=${encodedTerm}&type=profile`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        // Simulate human behavior
        await humanBehavior.simulatePageView(page);
        
        // Scroll to load more content
        await humanBehavior.simulateScroll(page);
        
        // Wait for user profile search results to load
        // Quora's user/profile search results can have various selectors depending on the page structure
        await page.waitForSelector('.q-box.qu-borderBottom, .q-profile-card', { timeout: 10000 })
          .catch(() => logger.warn(`No user results found for "${term}"`));
        
        // Extract usernames from search results
        const foundUsers = await page.evaluate(() => {
          // Target profile cards or user cells in search results
          let userElements = document.querySelectorAll('.q-profile-card, .q-box.qu-borderBottom a[href^="/profile/"]');
          
          // If we don't find any with the first selector, try alternatives
          if (userElements.length === 0) {
            userElements = document.querySelectorAll('a[href^="/profile/"], .qu-hover--textDecoration--underline[href^="/profile/"]');
          }
          
          return Array.from(userElements).map(el => {
            // Get profile URL
            const href = el.getAttribute('href');
            
            // Extract username from URL
            if (href && href.startsWith('/profile/')) {
              return href.replace('/profile/', '').split('?')[0];
            } else {
              // For elements that contain a link to the profile
              const link = el.querySelector('a[href^="/profile/"]');
              if (link) {
                return link.getAttribute('href').replace('/profile/', '').split('?')[0];
              }
            }
            return null;
          }).filter(Boolean);
        });
        
        if (foundUsers.length > 0) {
          logger.log(`Found ${foundUsers.length} potential users for term "${term}"`);
          users.push(...foundUsers);
        }
        
        // Increment search count
        await rateLimiter.incrementActionCount('quora_search');
        
      } catch (error) {
        logger.error(`Error searching Quora for term "${term}": ${error.message}`);
        
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
    
    // Remove duplicates and filter out obvious bot/official accounts
    const filteredUsers = [...new Set(users)].filter(username => {
      const lowerUsername = username.toLowerCase();
      return !lowerUsername.includes('bot') && 
             !lowerUsername.includes('official') && 
             !lowerUsername.includes('quora');
    });
    
    return filteredUsers;
    
  } catch (error) {
    logger.error(`Error finding Quora users: ${error.message}`);
    return [];
  }
}

/**
 * Message a Quora user
 * @param {string} username - Quora username to message
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
export async function messageUser(username, message) {
  if (!browser || !page) {
    throw new Error('Quora browser not initialized');
  }
  
  logger.log(`[${dayjs().format('HH:mm')}] Attempting to message Quora user: ${username}`);
  
  try {
    // Check if logged in - messaging requires login
    if (!isLoggedIn) {
      logger.warn('Cannot message Quora user - not logged in');
      return false;
    }
    
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('quora_message');
    if (!canProceed) {
      logger.warn('Rate limit reached for Quora messaging');
      return false;
    }
    
    // Wait before action to avoid detection
    await rateLimiter.waitForNextAction();
    
    // Navigate to user's profile
    await page.goto(`https://www.quora.com/profile/${username}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    // Check if the profile exists
    const profileExists = await page.evaluate(() => {
      return !document.body.innerText.includes('Page Not Found');
    });
    
    if (!profileExists) {
      logger.warn(`Quora user ${username} not found`);
      return false;
    }
    
    // Attempt to find Message button
    const messageButtonExists = await page.evaluate(() => {
      const messageButton = Array.from(document.querySelectorAll('button, a')).find(el => 
        el.textContent.trim().toLowerCase() === 'message' || 
        el.textContent.trim().toLowerCase().includes('message')
      );
      
      if (messageButton) {
        messageButton.click();
        return true;
      }
      return false;
    });
    
    if (!messageButtonExists) {
      // If we can't find a direct message button, try to interact with the user through a different approach
      logger.warn(`Could not find message button for Quora user ${username}`);
      
      // Try to find a way to follow the user instead
      const followButtonExists = await page.evaluate(() => {
        const followButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
          btn.textContent.trim().toLowerCase() === 'follow' ||
          btn.textContent.trim().toLowerCase().includes('follow')
        );
        
        if (followButtons.length > 0) {
          followButtons[0].click();
          return true;
        }
        return false;
      });
      
      if (followButtonExists) {
        logger.log(`Followed Quora user ${username}`);
        await wait(2000);
        
        // Since we can't message directly, try to comment on a post instead
        return await commentOnUserPost(username, message);
      } else {
        logger.warn(`Could not interact with Quora user ${username}`);
        return false;
      }
    }
    
    // Wait for the message dialog to appear
    await page.waitForSelector('.modal-dialog, .modal-content, textarea, div[contenteditable=true]', { timeout: 10000 })
      .catch(() => logger.warn(`Message dialog for ${username} did not appear`));
    
    await wait(1000);
    
    // Try to find the message input field - Quora might use different selectors
    const messageInputSelector = await page.evaluate(() => {
      // Try different possible selectors for the message input
      const possibilities = [
        'textarea',
        'div[contenteditable=true]',
        '.editor-input',
        '.message-input',
        '.messaging-input'
      ];
      
      for (const selector of possibilities) {
        const element = document.querySelector(selector);
        if (element) return selector;
      }
      return null;
    });
    
    if (!messageInputSelector) {
      logger.warn(`Could not find message input for Quora user ${username}`);
      return false;
    }
    
    // Type message
    await humanBehavior.simulateTyping(page, messageInputSelector, message);
    
    // Find and click send button
    const sendSuccess = await page.evaluate(() => {
      // Look for send button with various possible selectors
      const sendButton = 
        document.querySelector('button[type="submit"]') || 
        Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim().toLowerCase() === 'send' ||
          btn.textContent.trim().toLowerCase().includes('send')
        );
      
      if (sendButton) {
        sendButton.click();
        return true;
      }
      return false;
    });
    
    if (!sendSuccess) {
      logger.warn(`Could not find send button for Quora user ${username}`);
      return false;
    }
    
    // Wait for the message to be sent
    await wait(2000);
    
    // Increment message count
    await rateLimiter.incrementActionCount('quora_message');
    
    logger.log(`\u2705 Message sent to Quora user ${username}`);
    return true;
    
  } catch (error) {
    logger.error(`Error messaging Quora user ${username}: ${error.message}`);
    
    // Check if we're being rate limited
    await rateLimiter.checkForRateLimit(page);
    
    return false;
  }
}

/**
 * Helper function to comment on a user's post if direct messaging isn't available
 * @param {string} username - Quora username
 * @param {string} message - Message to send as comment
 * @returns {Promise<boolean>} - Success status
 */
async function commentOnUserPost(username, message) {
  try {
    logger.log(`Attempting to comment on a post by ${username}`);
    
    // Find the first post/answer by the user
    const postFound = await page.evaluate(() => {
      // Try different selectors that might contain user posts/answers
      const postElements = document.querySelectorAll('.q-box.qu-borderBottom, .q-text, .qu-userContent');
      
      // Find the first post with a comment or answer field
      for (const post of Array.from(postElements).slice(0, 5)) { // Check first 5 posts
        post.scrollIntoView();
        return true;
      }
      
      return false;
    });
    
    if (!postFound) {
      logger.warn(`No posts found for Quora user ${username}`);
      return false;
    }
    
    // Scroll to load more content and find comment sections
    await humanBehavior.simulateScroll(page);
    
    // Look for add comment button
    await wait(1000);
    const commentButtonFound = await page.evaluate(() => {
      // Find any button that looks like a comment button
      const commentButtons = Array.from(document.querySelectorAll('button')).filter(btn => 
        btn.textContent.trim().toLowerCase().includes('comment') ||
        btn.textContent.trim() === 'Add comment' ||
        btn.getAttribute('aria-label')?.includes('comment')
      );
      
      if (commentButtons.length > 0) {
        commentButtons[0].click();
        return true;
      }
      return false;
    });
    
    if (!commentButtonFound) {
      logger.warn(`Could not find comment button for ${username}'s post`);
      return false;
    }
    
    // Wait for comment input to appear
    await page.waitForSelector('textarea, div[contenteditable=true], .comment-input', { timeout: 5000 })
      .catch(() => logger.warn('Comment input field did not appear'));
    
    await wait(1000);
    
    // Find comment input
    const commentInputSelector = await page.evaluate(() => {
      const possibilities = [
        'textarea',
        'div[contenteditable=true]',
        '.comment-input',
        '.comment-editor'
      ];
      
      for (const selector of possibilities) {
        const element = document.querySelector(selector);
        if (element) return selector;
      }
      return null;
    });
    
    if (!commentInputSelector) {
      logger.warn(`Could not find comment input for ${username}'s post`);
      return false;
    }
    
    // Type comment
    await humanBehavior.simulateTyping(page, commentInputSelector, `@${username} ${message}`);
    
    // Submit comment
    const commentSubmitted = await page.evaluate(() => {
      const submitButton = 
        document.querySelector('button[type="submit"]') ||
        Array.from(document.querySelectorAll('button')).find(btn => 
          btn.textContent.trim().toLowerCase() === 'add comment' ||
          btn.textContent.trim().toLowerCase() === 'post' ||
          btn.textContent.trim().toLowerCase() === 'submit'
        );
      
      if (submitButton) {
        submitButton.click();
        return true;
      }
      return false;
    });
    
    if (commentSubmitted) {
      logger.log(`\u2705 Commented on ${username}'s post`);
      
      // Increment message count (uses same limit as direct messages)
      await rateLimiter.incrementActionCount('quora_message');
      
      return true;
    } else {
      logger.warn(`Could not submit comment on ${username}'s post`);
      return false;
    }
    
  } catch (error) {
    logger.error(`Error commenting on ${username}'s post: ${error.message}`);
    return false;
  }
}

/**
 * Close the Quora browser instance
 */
export async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    logger.log('Quora browser closed');
  }
}

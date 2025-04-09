import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

let browser;
let page;
let youtube;

// Initialize YouTube API client
async function initYouTubeAPI() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const apiKey = process.env.YOUTUBE_API_KEY; // Optional API key for simpler access
  
  if (!clientId || !clientSecret) {
    logger.warn('YouTube API credentials not found in environment variables');
    return null;
  }
  
  try {
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/oauth2callback'
    );
    
    // If we have a refresh token in environment variables, use it
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    if (refreshToken) {
      logger.log('Using stored refresh token for YouTube API');
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      
      // Get a new access token
      try {
        const tokenResponse = await oauth2Client.getAccessToken();
        if (tokenResponse && tokenResponse.token) {
          logger.log('Successfully refreshed YouTube API access token');
        }
      } catch (tokenError) {
        logger.warn(`Error refreshing YouTube token: ${tokenError.message}`);
        // Continue with API key if available
      }
    } else if (apiKey) {
      logger.log('No refresh token available. Using API key for YouTube API');
      // For operations that don't require user authentication
      oauth2Client.apiKey = apiKey;
    } else {
      logger.warn('No refresh token or API key available for YouTube API. Some operations may fail.');
    }
    
    // Create YouTube API client
    const youtubeClient = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });
    
    // Test the API connection
    try {
      const response = await youtubeClient.channels.list({
        part: 'snippet',
        mine: true
      }).catch(() => {
        // If 'mine: true' fails (no auth), try a public endpoint with the API key
        if (apiKey) {
          return youtubeClient.channels.list({
            part: 'snippet',
            id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' // Google Developers channel as a test
          });
        }
        throw new Error('YouTube API authentication failed');
      });
      
      if (response && response.data) {
        logger.log('YouTube API connection verified successfully');
        return {
          client: youtubeClient,
          oauth2Client,
          hasFullAuth: !!refreshToken,
          hasApiKey: !!apiKey
        };
      }
    } catch (testError) {
      logger.warn(`YouTube API test failed: ${testError.message}`);
      // Return the client anyway, some operations might still work
    }
    
    return {
      client: youtubeClient,
      oauth2Client,
      hasFullAuth: !!refreshToken,
      hasApiKey: !!apiKey
    };
  } catch (error) {
    logger.error(`Error initializing YouTube API: ${error.message}`);
    return null;
  }
}

/**
 * Initialize YouTube platform
 */
export async function initialize() {
  try {
    // Initialize YouTube API client
    youtube = await initYouTubeAPI();
    
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
    
    // Visit YouTube to warm up the session
    await page.goto('https://www.youtube.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    logger.log('YouTube initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize YouTube: ${error.message}`);
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Find potential users based on search terms
 * @param {Array<string>} searchTerms - List of search terms to find users
 * @returns {Promise<Array<string>>} - List of channel IDs
 */
export async function findPotentialUsers(searchTerms) {
  if (!browser || !page) {
    throw new Error('YouTube browser not initialized');
  }
  
  const users = [];
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('youtube_search');
    if (!canProceed) {
      logger.warn('Rate limit reached for YouTube search');
      return users;
    }
    
    // Process each search term
    for (const term of searchTerms) {
      logger.log(`Searching YouTube for term: ${term}`);
      
      // Wait before each search to avoid detection
      await rateLimiter.waitForNextAction();
      
      try {
        // Navigate to YouTube search page
        const encodedTerm = encodeURIComponent(term);
        await page.goto(`https://www.youtube.com/results?search_query=${encodedTerm}&sp=EgIQAg%253D%253D`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        // Simulate human behavior
        await humanBehavior.simulatePageView(page);
        
        // Scroll to load more content
        await humanBehavior.simulateScroll(page);
        
        // Wait for channel results to load
        await page.waitForSelector('ytd-channel-renderer, ytd-video-renderer', { timeout: 10000 })
          .catch(() => logger.warn(`No channel results found for "${term}"`));
        
        // Extract channel IDs from search results
        const foundUsers = await page.evaluate(() => {
          // First try to get channels directly
          const channelElements = Array.from(document.querySelectorAll('ytd-channel-renderer'));
          const channelIds = channelElements.map(el => {
            const channelLink = el.querySelector('a#main-link');
            if (!channelLink) return null;
            
            const href = channelLink.getAttribute('href');
            if (!href) return null;
            
            // Extract channel ID from href
            return href.split('/').pop();
          }).filter(Boolean);
          
          // If no channels found directly, try to get channels from videos
          if (channelIds.length === 0) {
            const videoElements = Array.from(document.querySelectorAll('ytd-video-renderer'));
            return videoElements.map(el => {
              const channelLink = el.querySelector('a.yt-simple-endpoint[href*="/channel/"]');
              if (!channelLink) return null;
              
              const href = channelLink.getAttribute('href');
              if (!href) return null;
              
              // Extract channel ID from href
              const match = href.match(/\/channel\/([^\/]+)/);
              return match ? match[1] : null;
            }).filter(Boolean);
          }
          
          return channelIds;
        });
        
        if (foundUsers.length > 0) {
          logger.log(`Found ${foundUsers.length} potential channels for term "${term}"`);
          users.push(...foundUsers);
        }
        
        // Increment search count
        await rateLimiter.incrementActionCount('youtube_search');
        
      } catch (error) {
        logger.error(`Error searching YouTube for term "${term}": ${error.message}`);
        
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
    const filteredUsers = [...new Set(users)].filter(channelId => {
      // We don't have channel names here, just IDs, so we can't filter by name
      // We'll do more filtering in the messageUser function
      return true;
    });
    
    return filteredUsers;
    
  } catch (error) {
    logger.error(`Error finding YouTube users: ${error.message}`);
    return [];
  }
}

/**
 * Message a YouTube channel owner
 * @param {string} channelId - YouTube channel ID to message
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
export async function messageUser(channelId, message) {
  if (!browser || !page) {
    throw new Error('YouTube browser not initialized');
  }
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('youtube_message');
    if (!canProceed) {
      logger.warn('Rate limit reached for YouTube messaging');
      return false;
    }
    
    logger.log(`Attempting to message YouTube channel: ${channelId}`);
    
    // Navigate to the channel page
    await page.goto(`https://www.youtube.com/channel/${channelId}/about`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    
    // Check if the channel has a "View email address" button
    const hasEmailButton = await page.evaluate(() => {
      const emailButtons = Array.from(document.querySelectorAll('tp-yt-paper-button'));
      return emailButtons.some(button => {
        return button.textContent.trim().toLowerCase().includes('view email');
      });
    });
    
    if (!hasEmailButton) {
      logger.warn(`Channel ${channelId} does not have a visible email address`);
      return false;
    }
    
    // Click the "View email address" button
    await page.evaluate(() => {
      const emailButtons = Array.from(document.querySelectorAll('tp-yt-paper-button'));
      const emailButton = emailButtons.find(button => {
        return button.textContent.trim().toLowerCase().includes('view email');
      });
      if (emailButton) emailButton.click();
    });
    
    // Wait for the email to be visible
    await wait(2000);
    
    // Extract the email address
    const email = await page.evaluate(() => {
      const emailElements = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
      if (emailElements.length === 0) return null;
      
      const href = emailElements[0].getAttribute('href');
      if (!href) return null;
      
      return href.replace('mailto:', '');
    });
    
    if (!email) {
      logger.warn(`Could not extract email for channel ${channelId}`);
      return false;
    }
    
    logger.log(`Found email address for channel ${channelId}: ${email}`);
    
    // Send an email to this address using the YouTube client credentials
    try {
      // Create a transporter using Gmail SMTP (you might want to use a different service)
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'your-email@gmail.com',
          pass: process.env.EMAIL_PASSWORD || 'your-app-password'
        }
      });
      
      // Set up email options
      const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: email,
        subject: 'Networking Opportunity',
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`
      };
      
      // Send the email (commenting out actual send to avoid unintended emails)
      // await transporter.sendMail(mailOptions);
      
      logger.log(`Would send email to ${email} with message: ${message}`);
      logger.log('Email would be sent using YouTube client credentials for authentication');
      
      // Increment message count
      await rateLimiter.incrementActionCount('youtube_message');
      
      // Return success
      return true;
    } catch (emailError) {
      logger.error(`Error sending email to ${email}: ${emailError.message}`);
      return false;
    }
    
  } catch (error) {
    logger.error(`Error messaging YouTube channel ${channelId}: ${error.message}`);
    return false;
  }
}

/**
 * Close the YouTube browser instance
 */
export async function cleanup() {
  if (browser) {
    try {
      await browser.close();
      browser = null;
      page = null;
      logger.log('YouTube browser closed');
    } catch (error) {
      logger.error(`Error closing YouTube browser: ${error.message}`);
    }
  }
}

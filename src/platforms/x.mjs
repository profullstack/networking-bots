import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import { TwitterApi } from 'twitter-api-v2';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

let browser;
let page;
let twitterClient;

/**
 * Initialize Twitter API client
 * @returns {Promise<TwitterApi|null>} Twitter API client or null if initialization fails
 */
async function initTwitterAPI() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    logger.warn('X (Twitter) API credentials not found in environment variables');
    return null;
  }
  
  try {
    // Create Twitter API client with OAuth 1.0a authentication
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken: accessToken,
      accessSecret: accessSecret
    });
    
    // Verify credentials by making a test API call
    const verifyResponse = await client.v2.me();
    if (verifyResponse && verifyResponse.data) {
      logger.log(`X (Twitter) API initialized successfully. Connected as: ${verifyResponse.data.username}`);
      return client;
    } else {
      logger.warn('X (Twitter) API credentials verification failed');
      return null;
    }
  } catch (error) {
    logger.error(`Error initializing X (Twitter) API: ${error.message}`);
    return null;
  }
}

/**
 * Initialize X platform
 */
export async function initialize() {
  try {
    // Initialize Twitter API client
    twitterClient = await initTwitterAPI();
    
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
    
    // Visit X.com to warm up the session
    await page.goto('https://x.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    logger.log('X.com initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize X.com: ${error.message}`);
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
    throw new Error('X.com browser not initialized');
  }
  
  const users = [];
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('x_search');
    if (!canProceed) {
      logger.warn('Rate limit reached for X.com search');
      return users;
    }
    
    // Process each search term
    for (const term of searchTerms) {
      logger.log(`Searching X.com for term: ${term}`);
      
      // Wait before each search to avoid detection
      await rateLimiter.waitForNextAction();
      
      try {
        // Use the Nitter guest access approach for better scraping
        // Navigate to X.com search page
        const encodedTerm = encodeURIComponent(term);
        await page.goto(`https://x.com/search?q=${encodedTerm}&f=user`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        // Simulate human behavior
        await humanBehavior.simulatePageView(page);
        
        // Scroll to load more content
        await humanBehavior.simulateScroll(page);
        
        // Wait for user cards to load
        await page.waitForSelector('[data-testid="UserCell"]', { timeout: 10000 })
          .catch(() => logger.warn(`No user results found for "${term}"`));
        
        // Extract usernames from search results
        const foundUsers = await page.evaluate(() => {
          const userElements = document.querySelectorAll('[data-testid="UserCell"]');
          return Array.from(userElements).map(el => {
            // Find the username element
            const usernameEl = el.querySelector('[data-testid="User-Name"] a:nth-child(2)');
            if (!usernameEl) return null;
            
            // Extract username from href attribute
            const href = usernameEl.getAttribute('href');
            if (!href) return null;
            
            // Username is the part after the slash without the @
            return href.split('/').pop();
          }).filter(Boolean);
        });
        
        if (foundUsers.length > 0) {
          logger.log(`Found ${foundUsers.length} potential users for term "${term}"`);
          users.push(...foundUsers);
        }
        
        // Increment search count
        await rateLimiter.incrementActionCount('x_search');
        
      } catch (error) {
        logger.error(`Error searching X.com for term "${term}": ${error.message}`);
        
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
    const filteredUsers = [...new Set(users)].filter(username => {
      const lowerUsername = username.toLowerCase();
      return !lowerUsername.includes('bot') && 
             !lowerUsername.includes('official') && 
             !lowerUsername.includes('twitter') && 
             !lowerUsername.includes('x_') && 
             !lowerUsername.includes('news');
    });
    
    return filteredUsers;
    
  } catch (error) {
    logger.error(`Error finding X.com users: ${error.message}`);
    return [];
  }
}

/**
 * Message an X.com user
 * @param {string} username - X.com username to message
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
export async function messageUser(username, message) {
  logger.log(`[${dayjs().format('HH:mm')}] Attempting to message X.com user: ${username}`);
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('x_message');
    if (!canProceed) {
      logger.warn('Rate limit reached for X.com messaging');
      return false;
    }
    
    // Try using the Twitter API first if available
    if (twitterClient) {
      try {
        logger.log(`Attempting to message ${username} using Twitter API`);
        
        // Step 1: Find the user's ID from their username
        const userLookup = await twitterClient.v2.userByUsername(username);
        if (!userLookup.data) {
          logger.warn(`Could not find user ${username} via Twitter API`);
        } else {
          const userId = userLookup.data.id;
          logger.log(`Found user ${username} with ID: ${userId}`);
          
          // Step 2: Check if we can send a direct message to this user
          // This requires checking if they follow us or have DMs open
          const relationship = await twitterClient.v2.friendship(
            await twitterClient.v2.me().then(me => me.data.id),
            userId
          );
          
          if (relationship.data.following) {
            logger.log(`User ${username} is following us, can send DM`);
            
            // Step 3: Send the direct message
            const dmResponse = await twitterClient.v1.sendDm({
              recipient_id: userId,
              text: message
            });
            
            if (dmResponse && dmResponse.event) {
              logger.log(`Successfully sent DM to ${username} via Twitter API`);
              
              // Increment message count
              await rateLimiter.incrementActionCount('x_message');
              
              return true;
            }
          } else {
            logger.log(`User ${username} is not following us, cannot send DM via API`);
            // Try following them first
            await twitterClient.v2.follow(await twitterClient.v2.me().then(me => me.data.id), userId);
            logger.log(`Followed user ${username}, they may follow back later`);
          }
        }
      } catch (apiError) {
        logger.error(`Error using Twitter API to message ${username}: ${apiError.message}`);
        logger.log('Falling back to browser-based approach');
      }
    }
    
    // Fall back to browser-based approach if API fails or isn't available
    if (!browser || !page) {
      throw new Error('X.com browser not initialized');
    }
    
    // Wait before action to avoid detection
    await rateLimiter.waitForNextAction();
    
    // Navigate to user's profile
    await page.goto(`https://x.com/${username}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    // Check if the profile exists
    const profileExists = await page.evaluate(() => {
      return !document.body.innerText.includes('This account doesn\'t exist');
    });
    
    if (!profileExists) {
      logger.warn(`X.com user @${username} not found`);
      return false;
    }
    
    // X.com doesn't allow direct messaging without login
    // Instead, we'll try to follow the user and mention them in a tweet
    
    // Check if we can find the follow button
    const followButtonExists = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid="follow"]'));
      return buttons.length > 0;
    });
    
    if (followButtonExists) {
      // Click follow button
      await page.click('[data-testid="follow"]');
      logger.log(`Followed X.com user @${username}`);
      await wait(2000 + Math.random() * 2000);
    }
    
    // Navigate to compose tweet page
    await page.goto('https://x.com/compose/tweet', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Check if we're on the login page
    const isLoginPage = await page.evaluate(() => {
      return document.body.innerText.includes('Sign in to X');
    });
    
    if (isLoginPage) {
      logger.warn('Cannot compose tweet without login');
      return false;
    }
    
    // Try to compose a tweet mentioning the user
    try {
      // Wait for tweet composer to load
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
      
      // Type message
      await humanBehavior.simulateTyping(page, '[data-testid="tweetTextarea_0"]', `@${username} ${message}`);
      
      // Click tweet button
      await page.click('[data-testid="tweetButton"]');
      
      logger.log(`\u2705 Messaged X.com user @${username} via mention`);
    } catch (error) {
      logger.warn(`Could not tweet to @${username}: ${error.message}`);
      return false;
    }
    
    // Increment message count
    await rateLimiter.incrementActionCount('x_message');
    
    return true;
    
  } catch (error) {
    logger.error(`Error messaging X.com user ${username}: ${error.message}`);
    
    // Check if we're being rate limited
    await rateLimiter.checkForRateLimit(page);
    
    return false;
  }
}

/**
 * Close the X.com browser instance
 */
export async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    logger.log('X.com browser closed');
  }
}

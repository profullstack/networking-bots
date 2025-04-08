import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

let browser;
let page;

/**
 * Initialize TikTok platform
 */
export async function initialize() {
  try {
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
    
    // Visit TikTok to warm up the session
    await page.goto('https://www.tiktok.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    logger.log('TikTok initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize TikTok: ${error.message}`);
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
    throw new Error('TikTok browser not initialized');
  }
  
  const users = [];
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('tiktok_search');
    if (!canProceed) {
      logger.warn('Rate limit reached for TikTok search');
      return users;
    }
    
    // Process each search term
    for (const term of searchTerms) {
      logger.log(`Searching TikTok for term: ${term}`);
      
      // Wait before each search to avoid detection
      await rateLimiter.waitForNextAction();
      
      try {
        // Navigate to TikTok search page
        const encodedTerm = encodeURIComponent(term);
        await page.goto(`https://www.tiktok.com/search?q=${encodedTerm}`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        
        // Simulate human behavior
        await humanBehavior.simulatePageView(page);
        
        // Scroll to load more content
        await humanBehavior.simulateScroll(page);
        
        // Wait for user cards to load
        await page.waitForSelector('div[data-e2e="search-user-container"]', { timeout: 10000 })
          .catch(() => logger.warn(`No user results found for "${term}"`));
        
        // Extract usernames from search results
        const foundUsers = await page.evaluate(() => {
          const userElements = document.querySelectorAll('div[data-e2e="search-user-container"] a[href^="/@"]');
          return Array.from(userElements).map(el => {
            const username = el.getAttribute('href').replace('/@', '');
            return username;
          }).filter(Boolean);
        });
        
        if (foundUsers.length > 0) {
          logger.log(`Found ${foundUsers.length} potential users for term "${term}"`);
          users.push(...foundUsers);
        }
        
        // Increment search count
        await rateLimiter.incrementActionCount('tiktok_search');
        
      } catch (error) {
        logger.error(`Error searching TikTok for term "${term}": ${error.message}`);
        
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
             !lowerUsername.includes('tiktok');
    });
    
    return filteredUsers;
    
  } catch (error) {
    logger.error(`Error finding TikTok users: ${error.message}`);
    return [];
  }
}

/**
 * Message a TikTok user
 * @param {string} username - TikTok username to message
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
export async function messageUser(username, message) {
  if (!browser || !page) {
    throw new Error('TikTok browser not initialized');
  }
  
  logger.log(`[${dayjs().format('HH:mm')}] Attempting to message TikTok user: ${username}`);
  
  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('tiktok_message');
    if (!canProceed) {
      logger.warn('Rate limit reached for TikTok messaging');
      return false;
    }
    
    // Wait before action to avoid detection
    await rateLimiter.waitForNextAction();
    
    // Navigate to user's profile
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);
    
    // Check if the profile exists
    const profileExists = await page.evaluate(() => {
      return !document.body.innerText.includes('Couldn\'t find this account');
    });
    
    if (!profileExists) {
      logger.warn(`TikTok user @${username} not found`);
      return false;
    }
    
    // TikTok doesn't allow direct messaging without login
    // Instead, we'll follow the user and comment on their latest video
    
    // Check if we can find the follow button
    const followButtonExists = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(btn => btn.innerText.includes('Follow'));
    });
    
    if (followButtonExists) {
      // Click follow button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const followButton = buttons.find(btn => btn.innerText.includes('Follow'));
        if (followButton) followButton.click();
      });
      
      logger.log(`Followed TikTok user @${username}`);
      await wait(2000 + Math.random() * 2000);
    }
    
    // Find the first video and click on it
    const hasVideos = await page.evaluate(() => {
      const videoLinks = document.querySelectorAll('div[data-e2e="user-post-item"] a');
      if (videoLinks.length > 0) {
        videoLinks[0].click();
        return true;
      }
      return false;
    });
    
    if (!hasVideos) {
      logger.warn(`TikTok user @${username} has no videos`);
      return false;
    }
    
    // Wait for video page to load
    await page.waitForSelector('div[data-e2e="comment-list"]', { timeout: 10000 })
      .catch(() => logger.warn(`Could not find comment section for @${username}'s video`));
    
    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    
    // Try to comment (note: this will likely fail without login, but we'll try)
    try {
      // Click on comment input
      await page.waitForSelector('div[data-e2e="comment-input"]', { timeout: 5000 });
      await page.click('div[data-e2e="comment-input"]');
      
      // Type message
      await humanBehavior.simulateTyping(page, 'div[data-e2e="comment-input"]', `@${username} ${message}`);
      
      // Click post button
      await page.click('button[data-e2e="comment-post"]');
      
      logger.log(`\u2705 Commented on TikTok user @${username}'s video`);
    } catch (error) {
      logger.warn(`Could not comment on @${username}'s video: ${error.message}`);
    }
    
    // Increment message count
    await rateLimiter.incrementActionCount('tiktok_message');
    
    return true;
    
  } catch (error) {
    logger.error(`Error messaging TikTok user ${username}: ${error.message}`);
    
    // Check if we're being rate limited
    await rateLimiter.checkForRateLimit(page);
    
    return false;
  }
}

/**
 * Close the TikTok browser instance
 */
export async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    logger.log('TikTok browser closed');
  }
}

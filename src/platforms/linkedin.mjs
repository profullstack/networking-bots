import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

let browser;
let page;

// Initialize LinkedIn browser automation
async function initLinkedInAPI() {
  const username = process.env.LINKEDIN_USERNAME;
  const password = process.env.LINKEDIN_PASSWORD;
  if (!username || !password) {
    logger.warn('LinkedIn credentials not found in environment variables');
    return null;
  }
  try {
    puppeteer.use(StealthPlugin());
    // Use proxy if available
    const proxy = proxyManager.currentProxy;
    browser = await puppeteer.launch({
      headless: true,
      args: proxy ? [`--proxy-server=${proxy}`] : []
    });
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    logger.log('Navigating to LinkedIn login page...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle2' });
    await humanBehavior.simulateTyping(page, 'input#username', username);
    await humanBehavior.simulateTyping(page, 'input#password', password);
    await Promise.all([
      page.click('button[type=submit]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    // Check login success
    if (page.url().includes('/feed')) {
      logger.log('Successfully logged into LinkedIn.');
      return true;
    } else {
      logger.error('Failed to log in to LinkedIn. Check credentials or captcha.');
      return false;
    }
  } catch (err) {
    logger.error('LinkedIn login automation failed:', err.message);
    return false;
  }
}

// Search for potential users on LinkedIn using keywords
async function findPotentialUsers(searchTerms) {
  if (!page) {
    logger.warn('LinkedIn page not initialized. Call initLinkedInAPI first.');
    return [];
  }
  logger.log('Searching LinkedIn for potential users with terms:', searchTerms);
  const results = [];
  for (const term of searchTerms) {
    await rateLimiter.wait('linkedin_search');
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(term)}`;
    logger.log(`Navigating to search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.reusable-search__entity-result-list', { timeout: 10000 });
    // Extract profile URLs from search results
    const users = await page.$$eval('a.app-aware-link', links =>
      links
        .filter(link => link.href.includes('/in/'))
        .map(link => link.href.split('?')[0])
    );
    // Add unique users only
    users.forEach(u => { if (!results.includes(u)) results.push(u); });
    await humanBehavior.simulatePageView(page);
  }
  logger.log(`Found ${results.length} potential users.`);
  return results;
}

// Message a LinkedIn user by profile URL
async function messageUser(profileUrl, message) {
  if (!page) {
    logger.warn('LinkedIn page not initialized. Call initLinkedInAPI first.');
    return false;
  }
  logger.log(`Messaging LinkedIn user at ${profileUrl}: ${message}`);
  try {
    await rateLimiter.wait('linkedin_message');
    await page.goto(profileUrl, { waitUntil: 'networkidle2' });
    await humanBehavior.simulatePageView(page);
    // Click the Message button
    await page.waitForSelector('button[aria-label^="Message"]', { timeout: 10000 });
    await page.click('button[aria-label^="Message"]');
    await page.waitForSelector('div.msg-form__contenteditable', { visible: true, timeout: 10000 });
    await humanBehavior.simulateTyping(page, 'div.msg-form__contenteditable', message);
    await page.click('button.msg-form__send-button');
    logger.log('Message sent successfully.');
    return true;
  } catch (err) {
    logger.error('Failed to message LinkedIn user:', err.message);
    return false;
  }
}

// Cleanup function
async function cleanup() {
  if (browser) {
    await browser.close();
    logger.log('Closed LinkedIn browser instance');
  }
}

export async function initialize() {
  const success = await initLinkedInAPI();
  return !!success;
}

export { findPotentialUsers, messageUser, cleanup };

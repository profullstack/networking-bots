import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

let browser;
let page;

// Load accounts from accounts.json
async function loadAccountsData() {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const accountsPath = path.join(__dirname, '../../accounts.json');
    const data = await fs.readFile(accountsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty object
    return {};
  }
}

// Get active account for LinkedIn
async function getActiveLinkedInAccount() {
  const accounts = await loadAccountsData();
  if (!accounts.linkedin) return null;
  return accounts.linkedin.find(acc => acc.active) || null;
}

// Decrypt password
function decrypt(hash) {
  if (!hash || !hash.iv || !hash.content) {
    return null;
  }
  
  const crypto = require('crypto');
  const algorithm = 'aes-256-ctr';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me';
  
  try {
    const decipher = crypto.createDecipheriv(
      algorithm,
      secretKey,
      Buffer.from(hash.iv, 'hex')
    );
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(hash.content, 'hex')),
      decipher.final()
    ]);
    
    return decrypted.toString();
  } catch (error) {
    logger.error('Failed to decrypt password:', error.message);
    return null;
  }
}

// Initialize LinkedIn browser automation
async function initLinkedInAPI() {
  // Try to get credentials from account management system first
  let username, password;
  
  const activeAccount = await getActiveLinkedInAccount();
  if (activeAccount) {
    username = activeAccount.username;
    password = decrypt(activeAccount.password);
    logger.log(`Using account ${username} from account management system`);
  } else {
    // Fall back to environment variables
    username = process.env.LINKEDIN_USERNAME;
    password = process.env.LINKEDIN_PASSWORD;
    logger.log('Using LinkedIn credentials from environment variables');
  }
  
  if (!username || !password) {
    logger.warn('LinkedIn credentials not found in account management system or environment variables');
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

/**
 * Test script for advanced human-like CAPTCHA bypass
 * 
 * This script tests the advanced human-like CAPTCHA bypass capabilities
 * implemented in human-behavior.mjs and integrated with form-detection.mjs.
 * 
 * Usage: node test-captcha-bypass.mjs [captchaType] [url]
 * 
 * captchaType: 'recaptcha', 'hcaptcha', or 'auto' (default: 'auto')
 * url: URL to test CAPTCHA on (default: uses test URLs based on captchaType)
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { HumanBehaviorSimulator } from './src/services/human-behavior.mjs';
import { formDetection } from './src/services/form-detection.mjs';
import { logger } from './src/utils/logger.mjs';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// Parse command line arguments
const args = process.argv.slice(2);
const captchaType = args[0] || 'auto';
const customUrl = args[1];

// Test URLs for different CAPTCHA types
const TEST_URLS = {
  recaptcha: 'https://www.google.com/recaptcha/api2/demo',
  hcaptcha: 'https://accounts.hcaptcha.com/demo'
};

/**
 * Main test function
 */
async function testCaptchaBypass() {
  logger.log('Starting CAPTCHA bypass test...');
  logger.log(`CAPTCHA type: ${captchaType}`);
  
  // Initialize browser with anti-detection measures
  const browser = await puppeteer.launch({
    headless: false, // Use headed mode for easier debugging
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080'
    ]
  });
  
  try {
    // Create a new page with human-like behavior
    const page = await browser.newPage();
    const humanBehavior = new HumanBehaviorSimulator();
    
    // Configure the page with anti-detection measures
    await humanBehavior.configurePageForHumanBehavior(page);
    
    // Set viewport to a common resolution
    await page.setViewport({ width: 1280, height: 800 });
    
    // Determine which URL to test
    let testUrl;
    if (customUrl) {
      testUrl = customUrl;
    } else if (captchaType === 'auto') {
      // Test both types sequentially if 'auto' is specified
      await testSpecificCaptcha('recaptcha', null, browser, humanBehavior);
      await testSpecificCaptcha('hcaptcha', null, browser, humanBehavior);
      await browser.close();
      return;
    } else {
      testUrl = TEST_URLS[captchaType];
      if (!testUrl) {
        logger.error(`Unknown CAPTCHA type: ${captchaType}`);
        await browser.close();
        return;
      }
    }
    
    // Test the specified CAPTCHA type
    await testSpecificCaptcha(captchaType, testUrl, browser, humanBehavior);
    
  } catch (error) {
    logger.error('Error during CAPTCHA bypass test:', error);
  } finally {
    // Close the browser
    await browser.close();
    logger.log('CAPTCHA bypass test completed.');
  }
}

/**
 * Test a specific CAPTCHA type
 * @param {string} type - CAPTCHA type ('recaptcha' or 'hcaptcha')
 * @param {string} url - Test URL
 * @param {Object} browser - Puppeteer browser instance
 * @param {Object} humanBehavior - Human behavior simulator
 */
async function testSpecificCaptcha(type, url, browser, humanBehavior) {
  const testUrl = url || TEST_URLS[type];
  logger.log(`Testing ${type} at ${testUrl}`);
  
  // Create a new page for this test
  const page = await browser.newPage();
  await humanBehavior.configurePageForHumanBehavior(page);
  await page.setViewport({ width: 1280, height: 800 });
  
  // Navigate to the test page
  logger.log(`Navigating to ${testUrl}...`);
  await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Simulate initial human-like behavior
  logger.log('Simulating initial human-like behavior...');
  await humanBehavior.simulateInitialBrowsing(page);
  
  // Take a screenshot before attempting CAPTCHA
  await page.screenshot({ path: `${type}-test-before-${Date.now()}.png` });
  
  // Detect CAPTCHA
  logger.log('Detecting CAPTCHA...');
  const captchaInfo = await formDetection.detectCaptcha(page);
  
  if (captchaInfo.detected) {
    logger.log(`CAPTCHA detected: ${captchaInfo.type}`);
    
    // Handle the CAPTCHA based on its type
    let result = false;
    if (type === 'recaptcha' || captchaInfo.type === 'recaptcha') {
      // Test both direct and integrated approaches
      logger.log('Testing direct reCAPTCHA handling...');
      result = await humanBehavior.handleReCaptcha(page);
      logger.log(`Direct reCAPTCHA handling result: ${result ? 'Success' : 'Failed'}`);
      
      // If direct handling failed, try through form detection service
      if (!result) {
        logger.log('Testing integrated reCAPTCHA handling...');
        result = await formDetection.handleReCaptcha(page, humanBehavior);
        logger.log(`Integrated reCAPTCHA handling result: ${result ? 'Success' : 'Failed'}`);
      }
    } else if (type === 'hcaptcha' || captchaInfo.type === 'hcaptcha') {
      // Test both direct and integrated approaches
      logger.log('Testing direct hCaptcha handling...');
      result = await humanBehavior.handleHCaptcha(page);
      logger.log(`Direct hCaptcha handling result: ${result ? 'Success' : 'Failed'}`);
      
      // If direct handling failed, try through form detection service
      if (!result) {
        logger.log('Testing integrated hCaptcha handling...');
        result = await formDetection.handleHCaptcha(page, humanBehavior);
        logger.log(`Integrated hCaptcha handling result: ${result ? 'Success' : 'Failed'}`);
      }
    } else {
      logger.warn(`Unknown CAPTCHA type: ${captchaInfo.type}`);
    }
    
    // Take a screenshot after CAPTCHA handling
    await page.screenshot({ path: `${type}-test-after-${Date.now()}.png` });
    
    // Check if we need to submit a form after solving the CAPTCHA
    try {
      const submitButton = await page.$('button[type="submit"], input[type="submit"], .btn-submit');
      if (submitButton) {
        logger.log('Found submit button, attempting to click...');
        await humanBehavior.simulateMouseMovement(page, submitButton);
        await submitButton.click();
        logger.log('Clicked submit button');
        
        // Wait for navigation or response
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${type}-test-submit-${Date.now()}.png` });
      }
    } catch (error) {
      logger.warn('Error attempting to submit form:', error.message);
    }
    
  } else {
    logger.warn(`No ${type} detected on the page.`);
  }
  
  // Wait a bit before closing this test
  await page.waitForTimeout(3000);
}

// Run the test
testCaptchaBypass().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});

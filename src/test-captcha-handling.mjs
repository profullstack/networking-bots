#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logger } from './utils/logger.mjs';
import { humanBehavior } from './services/human-behavior.mjs';
import { formDetection } from './services/form-detection.mjs';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Test CAPTCHA detection and handling on known CAPTCHA test sites
 */
async function testCaptchaHandling() {
  logger.log('=== Testing CAPTCHA Detection and Handling ===');
  
  // Sites known to have CAPTCHAs for testing
  const captchaSites = [
    {
      name: 'Google reCAPTCHA Demo',
      url: 'https://www.google.com/recaptcha/api2/demo',
      type: 'recaptcha',
      description: 'Google reCAPTCHA v2 demo site'
    },
    {
      name: 'hCaptcha Demo',
      url: 'https://accounts.hcaptcha.com/demo',
      type: 'hcaptcha',
      description: 'hCaptcha demo site'
    }
  ];
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const options = {
    headless: !args.includes('--headed'),
    captchaMode: args.includes('--manual') ? 'manual' : 'human-like',
    waitTime: args.includes('--wait') ? 30000 : 5000
  };
  
  logger.log(`Mode: ${options.headless ? 'Headless' : 'Headed'} browser`);
  logger.log(`CAPTCHA handling: ${options.captchaMode}`);
  
  // Launch browser
  puppeteer.use(StealthPlugin());
  const browser = await puppeteer.launch({
    headless: options.headless ? 'new' : false,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--window-size=1280,800',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });
  
  const results = {};
  
  try {
    for (const site of captchaSites) {
      logger.log(`\n=== Testing ${site.name} (${site.type}) ===`);
      logger.log(site.description);
      
      try {
        // Create a new page with anti-detection measures
        const page = await browser.newPage();
        await humanBehavior.setupHumanLikeSession(browser, page);
        
        // Navigate to the CAPTCHA test site
        logger.log(`Navigating to ${site.url}...`);
        await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Take a screenshot
        const screenshotPath = `captcha-test-${site.type}-initial.png`;
        await page.screenshot({ path: screenshotPath });
        logger.log(`Screenshot saved to ${screenshotPath}`);
        
        // Detect CAPTCHA
        logger.log('Attempting to detect CAPTCHA...');
        const captchaDetected = await formDetection.detectCaptcha(page);
        
        if (captchaDetected) {
          logger.log('✅ CAPTCHA detected successfully');
          
          // Handle CAPTCHA based on mode
          logger.log(`Handling CAPTCHA in ${options.captchaMode} mode...`);
          
          if (options.captchaMode === 'manual') {
            // Override humanBehavior methods to always use manual intervention
            humanBehavior.handleReCaptcha = async (page) => {
              logger.warn('Manual CAPTCHA intervention requested');
              await page.screenshot({ path: `captcha-test-${site.type}-manual.png` });
              logger.warn('Please solve the CAPTCHA manually in the browser window.');
              await page.waitForTimeout(options.waitTime);
              return true;
            };
          }
          
          // Attempt to handle the CAPTCHA
          const captchaHandled = await formDetection.handleCaptcha(page);
          
          // Take a screenshot after handling
          const afterScreenshotPath = `captcha-test-${site.type}-after.png`;
          await page.screenshot({ path: afterScreenshotPath });
          logger.log(`After-handling screenshot saved to ${afterScreenshotPath}`);
          
          results[site.name] = {
            detected: true,
            handled: captchaHandled,
            type: site.type
          };
          
          // Try to submit the form if there is one
          try {
            const submitButton = await page.$('button[type="submit"], input[type="submit"], .g-recaptcha + button');
            if (submitButton) {
              logger.log('Found submit button, attempting to click with human-like behavior...');
              await humanBehavior.simulateMouseMovement(page, submitButton);
              await page.waitForTimeout(500 + Math.random() * 500);
              await submitButton.click();
              await page.waitForTimeout(3000);
              
              // Take a final screenshot
              await page.screenshot({ path: `captcha-test-${site.type}-final.png` });
            }
          } catch (e) {
            logger.warn(`Could not submit form: ${e.message}`);
          }
        } else {
          logger.error('❌ CAPTCHA not detected');
          results[site.name] = {
            detected: false,
            handled: false,
            type: site.type
          };
        }
        
        // Close the page
        await page.close();
        
      } catch (error) {
        logger.error(`Error testing ${site.name}: ${error.message}`);
        results[site.name] = {
          detected: false,
          handled: false,
          error: error.message
        };
      }
    }
    
    // Print summary
    logger.log('\n=== CAPTCHA Testing Results Summary ===');
    for (const [site, result] of Object.entries(results)) {
      logger.log(`${site}:`);
      logger.log(`  - CAPTCHA detected: ${result.detected ? '✅ Yes' : '❌ No'}`);
      if (result.detected) {
        logger.log(`  - CAPTCHA type: ${result.type}`);
        logger.log(`  - CAPTCHA handled: ${result.handled ? '✅ Yes' : '❌ No'}`);
      }
      if (result.error) {
        logger.log(`  - Error: ${result.error}`);
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // Print usage information
  logger.log('\n=== Usage ===');
  logger.log('node test-captcha-handling.mjs [options]');
  logger.log('Options:');
  logger.log('  --headed    Run in headed mode (shows browser)');
  logger.log('  --manual    Use manual CAPTCHA solving');
  logger.log('  --wait      Wait longer for manual CAPTCHA solving (30s)');
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testCaptchaHandling().catch(error => {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

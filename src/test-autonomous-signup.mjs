#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.mjs';
import { formDetection } from './services/form-detection.mjs';
import { humanBehavior } from './services/human-behavior.mjs';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Generate test user data
 * @returns {Object} User data object with name, email, etc.
 */
function generateTestUserData() {
  const randomNum = Math.floor(Math.random() * 10000);
  return {
    firstName: 'Test',
    lastName: `User${randomNum}`,
    email: `testuser${randomNum}@example.com`,
    password: `TestPass${randomNum}!`,
    username: `testuser${randomNum}`,
    birthDay: '15',
    birthMonth: '6',
    birthYear: '1990',
    phone: '5551234567' // Note: This is a dummy number, real tests would need valid numbers
  };
}

/**
 * Run autonomous signup test for a specific platform
 * @param {string} platform - Platform name (e.g., 'linkedin', 'x', 'tiktok')
 * @param {Object} options - Test options
 */
async function testAutonomousSignup(platform, options = {}) {
  const {
    headless = true,
    captchaMode = 'human-like', // 'human-like', 'manual', or 'auto'
    waitForManualCaptcha = true,
    maxRetries = 1
  } = options;
  
  logger.log(`\n=== Testing autonomous signup for ${platform} ===`);
  logger.log(`Mode: ${headless ? 'Headless' : 'Headed'}, CAPTCHA handling: ${captchaMode}`);
  
  // Generate test user data
  const userData = generateTestUserData();
  logger.log('Generated test user data:');
  logger.log(`Name: ${userData.firstName} ${userData.lastName}`);
  logger.log(`Email: ${userData.email}`);
  logger.log(`Password: ${userData.password}`);
  
  // Track attempts
  let attempts = 0;
  let success = false;
  let finalResult = null;
  
  while (attempts < maxRetries && !success) {
    attempts++;
    if (attempts > 1) {
      logger.log(`\nRetry attempt ${attempts} of ${maxRetries}...`);
    }
    
    try {
      // Start the autonomous account creation process
      logger.log(`\nStarting autonomous account creation for ${platform}...`);
      
      // Configure CAPTCHA handling mode
      if (captchaMode === 'manual') {
        // Override humanBehavior methods to always use manual intervention
        humanBehavior.handleReCaptcha = async (page) => {
          logger.warn('Manual CAPTCHA intervention requested');
          await page.screenshot({ path: `${platform}-manual-captcha.png` });
          logger.warn('Please solve the CAPTCHA manually in the browser window.');
          await page.waitForTimeout(waitForManualCaptcha ? 30000 : 5000);
          return true;
        };
      } else if (captchaMode === 'auto') {
        // This would be where you'd integrate with a CAPTCHA solving service
        logger.warn('Auto CAPTCHA solving requested but not implemented - falling back to human-like');
        // In a real implementation, you would connect to a service like 2Captcha here
      }
      
      // Run the account creation with specified options
      const result = await formDetection.createAccountAutonomously(platform, userData, null, headless);
      finalResult = result;
      
      if (result.success) {
        success = true;
        logger.log(`\n✅ ${platform} account created successfully!`);
        logger.log(`Username: ${result.username || userData.email}`);
        logger.log(`Account URL: ${result.profileUrl || 'Not available'}`);
        
        // Log any notes or warnings
        if (result.notes && result.notes.length > 0) {
          logger.log('\nNotes:');
          result.notes.forEach(note => logger.log(`- ${note}`));
        }
        
        // Log CAPTCHA handling results
        if (result.captchaDetected) {
          logger.log('\nCAPTCHA Handling:');
          logger.log(`- CAPTCHA detected: Yes`);
          logger.log(`- CAPTCHA handling mode: ${captchaMode}`);
          logger.log(`- CAPTCHA solved: ${result.captchaSolved ? 'Yes' : 'No'}`);
        }
      } else {
        logger.error(`\n❌ Failed to create ${platform} account on attempt ${attempts}`);
        logger.error(`Reason: ${result.error || 'Unknown error'}`);
        
        // Log any additional information
        if (result.notes && result.notes.length > 0) {
          logger.log('\nAdditional information:');
          result.notes.forEach(note => logger.log(`- ${note}`));
        }
        
        // Log CAPTCHA information if it was detected
        if (result.captchaDetected) {
          logger.log('\nCAPTCHA Information:');
          logger.log(`- CAPTCHA type: ${result.captchaType || 'Unknown'}`);
          logger.log(`- CAPTCHA handling mode: ${captchaMode}`);
          logger.log(`- CAPTCHA solving attempted: ${result.captchaAttempted ? 'Yes' : 'No'}`);
        }
      }
    } catch (error) {
      logger.error(`Error during ${platform} autonomous signup test (attempt ${attempts}):`, error.message);
    }
  }
  
  return {
    success,
    attempts,
    result: finalResult
  };
}

/**
 * Run tests for all supported platforms or a specific platform
 */
async function runTests() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const targetPlatform = args[0] && !args[0].startsWith('--') ? args[0] : null;
  
  // Parse options
  const options = {
    headless: !args.includes('--headed'),
    captchaMode: args.includes('--manual-captcha') ? 'manual' : 
                 args.includes('--auto-captcha') ? 'auto' : 'human-like',
    waitForManualCaptcha: !args.includes('--no-wait'),
    maxRetries: args.includes('--retry') ? 2 : 1
  };
  
  // Get platforms to test
  const platforms = targetPlatform ? [targetPlatform] : ['linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit'];
  
  logger.log('=== Starting Autonomous Account Creation Tests ===');
  logger.log(`Mode: ${options.headless ? 'Headless' : 'Headed'} browser`);
  logger.log(`CAPTCHA handling: ${options.captchaMode}`);
  logger.log(`Max retries: ${options.maxRetries}`);
  
  const results = {};
  
  for (const platform of platforms) {
    const testResult = await testAutonomousSignup(platform, options);
    results[platform] = testResult;
  }
  
  // Print summary
  logger.log('\n=== Test Results Summary ===');
  for (const [platform, result] of Object.entries(results)) {
    logger.log(`${platform}: ${result.success ? '✅ Success' : '❌ Failed'} (${result.attempts} attempt${result.attempts !== 1 ? 's' : ''})`);
    
    // Log CAPTCHA statistics if available
    if (result.result && result.result.captchaDetected) {
      logger.log(`  - CAPTCHA detected: ${result.result.captchaType || 'Yes'}`);
      logger.log(`  - CAPTCHA solved: ${result.result.captchaSolved ? 'Yes' : 'No'}`);
    }
  }
  
  // Calculate success rate
  const successCount = Object.values(results).filter(result => result.success).length;
  const totalCount = Object.values(results).length;
  const successRate = (successCount / totalCount) * 100;
  logger.log(`\nSuccess rate: ${successRate.toFixed(2)}% (${successCount}/${totalCount})`);
  
  // Print usage information
  logger.log('\n=== Usage ===');
  logger.log('node test-autonomous-signup.mjs [platform] [options]');
  logger.log('Options:');
  logger.log('  --headed            Run in headed mode (shows browser)');
  logger.log('  --manual-captcha    Always use manual CAPTCHA solving');
  logger.log('  --auto-captcha      Try to use automated CAPTCHA solving');
  logger.log('  --no-wait           Don\'t wait for manual CAPTCHA solving');
  logger.log('  --retry             Retry failed attempts once');
  logger.log('\nExample: node test-autonomous-signup.mjs linkedin --headed --manual-captcha');

  process.exit(0);
}

// Run the tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

export { testAutonomousSignup, generateTestUserData };

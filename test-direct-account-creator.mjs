#!/usr/bin/env node

/**
 * Test Direct Account Creator
 * 
 * This script tests the direct account creation approach that uses HTTP requests
 * instead of browser automation to create real social media accounts.
 * 
 * Usage: node test-direct-account-creator.mjs [platform] [--debug]
 * 
 * platform: Platform to test account creation for (default: twitter)
 * --debug: Enable detailed debug logging
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import readline from 'readline';
import crypto from 'crypto';
import { logger } from './src/utils/logger.mjs';
import { directAccountCreator } from './src/services/direct-account-creator.mjs';
import { proxyManager } from './src/services/proxy-manager.mjs';

// Set up environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Parse command line arguments
const args = process.argv.slice(2);
const platform = args[0]?.toLowerCase() || 'twitter';
const debug = args.includes('--debug');

// Configure logger
if (debug) {
  logger.setLevel('debug');
  logger.log('Debug logging enabled');
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt for user input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User input
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Generate a secure random password
 * @param {number} length - Password length
 * @returns {string} Generated password
 */
function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  let password = '';
  
  // Ensure at least one character from each category
  password += charset.charAt(Math.floor(Math.random() * 26)); // lowercase
  password += charset.charAt(26 + Math.floor(Math.random() * 26)); // uppercase
  password += charset.charAt(52 + Math.floor(Math.random() * 10)); // number
  password += charset.charAt(62 + Math.floor(Math.random() * 12)); // special
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Save account data to file
 * @param {Object} accountData - Account data to save
 * @returns {Promise<void>}
 */
async function saveAccountData(accountData) {
  try {
    // Create test-results directory if it doesn't exist
    const resultsDir = path.join(__dirname, 'test-results');
    await fs.mkdir(resultsDir, { recursive: true }).catch(() => {});
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `account_${accountData.platform}_${timestamp}.json`;
    const filePath = path.join(resultsDir, filename);
    
    // Write account data to file
    await fs.writeFile(filePath, JSON.stringify(accountData, null, 2));
    logger.log(`Account data saved to ${filePath}`);
    
    return filePath;
  } catch (error) {
    logger.error(`Error saving account data: ${error.message}`);
    return null;
  }
}

/**
 * Test account creation for a specific platform
 * @param {string} platform - Platform to test
 * @returns {Promise<Object>} Test result
 */
async function testAccountCreation(platform) {
  logger.log(`\n=== Testing Direct Account Creation for ${platform} ===\n`);
  
  try {
    // Check if proxy is available
    const proxy = await proxyManager.getProxy();
    if (!proxy) {
      logger.warn('No proxy available. Running without proxy may increase detection risk.');
    } else {
      logger.log(`Using proxy: ${proxy.host}:${proxy.port}`);
    }
    
    // Get user data for account creation
    logger.log('\nEnter user data for account creation:');
    
    const firstName = await prompt('First Name: ');
    const lastName = await prompt('Last Name: ');
    const email = await prompt('Email: ');
    
    // Generate password or ask for one
    let password = '';
    const useGeneratedPassword = (await prompt('Generate secure password? (y/n): ')).toLowerCase() === 'y';
    
    if (useGeneratedPassword) {
      password = generatePassword();
      logger.log(`Generated password: ${password}`);
    } else {
      password = await prompt('Password: ');
    }
    
    // Get birth date
    const birthYear = await prompt('Birth Year (e.g., 1990): ');
    const birthMonth = await prompt('Birth Month (1-12): ');
    const birthDay = await prompt('Birth Day (1-31): ');
    
    // Prepare user data
    const userData = {
      firstName,
      lastName,
      email,
      password,
      birthYear,
      birthMonth,
      birthDay,
      username: `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`
    };
    
    // Confirm account creation
    logger.log('\nAccount will be created with the following data:');
    logger.log(`Name: ${userData.firstName} ${userData.lastName}`);
    logger.log(`Email: ${userData.email}`);
    logger.log(`Password: ${userData.password}`);
    logger.log(`Birth Date: ${userData.birthMonth}/${userData.birthDay}/${userData.birthYear}`);
    logger.log(`Suggested Username: ${userData.username}`);
    
    const confirm = await prompt('\nProceed with account creation? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      logger.log('Account creation cancelled.');
      rl.close();
      return { success: false, cancelled: true };
    }
    
    // Start account creation
    logger.log('\nStarting account creation process...');
    const startTime = Date.now();
    
    // Create account
    const result = await directAccountCreator.createAccount(platform, userData);
    
    // Calculate duration
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Log result
    logger.log(`\nAccount creation ${result.success ? 'completed' : 'failed'} in ${duration} seconds`);
    
    if (result.success) {
      logger.log('\n✅ Account created successfully:');
      logger.log(`Platform: ${result.platform}`);
      logger.log(`Username: ${result.username}`);
      logger.log(`Email: ${result.email}`);
      
      if (result.notes && result.notes.length > 0) {
        logger.log('\nNotes:');
        result.notes.forEach(note => logger.log(`- ${note}`));
      }
      
      if (result.requiresEmailVerification) {
        logger.log('\n⚠️ Email verification required to complete account setup');
      }
      
      // Save account data
      const accountData = {
        ...result,
        createdAt: new Date().toISOString(),
        creationDuration: duration
      };
      
      await saveAccountData(accountData);
    } else {
      logger.log('\n❌ Account creation failed:');
      logger.log(`Error: ${result.error}`);
      
      if (result.requiresManualIntervention) {
        logger.log('\n⚠️ Manual intervention required (possible CAPTCHA or verification)');
      }
      
      if (result.retryAfter) {
        logger.log(`\n⚠️ Rate limited. Retry after ${result.retryAfter} seconds`);
      }
    }
    
    return result;
  } catch (error) {
    logger.error(`Error in test account creation: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    rl.close();
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Display header
    logger.log('\n=================================================');
    logger.log('   Direct Account Creator Test');
    logger.log('   HTTP-based Account Creation (No Browser)');
    logger.log('=================================================\n');
    
    // Test account creation
    await testAccountCreation(platform);
    
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { testAccountCreation };

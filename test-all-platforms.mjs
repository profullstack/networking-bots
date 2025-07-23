#!/usr/bin/env node

/**
 * Test All Platforms Direct Account Creator
 * 
 * This script tests the direct account creation approach for multiple platforms
 * using HTTP requests instead of browser automation.
 * 
 * Usage: node test-all-platforms.mjs [--debug]
 * 
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
      resolve(answer);
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
  password += charset.slice(0, 26).charAt(Math.floor(Math.random() * 26)); // lowercase
  password += charset.slice(26, 52).charAt(Math.floor(Math.random() * 26)); // uppercase
  password += charset.slice(52, 62).charAt(Math.floor(Math.random() * 10)); // number
  password += charset.slice(62).charAt(Math.floor(Math.random() * (charset.length - 62))); // special
  
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
    const accountsDir = path.join(__dirname, 'accounts');
    
    // Create accounts directory if it doesn't exist
    try {
      await fs.mkdir(accountsDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const platform = accountData.platform || 'unknown';
    const filename = `${platform}-${accountData.username || accountData.email}-${timestamp}.json`;
    const filePath = path.join(accountsDir, filename);
    
    await fs.writeFile(filePath, JSON.stringify(accountData, null, 2));
    logger.log(`Account data saved to ${filePath}`);
  } catch (error) {
    logger.error(`Failed to save account data: ${error.message}`);
  }
}

/**
 * Test account creation for a specific platform
 * @param {string} platform - Platform to test
 * @returns {Promise<Object>} Test result
 */
async function testAccountCreation(platform) {
  logger.log(`\n=== Testing ${platform} Account Creation ===\n`);
  
  try {
    // Initialize proxy manager if needed
    logger.log('Initializing proxy manager...');
    await proxyManager.initialize();
    logger.log('Proxy initialization complete.');
    
    // Force console flush to ensure prompts are visible
    process.stdout.write('\n');
    
    // Get user data
    logger.log('Please enter user information:');
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
    
    // Get gender for platforms that require it (like Facebook)
    let gender = null;
    if (platform.toLowerCase() === 'facebook') {
      const genderInput = await prompt('Gender (m/f): ');
      gender = genderInput.toLowerCase() === 'f' ? '1' : '2'; // 1=female, 2=male in Facebook's API
    }
    
    // Prepare user data
    const userData = {
      firstName,
      lastName,
      email,
      password,
      birthYear,
      birthMonth,
      birthDay,
      gender,
      username: `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`
    };
    
    // Confirm account creation
    logger.log('\nAccount will be created with the following data:');
    logger.log(`Name: ${userData.firstName} ${userData.lastName}`);
    logger.log(`Email: ${userData.email}`);
    logger.log(`Password: ${userData.password}`);
    logger.log(`Birth Date: ${userData.birthMonth}/${userData.birthDay}/${userData.birthYear}`);
    if (gender) logger.log(`Gender: ${gender === '1' ? 'Female' : 'Male'}`);
    logger.log(`Suggested Username: ${userData.username}`);
    
    const confirm = await prompt('\nProceed with account creation? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      logger.log('Account creation cancelled.');
      return { success: false, cancelled: true };
    }
    
    // Create the account
    logger.log(`\nCreating ${platform} account...`);
    const result = await directAccountCreator.createAccount(platform, userData);
    
    if (result.success) {
      logger.log(`\n✅ ${platform} account creation successful!`);
      
      // Save account data
      const accountData = {
        platform,
        ...result,
        createdAt: new Date().toISOString()
      };
      
      await saveAccountData(accountData);
    } else {
      logger.error(`\n❌ ${platform} account creation failed: ${result.error}`);
      
      if (result.requiresManualAction) {
        logger.warn('Manual action required (CAPTCHA or verification)');
      }
    }
    
    return result;
  } catch (error) {
    logger.error(`Error during ${platform} account creation test: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  try {
    logger.log('=== Direct Account Creator Test ===');
    
    // Show available platforms
    logger.log('\nAvailable platforms:');
    logger.log('1. Twitter/X');
    logger.log('2. LinkedIn');
    logger.log('3. Facebook');
    
    const platformChoice = await prompt('\nSelect platform (1-3): ');
    
    let platform;
    switch (platformChoice) {
      case '1':
        platform = 'twitter';
        break;
      case '2':
        platform = 'linkedin';
        break;
      case '3':
        platform = 'facebook';
        break;
      default:
        logger.error('Invalid platform selection');
        rl.close();
        return;
    }
    
    await testAccountCreation(platform);
    
    // Ask if user wants to test another platform
    const testAnother = await prompt('\nTest another platform? (y/n): ');
    if (testAnother.toLowerCase() === 'y') {
      await main();
    } else {
      logger.log('\nTest completed. Goodbye!');
      rl.close();
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    rl.close();
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

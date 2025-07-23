#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';
import crypto from 'crypto';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Import logger, human behavior simulator, and form detection service
import { logger } from './utils/logger.mjs';
import { humanBehavior } from './services/human-behavior.mjs';
import { formDetection } from './services/form-detection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

// Define the accounts file path
const ACCOUNTS_FILE_PATH = path.join(__dirname, '../accounts.json');

// Create readline interface for CLI interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Helper function to encrypt sensitive data
function encrypt(text) {
  const algorithm = 'aes-256-ctr';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me';
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  
  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex')
  };
}

// Load accounts from file
async function loadAccounts() {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is invalid, return empty object
    return {};
  }
}

// Save accounts to file
async function saveAccounts(accounts) {
  await fs.writeFile(ACCOUNTS_FILE_PATH, JSON.stringify(accounts, null, 2));
}

// Generate a secure random password
function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}

// Create a profile on a specific platform
async function createProfile(platform, firstName, lastName, useAI = false) {
  logger.log(`\n=== Creating ${platform} profile ===`);
  
  // Ask for email
  const email = await prompt(`Enter email for ${platform}: `);
  
  if (!email || !email.includes('@')) {
    logger.error('Invalid email address. Profile creation skipped.');
    return null;
  }
  
  // Generate a secure password
  const password = generatePassword();
  
  logger.log('\n📝 Account credentials (save these):');
  logger.log(`📧 Email: ${email}`);
  logger.log(`🔑 Password: ${password}`);
  logger.log(`👤 Name: ${firstName} ${lastName}`);
  
  try {
    // Initialize puppeteer with stealth plugin
    puppeteer.use(StealthPlugin());
    const browser = await puppeteer.launch({
      headless: 'new', // Use headless mode for automation
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    
    logger.log('\n🔄 Starting automated signup process...');
    logger.log('⚠️ A browser window will open to the signup page.');
    
    // Prepare user data for AI-driven account creation
    const userData = {
      firstName,
      lastName,
      email,
      password,
      birthDay: '15', // Default values, can be customized later
      birthMonth: '6',
      birthYear: '1990',
      username: `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`
    };
    
    // Platform-specific signup process
    let success = false;
    let username = '';
    let result = {};
    
    if (useAI) {
      // Use AI-driven autonomous account creation
      logger.log('🤖 Using AI-driven autonomous account creation...');
      logger.log('⚠️ The AI will attempt to detect and fill forms automatically.');
      logger.log('⚠️ You may need to complete CAPTCHA or verification steps if prompted.');
      
      result = await formDetection.createAccountAutonomously(platform, userData, browser);
      success = result.success;
      username = result.username || userData.username || email;
      
      if (result.notes && result.notes.length > 0) {
        logger.log('\nNotes from AI account creation:');
        result.notes.forEach(note => logger.log(`- ${note}`));
      }
    } else {
      // Use traditional platform-specific signup process
      logger.log('⚠️ Using traditional signup process with manual assistance.');
      logger.log('⚠️ The system will fill in forms automatically where possible.');
      logger.log('⚠️ You will need to complete email/phone verification steps.');
      
      switch (platform) {
        case 'linkedin':
          success = await createLinkedInProfile(page, email, password, firstName, lastName);
          username = email;
          break;
        case 'x':
          [success, username] = await createXProfile(page, email, password, firstName, lastName);
          break;
        case 'tiktok':
          [success, username] = await createTikTokProfile(page, email, password, firstName, lastName);
          break;
        case 'youtube':
          [success, username] = await createYouTubeProfile(page, email, password, firstName, lastName);
          break;
        case 'facebook':
          [success, username] = await createFacebookProfile(page, email, password, firstName, lastName);
          break;
        case 'reddit':
          [success, username] = await createRedditProfile(page, email, password, firstName, lastName);
          break;
        default:
          logger.error(`Unsupported platform: ${platform}`);
          await browser.close();
          return null;
      }
    }
    
    await browser.close();
    
    if (!success) {
      const retry = await prompt(`Failed to create ${platform} profile. Skip and continue? (y/n): `);
      if (retry.toLowerCase() === 'n') {
        return await createProfile(platform, firstName, lastName);
      }
      return null;
    }
    
    logger.log(`\n✅ ${platform} profile created successfully!`);
    logger.log(`👤 Username: ${username || email}`);
    
    // Create account object
    const account = {
      username: username || email,
      password: encrypt(password),
      active: true, // Set as active by default
      dateAdded: new Date().toISOString(),
      email: email
    };
    
    return account;
  } catch (error) {
    logger.error(`Error creating ${platform} profile: ${error.message}`);
    const skip = await prompt(`Error occurred. Skip and continue? (y/n): `);
    if (skip.toLowerCase() === 'n') {
      return await createProfile(platform, firstName, lastName);
    }
    return null;
  }
}

// LinkedIn profile creation
async function createLinkedInProfile(page, email, password, firstName, lastName) {
  try {
    logger.log('Navigating to LinkedIn signup page...');
    await page.goto('https://www.linkedin.com/signup', { waitUntil: 'networkidle2' });
    
    // Take a screenshot to see the current state
    await page.screenshot({ path: 'linkedin-signup-initial.png' });
    logger.log('Initial LinkedIn signup page screenshot saved as linkedin-signup-initial.png');
    
    // Step 1: Fill in first name and last name
    logger.log('Filling in first name and last name...');
    await humanBehavior.simulateTyping(page, '#first-name', firstName);
    await humanBehavior.simulateTyping(page, '#last-name', lastName);
    
    // Step 2: Click the Continue button
    logger.log('Clicking Continue button...');
    await page.click('button[data-id="sign-in-form__continue-btn"]');
    await page.waitForTimeout(2000);
    
    // Step 3: Fill in email
    logger.log('Filling in email address...');
    await humanBehavior.simulateTyping(page, '#email-address', email);
    
    // Step 4: Click the Continue button again
    logger.log('Clicking Continue button after email...');
    await page.click('button[data-id="sign-in-form__continue-btn"]');
    await page.waitForTimeout(2000);
    
    // Step 5: Fill in password
    logger.log('Filling in password...');
    await humanBehavior.simulateTyping(page, '#password', password);
    
    // Step 6: Click the Join LinkedIn button
    logger.log('Clicking Join LinkedIn button...');
    await page.click('button[data-id="sign-in-form__continue-btn"]');
    await page.waitForTimeout(2000);
    
    // Take a screenshot of the current state
    await page.screenshot({ path: 'linkedin-signup-verification.png' });
    
    // Prompt user for verification
    logger.log('\n⚠️ Email/Phone Verification Required');
    logger.log('Please check your email or phone for a verification code from LinkedIn.');
    logger.log('Complete the verification process in the browser window.');
    
    const verification = await prompt('\nPress Enter after completing verification...');
    
    // Take a final screenshot
    await page.screenshot({ path: 'linkedin-signup-final.png' });
    
    // Ask user if signup was successful
    const success = await prompt('Was the LinkedIn account creation successful? (y/n): ');
    
    if (success.toLowerCase() === 'y') {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    logger.error('LinkedIn profile creation failed:', error.message);
    // Take a screenshot of the error state
    try {
      await page.screenshot({ path: 'linkedin-signup-error.png' });
      logger.log('Error state screenshot saved as linkedin-signup-error.png');
    } catch (e) {
      // Ignore screenshot errors
    }
    return false;
  }
}

// X (Twitter) profile creation
async function createXProfile(page, email, password, firstName, lastName) {
  try {
    logger.log('Navigating to X (Twitter) signup page...');
    await page.goto('https://twitter.com/i/flow/signup', { waitUntil: 'networkidle2' });
    
    // Take a screenshot to see the current state
    await page.screenshot({ path: 'x-signup-initial.png' });
    logger.log('Initial X signup page screenshot saved as x-signup-initial.png');
    
    // Step 1: Click the "Create account" button
    logger.log('Clicking "Create account" button...');
    try {
      // Try different selectors for the Create account button
      const createAccountSelectors = [
        'div[role="button"]:has-text("Create account")',
        'span:has-text("Create account")',
        'a:has-text("Create account")',
        'button:has-text("Create account")'
      ];
      
      let buttonClicked = false;
      for (const selector of createAccountSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          await page.click(selector);
          logger.log(`Clicked Create account using selector: ${selector}`);
          buttonClicked = true;
          break;
        } catch (e) {
          // Try next selector
        }
      }
      
      if (!buttonClicked) {
        // Try clicking by coordinates based on the screenshot
        logger.log('Trying to click Create account button by coordinates...');
        await page.mouse.click(610, 618); // Approximate center of the Create account button
      }
      
      await page.waitForTimeout(2000);
    } catch (e) {
      logger.log('Could not click Create account button automatically:', e.message);
      logger.log('Please click the "Create account" button manually.');
      await prompt('Press Enter after clicking the Create account button...');
    }
    
    // Take a screenshot after clicking Create account
    await page.screenshot({ path: 'x-signup-after-create.png' });
    
    // Step 2: Fill in name
    logger.log('Filling in name...');
    try {
      const nameSelectors = [
        'input[name="name"]',
        'input[placeholder="Name"]',
        'input[data-testid="name-field"]'
      ];
      
      for (const selector of nameSelectors) {
        const nameField = await page.$(selector);
        if (nameField) {
          await humanBehavior.simulateTyping(page, selector, `${firstName} ${lastName}`);
          logger.log(`Filled name using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill name automatically:', e.message);
      logger.log('Please enter your name manually.');
      await prompt('Press Enter after entering your name...');
    }
    
    // Step 3: Fill in email and other required fields
    logger.log('Please complete the remaining signup fields (email, date of birth, etc.)');
    logger.log('The system will generate a username for you based on your name.');
    
    // Generate a username based on first and last name
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
    logger.log(`Suggested username: ${username}`);
    
    // Prompt user for verification
    logger.log('\n⚠️ Email/Phone Verification Required');
    logger.log('Please check your email or phone for a verification code from X (Twitter).');
    logger.log('Complete the verification process in the browser window.');
    
    await prompt('\nPress Enter after completing verification...');
    
    // Take a final screenshot
    await page.screenshot({ path: 'x-signup-final.png' });
    
    // Ask user if signup was successful
    const success = await prompt('Was the X account creation successful? (y/n): ');
    
    if (success.toLowerCase() === 'y') {
      // Ask for the actual username that was created
      const actualUsername = await prompt('What username did you create? (leave blank to use suggested): ');
      return [true, actualUsername || username];
    } else {
      return [false, ''];
    }
  } catch (error) {
    logger.error('X profile creation failed:', error.message);
    // Take a screenshot of the error state
    try {
      await page.screenshot({ path: 'x-signup-error.png' });
      logger.log('Error state screenshot saved as x-signup-error.png');
    } catch (e) {
      // Ignore screenshot errors
    }
    return [false, ''];
  }
}

// TikTok profile creation
async function createTikTokProfile(page, email, password, firstName, lastName) {
  try {
    logger.log('Navigating to TikTok signup page...');
    await page.goto('https://www.tiktok.com/signup', { waitUntil: 'networkidle2' });
    
    // Take a screenshot to see the current state
    await page.screenshot({ path: 'tiktok-signup-initial.png' });
    
    // Try to automate the signup process
    logger.log('Attempting to fill in signup form...');
    
    // Try to find and fill in the name field
    try {
      const nameSelectors = [
        'input[name="full_name"]',
        'input[placeholder="Full name"]',
        'input[data-e2e="fullname-input"]'
      ];
      
      for (const selector of nameSelectors) {
        const nameField = await page.$(selector);
        if (nameField) {
          await humanBehavior.simulateTyping(page, selector, `${firstName} ${lastName}`);
          logger.log(`Filled name using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill name automatically:', e.message);
    }
    
    // Try to find and fill in the email field
    try {
      const emailSelectors = [
        'input[name="email"]',
        'input[type="email"]',
        'input[placeholder="Email"]'
      ];
      
      for (const selector of emailSelectors) {
        const emailField = await page.$(selector);
        if (emailField) {
          await humanBehavior.simulateTyping(page, selector, email);
          logger.log(`Filled email using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill email automatically:', e.message);
    }
    
    // Try to find and fill in the password field
    try {
      const passwordSelectors = [
        'input[name="password"]',
        'input[type="password"]',
        'input[placeholder="Password"]'
      ];
      
      for (const selector of passwordSelectors) {
        const passwordField = await page.$(selector);
        if (passwordField) {
          await humanBehavior.simulateTyping(page, selector, password);
          logger.log(`Filled password using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill password automatically:', e.message);
    }
    
    // Generate a username based on first and last name
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
    
    // Take a screenshot after filling in the form
    await page.screenshot({ path: 'tiktok-signup-filled.png' });
    
    logger.log('\n⚠️ Please complete any remaining fields and submit the form.');
    logger.log('⚠️ Email/Phone Verification Required');
    logger.log('Please check your email or phone for a verification code from TikTok.');
    logger.log('Complete the verification process in the browser window.');
    
    await prompt('\nPress Enter after completing verification...');
    
    // Take a final screenshot
    await page.screenshot({ path: 'tiktok-signup-final.png' });
    
    // Ask user if signup was successful
    const success = await prompt('Was the TikTok account creation successful? (y/n): ');
    
    if (success.toLowerCase() === 'y') {
      // Ask for the actual username that was created
      const actualUsername = await prompt('What username did you create? (leave blank to use suggested): ');
      return [true, actualUsername || username];
    } else {
      return [false, ''];
    }
  } catch (error) {
    logger.error('TikTok profile creation failed:', error.message);
    // Take a screenshot of the error state
    try {
      await page.screenshot({ path: 'tiktok-signup-error.png' });
    } catch (e) {
      // Ignore screenshot errors
    }
    return [false, ''];
  }
}

// YouTube profile creation (via Google)
async function createYouTubeProfile(page, email, password, firstName, lastName) {
  try {
    logger.log('Navigating to Google signup page...');
    await page.goto('https://accounts.google.com/signup', { waitUntil: 'networkidle2' });
    
    // Take a screenshot to see the current state
    await page.screenshot({ path: 'google-signup-initial.png' });
    
    // Try to automate the signup process
    logger.log('Attempting to fill in signup form...');
    
    // Try to find and fill in the first name field
    try {
      const firstNameSelectors = [
        'input[name="firstName"]',
        'input[id="firstName"]'
      ];
      
      for (const selector of firstNameSelectors) {
        const firstNameField = await page.$(selector);
        if (firstNameField) {
          await humanBehavior.simulateTyping(page, selector, firstName);
          logger.log(`Filled first name using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill first name automatically:', e.message);
    }
    
    // Try to find and fill in the last name field
    try {
      const lastNameSelectors = [
        'input[name="lastName"]',
        'input[id="lastName"]'
      ];
      
      for (const selector of lastNameSelectors) {
        const lastNameField = await page.$(selector);
        if (lastNameField) {
          await humanBehavior.simulateTyping(page, selector, lastName);
          logger.log(`Filled last name using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill last name automatically:', e.message);
    }
    
    // Try to find and fill in the email field
    try {
      const emailSelectors = [
        'input[name="Username"]',
        'input[id="username"]',
        'input[type="email"]'
      ];
      
      for (const selector of emailSelectors) {
        const emailField = await page.$(selector);
        if (emailField) {
          await humanBehavior.simulateTyping(page, selector, email.split('@')[0]); // Just the username part
          logger.log(`Filled email username using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill email automatically:', e.message);
    }
    
    // Try to find and fill in the password fields
    try {
      const passwordSelectors = [
        'input[name="Passwd"]',
        'input[name="password"]',
        'input[type="password"]'
      ];
      
      for (const selector of passwordSelectors) {
        const passwordField = await page.$(selector);
        if (passwordField) {
          await humanBehavior.simulateTyping(page, selector, password);
          logger.log(`Filled password using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill password automatically:', e.message);
    }
    
    // Take a screenshot after filling in the form
    await page.screenshot({ path: 'google-signup-filled.png' });
    
    logger.log('\n⚠️ Please complete any remaining fields and submit the form.');
    logger.log('⚠️ Email/Phone Verification Required');
    logger.log('Please check your email or phone for a verification code from Google.');
    logger.log('Complete the verification process in the browser window.');
    
    await prompt('\nPress Enter after completing verification...');
    
    // Take a final screenshot
    await page.screenshot({ path: 'google-signup-final.png' });
    
    // Ask user if signup was successful
    const success = await prompt('Was the Google account creation successful? (y/n): ');
    
    if (success.toLowerCase() === 'y') {
      return [true, email];
    } else {
      return [false, ''];
    }
  } catch (error) {
    logger.error('Google profile creation failed:', error.message);
    // Take a screenshot of the error state
    try {
      await page.screenshot({ path: 'google-signup-error.png' });
    } catch (e) {
      // Ignore screenshot errors
    }
    return [false, ''];
  }
}

// Facebook profile creation
async function createFacebookProfile(page, email, password, firstName, lastName) {
  try {
    logger.log('Navigating to Facebook signup page...');
    await page.goto('https://www.facebook.com/signup', { waitUntil: 'networkidle2' });
    
    // Take a screenshot to see the current state
    await page.screenshot({ path: 'facebook-signup-initial.png' });
    
    // Try to automate the signup process
    logger.log('Attempting to fill in signup form...');
    
    // Try to find and fill in the first name field
    try {
      const firstNameSelectors = [
        'input[name="firstname"]',
        'input[id="u_0_b_"]'
      ];
      
      for (const selector of firstNameSelectors) {
        const firstNameField = await page.$(selector);
        if (firstNameField) {
          await humanBehavior.simulateTyping(page, selector, firstName);
          logger.log(`Filled first name using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill first name automatically:', e.message);
    }
    
    // Try to find and fill in the last name field
    try {
      const lastNameSelectors = [
        'input[name="lastname"]',
        'input[id="u_0_d_"]'
      ];
      
      for (const selector of lastNameSelectors) {
        const lastNameField = await page.$(selector);
        if (lastNameField) {
          await humanBehavior.simulateTyping(page, selector, lastName);
          logger.log(`Filled last name using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill last name automatically:', e.message);
    }
    
    // Try to find and fill in the email field
    try {
      const emailSelectors = [
        'input[name="reg_email__"]',
        'input[id="u_0_g_"]'
      ];
      
      for (const selector of emailSelectors) {
        const emailField = await page.$(selector);
        if (emailField) {
          await humanBehavior.simulateTyping(page, selector, email);
          logger.log(`Filled email using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill email automatically:', e.message);
    }
    
    // Try to find and fill in the password field
    try {
      const passwordSelectors = [
        'input[name="reg_passwd__"]',
        'input[id="password_step_input"]'
      ];
      
      for (const selector of passwordSelectors) {
        const passwordField = await page.$(selector);
        if (passwordField) {
          await humanBehavior.simulateTyping(page, selector, password);
          logger.log(`Filled password using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill password automatically:', e.message);
    }
    
    // Take a screenshot after filling in the form
    await page.screenshot({ path: 'facebook-signup-filled.png' });
    
    logger.log('\n⚠️ Please complete any remaining fields (birth date, gender) and submit the form.');
    logger.log('⚠️ Email/Phone Verification Required');
    logger.log('Please check your email or phone for a verification code from Facebook.');
    logger.log('Complete the verification process in the browser window.');
    
    await prompt('\nPress Enter after completing verification...');
    
    // Take a final screenshot
    await page.screenshot({ path: 'facebook-signup-final.png' });
    
    // Ask user if signup was successful
    const success = await prompt('Was the Facebook account creation successful? (y/n): ');
    
    if (success.toLowerCase() === 'y') {
      return [true, email];
    } else {
      return [false, ''];
    }
  } catch (error) {
    logger.error('Facebook profile creation failed:', error.message);
    // Take a screenshot of the error state
    try {
      await page.screenshot({ path: 'facebook-signup-error.png' });
    } catch (e) {
      // Ignore screenshot errors
    }
    return [false, ''];
  }
}

// Reddit profile creation
async function createRedditProfile(page, email, password, firstName, lastName) {
  try {
    logger.log('Navigating to Reddit signup page...');
    await page.goto('https://www.reddit.com/register/', { waitUntil: 'networkidle2' });
    
    // Take a screenshot to see the current state
    await page.screenshot({ path: 'reddit-signup-initial.png' });
    
    // Try to automate the signup process
    logger.log('Attempting to fill in signup form...');
    
    // Generate a username based on first and last name
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
    
    // Try to find and fill in the email field
    try {
      const emailSelectors = [
        'input[name="email"]',
        'input[id="regEmail"]',
        'input[type="email"]'
      ];
      
      for (const selector of emailSelectors) {
        const emailField = await page.$(selector);
        if (emailField) {
          await humanBehavior.simulateTyping(page, selector, email);
          logger.log(`Filled email using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill email automatically:', e.message);
    }
    
    // Try to find and fill in the username field
    try {
      const usernameSelectors = [
        'input[name="username"]',
        'input[id="regUsername"]'
      ];
      
      for (const selector of usernameSelectors) {
        const usernameField = await page.$(selector);
        if (usernameField) {
          await humanBehavior.simulateTyping(page, selector, username);
          logger.log(`Filled username using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill username automatically:', e.message);
    }
    
    // Try to find and fill in the password field
    try {
      const passwordSelectors = [
        'input[name="password"]',
        'input[id="regPassword"]',
        'input[type="password"]'
      ];
      
      for (const selector of passwordSelectors) {
        const passwordField = await page.$(selector);
        if (passwordField) {
          await humanBehavior.simulateTyping(page, selector, password);
          logger.log(`Filled password using selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      logger.log('Could not fill password automatically:', e.message);
    }
    
    // Take a screenshot after filling in the form
    await page.screenshot({ path: 'reddit-signup-filled.png' });
    
    logger.log('\n⚠️ Please complete any remaining fields and submit the form.');
    logger.log('⚠️ Email Verification Required');
    logger.log('Please check your email for a verification code from Reddit.');
    logger.log('Complete the verification process in the browser window.');
    
    await prompt('\nPress Enter after completing verification...');
    
    // Take a final screenshot
    await page.screenshot({ path: 'reddit-signup-final.png' });
    
    // Ask user if signup was successful
    const success = await prompt('Was the Reddit account creation successful? (y/n): ');
    
    if (success.toLowerCase() === 'y') {
      // Ask for the actual username that was created
      const actualUsername = await prompt('What username did you create? (leave blank to use suggested): ');
      return [true, actualUsername || username];
    } else {
      return [false, ''];
    }
  } catch (error) {
    logger.error('Reddit profile creation failed:', error.message);
    // Take a screenshot of the error state
    try {
      await page.screenshot({ path: 'reddit-signup-error.png' });
    } catch (e) {
      // Ignore screenshot errors
    }
    return [false, ''];
  }
}

// Profile setup functions
async function setupLinkedInProfile(page) {
  logger.log('Setting up LinkedIn profile...');
  // Set avatar, bio, and SEO profile links
  // This would be implemented with specific selectors and actions
}

async function setupXProfile(page) {
  logger.log('Setting up X profile...');
  // Set avatar, bio, and SEO profile links
}

async function setupTikTokProfile(page) {
  logger.log('Setting up TikTok profile...');
  // Set avatar, bio, and SEO profile links
}

async function setupYouTubeProfile(page) {
  logger.log('Setting up YouTube profile...');
  // Set avatar, bio, and SEO profile links
}

async function setupFacebookProfile(page) {
  logger.log('Setting up Facebook profile...');
  // Set avatar, bio, and SEO profile links
}

async function setupRedditProfile(page) {
  logger.log('Setting up Reddit profile...');
  // Set avatar, bio, and SEO profile links
}

// Main function to create profiles for all platforms
export async function createProfiles() {
  logger.log('=== Profile Creator ===');
  logger.log('This tool will help you create profiles on various social media platforms.');
  
  // Ask for first name and last name
  const firstName = await prompt('Enter first name: ');
  const lastName = await prompt('Enter last name: ');
  
  if (!firstName || !lastName) {
    logger.error('First name and last name are required.');
    process.exit(1);
  }
  
  // Ask which platforms to create profiles for
  logger.log('\nAvailable platforms:');
  logger.log('1. LinkedIn');
  logger.log('2. X (Twitter)');
  logger.log('3. TikTok');
  logger.log('4. YouTube');
  logger.log('5. Facebook');
  logger.log('6. Reddit');
  logger.log('7. All platforms');
  
  const platformChoice = await prompt('\nEnter the number of the platform to create a profile for (or multiple numbers separated by commas): ');
  
  const platforms = [];
  
  if (platformChoice.includes('7') || platformChoice.toLowerCase() === 'all') {
    platforms.push('linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit');
  } else {
    const choices = platformChoice.split(',').map(c => c.trim());
    
    if (choices.includes('1')) platforms.push('linkedin');
    if (choices.includes('2')) platforms.push('x');
    if (choices.includes('3')) platforms.push('tiktok');
    if (choices.includes('4')) platforms.push('youtube');
    if (choices.includes('5')) platforms.push('facebook');
    if (choices.includes('6')) platforms.push('reddit');
  }
  
  if (platforms.length === 0) {
    logger.error('No valid platforms selected.');
    process.exit(1);
  }
  
  // Ask if AI-driven autonomous account creation should be used
  const useAIResponse = await prompt('\nUse AI-driven autonomous account creation? (y/n): ');
  const useAI = useAIResponse.toLowerCase() === 'y' || useAIResponse.toLowerCase() === 'yes';
  
  if (useAI) {
    logger.log('\n🤖 AI-driven autonomous account creation enabled');
    logger.log('The system will use AI to detect and fill forms automatically.');
    logger.log('Note: You may still need to handle CAPTCHA and verification steps.');
  } else {
    logger.log('\n👤 Traditional account creation selected');
    logger.log('The system will use predefined form filling logic with manual assistance.');
  }
  
  logger.log(`\nCreating profiles for: ${platforms.join(', ')}`);
  
  // Load existing accounts
  const accounts = await loadAccounts();
  
  // Create profiles for each selected platform
  for (const platform of platforms) {
    if (!accounts[platform]) {
      accounts[platform] = [];
    }
    
    const account = await createProfile(platform, firstName, lastName, useAI);
    
    if (account) {
      // Add new account
      accounts[platform].push(account);
      
      // Save accounts
      await saveAccounts(accounts);
      
      logger.log(`Account saved successfully to ${platform}.`);
    }
  }
  
  logger.log('\n✅ Profile creation completed!');
  rl.close();
}

// If this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createProfiles().catch(error => {
    logger.error(`Error: ${error.message}`);
    rl.close();
  });
}
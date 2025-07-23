#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';
import crypto from 'crypto';

// Import logger
import { logger } from './utils/logger.mjs';

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
  // This is a simple encryption for demonstration
  // In production, use a more secure method with proper key management
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

// Helper function to decrypt sensitive data
function decrypt(hash) {
  const algorithm = 'aes-256-ctr';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me';
  const decipher = crypto.createDecipheriv(
    algorithm,
    secretKey,
    Buffer.from(hash.iv, 'hex')
  );
  
  const decrpyted = Buffer.concat([
    decipher.update(Buffer.from(hash.content, 'hex')),
    decipher.final()
  ]);
  
  return decrpyted.toString();
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

// List all accounts
async function listAccounts() {
  const accounts = await loadAccounts();
  const platforms = Object.keys(accounts);
  
  if (platforms.length === 0) {
    logger.log('No accounts found.');
    return;
  }
  
  logger.log('\n===== ACCOUNTS =====');
  
  for (const platform of platforms) {
    logger.log(`\n[${platform.toUpperCase()}]`);
    
    const platformAccounts = accounts[platform];
    if (platformAccounts.length === 0) {
      logger.log('  No accounts for this platform.');
      continue;
    }
    
    for (let i = 0; i < platformAccounts.length; i++) {
      const account = platformAccounts[i];
      logger.log(`  ${i + 1}. ${account.username} ${account.active ? '(ACTIVE)' : ''}`);
    }
  }
}

// Add a new account
async function addAccount() {
  const platform = await prompt('Enter platform (linkedin, x, tiktok, youtube, facebook, reddit): ');
  
  if (!['linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit'].includes(platform)) {
    logger.error('Invalid platform. Please choose from the available options.');
    return;
  }
  
  const username = await prompt('Enter username: ');
  const password = await prompt('Enter password: ');
  
  // Additional platform-specific credentials
  const additionalCredentials = {};
  
  if (platform === 'x') {
    additionalCredentials.apiKey = await prompt('Enter API key (optional): ');
    additionalCredentials.apiSecret = await prompt('Enter API secret (optional): ');
  } else if (platform === 'youtube') {
    additionalCredentials.clientId = await prompt('Enter client ID (optional): ');
    additionalCredentials.clientSecret = await prompt('Enter client secret (optional): ');
  } else if (platform === 'facebook') {
    additionalCredentials.appId = await prompt('Enter app ID (optional): ');
    additionalCredentials.appSecret = await prompt('Enter app secret (optional): ');
  }
  
  // Encrypt sensitive data
  const encryptedPassword = encrypt(password);
  
  // Create account object
  const account = {
    username,
    password: encryptedPassword,
    active: false,
    dateAdded: new Date().toISOString(),
    ...additionalCredentials
  };
  
  // Load existing accounts
  const accounts = await loadAccounts();
  
  // Initialize platform array if it doesn't exist
  if (!accounts[platform]) {
    accounts[platform] = [];
  }
  
  // Add new account
  accounts[platform].push(account);
  
  // Save accounts
  await saveAccounts(accounts);
  
  logger.log(`Account ${username} added successfully to ${platform}.`);
}

// Update an account
async function updateAccount() {
  const platform = await prompt('Enter platform (linkedin, x, tiktok, youtube, facebook, reddit): ');
  
  if (!['linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit'].includes(platform)) {
    logger.error('Invalid platform. Please choose from the available options.');
    return;
  }
  
  // Load accounts
  const accounts = await loadAccounts();
  
  // Check if platform exists
  if (!accounts[platform] || accounts[platform].length === 0) {
    logger.error(`No accounts found for ${platform}.`);
    return;
  }
  
  // Display accounts for the platform
  logger.log(`\n[${platform.toUpperCase()}]`);
  for (let i = 0; i < accounts[platform].length; i++) {
    const account = accounts[platform][i];
    logger.log(`  ${i + 1}. ${account.username} ${account.active ? '(ACTIVE)' : ''}`);
  }
  
  // Select account to update
  const index = parseInt(await prompt('Enter account number to update: ')) - 1;
  
  if (isNaN(index) || index < 0 || index >= accounts[platform].length) {
    logger.error('Invalid account number.');
    return;
  }
  
  const account = accounts[platform][index];
  
  // Update fields
  const updatePassword = (await prompt('Update password? (y/n): ')).toLowerCase() === 'y';
  if (updatePassword) {
    const password = await prompt('Enter new password: ');
    account.password = encrypt(password);
  }
  
  // Update additional fields based on platform
  if (platform === 'x') {
    const updateApiKey = (await prompt('Update API key? (y/n): ')).toLowerCase() === 'y';
    if (updateApiKey) {
      account.apiKey = await prompt('Enter new API key: ');
    }
    
    const updateApiSecret = (await prompt('Update API secret? (y/n): ')).toLowerCase() === 'y';
    if (updateApiSecret) {
      account.apiSecret = await prompt('Enter new API secret: ');
    }
  } else if (platform === 'youtube') {
    const updateClientId = (await prompt('Update client ID? (y/n): ')).toLowerCase() === 'y';
    if (updateClientId) {
      account.clientId = await prompt('Enter new client ID: ');
    }
    
    const updateClientSecret = (await prompt('Update client secret? (y/n): ')).toLowerCase() === 'y';
    if (updateClientSecret) {
      account.clientSecret = await prompt('Enter new client secret: ');
    }
  } else if (platform === 'facebook') {
    const updateAppId = (await prompt('Update app ID? (y/n): ')).toLowerCase() === 'y';
    if (updateAppId) {
      account.appId = await prompt('Enter new app ID: ');
    }
    
    const updateAppSecret = (await prompt('Update app secret? (y/n): ')).toLowerCase() === 'y';
    if (updateAppSecret) {
      account.appSecret = await prompt('Enter new app secret: ');
    }
  }
  
  // Save accounts
  await saveAccounts(accounts);
  
  logger.log(`Account ${account.username} updated successfully.`);
}

// Delete an account
async function deleteAccount() {
  const platform = await prompt('Enter platform (linkedin, x, tiktok, youtube, facebook, reddit): ');
  
  if (!['linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit'].includes(platform)) {
    logger.error('Invalid platform. Please choose from the available options.');
    return;
  }
  
  // Load accounts
  const accounts = await loadAccounts();
  
  // Check if platform exists
  if (!accounts[platform] || accounts[platform].length === 0) {
    logger.error(`No accounts found for ${platform}.`);
    return;
  }
  
  // Display accounts for the platform
  logger.log(`\n[${platform.toUpperCase()}]`);
  for (let i = 0; i < accounts[platform].length; i++) {
    const account = accounts[platform][i];
    logger.log(`  ${i + 1}. ${account.username} ${account.active ? '(ACTIVE)' : ''}`);
  }
  
  // Select account to delete
  const index = parseInt(await prompt('Enter account number to delete: ')) - 1;
  
  if (isNaN(index) || index < 0 || index >= accounts[platform].length) {
    logger.error('Invalid account number.');
    return;
  }
  
  const account = accounts[platform][index];
  
  // Confirm deletion
  const confirm = await prompt(`Are you sure you want to delete ${account.username}? (y/n): `);
  
  if (confirm.toLowerCase() !== 'y') {
    logger.log('Deletion cancelled.');
    return;
  }
  
  // Remove account
  accounts[platform].splice(index, 1);
  
  // Save accounts
  await saveAccounts(accounts);
  
  logger.log(`Account ${account.username} deleted successfully.`);
}

// Set active account for a platform
async function setActiveAccount() {
  const platform = await prompt('Enter platform (linkedin, x, tiktok, youtube, facebook, reddit): ');
  
  if (!['linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit'].includes(platform)) {
    logger.error('Invalid platform. Please choose from the available options.');
    return;
  }
  
  // Load accounts
  const accounts = await loadAccounts();
  
  // Check if platform exists
  if (!accounts[platform] || accounts[platform].length === 0) {
    logger.error(`No accounts found for ${platform}.`);
    return;
  }
  
  // Display accounts for the platform
  logger.log(`\n[${platform.toUpperCase()}]`);
  for (let i = 0; i < accounts[platform].length; i++) {
    const account = accounts[platform][i];
    logger.log(`  ${i + 1}. ${account.username} ${account.active ? '(ACTIVE)' : ''}`);
  }
  
  // Select account to set as active
  const index = parseInt(await prompt('Enter account number to set as active: ')) - 1;
  
  if (isNaN(index) || index < 0 || index >= accounts[platform].length) {
    logger.error('Invalid account number.');
    return;
  }
  
  // Set all accounts for this platform to inactive
  for (const acc of accounts[platform]) {
    acc.active = false;
  }
  
  // Set selected account to active
  accounts[platform][index].active = true;
  
  // Save accounts
  await saveAccounts(accounts);
  
  logger.log(`Account ${accounts[platform][index].username} set as active for ${platform}.`);
}

// Export account credentials to .env file
async function exportToEnv() {
  const accounts = await loadAccounts();
  const platforms = Object.keys(accounts);
  
  if (platforms.length === 0) {
    logger.error('No accounts found to export.');
    return;
  }
  
  // Read current .env file
  let envContent;
  try {
    envContent = await fs.readFile(path.join(__dirname, '../.env'), 'utf8');
  } catch (error) {
    envContent = '';
  }
  
  // Create a map of environment variables to update
  const envVars = {};
  
  // Process each platform
  for (const platform of platforms) {
    // Find active account for this platform
    const activeAccount = accounts[platform].find(acc => acc.active);
    
    if (!activeAccount) {
      logger.warn(`No active account found for ${platform}. Skipping.`);
      continue;
    }
    
    // Set platform-specific environment variables
    if (platform === 'linkedin') {
      envVars['LINKEDIN_USERNAME'] = activeAccount.username;
      envVars['LINKEDIN_PASSWORD'] = decrypt(activeAccount.password);
    } else if (platform === 'x') {
      envVars['X_USERNAME'] = activeAccount.username;
      envVars['X_PASSWORD'] = decrypt(activeAccount.password);
      if (activeAccount.apiKey) envVars['X_API_KEY'] = activeAccount.apiKey;
      if (activeAccount.apiSecret) envVars['X_API_SECRET'] = activeAccount.apiSecret;
    } else if (platform === 'tiktok') {
      envVars['TIKTOK_USERNAME'] = activeAccount.username;
      envVars['TIKTOK_PASSWORD'] = decrypt(activeAccount.password);
    } else if (platform === 'youtube') {
      envVars['YOUTUBE_USERNAME'] = activeAccount.username;
      envVars['YOUTUBE_PASSWORD'] = decrypt(activeAccount.password);
      if (activeAccount.clientId) envVars['YOUTUBE_CLIENT_ID'] = activeAccount.clientId;
      if (activeAccount.clientSecret) envVars['YOUTUBE_CLIENT_SECRET'] = activeAccount.clientSecret;
    } else if (platform === 'facebook') {
      envVars['FACEBOOK_USERNAME'] = activeAccount.username;
      envVars['FACEBOOK_PASSWORD'] = decrypt(activeAccount.password);
      if (activeAccount.appId) envVars['FACEBOOK_APP_ID'] = activeAccount.appId;
      if (activeAccount.appSecret) envVars['FACEBOOK_APP_SECRET'] = activeAccount.appSecret;
    } else if (platform === 'reddit') {
      envVars['REDDIT_USERNAME'] = activeAccount.username;
      envVars['REDDIT_PASSWORD'] = decrypt(activeAccount.password);
    }
  }
  
  // Update .env file
  for (const [key, value] of Object.entries(envVars)) {
    const regex = new RegExp(`^${key}=.*`, 'm');
    
    if (envContent.match(regex)) {
      // Update existing variable
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Add new variable
      envContent += `\n${key}=${value}`;
    }
  }
  
  // Write updated .env file
  await fs.writeFile(path.join(__dirname, '../.env'), envContent);
  
  logger.log('Account credentials exported to .env file successfully.');
}

// Main function
async function main() {
  console.log('\n🤖 Networking Bot - Account Manager\n');
  
  while (true) {
    console.log('\nOptions:');
    console.log('1. List accounts');
    console.log('2. Add account');
    console.log('3. Update account');
    console.log('4. Delete account');
    console.log('5. Set active account');
    console.log('6. Export active accounts to .env');
    console.log('7. Exit');
    
    const choice = await prompt('\nEnter your choice (1-7): ');
    
    switch (choice) {
      case '1':
        await listAccounts();
        break;
      case '2':
        await addAccount();
        break;
      case '3':
        await updateAccount();
        break;
      case '4':
        await deleteAccount();
        break;
      case '5':
        await setActiveAccount();
        break;
      case '6':
        await exportToEnv();
        break;
      case '7':
        console.log('Exiting account manager. Goodbye!');
        rl.close();
        return;
      default:
        console.log('Invalid choice. Please try again.');
    }
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Error: ${error.message}`);
  rl.close();
});

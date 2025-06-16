#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test accounts data
const testAccounts = {
  linkedin: [
    {
      username: 'test_linkedin_user',
      password: encrypt('test_password'),
      active: true,
      dateAdded: new Date().toISOString()
    }
  ],
  x: [
    {
      username: 'test_x_user',
      password: encrypt('test_password'),
      apiKey: 'test_api_key',
      apiSecret: 'test_api_secret',
      active: true,
      dateAdded: new Date().toISOString()
    }
  ],
  tiktok: [
    {
      username: 'test_tiktok_user',
      password: encrypt('test_password'),
      active: false,
      dateAdded: new Date().toISOString()
    },
    {
      username: 'test_tiktok_user2',
      password: encrypt('test_password2'),
      active: true,
      dateAdded: new Date().toISOString()
    }
  ]
};

// Test file paths
const TEST_ACCOUNTS_FILE = path.join(__dirname, '../test-accounts.json');
const TEST_ENV_FILE = path.join(__dirname, '../test.env');

// Helper function to encrypt sensitive data (copied from account-manager.mjs)
function encrypt(text) {
  const algorithm = 'aes-256-ctr';
  // For AES-256, key must be exactly 32 bytes (256 bits)
  const secretKey = crypto.createHash('sha256').update('test-encryption-key-for-unit-tests').digest();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  
  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex')
  };
}

// Helper function to decrypt sensitive data (copied from account-manager.mjs)
function decrypt(hash) {
  const algorithm = 'aes-256-ctr';
  // For AES-256, key must be exactly 32 bytes (256 bits)
  const secretKey = crypto.createHash('sha256').update('test-encryption-key-for-unit-tests').digest();
  
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
}

// Setup function to create test files
async function setup() {
  try {
    // Create test accounts file
    await fs.writeFile(TEST_ACCOUNTS_FILE, JSON.stringify(testAccounts, null, 2));
    
    // Create test env file
    await fs.writeFile(TEST_ENV_FILE, 'ENCRYPTION_KEY=test-encryption-key-for-unit-tests\n');
    
    console.log('Test setup completed successfully');
  } catch (error) {
    console.error('Error during test setup:', error);
    process.exit(1);
  }
}

// Cleanup function to remove test files
async function cleanup() {
  try {
    await fs.unlink(TEST_ACCOUNTS_FILE);
    await fs.unlink(TEST_ENV_FILE);
    console.log('Test cleanup completed successfully');
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
}

// Test function to load accounts
async function testLoadAccounts() {
  try {
    const accounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    assert.deepStrictEqual(accounts, testAccounts, 'Loaded accounts should match test accounts');
    console.log('✅ testLoadAccounts passed');
  } catch (error) {
    console.error('❌ testLoadAccounts failed:', error);
    throw error;
  }
}

// Test function to get active account
async function testGetActiveAccount() {
  try {
    const accounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    
    // LinkedIn should have an active account
    const linkedinActive = accounts.linkedin.find(acc => acc.active);
    assert.strictEqual(linkedinActive.username, 'test_linkedin_user', 'Active LinkedIn account should be test_linkedin_user');
    
    // X should have an active account
    const xActive = accounts.x.find(acc => acc.active);
    assert.strictEqual(xActive.username, 'test_x_user', 'Active X account should be test_x_user');
    
    // TikTok should have the second account as active
    const tiktokActive = accounts.tiktok.find(acc => acc.active);
    assert.strictEqual(tiktokActive.username, 'test_tiktok_user2', 'Active TikTok account should be test_tiktok_user2');
    
    console.log('✅ testGetActiveAccount passed');
  } catch (error) {
    console.error('❌ testGetActiveAccount failed:', error);
    throw error;
  }
}

// Test function to add a new account
async function testAddAccount() {
  try {
    // Load current accounts
    const accounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    
    // Add a new account for reddit
    if (!accounts.reddit) {
      accounts.reddit = [];
    }
    
    const newAccount = {
      username: 'test_reddit_user',
      password: encrypt('test_reddit_password'),
      active: true,
      dateAdded: new Date().toISOString()
    };
    
    accounts.reddit.push(newAccount);
    
    // Save updated accounts
    await fs.writeFile(TEST_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    
    // Verify account was added
    const updatedAccounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    assert.strictEqual(updatedAccounts.reddit.length, 1, 'Reddit should have 1 account');
    assert.strictEqual(updatedAccounts.reddit[0].username, 'test_reddit_user', 'Reddit account username should be test_reddit_user');
    
    console.log('✅ testAddAccount passed');
  } catch (error) {
    console.error('❌ testAddAccount failed:', error);
    throw error;
  }
}

// Test function to update an account
async function testUpdateAccount() {
  try {
    // Load current accounts
    const accounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    
    // Update LinkedIn account
    accounts.linkedin[0].password = encrypt('updated_password');
    
    // Save updated accounts
    await fs.writeFile(TEST_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    
    // Verify account was updated
    const updatedAccounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    const decryptedPassword = decrypt(updatedAccounts.linkedin[0].password);
    assert.strictEqual(decryptedPassword, 'updated_password', 'LinkedIn password should be updated');
    
    console.log('✅ testUpdateAccount passed');
  } catch (error) {
    console.error('❌ testUpdateAccount failed:', error);
    throw error;
  }
}

// Test function to delete an account
async function testDeleteAccount() {
  try {
    // Load current accounts
    const accounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    
    // Delete the first TikTok account
    accounts.tiktok.splice(0, 1);
    
    // Save updated accounts
    await fs.writeFile(TEST_ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    
    // Verify account was deleted
    const updatedAccounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    assert.strictEqual(updatedAccounts.tiktok.length, 1, 'TikTok should have 1 account');
    assert.strictEqual(updatedAccounts.tiktok[0].username, 'test_tiktok_user2', 'Remaining TikTok account should be test_tiktok_user2');
    
    console.log('✅ testDeleteAccount passed');
  } catch (error) {
    console.error('❌ testDeleteAccount failed:', error);
    throw error;
  }
}

// Test function to export accounts to .env
async function testExportToEnv() {
  try {
    // Load current accounts
    const accounts = JSON.parse(await fs.readFile(TEST_ACCOUNTS_FILE, 'utf8'));
    
    // Read current .env file
    let envContent = await fs.readFile(TEST_ENV_FILE, 'utf8');
    
    // Create a map of environment variables to update
    const envVars = {};
    
    // Process each platform
    for (const platform of Object.keys(accounts)) {
      // Find active account for this platform
      const activeAccount = accounts[platform].find(acc => acc.active);
      
      if (!activeAccount) {
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
    await fs.writeFile(TEST_ENV_FILE, envContent);
    
    // Verify .env file was updated
    const updatedEnvContent = await fs.readFile(TEST_ENV_FILE, 'utf8');
    
    // Check for LinkedIn credentials
    assert.ok(updatedEnvContent.includes('LINKEDIN_USERNAME=test_linkedin_user'), 'LinkedIn username should be in .env');
    assert.ok(updatedEnvContent.includes('LINKEDIN_PASSWORD=updated_password'), 'LinkedIn password should be in .env');
    
    // Check for X credentials
    assert.ok(updatedEnvContent.includes('X_USERNAME=test_x_user'), 'X username should be in .env');
    assert.ok(updatedEnvContent.includes('X_PASSWORD=test_password'), 'X password should be in .env');
    assert.ok(updatedEnvContent.includes('X_API_KEY=test_api_key'), 'X API key should be in .env');
    assert.ok(updatedEnvContent.includes('X_API_SECRET=test_api_secret'), 'X API secret should be in .env');
    
    // Check for TikTok credentials
    assert.ok(updatedEnvContent.includes('TIKTOK_USERNAME=test_tiktok_user2'), 'TikTok username should be in .env');
    assert.ok(updatedEnvContent.includes('TIKTOK_PASSWORD=test_password2'), 'TikTok password should be in .env');
    
    // Check for Reddit credentials
    assert.ok(updatedEnvContent.includes('REDDIT_USERNAME=test_reddit_user'), 'Reddit username should be in .env');
    assert.ok(updatedEnvContent.includes('REDDIT_PASSWORD=test_reddit_password'), 'Reddit password should be in .env');
    
    console.log('✅ testExportToEnv passed');
  } catch (error) {
    console.error('❌ testExportToEnv failed:', error);
    throw error;
  }
}

// Main test function
async function runTests() {
  try {
    console.log('Starting account manager tests...');
    
    // Setup test environment
    await setup();
    
    // Run tests
    await testLoadAccounts();
    await testGetActiveAccount();
    await testAddAccount();
    await testUpdateAccount();
    await testDeleteAccount();
    await testExportToEnv();
    
    console.log('\nAll tests passed successfully! 🎉');
  } catch (error) {
    console.error('\nTests failed:', error);
  } finally {
    // Clean up test environment
    await cleanup();
  }
}

// Run tests
runTests();

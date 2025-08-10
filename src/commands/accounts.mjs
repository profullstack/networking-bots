import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Define the accounts file path
const ACCOUNTS_FILE_PATH = path.join(__dirname, '../../accounts.json');

// Supported platforms
const SUPPORTED_PLATFORMS = ['linkedin', 'x', 'tiktok', 'youtube', 'facebook', 'reddit'];

/**
 * Create readline interface for CLI interaction
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
}

/**
 * Helper function to prompt for input
 */
function prompt(rl, question) {
  return new Promise((resolve) => {
    // Disable echo temporarily for clean input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Helper function to prompt for password input (hidden)
 */
function promptPassword(rl, question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    let password = '';
    
    const onData = (char) => {
      const charStr = char.toString();
      
      if (charStr === '\n' || charStr === '\r' || charStr === '\u0004') {
        // Enter or Ctrl+D
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password.trim());
      } else if (charStr === '\u0003') {
        // Ctrl+C
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        process.exit(1);
      } else if (charStr === '\u007f' || charStr === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (charStr >= ' ' && charStr <= '~') {
        // Printable characters
        password += charStr;
        process.stdout.write('*');
      }
    };
    
    process.stdin.on('data', onData);
  });
}

/**
 * Helper function to encrypt sensitive data
 */
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

/**
 * Helper function to decrypt sensitive data
 */
function decrypt(hash) {
  const algorithm = 'aes-256-ctr';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me';
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

/**
 * Load accounts from file
 */
async function loadAccounts() {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Save accounts to file
 */
async function saveAccounts(accounts) {
  await fs.writeFile(ACCOUNTS_FILE_PATH, JSON.stringify(accounts, null, 2));
}

/**
 * List all accounts
 */
async function listAccounts() {
  const accounts = await loadAccounts();
  const platforms = Object.keys(accounts);
  
  if (platforms.length === 0) {
    logger.log('📭 No accounts found.');
    logger.log('💡 Use: nbot accounts --add');
    return;
  }
  
  logger.log('\n👤 ACCOUNTS OVERVIEW');
  logger.log('='.repeat(50));
  
  for (const platform of platforms) {
    logger.log(`\n🔹 ${platform.toUpperCase()}`);
    
    const platformAccounts = accounts[platform];
    if (platformAccounts.length === 0) {
      logger.log('  📭 No accounts for this platform.');
      continue;
    }
    
    for (let i = 0; i < platformAccounts.length; i++) {
      const account = platformAccounts[i];
      const status = account.active ? '🟢 ACTIVE' : '⚪ INACTIVE';
      const dateAdded = account.dateAdded ? new Date(account.dateAdded).toLocaleDateString() : 'Unknown';
      logger.log(`  ${i + 1}. ${account.username} ${status} (Added: ${dateAdded})`);
    }
  }
  
  logger.log('\n💡 Use --set-active to change active accounts');
}

/**
 * Add a new account interactively
 */
async function addAccountInteractive() {
  const rl = createReadlineInterface();
  
  try {
    logger.log('\n➕ ADD NEW ACCOUNT');
    logger.log('='.repeat(30));
    
    const platform = await prompt(rl, `Enter platform (${SUPPORTED_PLATFORMS.join(', ')}): `);
    
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      logger.error('❌ Invalid platform. Please choose from the available options.');
      return;
    }
    
    const username = await prompt(rl, 'Enter username: ');
    const password = await promptPassword(rl, 'Enter password: ');
    
    // Additional platform-specific credentials
    const additionalCredentials = {};
    
    if (platform === 'x') {
      const apiKey = await prompt(rl, 'Enter API key (optional, press Enter to skip): ');
      const apiSecret = await prompt(rl, 'Enter API secret (optional, press Enter to skip): ');
      if (apiKey) additionalCredentials.apiKey = apiKey;
      if (apiSecret) additionalCredentials.apiSecret = apiSecret;
    } else if (platform === 'youtube') {
      const clientId = await prompt(rl, 'Enter client ID (optional, press Enter to skip): ');
      const clientSecret = await prompt(rl, 'Enter client secret (optional, press Enter to skip): ');
      if (clientId) additionalCredentials.clientId = clientId;
      if (clientSecret) additionalCredentials.clientSecret = clientSecret;
    } else if (platform === 'facebook') {
      const appId = await prompt(rl, 'Enter app ID (optional, press Enter to skip): ');
      const appSecret = await prompt(rl, 'Enter app secret (optional, press Enter to skip): ');
      if (appId) additionalCredentials.appId = appId;
      if (appSecret) additionalCredentials.appSecret = appSecret;
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
    
    logger.log(`✅ Account ${username} added successfully to ${platform}.`);
    logger.log('💡 Use --set-active to make this account active');
    
  } finally {
    rl.close();
  }
}

/**
 * Set active account for a platform
 */
async function setActiveAccountInteractive() {
  const rl = createReadlineInterface();
  
  try {
    logger.log('\n🎯 SET ACTIVE ACCOUNT');
    logger.log('='.repeat(30));
    
    const platform = await prompt(rl, `Enter platform (${SUPPORTED_PLATFORMS.join(', ')}): `);
    
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      logger.error('❌ Invalid platform. Please choose from the available options.');
      return;
    }
    
    // Load accounts
    const accounts = await loadAccounts();
    
    // Check if platform exists
    if (!accounts[platform] || accounts[platform].length === 0) {
      logger.error(`❌ No accounts found for ${platform}.`);
      logger.log('💡 Use --add to add an account first');
      return;
    }
    
    // Display accounts for the platform
    logger.log(`\n🔹 ${platform.toUpperCase()} ACCOUNTS:`);
    for (let i = 0; i < accounts[platform].length; i++) {
      const account = accounts[platform][i];
      const status = account.active ? '🟢 ACTIVE' : '⚪ INACTIVE';
      logger.log(`  ${i + 1}. ${account.username} ${status}`);
    }
    
    // Select account to set as active
    const index = parseInt(await prompt(rl, '\nEnter account number to set as active: ')) - 1;
    
    if (isNaN(index) || index < 0 || index >= accounts[platform].length) {
      logger.error('❌ Invalid account number.');
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
    
    logger.log(`✅ Account ${accounts[platform][index].username} set as active for ${platform}.`);
    
  } finally {
    rl.close();
  }
}

/**
 * Export account credentials to .env file
 */
async function exportToEnv() {
  const accounts = await loadAccounts();
  const platforms = Object.keys(accounts);
  
  if (platforms.length === 0) {
    logger.error('❌ No accounts found to export.');
    logger.log('💡 Use --add to add accounts first');
    return;
  }
  
  logger.log('\n📤 EXPORTING ACTIVE ACCOUNTS TO .ENV');
  logger.log('='.repeat(40));
  
  // Read current .env file
  let envContent;
  try {
    envContent = await fs.readFile(path.join(__dirname, '../../.env'), 'utf8');
  } catch (error) {
    envContent = '';
  }
  
  // Create a map of environment variables to update
  const envVars = {};
  let exportedCount = 0;
  
  // Process each platform
  for (const platform of platforms) {
    // Find active account for this platform
    const activeAccount = accounts[platform].find(acc => acc.active);
    
    if (!activeAccount) {
      logger.warn(`⚠️ No active account found for ${platform}. Skipping.`);
      continue;
    }
    
    logger.log(`✅ Exporting ${activeAccount.username} for ${platform}`);
    exportedCount++;
    
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
  
  if (exportedCount === 0) {
    logger.warn('⚠️ No active accounts found to export.');
    logger.log('💡 Use --set-active to activate accounts first');
    return;
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
  await fs.writeFile(path.join(__dirname, '../../.env'), envContent);
  
  logger.log(`\n✅ Exported ${exportedCount} active accounts to .env file successfully.`);
}

/**
 * Main accounts management function
 */
export async function manageAccounts(options = {}) {
  const { list, add, update, delete: deleteAccount, setActive, export: exportAccounts } = options;
  
  try {
    if (list) {
      await listAccounts();
    } else if (add) {
      await addAccountInteractive();
    } else if (setActive) {
      await setActiveAccountInteractive();
    } else if (exportAccounts) {
      await exportToEnv();
    } else {
      // Interactive mode - show menu
      await showAccountsMenu();
    }
  } catch (error) {
    logger.error(`❌ Account management error: ${error.message}`);
    throw error;
  }
}

/**
 * Interactive accounts menu
 */
async function showAccountsMenu() {
  const rl = createReadlineInterface();
  
  try {
    logger.log('\n👤 NETWORKING BOT - ACCOUNT MANAGER');
    logger.log('='.repeat(40));
    
    while (true) {
      logger.log('\nOptions:');
      logger.log('1. 📋 List accounts');
      logger.log('2. ➕ Add account');
      logger.log('3. 🎯 Set active account');
      logger.log('4. 📤 Export active accounts to .env');
      logger.log('5. 🚪 Exit');
      
      const choice = await prompt(rl, '\nEnter your choice (1-5): ');
      
      switch (choice) {
        case '1':
          await listAccounts();
          break;
        case '2':
          rl.close();
          await addAccountInteractive();
          return;
        case '3':
          rl.close();
          await setActiveAccountInteractive();
          return;
        case '4':
          await exportToEnv();
          break;
        case '5':
          logger.log('👋 Exiting account manager. Goodbye!');
          return;
        default:
          logger.log('❌ Invalid choice. Please try again.');
      }
    }
  } finally {
    rl.close();
  }
}
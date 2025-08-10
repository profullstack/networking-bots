import { createInterface } from 'readline';
import { logger } from '../utils/logger.mjs';
import { config } from '../utils/config.mjs';

/**
 * Create readline interface for CLI interaction
 */
function createReadlineInterface() {
  return createInterface({
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
 * Show current configuration
 */
async function showConfig() {
  const currentConfig = config.load();
  
  logger.log('\n⚙️  CURRENT CONFIGURATION');
  logger.log('='.repeat(40));
  logger.log(`📁 Config location: ${config.getConfigPath()}`);
  
  // Show platforms
  logger.log('\n🔹 PLATFORMS:');
  for (const [platform, settings] of Object.entries(currentConfig.platforms)) {
    const status = settings.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
    logger.log(`  ${platform}: ${status}`);
    if (settings.message) {
      logger.log(`    Message: "${settings.message.substring(0, 60)}${settings.message.length > 60 ? '...' : ''}"`);
    }
  }
  
  // Show search terms
  logger.log('\n🔍 SEARCH TERMS:');
  for (const [platform, terms] of Object.entries(currentConfig.searchTerms || {})) {
    if (terms && terms.length > 0) {
      logger.log(`  ${platform}: ${terms.join(', ')}`);
    }
  }
  
  // Show settings
  logger.log('\n⚙️  SETTINGS:');
  const settings = currentConfig.settings || {};
  logger.log(`  Working Hours: ${settings.respectWorkingHours ? 'Enabled' : 'Disabled'}`);
  logger.log(`  Max Messages/Day: ${settings.maxMessagesPerDay || 'Not set'}`);
  logger.log(`  Delay Between Messages: ${(settings.delayBetweenMessages || 0) / 60000} minutes`);
  logger.log(`  Retry Attempts: ${settings.retryAttempts || 'Not set'}`);
}

/**
 * Initialize configuration with default values
 */
async function initConfig() {
  logger.log('⚠️ This will reset your configuration to default values.');
  const rl = createReadlineInterface();
  
  try {
    const overwrite = await prompt(rl, 'Do you want to continue? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      logger.log('❌ Configuration initialization cancelled.');
      return;
    }
  } finally {
    rl.close();
  }
  
  config.reset();
  logger.log('✅ Configuration initialized with default values');
  logger.log('💡 Use: nbot config --edit to customize your settings');
}

/**
 * Edit configuration interactively
 */
async function editConfig() {
  let currentConfig = config.load();
  
  const rl = createReadlineInterface();
  
  try {
    logger.log('\n✏️  EDIT CONFIGURATION');
    logger.log('='.repeat(30));
    
    while (true) {
      logger.log('\nWhat would you like to edit?');
      logger.log('1. 🔹 Platform settings');
      logger.log('2. 🔍 Search terms');
      logger.log('3. ⚙️  General settings');
      logger.log('4. 💾 Save and exit');
      logger.log('5. 🚪 Exit without saving');
      
      const choice = await prompt(rl, '\nEnter your choice (1-5): ');
      
      switch (choice) {
        case '1':
          currentConfig = await editPlatformSettings(rl, currentConfig);
          break;
        case '2':
          currentConfig = await editSearchTerms(rl, currentConfig);
          break;
        case '3':
          currentConfig = await editGeneralSettings(rl, currentConfig);
          break;
        case '4':
          config.save(currentConfig);
          logger.log('✅ Configuration saved successfully!');
          return;
        case '5':
          logger.log('❌ Exiting without saving changes.');
          return;
        default:
          logger.log('❌ Invalid choice. Please try again.');
      }
    }
  } finally {
    rl.close();
  }
}

/**
 * Edit platform settings
 */
async function editPlatformSettings(rl, currentConfig) {
  logger.log('\n🔹 PLATFORM SETTINGS');
  logger.log('='.repeat(25));
  
  const platforms = Object.keys(currentConfig.platforms);
  
  // Show current platforms
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const settings = currentConfig.platforms[platform];
    const status = settings.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
    logger.log(`${i + 1}. ${platform}: ${status}`);
  }
  
  const platformIndex = parseInt(await prompt(rl, '\nSelect platform to edit (number): ')) - 1;
  
  if (isNaN(platformIndex) || platformIndex < 0 || platformIndex >= platforms.length) {
    logger.log('❌ Invalid platform selection.');
    return currentConfig;
  }
  
  const selectedPlatform = platforms[platformIndex];
  const platformConfig = currentConfig.platforms[selectedPlatform];
  
  // Edit enabled status
  const currentStatus = platformConfig.enabled ? 'enabled' : 'disabled';
  const newStatus = await prompt(rl, `Platform is currently ${currentStatus}. Enable? (y/N): `);
  platformConfig.enabled = newStatus.toLowerCase() === 'y';
  
  // Edit message
  logger.log(`\nCurrent message: "${platformConfig.message}"`);
  const newMessage = await prompt(rl, 'Enter new message (or press Enter to keep current): ');
  if (newMessage) {
    platformConfig.message = newMessage;
  }
  
  logger.log(`✅ Updated ${selectedPlatform} settings.`);
  return currentConfig;
}

/**
 * Edit search terms
 */
async function editSearchTerms(rl, currentConfig) {
  logger.log('\n🔍 SEARCH TERMS');
  logger.log('='.repeat(20));
  
  const platforms = Object.keys(currentConfig.platforms);
  
  // Show current search terms
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const terms = currentConfig.searchTerms[platform] || [];
    logger.log(`${i + 1}. ${platform}: ${terms.join(', ') || 'No terms set'}`);
  }
  
  const platformIndex = parseInt(await prompt(rl, '\nSelect platform to edit search terms (number): ')) - 1;
  
  if (isNaN(platformIndex) || platformIndex < 0 || platformIndex >= platforms.length) {
    logger.log('❌ Invalid platform selection.');
    return currentConfig;
  }
  
  const selectedPlatform = platforms[platformIndex];
  const currentTerms = currentConfig.searchTerms[selectedPlatform] || [];
  
  logger.log(`\nCurrent search terms for ${selectedPlatform}: ${currentTerms.join(', ')}`);
  const newTerms = await prompt(rl, 'Enter new search terms (comma-separated): ');
  
  if (newTerms) {
    currentConfig.searchTerms[selectedPlatform] = newTerms.split(',').map(term => term.trim()).filter(term => term);
    logger.log(`✅ Updated search terms for ${selectedPlatform}.`);
  }
  
  return currentConfig;
}

/**
 * Edit general settings
 */
async function editGeneralSettings(rl, currentConfig) {
  logger.log('\n⚙️  GENERAL SETTINGS');
  logger.log('='.repeat(25));
  
  const settings = currentConfig.settings || {};
  
  // Working hours
  const currentWorkingHours = settings.respectWorkingHours ? 'enabled' : 'disabled';
  const workingHours = await prompt(rl, `Working hours are ${currentWorkingHours}. Enable? (y/N): `);
  settings.respectWorkingHours = workingHours.toLowerCase() === 'y';
  
  // Max messages per day
  const currentMax = settings.maxMessagesPerDay || 10;
  const maxMessages = await prompt(rl, `Max messages per day (current: ${currentMax}): `);
  if (maxMessages && !isNaN(parseInt(maxMessages))) {
    settings.maxMessagesPerDay = parseInt(maxMessages);
  }
  
  // Delay between messages
  const currentDelay = (settings.delayBetweenMessages || 300000) / 60000;
  const delay = await prompt(rl, `Delay between messages in minutes (current: ${currentDelay}): `);
  if (delay && !isNaN(parseFloat(delay))) {
    settings.delayBetweenMessages = parseFloat(delay) * 60000;
  }
  
  currentConfig.settings = settings;
  logger.log('✅ Updated general settings.');
  
  return currentConfig;
}

/**
 * Configure specific platform
 */
async function configurePlatform(platform) {
  let currentConfig = config.load();
  
  if (!currentConfig.platforms[platform]) {
    logger.error(`❌ Platform '${platform}' not found in configuration.`);
    return;
  }
  
  const rl = createReadlineInterface();
  
  try {
    logger.log(`\n🔹 CONFIGURE ${platform.toUpperCase()}`);
    logger.log('='.repeat(30));
    
    const platformConfig = currentConfig.platforms[platform];
    
    // Show current settings
    logger.log(`Current status: ${platformConfig.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
    logger.log(`Current message: "${platformConfig.message}"`);
    logger.log(`Search terms: ${(currentConfig.searchTerms[platform] || []).join(', ')}`);
    
    // Edit settings
    const enable = await prompt(rl, '\nEnable this platform? (y/N): ');
    platformConfig.enabled = enable.toLowerCase() === 'y';
    
    const message = await prompt(rl, 'Enter message template: ');
    if (message) {
      platformConfig.message = message;
    }
    
    const terms = await prompt(rl, 'Enter search terms (comma-separated): ');
    if (terms) {
      currentConfig.searchTerms[platform] = terms.split(',').map(term => term.trim()).filter(term => term);
    }
    
    config.save(currentConfig);
    logger.log(`✅ ${platform} configuration updated successfully!`);
    
  } finally {
    rl.close();
  }
}

/**
 * Main configuration management function
 */
export async function configureBot(options = {}) {
  const { show, edit, init, platform } = options;
  
  try {
    if (init) {
      await initConfig();
    } else if (show) {
      await showConfig();
    } else if (edit) {
      await editConfig();
    } else if (platform) {
      await configurePlatform(platform);
    } else {
      // Show current config by default
      await showConfig();
    }
  } catch (error) {
    logger.error(`❌ Configuration error: ${error.message}`);
    throw error;
  }
}
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { logger } from '../utils/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration template
const DEFAULT_CONFIG = {
  platforms: {
    tiktok: { 
      enabled: false,
      message: "Hi! I noticed your interest in [topic]. I'd love to connect and share some insights!"
    },
    x: { 
      enabled: false,
      message: "Hey! Saw your post about [topic]. Would love to connect and discuss further!"
    },
    youtube: { 
      enabled: false,
      message: "Great content on [topic]! I'd love to connect and share some related insights."
    },
    facebook: { 
      enabled: false,
      message: "Hi! I found your post about [topic] really interesting. Let's connect!"
    },
    reddit: { 
      enabled: false,
      message: "Great point about [topic]! I'd love to discuss this further with you."
    },
    linkedin: { 
      enabled: false,
      message: "Hi! I noticed your expertise in [topic]. I'd love to connect and share insights!"
    }
  },
  searchTerms: {
    tiktok: ["entrepreneurship", "startup", "business"],
    x: ["tech", "startup", "entrepreneur"],
    youtube: ["business", "marketing", "growth"],
    facebook: ["entrepreneur", "business", "networking"],
    reddit: ["startup", "entrepreneur", "business"],
    linkedin: ["professional", "business", "networking"]
  },
  settings: {
    respectWorkingHours: true,
    maxMessagesPerDay: 10,
    delayBetweenMessages: 300000, // 5 minutes in milliseconds
    retryAttempts: 3
  }
};

/**
 * Create readline interface for CLI interaction
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Helper function to prompt for input
 */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Load configuration from file
 */
async function loadConfig(configPath = './config.json') {
  try {
    const fullPath = path.resolve(configPath);
    const data = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Save configuration to file
 */
async function saveConfig(config, configPath = './config.json') {
  const fullPath = path.resolve(configPath);
  await fs.writeFile(fullPath, JSON.stringify(config, null, 2));
}

/**
 * Show current configuration
 */
async function showConfig(configPath = './config.json') {
  const config = await loadConfig(configPath);
  
  if (!config) {
    logger.log('❌ No configuration file found.');
    logger.log('💡 Use: nbot config --init');
    return;
  }
  
  logger.log('\n⚙️  CURRENT CONFIGURATION');
  logger.log('='.repeat(40));
  
  // Show platforms
  logger.log('\n🔹 PLATFORMS:');
  for (const [platform, settings] of Object.entries(config.platforms)) {
    const status = settings.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
    logger.log(`  ${platform}: ${status}`);
    if (settings.message) {
      logger.log(`    Message: "${settings.message.substring(0, 60)}${settings.message.length > 60 ? '...' : ''}"`);
    }
  }
  
  // Show search terms
  logger.log('\n🔍 SEARCH TERMS:');
  for (const [platform, terms] of Object.entries(config.searchTerms || {})) {
    if (terms && terms.length > 0) {
      logger.log(`  ${platform}: ${terms.join(', ')}`);
    }
  }
  
  // Show settings
  logger.log('\n⚙️  SETTINGS:');
  const settings = config.settings || {};
  logger.log(`  Working Hours: ${settings.respectWorkingHours ? 'Enabled' : 'Disabled'}`);
  logger.log(`  Max Messages/Day: ${settings.maxMessagesPerDay || 'Not set'}`);
  logger.log(`  Delay Between Messages: ${(settings.delayBetweenMessages || 0) / 60000} minutes`);
  logger.log(`  Retry Attempts: ${settings.retryAttempts || 'Not set'}`);
}

/**
 * Initialize default configuration
 */
async function initConfig(configPath = './config.json') {
  const existingConfig = await loadConfig(configPath);
  
  if (existingConfig) {
    logger.log('⚠️ Configuration file already exists.');
    const rl = createReadlineInterface();
    
    try {
      const overwrite = await prompt(rl, 'Do you want to overwrite it? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        logger.log('❌ Configuration initialization cancelled.');
        return;
      }
    } finally {
      rl.close();
    }
  }
  
  await saveConfig(DEFAULT_CONFIG, configPath);
  logger.log('✅ Default configuration created successfully!');
  logger.log('💡 Use: nbot config --edit to customize your settings');
}

/**
 * Edit configuration interactively
 */
async function editConfig(configPath = './config.json') {
  let config = await loadConfig(configPath);
  
  if (!config) {
    logger.log('❌ No configuration file found.');
    logger.log('💡 Use: nbot config --init first');
    return;
  }
  
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
          config = await editPlatformSettings(rl, config);
          break;
        case '2':
          config = await editSearchTerms(rl, config);
          break;
        case '3':
          config = await editGeneralSettings(rl, config);
          break;
        case '4':
          await saveConfig(config, configPath);
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
async function editPlatformSettings(rl, config) {
  logger.log('\n🔹 PLATFORM SETTINGS');
  logger.log('='.repeat(25));
  
  const platforms = Object.keys(config.platforms);
  
  // Show current platforms
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const settings = config.platforms[platform];
    const status = settings.enabled ? '🟢 ENABLED' : '🔴 DISABLED';
    logger.log(`${i + 1}. ${platform}: ${status}`);
  }
  
  const platformIndex = parseInt(await prompt(rl, '\nSelect platform to edit (number): ')) - 1;
  
  if (isNaN(platformIndex) || platformIndex < 0 || platformIndex >= platforms.length) {
    logger.log('❌ Invalid platform selection.');
    return config;
  }
  
  const selectedPlatform = platforms[platformIndex];
  const platformConfig = config.platforms[selectedPlatform];
  
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
  return config;
}

/**
 * Edit search terms
 */
async function editSearchTerms(rl, config) {
  logger.log('\n🔍 SEARCH TERMS');
  logger.log('='.repeat(20));
  
  const platforms = Object.keys(config.platforms);
  
  // Show current search terms
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const terms = config.searchTerms[platform] || [];
    logger.log(`${i + 1}. ${platform}: ${terms.join(', ') || 'No terms set'}`);
  }
  
  const platformIndex = parseInt(await prompt(rl, '\nSelect platform to edit search terms (number): ')) - 1;
  
  if (isNaN(platformIndex) || platformIndex < 0 || platformIndex >= platforms.length) {
    logger.log('❌ Invalid platform selection.');
    return config;
  }
  
  const selectedPlatform = platforms[platformIndex];
  const currentTerms = config.searchTerms[selectedPlatform] || [];
  
  logger.log(`\nCurrent search terms for ${selectedPlatform}: ${currentTerms.join(', ')}`);
  const newTerms = await prompt(rl, 'Enter new search terms (comma-separated): ');
  
  if (newTerms) {
    config.searchTerms[selectedPlatform] = newTerms.split(',').map(term => term.trim()).filter(term => term);
    logger.log(`✅ Updated search terms for ${selectedPlatform}.`);
  }
  
  return config;
}

/**
 * Edit general settings
 */
async function editGeneralSettings(rl, config) {
  logger.log('\n⚙️  GENERAL SETTINGS');
  logger.log('='.repeat(25));
  
  const settings = config.settings || {};
  
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
  
  config.settings = settings;
  logger.log('✅ Updated general settings.');
  
  return config;
}

/**
 * Configure specific platform
 */
async function configurePlatform(platform, configPath = './config.json') {
  let config = await loadConfig(configPath);
  
  if (!config) {
    logger.log('❌ No configuration file found.');
    logger.log('💡 Use: nbot config --init first');
    return;
  }
  
  if (!config.platforms[platform]) {
    logger.error(`❌ Platform '${platform}' not found in configuration.`);
    return;
  }
  
  const rl = createReadlineInterface();
  
  try {
    logger.log(`\n🔹 CONFIGURE ${platform.toUpperCase()}`);
    logger.log('='.repeat(30));
    
    const platformConfig = config.platforms[platform];
    
    // Show current settings
    logger.log(`Current status: ${platformConfig.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
    logger.log(`Current message: "${platformConfig.message}"`);
    logger.log(`Search terms: ${(config.searchTerms[platform] || []).join(', ')}`);
    
    // Edit settings
    const enable = await prompt(rl, '\nEnable this platform? (y/N): ');
    platformConfig.enabled = enable.toLowerCase() === 'y';
    
    const message = await prompt(rl, 'Enter message template: ');
    if (message) {
      platformConfig.message = message;
    }
    
    const terms = await prompt(rl, 'Enter search terms (comma-separated): ');
    if (terms) {
      config.searchTerms[platform] = terms.split(',').map(term => term.trim()).filter(term => term);
    }
    
    await saveConfig(config, configPath);
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
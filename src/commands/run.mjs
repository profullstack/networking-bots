import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.mjs';

// Import platform modules
import * as tiktok from '../platforms/tiktok.mjs';
import * as x from '../platforms/x.mjs';
import * as youtube from '../platforms/youtube.mjs';
import * as facebook from '../platforms/facebook.mjs';
import * as reddit from '../platforms/reddit.mjs';
import * as linkedin from '../platforms/linkedin.mjs';

// Import services
import { proxyManager } from '../services/proxy-manager.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';

// Import utilities
import { loadMessagedUsers, saveMessagedUsers, migrateMessagedUsers } from '../utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Map platform names to their modules
const platforms = {
  tiktok,
  x,
  youtube,
  facebook,
  reddit,
  linkedin
};

/**
 * Load configuration from config.json
 */
async function loadConfig(configPath = 'config.json') {
  try {
    const fullPath = path.resolve(configPath);
    const data = await fs.readFile(fullPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.warn(`Could not load config from ${configPath}: ${error.message}`);
    logger.log('Using default configuration...');
    
    // Return default config
    return {
      platforms: {
        tiktok: { enabled: false },
        x: { enabled: false },
        youtube: { enabled: false },
        facebook: { enabled: false },
        reddit: { enabled: false },
        linkedin: { enabled: false }
      },
      searchTerms: {},
      settings: { respectWorkingHours: false }
    };
  }
}

/**
 * Load accounts from accounts.json
 */
async function loadAccountsData() {
  try {
    const accountsPath = path.join(__dirname, '../../accounts.json');
    const data = await fs.readFile(accountsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Get active account for a platform
 */
async function getActiveAccount(platform) {
  const accounts = await loadAccountsData();
  if (!accounts[platform]) return null;
  return accounts[platform].find(acc => acc.active) || null;
}

/**
 * Initialize services and platforms
 */
async function initialize(config, enabledPlatforms = null) {
  logger.log('🔧 Initializing services...');
  
  // Initialize proxy manager first
  try {
    await proxyManager.initialize();
    logger.log('✅ Proxy manager initialized');
  } catch (error) {
    logger.warn(`⚠️ Proxy manager initialization had issues: ${error.message}`);
    logger.warn('Will continue without proxies');
    proxyManager.proxyList = [];
  }
  
  // Initialize rate limiter
  try {
    await rateLimiter.initialize();
    logger.log('✅ Rate limiter initialized');
  } catch (error) {
    logger.warn(`⚠️ Rate limiter initialization had issues: ${error.message}`);
    logger.warn('Will continue without rate limiting');
  }
  
  logger.log('🔧 Initializing platforms...');
  
  const platformsToInit = enabledPlatforms || Object.keys(platforms);
  
  for (const name of platformsToInit) {
    if (config.platforms[name]?.enabled) {
      try {
        await platforms[name].initialize();
        logger.log(`✅ ${name} initialized`);
      } catch (error) {
        logger.error(`❌ Failed to initialize ${name}: ${error.message}`);
        // Disable the platform if initialization fails
        config.platforms[name].enabled = false;
      }
    } else {
      logger.log(`⏭️ Skipping disabled platform: ${name}`);
    }
  }
}

/**
 * Run the bot for a specific platform
 */
async function runPlatform(platformName, config, dryRun = false) {
  if (!config.platforms[platformName]?.enabled) {
    return;
  }
  
  logger.log(`\n🔄 Running ${platformName} bot...`);
  const platform = platforms[platformName];
  const messaged = await loadMessagedUsers(platformName);
  
  try {
    // Check if we're within working hours (if enabled)
    if (config.settings?.respectWorkingHours) {
      const hour = new Date().getHours();
      if (hour < 8 || hour > 22) {
        logger.log('⏰ Outside working hours (8 AM - 10 PM). Skipping this run.');
        return;
      }
    }
    
    // Find potential users based on search terms
    const candidates = await platform.findPotentialUsers(config.searchTerms[platformName]);
    logger.log(`🔍 Found ${candidates.length} potential users on ${platformName}`);
    
    // Filter out already messaged users
    const filtered = candidates.filter(user => !messaged.includes(user));
    
    logger.log(`✨ ${filtered.length} new candidates on ${platformName}`);
    
    if (filtered.length === 0) {
      logger.log(`📭 No new candidates found for ${platformName}.`);
      return;
    }
    
    // Message only one user per platform per run
    const nextUser = filtered[0];
    
    if (dryRun) {
      logger.log(`🧪 [DRY RUN] Would message user: ${nextUser} on ${platformName}`);
      logger.log(`📝 Message: ${config.platforms[platformName].message || 'No message configured'}`);
      return;
    }
    
    const success = await platform.messageUser(nextUser, config.platforms[platformName].message);
    
    // Only save to messaged list if successful
    if (success) {
      messaged.push(nextUser);
      await saveMessagedUsers(platformName, messaged);
      logger.log(`✅ Added ${nextUser} to messaged ${platformName} users list`);
    }
  } catch (error) {
    logger.error(`❌ Error running ${platformName} bot: ${error.message}`);
  }
}

/**
 * Cleanup resources before exit
 */
async function cleanup() {
  logger.log('🧹 Cleaning up resources...');
  
  for (const [name, platform] of Object.entries(platforms)) {
    if (platform.cleanup && typeof platform.cleanup === 'function') {
      try {
        await platform.cleanup();
        logger.log(`✅ ${name} cleaned up`);
      } catch (error) {
        logger.error(`❌ Error cleaning up ${name}: ${error.message}`);
      }
    }
  }
}

/**
 * Main run function for the networking bot
 */
export async function runNetworkingBot(options = {}) {
  const { platform: targetPlatform, dryRun = false, config: configPath = './config.json' } = options;
  
  logger.log(`\n🤖 Starting networking bot at ${dayjs().format('YYYY-MM-DD HH:mm')}`);
  
  if (dryRun) {
    logger.log('🧪 Running in DRY RUN mode - no actual messages will be sent');
  }
  
  try {
    // Load configuration
    const config = await loadConfig(configPath);
    
    // Migrate existing messaged.json to platform-specific files
    await migrateMessagedUsers();
    
    // Determine which platforms to run
    const platformsToRun = targetPlatform 
      ? [targetPlatform] 
      : Object.keys(platforms).filter(name => config.platforms[name]?.enabled);
    
    if (platformsToRun.length === 0) {
      logger.warn('⚠️ No platforms enabled or specified. Please configure platforms first.');
      logger.log('💡 Use: nbot config --edit');
      return;
    }
    
    // Initialize services and platforms
    await initialize(config, platformsToRun);
    
    // Run each platform sequentially
    for (const platformName of platformsToRun) {
      if (config.platforms[platformName]?.enabled) {
        await runPlatform(platformName, config, dryRun);
        
        // Add a delay between platforms to avoid detection (skip in dry run)
        if (!dryRun && platformsToRun.indexOf(platformName) < platformsToRun.length - 1) {
          const delay = 5 * 60 * 1000; // 5 minutes
          logger.log(`⏱️ Waiting ${delay/60000} minutes before next platform...`);
          await wait(delay);
        }
      }
    }
    
    if (!dryRun && !targetPlatform) {
      // Calculate next run time with some randomness to appear more human-like
      const baseDelay = 60 * 60 * 1000; // 1 hour base
      const randomDelay = Math.floor(Math.random() * 30 * 60 * 1000); // Random up to 30 minutes
      const totalDelay = baseDelay + randomDelay;
      const nextRunTime = new Date(Date.now() + totalDelay);
      
      logger.log(`\n⏰ Next run scheduled for ${nextRunTime.toLocaleTimeString()}`);
      logger.log('💡 Press Ctrl+C to stop the bot');
      
      await wait(totalDelay);
      await runNetworkingBot(options); // Recursive call for continuous operation
    }
    
  } catch (error) {
    logger.error(`💥 Fatal error: ${error.message}`);
    await cleanup();
    throw error;
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.log('\n👋 Shutting down networking bot...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.log('\n👋 Shutting down networking bot...');
  await cleanup();
  process.exit(0);
});
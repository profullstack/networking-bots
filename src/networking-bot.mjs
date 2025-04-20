#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import { logger } from './utils/logger.mjs';

// Import platform modules
import * as tiktok from './platforms/tiktok.mjs';
import * as x from './platforms/x.mjs';
import * as youtube from './platforms/youtube.mjs';
import * as facebook from './platforms/facebook.mjs';
import * as reddit from './platforms/reddit.mjs';
import * as linkedin from './platforms/linkedin.mjs';

// Import services
import { proxyManager } from './services/proxy-manager.mjs';
import { rateLimiter } from './services/rate-limiter.mjs';

// Import utilities
import { loadMessagedUsers, saveMessagedUsers, migrateMessagedUsers } from './utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load config from config.json
const config = JSON.parse(await fs.readFile(path.join(__dirname, '../config.json')));

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
 * Initialize services and platforms
 */
async function initialize() {
  logger.log('Initializing services...');
  
  // Initialize proxy manager first
  try {
    await proxyManager.initialize();
    logger.log('✅ Proxy manager initialized');
  } catch (error) {
    logger.warn(`⚠️ Proxy manager initialization had issues: ${error.message}`);
    logger.warn('Will continue without proxies');
    // Create an empty proxy list to prevent further errors
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
  
  
  logger.log('Initializing platforms...');
  
  for (const [name, platform] of Object.entries(platforms)) {
    if (config.platforms[name]?.enabled) {
      try {
        await platform.initialize();
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
 * @param {string} platformName - The platform name (tiktok, x)
 */
async function runPlatform(platformName) {
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
        logger.log('Outside working hours (8 AM - 10 PM). Skipping this run.');
        return;
      }
    }
    
    // Find potential users based on search terms
    const candidates = await platform.findPotentialUsers(config.searchTerms[platformName]);
    logger.log(`Found ${candidates.length} potential users on ${platformName}`);
    
    // Filter out already messaged users
    const filtered = candidates.filter(user => !messaged.includes(user));
    
    logger.log(`${filtered.length} new candidates on ${platformName}`);
    
    if (filtered.length === 0) {
      logger.log(`No new candidates found for ${platformName}.`);
      return;
    }
    
    // Message only one user per platform per run
    const nextUser = filtered[0];
    const success = await platform.messageUser(nextUser, config.platforms[platformName].message);
    
    // Only save to messaged list if successful
    if (success) {
      messaged.push(nextUser);
      await saveMessagedUsers(platformName, messaged);
      logger.log(`Added ${nextUser} to messaged ${platformName} users list`);
    }
  } catch (error) {
    logger.error(`Error running ${platformName} bot: ${error.message}`);
  }
}

/**
 * Cleanup resources before exit
 */
async function cleanup() {
  logger.log('Cleaning up resources...');
  
  for (const [name, platform] of Object.entries(platforms)) {
    if (platform.cleanup && typeof platform.cleanup === 'function') {
      try {
        await platform.cleanup();
        logger.log(`✅ ${name} cleaned up`);
      } catch (error) {
        logger.error(`Error cleaning up ${name}: ${error.message}`);
      }
    }
  }
}

/**
 * Main function that runs all enabled platforms
 */
async function main() {
  logger.log(`\n🤖 Starting networking bot at ${dayjs().format('YYYY-MM-DD HH:mm')}`);
  
  try {
    // Migrate existing messaged.json to platform-specific files
    await migrateMessagedUsers();
    
    // Initialize all services and platforms
    await initialize();
    
    // Run each platform sequentially
    for (const platformName of Object.keys(platforms)) {
      if (config.platforms[platformName]?.enabled) {
        await runPlatform(platformName);
        
        // Add a delay between platforms to avoid detection
        if (Object.keys(platforms).indexOf(platformName) < Object.keys(platforms).length - 1) {
          const delay = 5 * 60 * 1000; // 5 minutes
          logger.log(`Waiting ${delay/60000} minutes before next platform...`);
          await wait(delay);
        }
      }
    }
    
    // Calculate next run time with some randomness to appear more human-like
    const baseDelay = 60 * 60 * 1000; // 1 hour base
    const randomDelay = Math.floor(Math.random() * 30 * 60 * 1000); // Random up to 30 minutes
    const totalDelay = baseDelay + randomDelay;
    const nextRunTime = new Date(Date.now() + totalDelay);
    
    logger.log(`\n⏱️ Next run scheduled for ${nextRunTime.toLocaleTimeString()}`);
    await wait(totalDelay);
    await main();
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    await cleanup();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.log('\nShutting down...');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.log('\nShutting down...');
  await cleanup();
  process.exit(0);
});

// Start the bot
main().catch(async (err) => {
  logger.error('Fatal error:', err);
  await cleanup();
  process.exit(1);
});

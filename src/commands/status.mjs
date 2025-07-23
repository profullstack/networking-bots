import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import { logger } from '../utils/logger.mjs';
import { loadMessagedUsers } from '../utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supported platforms
const PLATFORMS = ['tiktok', 'x', 'youtube', 'facebook', 'reddit', 'linkedin'];

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
 * Load accounts from file
 */
async function loadAccounts() {
  try {
    const accountsPath = path.join(__dirname, '../../accounts.json');
    const data = await fs.readFile(accountsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Get platform statistics
 */
async function getPlatformStats(platform) {
  try {
    const messagedUsers = await loadMessagedUsers(platform);
    const today = dayjs().format('YYYY-MM-DD');
    
    // Count messages sent today (this is a simplified approach)
    // In a real implementation, you'd want to store timestamps
    const messagesToday = 0; // Placeholder - would need timestamp tracking
    
    return {
      totalMessaged: messagedUsers.length,
      messagesToday,
      lastActivity: messagedUsers.length > 0 ? 'Recent' : 'None'
    };
  } catch (error) {
    return {
      totalMessaged: 0,
      messagesToday: 0,
      lastActivity: 'None'
    };
  }
}

/**
 * Show overall bot status
 */
async function showOverallStatus() {
  logger.log('\n📊 NETWORKING BOT STATUS');
  logger.log('='.repeat(40));
  
  // Load configuration
  const config = await loadConfig();
  if (!config) {
    logger.log('❌ No configuration found');
    logger.log('💡 Use: nbot config --init');
    return;
  }
  
  // Load accounts
  const accounts = await loadAccounts();
  
  // Show configuration status
  logger.log('\n⚙️  CONFIGURATION:');
  const enabledPlatforms = Object.entries(config.platforms)
    .filter(([_, settings]) => settings.enabled)
    .map(([platform, _]) => platform);
  
  logger.log(`  Enabled platforms: ${enabledPlatforms.length > 0 ? enabledPlatforms.join(', ') : 'None'}`);
  logger.log(`  Working hours: ${config.settings?.respectWorkingHours ? 'Enabled' : 'Disabled'}`);
  logger.log(`  Max messages/day: ${config.settings?.maxMessagesPerDay || 'Not set'}`);
  
  // Show account status
  logger.log('\n👤 ACCOUNTS:');
  let totalAccounts = 0;
  let activeAccounts = 0;
  
  for (const platform of PLATFORMS) {
    const platformAccounts = accounts[platform] || [];
    const activeAccount = platformAccounts.find(acc => acc.active);
    
    totalAccounts += platformAccounts.length;
    if (activeAccount) activeAccounts++;
    
    if (platformAccounts.length > 0) {
      const status = activeAccount ? '🟢 Active' : '🔴 No active account';
      logger.log(`  ${platform}: ${platformAccounts.length} account(s) - ${status}`);
    }
  }
  
  logger.log(`\n  Total accounts: ${totalAccounts}`);
  logger.log(`  Active accounts: ${activeAccounts}`);
  
  // Show activity statistics
  logger.log('\n📈 ACTIVITY:');
  let totalMessaged = 0;
  
  for (const platform of enabledPlatforms) {
    const stats = await getPlatformStats(platform);
    totalMessaged += stats.totalMessaged;
    logger.log(`  ${platform}: ${stats.totalMessaged} users messaged`);
  }
  
  logger.log(`\n  Total users messaged: ${totalMessaged}`);
  logger.log(`  Last run: ${dayjs().format('YYYY-MM-DD HH:mm')}`);
  
  // Show warnings
  const warnings = [];
  if (enabledPlatforms.length === 0) {
    warnings.push('No platforms enabled');
  }
  if (activeAccounts === 0) {
    warnings.push('No active accounts configured');
  }
  if (enabledPlatforms.length > activeAccounts) {
    warnings.push('Some enabled platforms have no active accounts');
  }
  
  if (warnings.length > 0) {
    logger.log('\n⚠️  WARNINGS:');
    warnings.forEach(warning => logger.log(`  • ${warning}`));
  }
  
  // Show recommendations
  logger.log('\n💡 RECOMMENDATIONS:');
  if (enabledPlatforms.length === 0) {
    logger.log('  • Enable platforms: nbot config --edit');
  }
  if (activeAccounts === 0) {
    logger.log('  • Add accounts: nbot accounts --add');
  }
  if (totalMessaged === 0) {
    logger.log('  • Start the bot: nbot run');
  }
}

/**
 * Show detailed platform status
 */
async function showPlatformStatus(platform, detailed = false) {
  if (!PLATFORMS.includes(platform)) {
    logger.error(`❌ Invalid platform: ${platform}`);
    logger.log(`💡 Available platforms: ${PLATFORMS.join(', ')}`);
    return;
  }
  
  logger.log(`\n📊 ${platform.toUpperCase()} STATUS`);
  logger.log('='.repeat(30));
  
  // Load configuration
  const config = await loadConfig();
  const platformConfig = config?.platforms?.[platform];
  
  if (!platformConfig) {
    logger.log('❌ Platform not found in configuration');
    return;
  }
  
  // Show platform configuration
  logger.log('\n⚙️  CONFIGURATION:');
  logger.log(`  Status: ${platformConfig.enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
  logger.log(`  Message: "${platformConfig.message || 'Not set'}"`);
  
  const searchTerms = config.searchTerms?.[platform] || [];
  logger.log(`  Search terms: ${searchTerms.length > 0 ? searchTerms.join(', ') : 'None'}`);
  
  // Show account information
  const accounts = await loadAccounts();
  const platformAccounts = accounts[platform] || [];
  const activeAccount = platformAccounts.find(acc => acc.active);
  
  logger.log('\n👤 ACCOUNT:');
  if (platformAccounts.length === 0) {
    logger.log('  ❌ No accounts configured');
  } else {
    logger.log(`  Total accounts: ${platformAccounts.length}`);
    if (activeAccount) {
      logger.log(`  Active account: ${activeAccount.username}`);
      logger.log(`  Added: ${activeAccount.dateAdded ? dayjs(activeAccount.dateAdded).format('YYYY-MM-DD') : 'Unknown'}`);
    } else {
      logger.log('  ❌ No active account set');
    }
  }
  
  // Show activity statistics
  const stats = await getPlatformStats(platform);
  logger.log('\n📈 ACTIVITY:');
  logger.log(`  Total users messaged: ${stats.totalMessaged}`);
  logger.log(`  Messages today: ${stats.messagesToday}`);
  logger.log(`  Last activity: ${stats.lastActivity}`);
  
  if (detailed) {
    // Show detailed statistics
    logger.log('\n📋 DETAILED STATS:');
    
    try {
      const messagedUsers = await loadMessagedUsers(platform);
      if (messagedUsers.length > 0) {
        logger.log(`  Recent users messaged:`);
        const recentUsers = messagedUsers.slice(-5).reverse();
        recentUsers.forEach((user, index) => {
          logger.log(`    ${index + 1}. ${user}`);
        });
        
        if (messagedUsers.length > 5) {
          logger.log(`    ... and ${messagedUsers.length - 5} more`);
        }
      } else {
        logger.log('  No users messaged yet');
      }
    } catch (error) {
      logger.log('  Could not load detailed statistics');
    }
  }
  
  // Show platform-specific warnings
  const warnings = [];
  if (!platformConfig.enabled) {
    warnings.push('Platform is disabled');
  }
  if (!activeAccount) {
    warnings.push('No active account configured');
  }
  if (searchTerms.length === 0) {
    warnings.push('No search terms configured');
  }
  if (!platformConfig.message) {
    warnings.push('No message template configured');
  }
  
  if (warnings.length > 0) {
    logger.log('\n⚠️  WARNINGS:');
    warnings.forEach(warning => logger.log(`  • ${warning}`));
  }
}

/**
 * Main status function
 */
export async function showStatus(options = {}) {
  const { platform, detailed = false } = options;
  
  try {
    if (platform) {
      await showPlatformStatus(platform, detailed);
    } else {
      await showOverallStatus();
    }
  } catch (error) {
    logger.error(`❌ Status error: ${error.message}`);
    throw error;
  }
}
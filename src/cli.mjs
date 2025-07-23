#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.mjs';

// Import command modules
import { runNetworkingBot } from './commands/run.mjs';
import { manageAccounts } from './commands/accounts.mjs';
import { createProfiles } from './commands/profiles.mjs';
import { configureBot } from './commands/config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for version
async function getVersion() {
  try {
    const packagePath = path.join(__dirname, '../package.json');
    const packageData = await fs.readFile(packagePath, 'utf8');
    const packageJson = JSON.parse(packageData);
    return packageJson.version;
  } catch (error) {
    return '1.0.0';
  }
}

/**
 * Main CLI program setup
 */
async function setupCLI() {
  const program = new Command();
  const version = await getVersion();

  program
    .name('nbot')
    .description('🤖 Networking Bot - Automate social media outreach and account management')
    .version(version, '-v, --version', 'display version number');

  // Run command - main bot operation
  program
    .command('run')
    .description('🚀 Start the networking bot to find and message potential users')
    .option('-p, --platform <platform>', 'run only specific platform (tiktok, x, youtube, facebook, reddit, linkedin)')
    .option('-d, --dry-run', 'run in dry-run mode (no actual messages sent)')
    .option('-c, --config <path>', 'path to config file', './config.json')
    .action(async (options) => {
      try {
        await runNetworkingBot(options);
      } catch (error) {
        logger.error(`Failed to run networking bot: ${error.message}`);
        process.exit(1);
      }
    });

  // Accounts command - manage social media accounts
  program
    .command('accounts')
    .description('👤 Manage social media accounts')
    .option('-l, --list', 'list all accounts')
    .option('-a, --add', 'add a new account')
    .option('-u, --update', 'update an existing account')
    .option('-d, --delete', 'delete an account')
    .option('-s, --set-active', 'set active account for a platform')
    .option('-e, --export', 'export active accounts to .env file')
    .action(async (options) => {
      try {
        await manageAccounts(options);
      } catch (error) {
        logger.error(`Failed to manage accounts: ${error.message}`);
        process.exit(1);
      }
    });

  // Profiles command - create synthetic profiles
  program
    .command('create-profiles')
    .alias('profiles')
    .description('🎭 Create synthetic user profiles for bot accounts')
    .option('-n, --number <count>', 'number of profiles to create', '1')
    .option('-p, --platform <platform>', 'create profiles for specific platform')
    .action(async (options) => {
      try {
        await createProfiles(options);
      } catch (error) {
        logger.error(`Failed to create profiles: ${error.message}`);
        process.exit(1);
      }
    });

  // Config command - manage bot configuration
  program
    .command('config')
    .description('⚙️  Manage bot configuration')
    .option('-s, --show', 'show current configuration')
    .option('-e, --edit', 'edit configuration interactively')
    .option('-i, --init', 'initialize default configuration')
    .option('-p, --platform <platform>', 'configure specific platform')
    .action(async (options) => {
      try {
        await configureBot(options);
      } catch (error) {
        logger.error(`Failed to manage configuration: ${error.message}`);
        process.exit(1);
      }
    });

  // Status command - show bot status and statistics
  program
    .command('status')
    .description('📊 Show bot status and statistics')
    .option('-p, --platform <platform>', 'show status for specific platform')
    .option('-d, --detailed', 'show detailed statistics')
    .action(async (options) => {
      try {
        const { showStatus } = await import('./commands/status.mjs');
        await showStatus(options);
      } catch (error) {
        logger.error(`Failed to show status: ${error.message}`);
        process.exit(1);
      }
    });

  // Help command enhancement
  program.on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('  $ nbot run                    # Start the networking bot');
    console.log('  $ nbot run -p linkedin        # Run only LinkedIn bot');
    console.log('  $ nbot accounts --list        # List all accounts');
    console.log('  $ nbot accounts --add         # Add a new account');
    console.log('  $ nbot create-profiles -n 5   # Create 5 synthetic profiles');
    console.log('  $ nbot config --show          # Show current configuration');
    console.log('  $ nbot status                 # Show bot status');
    console.log('');
    console.log('For more information, visit: https://github.com/profullstack/networking-bots');
  });

  return program;
}

/**
 * Main execution function
 */
async function main() {
  try {
    const program = await setupCLI();
    
    // Parse command line arguments
    await program.parseAsync(process.argv);
    
    // If no command provided, show help
    if (process.argv.length <= 2) {
      program.help();
    }
  } catch (error) {
    logger.error(`CLI Error: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Start the CLI
main();
import { createInterface } from 'readline';
import { writeFileSync, existsSync } from 'fs';
import { logger } from '../utils/logger.mjs';
import { config } from '../utils/config.mjs';

/**
 * Environment variable definitions with descriptions and validation
 */
const ENV_VARIABLES = {
  // Proxy configuration
  PROXY_LIST_PATH: {
    description: 'Path to proxy list file',
    default: () => config.getProxiesPath(),
    required: false,
    type: 'string'
  },
  WEBSHARE_API_TOKEN: {
    description: 'Webshare API token (optional, leave empty to use file-based proxies)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  
  // Browser configuration
  HEADLESS: {
    description: 'Run browser in headless mode',
    default: 'true',
    required: false,
    type: 'boolean',
    options: ['true', 'false']
  },
  USER_AGENT: {
    description: 'Browser user agent string',
    default: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    required: false,
    type: 'string'
  },
  
  // X.com credentials
  X_USERNAME: {
    description: 'X.com (Twitter) username',
    default: '',
    required: false,
    type: 'string',
    sensitive: false
  },
  X_PASSWORD: {
    description: 'X.com (Twitter) password',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  
  // TikTok credentials
  TIKTOK_USERNAME: {
    description: 'TikTok username (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: false
  },
  TIKTOK_PASSWORD: {
    description: 'TikTok password (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  TIKTOK_CLIENT_ID: {
    description: 'TikTok API Client ID (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  TIKTOK_CLIENT_SECRET: {
    description: 'TikTok API Client Secret (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  
  // YouTube API credentials
  YOUTUBE_CLIENT_ID: {
    description: 'YouTube API Client ID (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  YOUTUBE_CLIENT_SECRET: {
    description: 'YouTube API Client Secret (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  
  // Facebook API credentials
  FACEBOOK_APP_ID: {
    description: 'Facebook App ID (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  },
  FACEBOOK_APP_SECRET: {
    description: 'Facebook App Secret (optional)',
    default: '',
    required: false,
    type: 'string',
    sensitive: true
  }
};

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
 * Setup environment variables
 */
async function setupEnvironmentVariables(rl) {
  logger.log('\n🔧 ENVIRONMENT SETUP');
  logger.log('='.repeat(30));
  logger.log('Configure environment variables for the networking bot.');
  logger.log('Press Enter to use default values, or type "skip" to skip optional items.\n');
  
  const envVars = {};
  const currentEnv = config.loadEnv();
  
  // Check if environment is already configured
  const hasConfiguredEnv = Object.values(currentEnv).some(value => value && value !== config.defaultEnv?.[Object.keys(currentEnv).find(k => currentEnv[k] === value)]);
  
  if (hasConfiguredEnv) {
    const overwrite = await prompt(rl, '⚠️  Environment variables already configured. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      logger.log('Skipping environment setup.');
      return;
    }
  }
  
  for (const [key, envConfig] of Object.entries(ENV_VARIABLES)) {
    const isRequired = envConfig.required ? ' (required)' : ' (optional)';
    const defaultValue = typeof envConfig.default === 'function' ? envConfig.default() : envConfig.default;
    const currentValue = currentEnv[key] || defaultValue;
    const defaultText = currentValue ? ` [${currentValue}]` : '';
    
    logger.log(`\n📝 ${envConfig.description}${isRequired}${defaultText}`);
    
    let value;
    if (envConfig.sensitive) {
      value = await promptPassword(rl, `${key}: `);
    } else {
      value = await prompt(rl, `${key}: `);
    }
    
    // Handle skip for optional fields
    if (value.toLowerCase() === 'skip' && !envConfig.required) {
      continue;
    }
    
    // Use current/default if empty and not required
    if (!value && !envConfig.required) {
      value = currentValue;
    }
    
    // Validate required fields
    if (envConfig.required && !value) {
      logger.error(`❌ ${key} is required!`);
      return;
    }
    
    // Validate boolean fields
    if (envConfig.type === 'boolean' && value && !envConfig.options.includes(value)) {
      logger.error(`❌ ${key} must be one of: ${envConfig.options.join(', ')}`);
      return;
    }
    
    if (value) {
      envVars[key] = value;
    }
  }
  
  // Save environment variables
  config.updateEnvBatch(envVars);
  logger.log(`\n✅ Environment variables saved to ${config.getEnvPath()}`);
}

/**
 * Setup proxy configuration
 */
async function setupProxies(rl) {
  logger.log('\n🌐 PROXY SETUP');
  logger.log('='.repeat(20));
  
  const useProxies = await prompt(rl, 'Do you want to configure proxies? (y/N): ');
  if (useProxies.toLowerCase() !== 'y') {
    logger.log('Skipping proxy setup.');
    return;
  }
  
  const proxyType = await prompt(rl, 'Proxy type:\n1. File-based proxies\n2. Webshare API\nChoose (1/2): ');
  
  if (proxyType === '1') {
    const proxiesPath = config.getProxiesPath();
    
    if (!existsSync(proxiesPath)) {
      logger.log(`\n📝 Creating ${proxiesPath}`);
      logger.log('Add your proxies in the format: host:port:username:password (one per line)');
      
      const createFile = await prompt(rl, 'Create empty proxies.txt file? (Y/n): ');
      if (createFile.toLowerCase() !== 'n') {
        writeFileSync(proxiesPath, '# Add your proxies here\n# Format: host:port:username:password\n# Example: 192.168.1.1:8080:user:pass\n');
        logger.log(`✅ Created ${proxiesPath}`);
      }
    } else {
      logger.log(`✅ Proxies file already exists at ${proxiesPath}`);
    }
    
    // Update environment to point to the correct proxies file
    config.updateEnv('PROXY_LIST_PATH', proxiesPath);
    
  } else if (proxyType === '2') {
    const token = await promptPassword(rl, 'Enter your Webshare API token: ');
    if (token) {
      config.updateEnv('WEBSHARE_API_TOKEN', token);
      logger.log('✅ Webshare API token saved');
    }
  }
}

/**
 * Setup platform configuration
 */
async function setupPlatformConfiguration(rl) {
  logger.log('\n🔹 PLATFORM CONFIGURATION');
  logger.log('='.repeat(35));
  
  const currentConfig = config.load();
  const platforms = Object.keys(currentConfig.platforms);
  
  logger.log('Configure which platforms to enable and their settings:\n');
  
  for (const platform of platforms) {
    logger.log(`\n--- ${platform.toUpperCase()} ---`);
    
    const enable = await prompt(rl, `Enable ${platform}? (y/N): `);
    const enabled = enable.toLowerCase() === 'y';
    
    currentConfig.platforms[platform].enabled = enabled;
    
    if (enabled) {
      // Configure message template
      logger.log(`\nCurrent message: "${currentConfig.platforms[platform].message}"`);
      const newMessage = await prompt(rl, 'Enter new message template (or press Enter to keep current): ');
      if (newMessage) {
        currentConfig.platforms[platform].message = newMessage;
      }
      
      // Configure search terms
      const currentTerms = currentConfig.searchTerms[platform] || [];
      logger.log(`\nCurrent search terms: ${currentTerms.join(', ') || 'None'}`);
      const newTerms = await prompt(rl, 'Enter search terms (comma-separated, or press Enter to keep current): ');
      if (newTerms) {
        currentConfig.searchTerms[platform] = newTerms.split(',').map(term => term.trim()).filter(term => term);
      }
    }
  }
  
  // Configure general settings
  logger.log('\n--- GENERAL SETTINGS ---');
  
  const settings = currentConfig.settings;
  
  const workingHours = await prompt(rl, `Respect working hours (8 AM - 10 PM)? Current: ${settings.respectWorkingHours} (y/N): `);
  if (workingHours.toLowerCase() === 'y') {
    settings.respectWorkingHours = true;
  } else if (workingHours.toLowerCase() === 'n') {
    settings.respectWorkingHours = false;
  }
  
  const maxMessages = await prompt(rl, `Max messages per day? Current: ${settings.maxMessagesPerDay} (or press Enter to keep): `);
  if (maxMessages && !isNaN(parseInt(maxMessages))) {
    settings.maxMessagesPerDay = parseInt(maxMessages);
  }
  
  const delay = await prompt(rl, `Delay between messages (minutes)? Current: ${settings.delayBetweenMessages / 60000} (or press Enter to keep): `);
  if (delay && !isNaN(parseFloat(delay))) {
    settings.delayBetweenMessages = parseFloat(delay) * 60000;
  }
  
  // Save configuration
  config.save(currentConfig);
  logger.log('\n✅ Platform configuration saved!');
}

/**
 * Setup summary and next steps
 */
async function showSetupSummary() {
  logger.log('\n🎉 SETUP COMPLETE!');
  logger.log('='.repeat(25));
  
  logger.log('\n📁 Configuration locations:');
  logger.log(`  • Config: ${config.getConfigPath()}`);
  logger.log(`  • Environment: ${config.getEnvPath()}`);
  logger.log(`  • Proxies: ${config.getProxiesPath()}`);
  
  logger.log('\n🚀 Next steps:');
  logger.log('  1. Add accounts: nbot accounts --add');
  logger.log('  2. Create profiles: nbot profiles create');
  logger.log('  3. Check status: nbot status');
  logger.log('  4. Start the bot: nbot run');
  
  logger.log('\n💡 Useful commands:');
  logger.log('  • nbot config --show    - View current configuration');
  logger.log('  • nbot config --edit    - Edit configuration interactively');
  logger.log('  • nbot accounts --list  - List configured accounts');
  logger.log('  • nbot setup --force    - Run setup again');
  logger.log('  • nbot help             - Show all available commands');
}

/**
 * Main setup function
 */
export async function runSetup(options = {}) {
  const { force = false } = options;
  
  try {
    logger.log('\n🚀 NETWORKING BOTS SETUP WIZARD');
    logger.log('='.repeat(40));
    logger.log('Welcome! This wizard will help you configure the networking bot.\n');
    
    // Check if already configured
    if (!force) {
      const currentConfig = config.load();
      const hasEnabledPlatforms = Object.values(currentConfig.platforms).some(p => p.enabled);
      const currentEnv = config.loadEnv();
      const hasConfiguredEnv = Object.values(currentEnv).some(value => value && value !== '');
      
      if (hasEnabledPlatforms || hasConfiguredEnv) {
        logger.log('⚠️  It looks like the bot is already configured.');
        const rl = createReadlineInterface();
        
        try {
          const proceed = await prompt(rl, 'Do you want to run setup anyway? (y/N): ');
          if (proceed.toLowerCase() !== 'y') {
            logger.log('Setup cancelled. Use --force to override.');
            return;
          }
        } finally {
          rl.close();
        }
      }
    }
    
    const rl = createReadlineInterface();
    
    try {
      // Step 1: Environment Variables
      await setupEnvironmentVariables(rl);
      
      // Step 2: Proxy Configuration
      await setupProxies(rl);
      
      // Step 3: Platform Configuration
      await setupPlatformConfiguration(rl);
      
      // Step 4: Summary
      await showSetupSummary();
      
    } finally {
      rl.close();
    }
    
  } catch (error) {
    logger.error(`❌ Setup error: ${error.message}`);
    throw error;
  }
}
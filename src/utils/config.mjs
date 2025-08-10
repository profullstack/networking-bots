import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from './logger.mjs';

/**
 * Configuration manager for networking-bots CLI
 * Handles user-specific config stored in ~/.config/networking-bots/config.json
 * Also manages environment variables in ~/.config/networking-bots/env.json
 */
class ConfigManager {
  constructor() {
    this.configDir = join(homedir(), '.config', 'networking-bots');
    this.configPath = join(this.configDir, 'config.json');
    this.envPath = join(this.configDir, 'env.json');
    this.proxiesPath = join(this.configDir, 'proxies.txt');
    this.defaultConfig = {
      platforms: {
        tiktok: {
          enabled: true,
          message: "Hi! I noticed your interest in [topic]. I'd love to connect and share some insights!"
        },
        x: {
          enabled: true,
          message: "Hey! Saw your post about [topic]. Would love to connect and discuss further!"
        },
        youtube: {
          enabled: true,
          message: "Great content on [topic]! I'd love to connect and share some related insights."
        },
        facebook: {
          enabled: true,
          message: "Hi! I found your post about [topic] really interesting. Let's connect!"
        },
        reddit: {
          enabled: true,
          message: "Great point about [topic]! I'd love to discuss this further with you."
        },
        linkedin: {
          enabled: true,
          message: "Hi! I noticed your expertise in [topic]. I'd love to connect and share insights!"
        }
      },
      searchTerms: {
        tiktok: ["plex"],
        x: ["plex"],
        youtube: ["plex", "emby"],
        facebook: ["plex", "emby"],
        reddit: ["plex", "emby"],
        linkedin: ["plex", "emby"]
      },
      settings: {
        respectWorkingHours: false,
        maxMessagesPerDay: 10,
        delayBetweenMessages: 300000,
        retryAttempts: 3
      }
    };
    
    this.defaultEnv = {
      // Proxy configuration
      PROXY_LIST_PATH: this.proxiesPath,
      WEBSHARE_API_TOKEN: '',
      
      // Browser configuration
      HEADLESS: 'true',
      USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      
      // X.com credentials
      X_USERNAME: '',
      X_PASSWORD: '',
      
      // TikTok credentials
      TIKTOK_USERNAME: '',
      TIKTOK_PASSWORD: '',
      TIKTOK_CLIENT_ID: '',
      TIKTOK_CLIENT_SECRET: '',
      
      // YouTube API credentials
      YOUTUBE_CLIENT_ID: '',
      YOUTUBE_CLIENT_SECRET: '',
      
      // Facebook API credentials
      FACEBOOK_APP_ID: '',
      FACEBOOK_APP_SECRET: ''
    };
  }

  /**
   * Ensure config directory exists
   */
  ensureConfigDir() {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      logger.log(`Created config directory: ${this.configDir}`);
    }
  }

  /**
   * Load configuration from user's config file
   * Creates default config if it doesn't exist
   */
  load() {
    try {
      this.ensureConfigDir();

      if (!existsSync(this.configPath)) {
        logger.log('Config file not found, creating default configuration...');
        this.save(this.defaultConfig);
        return this.defaultConfig;
      }

      const configData = readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Merge with default config to ensure all properties exist
      const mergedConfig = this.mergeWithDefaults(config);
      
      // Save merged config back to ensure it's up to date
      if (JSON.stringify(config) !== JSON.stringify(mergedConfig)) {
        this.save(mergedConfig);
      }
      
      return mergedConfig;
    } catch (error) {
      logger.error(`Error loading config: ${error.message}`);
      logger.log('Using default configuration...');
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to user's config file
   */
  save(config) {
    try {
      this.ensureConfigDir();
      writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      logger.log(`Configuration saved to: ${this.configPath}`);
    } catch (error) {
      logger.error(`Error saving config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Merge user config with default config to ensure all properties exist
   */
  mergeWithDefaults(userConfig) {
    const merged = JSON.parse(JSON.stringify(this.defaultConfig));
    
    // Deep merge platforms
    if (userConfig.platforms) {
      for (const [platform, settings] of Object.entries(userConfig.platforms)) {
        if (merged.platforms[platform]) {
          merged.platforms[platform] = { ...merged.platforms[platform], ...settings };
        } else {
          merged.platforms[platform] = settings;
        }
      }
    }

    // Merge search terms
    if (userConfig.searchTerms) {
      merged.searchTerms = { ...merged.searchTerms, ...userConfig.searchTerms };
    }

    // Merge settings
    if (userConfig.settings) {
      merged.settings = { ...merged.settings, ...userConfig.settings };
    }

    return merged;
  }

  /**
   * Get specific platform configuration
   */
  getPlatform(platformName) {
    const config = this.load();
    return config.platforms[platformName] || null;
  }

  /**
   * Update specific platform configuration
   */
  updatePlatform(platformName, settings) {
    const config = this.load();
    if (!config.platforms[platformName]) {
      config.platforms[platformName] = {};
    }
    config.platforms[platformName] = { ...config.platforms[platformName], ...settings };
    this.save(config);
  }

  /**
   * Get search terms for a platform
   */
  getSearchTerms(platformName) {
    const config = this.load();
    return config.searchTerms[platformName] || [];
  }

  /**
   * Update search terms for a platform
   */
  updateSearchTerms(platformName, terms) {
    const config = this.load();
    config.searchTerms[platformName] = terms;
    this.save(config);
  }

  /**
   * Get general settings
   */
  getSettings() {
    const config = this.load();
    return config.settings;
  }

  /**
   * Update general settings
   */
  updateSettings(newSettings) {
    const config = this.load();
    config.settings = { ...config.settings, ...newSettings };
    this.save(config);
  }

  /**
   * Get the full configuration path for display purposes
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * Load environment variables from user's env file
   */
  loadEnv() {
    try {
      this.ensureConfigDir();

      if (!existsSync(this.envPath)) {
        logger.log('Environment file not found, creating default...');
        this.saveEnv(this.defaultEnv);
        return this.defaultEnv;
      }

      const envData = readFileSync(this.envPath, 'utf8');
      const env = JSON.parse(envData);
      
      // Merge with default env to ensure all properties exist
      const mergedEnv = { ...this.defaultEnv, ...env };
      
      // Save merged env back to ensure it's up to date
      if (JSON.stringify(env) !== JSON.stringify(mergedEnv)) {
        this.saveEnv(mergedEnv);
      }
      
      return mergedEnv;
    } catch (error) {
      logger.error(`Error loading environment: ${error.message}`);
      logger.log('Using default environment...');
      return this.defaultEnv;
    }
  }

  /**
   * Save environment variables to user's env file
   */
  saveEnv(env) {
    try {
      this.ensureConfigDir();
      writeFileSync(this.envPath, JSON.stringify(env, null, 2));
      logger.log(`Environment saved to: ${this.envPath}`);
    } catch (error) {
      logger.error(`Error saving environment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get specific environment variable
   */
  getEnv(key) {
    const env = this.loadEnv();
    return env[key];
  }

  /**
   * Update specific environment variable
   */
  updateEnv(key, value) {
    const env = this.loadEnv();
    env[key] = value;
    this.saveEnv(env);
  }

  /**
   * Update multiple environment variables
   */
  updateEnvBatch(updates) {
    const env = this.loadEnv();
    Object.assign(env, updates);
    this.saveEnv(env);
  }

  /**
   * Get the environment file path
   */
  getEnvPath() {
    return this.envPath;
  }

  /**
   * Get the proxies file path
   */
  getProxiesPath() {
    return this.proxiesPath;
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this.save(this.defaultConfig);
    logger.log('Configuration reset to defaults');
  }

  /**
   * Reset environment to defaults
   */
  resetEnv() {
    this.saveEnv(this.defaultEnv);
    logger.log('Environment reset to defaults');
  }
}

// Export singleton instance
export const config = new ConfigManager();
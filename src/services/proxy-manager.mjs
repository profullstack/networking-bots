import { logger } from '../utils/logger.mjs';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

class ProxyManager {
  constructor() {
    this.proxyList = [];
    this.currentProxyIndex = -1;
    this.lastRotation = null;
    this.proxyScores = new Map(); // Track reliability of each proxy
    this.validationTimeout = 5000; // 5 seconds timeout for proxy validation
    this.maxRetries = 3;
    this.blacklistedProxies = new Set();
    this.lastProxyTest = new Map(); // Track when each proxy was last tested
    this.proxyTestInterval = 1800000; // 30 minutes
    this.proxyApiUrl = 'https://proxy.webshare.io/api/v2/proxy/list/';
    this.proxyApiToken = process.env.WEBSHARE_API_TOKEN;
    this.proxyListPath = process.env.PROXY_LIST_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../proxies.txt');
    this.currentProxy = null;
  }

  async fetchProxiesFromApi() {
    try {
      const url = new URL(this.proxyApiUrl);
      url.searchParams.append('mode', 'direct');
      url.searchParams.append('page', '1');
      url.searchParams.append('page_size', '25');

      const response = await fetch(url.href, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.proxyApiToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      logger.error('Error fetching proxies:', error);
      return [];
    }
  }

  async fetchProxiesFromFile() {
    try {
      if (!this.proxyListPath) {
        logger.warn('No proxy list file path specified');
        return [];
      }

      try {
        await fs.access(this.proxyListPath);
      } catch (error) {
        // Create an empty proxies file if it doesn't exist
        await fs.writeFile(this.proxyListPath, '');
        logger.warn(`Created empty proxy file at ${this.proxyListPath}`);
        return [];
      }

      const content = await fs.readFile(this.proxyListPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const [host, port, username, password] = line.split(':');
        return { proxy_address: host, port, username, password };
      });
    } catch (error) {
      logger.error('Error reading proxy list file:', error);
      return [];
    }
  }

  async initialize() {
    let apiProxies = [];
    let apiError = null;
    
    // If API token is provided, try API first
    if (this.proxyApiToken) {
      try {
        apiProxies = await this.fetchProxiesFromApi();
        if (apiProxies.length > 0) {
          await this.loadProxies(apiProxies);
          return;
        }
      } catch (error) {
        apiError = error;
        logger.warn(`API proxy fetch failed: ${error.message}. Falling back to file.`);
      }
    } else {
      logger.info('No proxy API token provided, using file-based proxies');
    }

    // Fallback to file or if no API token provided
    try {
      const fileProxies = await this.fetchProxiesFromFile();
      await this.loadProxies(fileProxies);
    } catch (error) {
      logger.error(`Failed to load proxies from file: ${error.message}`);
      // If both API and file failed, throw the API error if it exists
      if (apiError) throw apiError;
      throw error;
    }
  }

  async loadProxies(proxies) {
    this.proxyList = proxies.filter(proxy => !this.blacklistedProxies.has(proxy.proxy_address));
    
    // Initialize scores for new proxies
    for (const proxy of this.proxyList) {
      const proxyId = proxy.proxy_address;
      if (!this.proxyScores.has(proxyId)) {
        this.proxyScores.set(proxyId, 1.0); // Initial score
      }
    }
    
    logger.info(`Loaded ${this.proxyList.length} proxies (${proxies.length - this.proxyList.length} blacklisted)`);
    
    // Validate proxies in background
    this.validateProxies().catch(err => {
      logger.error('Error validating proxies:', err);
    });
  }

  async markProxySuccess(proxy) {
    if (!proxy) return;
    
    const proxyId = proxy.proxy_address;
    const currentScore = this.proxyScores.get(proxyId) || 1.0;
    this.proxyScores.set(proxyId, Math.min(1.0, currentScore + 0.1));
    logger.debug(`Proxy success: ${proxy.proxy_address}:${proxy.port} (score: ${this.proxyScores.get(proxyId).toFixed(2)})`);
  }

  markProxyFailure(proxy) {
    if (!proxy) return;
    
    const proxyId = proxy.proxy_address;
    const currentScore = this.proxyScores.get(proxyId) || 1.0;
    this.proxyScores.set(proxyId, Math.max(0, currentScore - 0.2));
    
    // If score is too low, remove proxy
    if (this.proxyScores.get(proxyId) <= 0.2) {
      this.blacklistedProxies.add(proxyId);
      this.proxyList = this.proxyList.filter(p => p.proxy_address !== proxyId);
      logger.warn(`Removed unreliable proxy: ${proxy.proxy_address}:${proxy.port}`);
    } else {
      logger.warn(`Proxy failure: ${proxy.proxy_address}:${proxy.port} (score: ${this.proxyScores.get(proxyId).toFixed(2)})`);
    }
  }

  async validateProxy(proxy) {
    const proxyId = proxy.proxy_address;
    if (Date.now() - (this.lastProxyTest.get(proxyId) || 0) < this.proxyTestInterval) {
      return true; // Skip validation if tested recently
    }

    // Validate proxy object structure
    if (!proxy.proxy_address || !proxy.port) {
      logger.error('Invalid proxy object structure:', proxy);
      return false;
    }

    // If username and password are provided, use them
    const proxyUrl = proxy.username && proxy.password
      ? `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`
      : `http://${proxy.proxy_address}:${proxy.port}`;
    
    return new Promise((resolve) => {
      const request = https.get({
        host: 'www.google.com',
        path: '/robots.txt',
        timeout: this.validationTimeout,
        proxy: proxyUrl,
        agent: new https.Agent({
          keepAlive: true,
          timeout: this.validationTimeout,
          rejectUnauthorized: false
        })
      });
      
      const timer = setTimeout(() => {
        request.destroy();
        resolve(false);
      }, this.validationTimeout);
      
      request.on('response', (response) => {
        clearTimeout(timer);
        this.lastProxyTest.set(proxyId, Date.now());
        resolve(response.statusCode === 200);
      });
      
      request.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  async validateProxies() {
    const validationResults = await Promise.all(
      this.proxyList.map(async (proxy) => {
        const isValid = await this.validateProxy(proxy);
        if (!isValid) {
          const proxyId = proxy.proxy_address;
          this.proxyScores.set(proxyId, Math.max(0, this.proxyScores.get(proxyId) - 0.2));
          logger.warn(`Proxy validation failed: ${proxy.proxy_address}:${proxy.port}`);
        } else {
          const proxyId = proxy.proxy_address;
          this.proxyScores.set(proxyId, Math.min(1, this.proxyScores.get(proxyId) + 0.1));
          logger.info(`Proxy validation successful: ${proxy.proxy_address}:${proxy.port}`);
        }
        return isValid;
      })
    );
    
    // Remove consistently failing proxies
    this.proxyList = this.proxyList.filter((proxy) => {
      const proxyId = proxy.proxy_address;
      if (this.proxyScores.get(proxyId) <= 0.2) {
        this.blacklistedProxies.add(proxyId);
        logger.warn(`Blacklisting unreliable proxy: ${proxy.proxy_address}:${proxy.port}`);
        return false;
      }
      return true;
    });
    
    return validationResults.filter(Boolean).length;
  }

  async getNextProxy() {
    // Initialize proxies if not already done
    if (this.proxyList.length === 0) {
      await this.initialize();
    }
    
    // If no proxies available, return null
    if (this.proxyList.length === 0) {
      logger.warn('No proxies available');
      return null;
    }
    
    // Rotate to the next proxy
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
    this.currentProxy = this.proxyList[this.currentProxyIndex];
    this.lastRotation = Date.now();
    
    logger.info(`Using proxy: ${this.currentProxy.proxy_address}:${this.currentProxy.port}`);
    return this.currentProxy;
  }
  async rotateProxy() {
    // If we just rotated recently, don't rotate again
    if (this.lastRotation && Date.now() - this.lastRotation < 60000) {
      logger.debug('Skipping proxy rotation (too soon)');
      return this.getCurrentProxy();
    }
    
    return this.getNextProxy();
  }

  async getCurrentProxy() {
    if (!this.currentProxy) {
      this.currentProxy = await this.getNextProxy();
    }
    return this.currentProxy;
  }
  
  /**
   * Get a proxy for use with HTTP requests
   * This method is used by the direct account creator
   * @returns {Promise<Object|null>} Proxy configuration or null if no proxy available
   */
  async getProxy() {
    try {
      // Get a proxy from the pool
      const proxy = await this.getNextProxy();
      
      if (!proxy) {
        logger.warn('No proxy available');
        return null;
      }
      
      // Format proxy for use with axios
      return {
        host: proxy.proxy_address,
        port: proxy.port,
        auth: proxy.username && proxy.password ? {
          username: proxy.username,
          password: proxy.password
        } : undefined
      };
    } catch (error) {
      logger.error(`Error getting proxy: ${error.message}`);
      return null;
    }
  }
}

// Export singleton instance
export const proxyManager = new ProxyManager();

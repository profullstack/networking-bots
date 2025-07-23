/**
 * Direct Account Creator Service
 * 
 * This service creates accounts directly using HTTP requests rather than browser automation.
 * It bypasses many anti-bot measures by directly communicating with the platform's APIs
 * while mimicking the exact request patterns of legitimate browsers.
 */

import axios from 'axios';
import https from 'https';
import crypto from 'crypto';
import { setTimeout as wait } from 'timers/promises';
import { logger } from '../utils/logger.mjs';
import { proxyManager } from './proxy-manager.mjs';
import { rateLimiter } from './rate-limiter.mjs';
import { humanBehavior } from './human-behavior.mjs';

class DirectAccountCreator {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
    ];
    
    // Initialize cookies storage and HTTP client
    this.cookies = {};
    this.initializeHttpClient();
  }
  
  /**
   * Initialize HTTP client with cookie support and other browser-like features
   */
  initializeHttpClient() {
    // Create a cookies object to store cookies
    this.cookies = {};
    
    // Create an axios instance
    this.client = axios.create({
      withCredentials: true,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Needed for some proxies
        keepAlive: true
      }),
      maxRedirects: 5,
      timeout: 30000
    });
    
    // Set default headers
    this.updateClientHeaders();
  }
  
  /**
   * Update client headers with random user agent and other browser-like headers
   */
  updateClientHeaders() {
    const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    
    this.client.defaults.headers.common = {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    };
  }
  
  /**
   * Apply a proxy to the HTTP client
   * @param {Object} proxy - Proxy configuration
   */
  async applyProxy(proxy = null) {
    if (!proxy) {
      proxy = await proxyManager.getProxy();
    }
    
    if (proxy) {
      logger.log(`Using proxy: ${proxy.host}:${proxy.port}`);
      
      this.client.defaults.proxy = {
        host: proxy.host,
        port: proxy.port,
        auth: proxy.auth ? {
          username: proxy.auth.username,
          password: proxy.auth.password
        } : undefined
      };
      
      return true;
    }
    
    logger.warn('No proxy available');
    return false;
  }
  
  /**
   * Generate browser fingerprint data to mimic real browser
   * @returns {Object} Browser fingerprint data
   */
  generateBrowserFingerprint() {
    // Generate a consistent but random fingerprint
    const fingerprint = {
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24
      },
      navigator: {
        hardwareConcurrency: 8,
        deviceMemory: 8,
        platform: 'Win32',
        vendor: 'Google Inc.',
        language: 'en-US',
        languages: ['en-US', 'en'],
        doNotTrack: null
      },
      webgl: {
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)'
      },
      canvas: crypto.randomBytes(16).toString('hex'),
      audio: crypto.randomBytes(8).toString('hex'),
      fonts: [
        'Arial', 'Courier New', 'Georgia', 'Times New Roman', 
        'Verdana', 'Tahoma', 'Trebuchet MS'
      ]
    };
    
    return fingerprint;
  }
  
  /**
   * Simulate human-like delays between requests
   */
  async simulateHumanDelay() {
    // Random delay between 1-3 seconds
    const delay = 1000 + Math.random() * 2000;
    await wait(delay);
  }
  
  /**
   * Extract CSRF token from HTML response
   * @param {string} html - HTML content
   * @param {string} tokenName - Name of the CSRF token field
   * @returns {string|null} CSRF token if found
   */
  extractCSRFToken(html, tokenName = 'csrf') {
    try {
      // Common patterns for CSRF tokens
      const patterns = [
        new RegExp(`name="${tokenName}"[^>]*value="([^"]+)"`, 'i'),
        new RegExp(`name='${tokenName}'[^>]*value='([^']+)'`, 'i'),
        new RegExp(`${tokenName}["\']:\\s*["\']([^"\']+)["\']`, 'i'),
        new RegExp(`${tokenName}=([^&;]+)`, 'i')
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
      
      logger.warn(`CSRF token (${tokenName}) not found in HTML`);
      return null;
    } catch (error) {
      logger.error(`Error extracting CSRF token: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Make a request with browser-like headers and cookies
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response
   */
  async makeRequest(options) {
    try {
      // Apply rate limiting
      await rateLimiter.limit(options.url);
      
      // Get a random user agent
      const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
      
      // Set default headers
      const headers = {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': options.isXhr ? 'empty' : 'document',
        'Sec-Fetch-Mode': options.isXhr ? 'cors' : 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        ...options.headers
      };
      
      // Add referer if provided
      if (options.referer) {
        headers['Referer'] = options.referer;
      }
      
      // Add content type for POST requests
      if (options.method === 'POST' && !headers['Content-Type']) {
        headers['Content-Type'] = options.isJson ? 
          'application/json;charset=utf-8' : 
          'application/x-www-form-urlencoded';
      }
      
      // Add cookies if available
      const domain = new URL(options.url).hostname;
      const cookieString = this.getCookieString(domain);
      if (cookieString) {
        headers['Cookie'] = cookieString;
      }
      
      // Configure proxy if available
      let axiosConfig = {
        url: options.url,
        method: options.method || 'GET',
        headers,
        data: options.data,
        validateStatus: () => true // Don't throw on any status code
      };
      
      // Add proxy configuration if provided
      if (options.proxy) {
        axiosConfig.proxy = options.proxy;
      }
      
      // Make the request
      const response = await this.client(axiosConfig);
      
      // Extract and store cookies from response
      this.extractCookies(response, domain);
      
      // Add a human-like delay after the request
      await humanBehavior.randomDelay(500, 1500);
      
      return response;
    } catch (error) {
      logger.error(`Request error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Set a cookie
   * @param {string} name - Cookie name
   * @param {string} value - Cookie value
   * @param {string} domain - Domain
   */
  setCookie(name, value, domain) {
    try {
      if (!this.cookies[domain]) {
        this.cookies[domain] = {};
      }
      this.cookies[domain][name] = value;
    } catch (error) {
      logger.error(`Error setting cookie ${name}: ${error.message}`);
    }
  }
  
  /**
   * Get the cookie string for a domain
   * @param {string} domain - Domain
   * @returns {string} Cookie string
   */
  getCookieString(domain) {
    try {
      const cookies = this.cookies[domain];
      if (!cookies) {
        return '';
      }
      
      const cookieString = Object.keys(cookies).map(name => `${name}=${cookies[name]}`).join('; ');
      return cookieString;
    } catch (error) {
      logger.error(`Error getting cookie string for ${domain}: ${error.message}`);
      return '';
    }
  }
  
  /**
   * Extract cookies from a response
   * @param {Object} response - Response object
   * @param {string} domain - Domain
   */
  extractCookies(response, domain) {
    try {
      const setCookieHeaders = response.headers['set-cookie'];
      if (!setCookieHeaders) {
        return;
      }
      
      setCookieHeaders.forEach(header => {
        const [name, value] = header.split(';')[0].split('=');
        this.setCookie(name, value, domain);
      });
    } catch (error) {
      logger.error(`Error extracting cookies for ${domain}: ${error.message}`);
    }
  }
  
  /**
   * Create a Twitter/X account directly using HTTP requests
   * @param {Object} userData - User data for account creation
   * @returns {Promise<Object>} Result of account creation
   */
  async createTwitterAccount(userData) {
    try {
      logger.log('Starting Twitter account creation process');
      await this.applyProxy();
      
      // Step 1: Visit the signup page to get initial cookies and tokens
      const signupPageUrl = 'https://twitter.com/i/flow/signup';
      logger.log(`Visiting signup page: ${signupPageUrl}`);
      
      const response = await this.client.get(signupPageUrl);
      await this.simulateHumanDelay();
      
      // Extract the bearer token from the page
      const bearerTokenMatch = response.data.match(/Bearer ([a-zA-Z0-9%-]+)/);
      const bearerToken = bearerTokenMatch ? bearerTokenMatch[1] : null;
      
      if (!bearerToken) {
        logger.error('Failed to extract bearer token');
        return { success: false, error: 'Failed to extract bearer token' };
      }
      
      // Set the authorization header
      this.client.defaults.headers.common['Authorization'] = `Bearer ${bearerToken}`;
      
      // Step 2: Get the guest token
      logger.log('Getting guest token');
      const guestTokenResponse = await this.client.post('https://api.twitter.com/1.1/guest/activate.json');
      const guestToken = guestTokenResponse.data.guest_token;
      
      if (!guestToken) {
        logger.error('Failed to get guest token');
        return { success: false, error: 'Failed to get guest token' };
      }
      
      this.client.defaults.headers.common['x-guest-token'] = guestToken;
      
      // Step 3: Start the signup flow
      logger.log('Starting signup flow');
      const flowStartResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_name: 'signup',
        input_flow_data: {
          flow_context: {
            referrer_url: 'https://twitter.com/',
            language: 'en'
          }
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      let flowToken = flowStartResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to get flow token');
        return { success: false, error: 'Failed to get flow token' };
      }
      
      // Step 4: Submit name
      logger.log('Submitting name');
      await this.simulateHumanDelay();
      
      const nameResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'name',
          name: {
            first_name: userData.firstName,
            last_name: userData.lastName
          }
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      flowToken = nameResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to submit name');
        return { success: false, error: 'Failed to submit name' };
      }
      
      // Step 5: Submit email
      logger.log('Submitting email');
      await this.simulateHumanDelay();
      
      const emailResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'email',
          email: {
            email: userData.email
          }
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      flowToken = emailResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to submit email');
        return { success: false, error: 'Failed to submit email' };
      }
      
      // Step 6: Submit birth date
      logger.log('Submitting birth date');
      await this.simulateHumanDelay();
      
      const birthDateResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'birthdate',
          birthdate: {
            day: parseInt(userData.birthDay),
            month: parseInt(userData.birthMonth),
            year: parseInt(userData.birthYear)
          }
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      flowToken = birthDateResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to submit birth date');
        return { success: false, error: 'Failed to submit birth date' };
      }
      
      // Step 7: Submit personalization preferences
      logger.log('Submitting personalization preferences');
      await this.simulateHumanDelay();
      
      const personalizationResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'personalization',
          personalization: {
            // Opt out of personalization
            use_settings: false
          }
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      flowToken = personalizationResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to submit personalization preferences');
        return { success: false, error: 'Failed to submit personalization preferences' };
      }
      
      // Step 8: Submit username suggestion
      logger.log('Getting username suggestions');
      await this.simulateHumanDelay();
      
      const suggestedUsername = userData.username || 
        `${userData.firstName.toLowerCase()}${userData.lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
      
      const usernameResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'username_suggestion',
          username_suggestion: {
            suggestion_id: null,
            suggestion: suggestedUsername
          }
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      flowToken = usernameResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to submit username suggestion');
        return { success: false, error: 'Failed to submit username suggestion' };
      }
      
      // Extract the actual username assigned
      let username = suggestedUsername;
      try {
        if (usernameResponse.data.subtasks && 
            usernameResponse.data.subtasks[0].username_suggestion &&
            usernameResponse.data.subtasks[0].username_suggestion.suggestions) {
          username = usernameResponse.data.subtasks[0].username_suggestion.suggestions[0].suggestion;
        }
      } catch (error) {
        logger.warn(`Could not extract assigned username: ${error.message}`);
      }
      
      // Step 9: Submit password
      logger.log('Setting password');
      await this.simulateHumanDelay();
      
      const passwordResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'password',
          password: {
            password: userData.password
          }
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      flowToken = passwordResponse.data.flow_token;
      if (!flowToken) {
        logger.error('Failed to set password');
        return { success: false, error: 'Failed to set password' };
      }
      
      // Step 10: Check for email verification requirement
      let requiresEmailVerification = false;
      let verificationToken = null;
      
      try {
        if (passwordResponse.data.subtasks && 
            passwordResponse.data.subtasks[0].check_logged_in_account &&
            passwordResponse.data.subtasks[0].check_logged_in_account.requires_verification) {
          requiresEmailVerification = true;
          verificationToken = flowToken;
        }
      } catch (error) {
        logger.warn(`Could not determine verification status: ${error.message}`);
      }
      
      // Step 11: Complete registration
      logger.log('Completing registration');
      await this.simulateHumanDelay();
      
      const completeResponse = await this.client.post('https://api.twitter.com/1.1/onboarding/task.json', {
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'done',
          done: {}
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Twitter-Active-User': 'yes',
          'X-Twitter-Client-Language': 'en'
        }
      });
      
      // Check for success
      let success = false;
      let notes = [];
      
      if (completeResponse.data && completeResponse.data.status === 'success') {
        success = true;
        notes.push('Account created successfully');
      } else {
        notes.push('Account creation may require additional steps');
      }
      
      if (requiresEmailVerification) {
        notes.push('Email verification required');
      }
      
      // Return the result
      return {
        success,
        platform: 'twitter',
        username,
        email: userData.email,
        password: userData.password,
        verificationToken: verificationToken,
        requiresEmailVerification,
        notes
      };
    } catch (error) {
      logger.error(`Twitter account creation error: ${error.message}`);
      
      // Check for specific error types
      if (error.response) {
        logger.error(`Status: ${error.response.status}`);
        logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
        
        // Check for CAPTCHA or verification challenges
        if (error.response.status === 403) {
          return { 
            success: false, 
            error: 'Account creation blocked - possible CAPTCHA or verification required',
            requiresManualIntervention: true
          };
        }
        
        // Check for rate limiting
        if (error.response.status === 429) {
          return { 
            success: false, 
            error: 'Rate limited - too many requests',
            retryAfter: error.response.headers['retry-after'] || 60
          };
        }
      }
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Create a LinkedIn account directly using HTTP requests
   * @param {Object} userData - User data for account creation
   * @returns {Promise<Object>} Result of account creation
   */
  async createLinkedInAccount(userData) {
    try {
      logger.log('Starting LinkedIn account creation process');
      await this.applyProxy();
      
      // Step 1: Visit the signup page to get initial cookies and CSRF token
      const signupPageUrl = 'https://www.linkedin.com/signup';
      logger.log(`Visiting signup page: ${signupPageUrl}`);
      
      const response = await this.client.get(signupPageUrl);
      await this.simulateHumanDelay();
      
      // Extract CSRF token from the page
      const csrfToken = this.extractCSRFToken(response.data, 'csrfToken');
      if (!csrfToken) {
        logger.error('Failed to extract CSRF token');
        return { success: false, error: 'Failed to extract CSRF token' };
      }
      
      // Extract cookies
      this.extractCookies(response, 'linkedin.com');
      
      // Step 2: Submit email for verification
      logger.log('Submitting email for verification');
      await this.simulateHumanDelay();
      
      const emailData = {
        session_key: userData.email,
        action: 'signup',
        csrfToken: csrfToken
      };
      
      const emailResponse = await this.client.post(
        'https://www.linkedin.com/checkpoint/lg/login-submit', 
        new URLSearchParams(emailData).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': signupPageUrl,
            'Cookie': this.getCookieString('linkedin.com')
          }
        }
      );
      
      // Extract any new cookies
      this.extractCookies(emailResponse, 'linkedin.com');
      await this.simulateHumanDelay();
      
      // Step 3: Submit registration form
      logger.log('Submitting registration form');
      
      const registrationData = {
        email_address: userData.email,
        first_name: userData.firstName,
        last_name: userData.lastName,
        password: userData.password,
        birth_month: userData.birthMonth,
        birth_day: userData.birthDay,
        birth_year: userData.birthYear,
        csrfToken: csrfToken
      };
      
      const registrationResponse = await this.client.post(
        'https://www.linkedin.com/checkpoint/lg/signup-submit', 
        new URLSearchParams(registrationData).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': signupPageUrl,
            'Cookie': this.getCookieString('linkedin.com')
          }
        }
      );
      
      // Check for success indicators in the response
      if (registrationResponse.status === 200 && 
          (registrationResponse.data.includes('verification') || 
           registrationResponse.data.includes('welcome'))) {
        
        logger.log('LinkedIn account creation successful, verification may be required');
        return {
          success: true,
          message: 'LinkedIn account created successfully, verification may be required',
          userData: userData
        };
      }
      
      // Check for CAPTCHA or other challenges
      if (registrationResponse.data.includes('captcha') || 
          registrationResponse.data.includes('challenge')) {
        logger.warn('CAPTCHA or challenge detected during LinkedIn registration');
        return {
          success: false,
          error: 'CAPTCHA or challenge detected',
          requiresManualAction: true
        };
      }
      
      logger.error('LinkedIn account creation failed with unknown error');
      return { 
        success: false, 
        error: 'Unknown error during registration' 
      };
      
      // For now, we'll return a placeholder result
      return {
        success: true,
        platform: 'linkedin',
        username: userData.email,
        email: userData.email,
        notes: ['Account creation initiated, verification required']
      };
    } catch (error) {
      logger.error(`LinkedIn account creation error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Create a Facebook account directly using HTTP requests
   * @param {Object} userData - User data for account creation
   * @returns {Promise<Object>} Result of account creation
   */
  async createFacebookAccount(userData) {
    try {
      logger.log('Starting Facebook account creation process');
      await this.applyProxy();
      
      // Step 1: Visit the signup page to get initial cookies and CSRF token
      const signupPageUrl = 'https://www.facebook.com/reg/';
      logger.log(`Visiting signup page: ${signupPageUrl}`);
      
      const response = await this.client.get(signupPageUrl);
      await this.simulateHumanDelay();
      
      // Extract CSRF token from the page (Facebook uses multiple token names)
      let csrfToken = this.extractCSRFToken(response.data, 'jazoest') ||
                     this.extractCSRFToken(response.data, '__spin_r') ||
                     this.extractCSRFToken(response.data, '__spin_t');
                     
      if (!csrfToken) {
        logger.error('Failed to extract CSRF token');
        return { success: false, error: 'Failed to extract CSRF token' };
      }
      
      // Extract cookies
      this.extractCookies(response, 'facebook.com');
      
      // Step 2: Submit registration form
      logger.log('Submitting registration form');
      await this.simulateHumanDelay();
      
      // Facebook requires a lot of parameters for registration
      const registrationData = {
        firstname: userData.firstName,
        lastname: userData.lastName,
        reg_email__: userData.email,
        reg_email_confirmation__: userData.email,
        reg_passwd__: userData.password,
        birthday_day: userData.birthDay,
        birthday_month: userData.birthMonth,
        birthday_year: userData.birthYear,
        sex: userData.gender || '2', // 1=female, 2=male
        websubmit: 'Sign Up',
        referrer: 'https://www.facebook.com/',
        jazoest: csrfToken,
        // Add other required fields that Facebook might expect
      };
      
      const registrationResponse = await this.client.post(
        'https://www.facebook.com/reg/submit/', 
        new URLSearchParams(registrationData).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': signupPageUrl,
            'Cookie': this.getCookieString('facebook.com')
          }
        }
      );
      
      // Extract any new cookies
      this.extractCookies(registrationResponse, 'facebook.com');
      
      // Check for success indicators in the response
      if (registrationResponse.status === 200 && 
          (registrationResponse.data.includes('checkpoint') || 
           registrationResponse.data.includes('confirmation') ||
           registrationResponse.data.includes('welcome'))) {
        
        logger.log('Facebook account creation successful, verification may be required');
        return {
          success: true,
          message: 'Facebook account created successfully, verification may be required',
          userData: userData
        };
      }
      
      // Check for CAPTCHA or other challenges
      if (registrationResponse.data.includes('captcha') || 
          registrationResponse.data.includes('security') ||
          registrationResponse.data.includes('checkpoint')) {
        logger.warn('CAPTCHA or security challenge detected during Facebook registration');
        return {
          success: false,
          error: 'CAPTCHA or security challenge detected',
          requiresManualAction: true
        };
      }
      
      logger.error('Facebook account creation failed with unknown error');
      return { 
        success: false, 
        error: 'Unknown error during registration' 
      };
    } catch (error) {
      logger.error(`Facebook account creation error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Create an account on a specific platform
   * @param {string} platform - Platform name (twitter, linkedin, etc.)
   * @param {Object} userData - User data for account creation
   * @returns {Promise<Object>} Result of account creation
   */
  async createAccount(platform, userData) {
    // Apply rate limiting
    await rateLimiter.limit(`create_account_${platform}`);
    
    switch (platform.toLowerCase()) {
      case 'twitter':
      case 'x':
        return this.createTwitterAccount(userData);
        
      case 'linkedin':
        return this.createLinkedInAccount(userData);
        
      case 'facebook':
        return this.createFacebookAccount(userData);
        
      // Add more platforms as needed
        
      default:
        logger.error(`Unsupported platform: ${platform}`);
        return { success: false, error: `Unsupported platform: ${platform}` };
    }
  }
}

export const directAccountCreator = new DirectAccountCreator();

import { logger } from '../utils/logger.mjs';

class HumanBehaviorSimulator {
  constructor() {
    // Typing speed parameters (in milliseconds)
    this.baseTypingDelay = 150;
    this.typingVariance = 100;
    
    // Mouse movement parameters
    this.mouseMovementSteps = 10;
    this.mouseMovementDelay = 50;
    
    // Scroll parameters
    this.scrollStepSize = 100;
    this.scrollStepDelay = 50;
    
    // Page interaction delays
    this.minPageViewTime = 3000;
    this.maxPageViewTime = 15000;
    
    // Working hours simulation (8 AM to 10 PM)
    this.workingHourStart = 8;
    this.workingHourEnd = 22;
    
    // Browser fingerprinting protection
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    ];
    
    // CAPTCHA handling settings
    this.captchaDetectionPatterns = {
      recaptcha: ['recaptcha', 'g-recaptcha', 'google.com/recaptcha', 'iframe[src*="recaptcha"]'],
      hcaptcha: ['hcaptcha', 'iframe[src*="hcaptcha"]'],
      imageRecognition: ['select all images with', 'click each image containing', 'verify you are human'],
      textCaptcha: ['enter the characters', 'type the text', 'enter the code']
    };
  }

  async simulateTyping(page, selector, text) {
    try {
      await page.waitForSelector(selector, { visible: true });
      
      // Focus the input field first
      await page.click(selector);
      
      // Type each character with human-like delays
      for (const char of text) {
        const delay = this.baseTypingDelay + (Math.random() * this.typingVariance);
        await page.type(selector, char, { delay });
        
        // Occasionally pause while typing (simulate thinking)
        if (Math.random() < 0.1) {
          await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
        }
      }
      
      // Small pause after typing
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      logger.error('Error during typing simulation:', error);
      throw error;
    }
  }

  async simulateMouseMovement(page, targetSelector) {
    try {
      // Get the target element's position
      let element;
      
      // Handle different types of selectors (string, ElementHandle, etc.)
      if (typeof targetSelector === 'string') {
        element = await page.$(targetSelector);
      } else if (targetSelector && typeof targetSelector === 'object') {
        // If it's already an ElementHandle
        element = targetSelector;
      } else {
        throw new Error(`Invalid selector type: ${typeof targetSelector}`);
      }
      
      if (!element) {
        throw new Error(`Element not found: ${targetSelector}`);
      }
      
      // Try to get the bounding box, with fallback for invisible elements
      const box = await element.boundingBox();
      if (!box) {
        logger.warn('Could not get element bounding box, using default position');
        // Use a default position in the middle of the viewport
        const viewportSize = page.viewport();
        return await page.mouse.click(viewportSize.width / 2, viewportSize.height / 2);
      }
      
      // Calculate target coordinates (center of element)
      const targetX = box.x + (box.width / 2);
      const targetY = box.y + (box.height / 2);
      
      // Get current mouse position (or use a default starting point)
      const startX = Math.random() * page.viewport().width;
      const startY = Math.random() * page.viewport().height;
      
      // Move mouse in steps with slight curves
      for (let i = 0; i <= this.mouseMovementSteps; i++) {
        const progress = i / this.mouseMovementSteps;
        
        // Add some randomness to the path
        const curve = Math.sin(progress * Math.PI) * (Math.random() * 100 - 50);
        
        const currentX = startX + (targetX - startX) * progress + curve;
        const currentY = startY + (targetY - startY) * progress + curve;
        
        await page.mouse.move(currentX, currentY);
        await new Promise(r => setTimeout(r, this.mouseMovementDelay));
      }
      
    } catch (error) {
      logger.error('Error during mouse movement simulation:', error);
      throw error;
    }
  }

  async simulateScroll(page, targetSelector = null) {
    try {
      if (targetSelector) {
        // Scroll to specific element
        const element = await page.$(targetSelector);
        if (!element) {
          throw new Error(`Element not found: ${targetSelector}`);
        }
        
        const elementPosition = await element.boundingBox();
        if (!elementPosition) {
          throw new Error('Could not get element position');
        }
        
        // Scroll in steps
        const currentScroll = await page.evaluate(() => window.scrollY);
        const targetScroll = elementPosition.y;
        const scrollDistance = targetScroll - currentScroll;
        const steps = Math.abs(Math.ceil(scrollDistance / this.scrollStepSize));
        
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          const currentPosition = currentScroll + (scrollDistance * progress);
          
          await page.evaluate((pos) => window.scrollTo(0, pos), currentPosition);
          await new Promise(r => setTimeout(r, this.scrollStepDelay));
        }
        
      } else {
        // Random scrolling behavior
        const pageHeight = await page.evaluate(() => document.body.scrollHeight);
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const maxScroll = pageHeight - viewportHeight;
        
        let currentPosition = 0;
        while (currentPosition < maxScroll) {
          // Random scroll amount
          const scrollAmount = Math.min(
            this.scrollStepSize + (Math.random() * this.scrollStepSize),
            maxScroll - currentPosition
          );
          
          currentPosition += scrollAmount;
          await page.evaluate((pos) => window.scrollTo(0, pos), currentPosition);
          
          // Random pause between scrolls
          await new Promise(r => setTimeout(r, this.scrollStepDelay + Math.random() * 1000));
          
          // Occasionally scroll back up slightly
          if (Math.random() < 0.2) {
            currentPosition -= scrollAmount * 0.3;
            await page.evaluate((pos) => window.scrollTo(0, pos), currentPosition);
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    } catch (error) {
      logger.error('Error during scroll simulation:', error);
      throw error;
    }
  }

  async simulatePageView(page) {
    const viewTime = this.minPageViewTime + (Math.random() * (this.maxPageViewTime - this.minPageViewTime));
    await new Promise(r => setTimeout(r, viewTime));
  }

  isWorkingHours() {
    const hour = new Date().getHours();
    return hour >= this.workingHourStart && hour < this.workingHourEnd;
  }

  async beforeAction(page) {
    // Random pre-action behaviors
    if (Math.random() < 0.3) {
      await this.simulateScroll(page);
    }
    
    if (Math.random() < 0.2) {
      await this.simulatePageView(page);
    }
  }

  async afterAction(page) {
    // Random post-action behaviors
    if (Math.random() < 0.4) {
      await this.simulatePageView(page);
    }
    
    if (Math.random() < 0.2) {
      await this.simulateScroll(page);
    }
  }

  async simulateDelay() {
    const delay = this.baseTypingDelay + (Math.random() * this.typingVariance);
    await new Promise(r => setTimeout(r, delay));
  }
  
  /**
   * Get a random user agent from the list
   * @returns {string} A random user agent string
   */
  getRandomUserAgent() {
    const index = Math.floor(Math.random() * this.userAgents.length);
    return this.userAgents[index];
  }
  
  /**
   * Configure browser to avoid detection
   * @param {Object} page - Puppeteer page object
   */
  async configureAntiDetection(page) {
    // Set a random user agent
    await page.setUserAgent(this.getRandomUserAgent());
    
    // Modify navigator properties to avoid fingerprinting
    await page.evaluateOnNewDocument(() => {
      // Overwrite the languages property to make it less unique
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Randomize hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => Math.floor(Math.random() * 8) + 2,
      });
      
      // Modify WebGL fingerprint
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // UNMASKED_VENDOR_WEBGL
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        // UNMASKED_RENDERER_WEBGL
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.apply(this, arguments);
      };
    });
    
    // Set random viewport size within normal ranges
    const width = 1100 + Math.floor(Math.random() * 300);
    const height = 700 + Math.floor(Math.random() * 200);
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
  }
  
  /**
   * Detect if a CAPTCHA is present on the page
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<Object>} CAPTCHA type and relevant elements
   */
  async detectCaptcha(page) {
    try {
      // Check for various types of CAPTCHAs
      const captchaInfo = await page.evaluate((patterns) => {
        const pageText = document.body.innerText.toLowerCase();
        const pageHTML = document.body.innerHTML;
        
        // Check for reCAPTCHA
        if (patterns.recaptcha.some(pattern => pageHTML.includes(pattern))) {
          const iframe = document.querySelector('iframe[src*="recaptcha"]');
          const checkbox = document.querySelector('.recaptcha-checkbox') || 
                          document.querySelector('[role="checkbox"]');
          return {
            type: 'recaptcha',
            elements: {
              iframe: iframe ? true : false,
              checkbox: checkbox ? true : false
            }
          };
        }
        
        // Check for hCaptcha
        if (patterns.hcaptcha.some(pattern => pageHTML.includes(pattern))) {
          return {
            type: 'hcaptcha',
            elements: {
              iframe: !!document.querySelector('iframe[src*="hcaptcha"]')
            }
          };
        }
        
        // Check for image recognition CAPTCHA
        if (patterns.imageRecognition.some(pattern => pageText.includes(pattern))) {
          return {
            type: 'image',
            elements: {
              images: !!document.querySelectorAll('img').length
            }
          };
        }
        
        // Check for text CAPTCHA
        if (patterns.textCaptcha.some(pattern => pageText.includes(pattern))) {
          return {
            type: 'text',
            elements: {
              input: !!document.querySelector('input[type="text"]')
            }
          };
        }
        
        return { type: null };
      }, this.captchaDetectionPatterns);
      
      return captchaInfo;
    } catch (error) {
      logger.error('Error detecting CAPTCHA:', error);
      return { type: null, error: error.message };
    }
  }
  
  /**
   * Handle reCAPTCHA in a human-like way
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<boolean>} Whether the CAPTCHA was handled successfully
   */
  async handleReCaptcha(page) {
    try {
      logger.log('Attempting to solve reCAPTCHA in a human-like way...');
      
      // Take a screenshot before interaction for diagnostics
      await page.screenshot({ path: `recaptcha-before-${Date.now()}.png` });
      
      // Find the reCAPTCHA checkbox frame using multiple strategies
      const frames = await page.frames();
      let recaptchaFrame = frames.find(frame => {
        const url = frame.url();
        return url && (url.includes('recaptcha') || url.includes('google.com/recaptcha'));
      });
      
      if (!recaptchaFrame) {
        // Try to find reCAPTCHA elements directly on the page
        const recaptchaElements = await page.$$('iframe[src*="recaptcha"], .g-recaptcha, div[data-sitekey]');
        
        if (recaptchaElements.length > 0) {
          logger.log(`Found ${recaptchaElements.length} reCAPTCHA elements on page, attempting to interact...`);
          
          // Try to click the first element with human-like movement
          await this.simulateMouseMovement(page, recaptchaElements[0]);
          await recaptchaElements[0].click();
          
          // Wait for iframe to appear after clicking
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
          
          // Check again for frames
          const newFrames = await page.frames();
          recaptchaFrame = newFrames.find(frame => {
            const url = frame.url();
            return url && (url.includes('recaptcha') || url.includes('google.com/recaptcha'));
          });
        }
      }
      
      if (!recaptchaFrame) {
        logger.warn('Could not find reCAPTCHA frame');
        return false;
      }
      
      // Find the checkbox within the frame using multiple selectors
      const selectors = [
        '.recaptcha-checkbox-border',
        '#recaptcha-anchor',
        'div[role="presentation"]',
        'span[role="checkbox"]',
        '.rc-anchor-center-container'
      ];
      
      let checkbox = null;
      for (const selector of selectors) {
        checkbox = await recaptchaFrame.$(selector);
        if (checkbox) {
          logger.log(`Found reCAPTCHA checkbox using selector: ${selector}`);
          break;
        }
      }
      
      if (!checkbox) {
        logger.warn('Could not find reCAPTCHA checkbox');
        return false;
      }
      
      // Add a random delay before clicking (human-like behavior)
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      
      // Get the bounding box of the checkbox
      const box = await checkbox.boundingBox();
      if (!box) {
        logger.warn('Could not get checkbox bounding box');
        
        // Try direct click as fallback
        try {
          await checkbox.click();
          logger.log('Direct clicked reCAPTCHA checkbox');
        } catch (clickError) {
          logger.error(`Error clicking checkbox: ${clickError.message}`);
          return false;
        }
      } else {
        // Simulate realistic human mouse movement with slight jitter
        // First move to a random position near the checkbox
        const randomStartX = box.x + box.width / 2 + (Math.random() * 100 - 50);
        const randomStartY = box.y + box.height / 2 + (Math.random() * 100 - 50);
        
        await recaptchaFrame.mouse.move(randomStartX, randomStartY);
        
        // Then move to the checkbox with human-like movement (curved path with variable speed)
        const steps = 10 + Math.floor(Math.random() * 15); // Variable number of steps
        
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          
          // Create a curved path using sine function
          const curve = Math.sin(progress * Math.PI) * (Math.random() * 10 - 5);
          
          // Calculate current position with curve
          const currentX = randomStartX + (box.x + box.width/2 - randomStartX) * progress + curve;
          const currentY = randomStartY + (box.y + box.height/2 - randomStartY) * progress + curve;
          
          // Move to the position
          await recaptchaFrame.mouse.move(currentX, currentY);
          
          // Variable delay between movements (slower at beginning and end)
          const movementDelay = 10 + Math.sin(progress * Math.PI) * 40 + Math.random() * 30;
          await new Promise(r => setTimeout(r, movementDelay));
        }
        
        // Random pause before clicking (as humans do)
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
        
        // Add slight jitter to click position (humans aren't perfect)
        await recaptchaFrame.mouse.click(
          box.x + box.width / 2 + (Math.random() * 6 - 3),
          box.y + box.height / 2 + (Math.random() * 6 - 3)
        );
        
        logger.log('Clicked reCAPTCHA checkbox with human-like movement');
      }
      
      // Wait for the challenge to appear or for success
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      
      // Take a screenshot after clicking
      await page.screenshot({ path: `recaptcha-after-click-${Date.now()}.png` });
      
      // Check if a challenge appeared
      const challengeFrame = frames.find(frame => {
        return frame.url() && frame.url().includes('recaptcha/api2/bframe');
      });
      
      let challengeAppeared = !!challengeFrame;
      
      if (!challengeAppeared) {
        // Double-check by evaluating page content
        challengeAppeared = await page.evaluate(() => {
          // Look for challenge iframe
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            if (iframe.src && iframe.src.includes('recaptcha/api2/bframe')) {
              return true;
            }
          }
          
          // Look for challenge content
          const challengeContent = document.querySelector('.rc-imageselect-instructions') ||
                                 document.querySelector('.rc-imageselect-desc-no-canonical');
          return !!challengeContent;
        });
      }
      
      if (challengeAppeared) {
        logger.warn('reCAPTCHA challenge appeared, manual intervention required');
        await page.screenshot({ path: `recaptcha-challenge-${Date.now()}.png` });
        logger.warn('Please solve the reCAPTCHA challenge manually in the browser window.');
        
        // Wait for manual solving
        await new Promise(resolve => setTimeout(resolve, 30000)); // Give 30 seconds for manual solving
        
        // Take a screenshot after manual solving
        await page.screenshot({ path: `recaptcha-after-manual-${Date.now()}.png` });
        return true;
      }
      
      // Check if the CAPTCHA was solved
      const solved = await page.evaluate(() => {
        // Check for success indicators
        const successIndicators = [
          '.recaptcha-checkbox-checked',
          '.recaptcha-success',
          '#recaptcha-verify-button[disabled]',
          '.rc-anchor-error-msg-container.rc-anchor-invisible'
        ];
        
        for (const indicator of successIndicators) {
          if (document.querySelector(indicator)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (solved) {
        logger.log('reCAPTCHA appears to be solved successfully!');
      } else {
        logger.warn('reCAPTCHA may not have been solved successfully');
      }
      
      return solved;
    } catch (error) {
      logger.error('Error handling reCAPTCHA:', error);
      return false;
    }
  }
  
  /**
   * Handle image-based CAPTCHAs with human assistance
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<boolean>} Whether the CAPTCHA was handled
   */
  async handleImageCaptcha(page) {
    try {
      logger.log('Image-based CAPTCHA detected. Taking screenshot for manual solving...');
      
      // Take a screenshot of the CAPTCHA
      await page.screenshot({ path: `image-captcha-${Date.now()}.png` });
      
      logger.warn('Please solve the image CAPTCHA manually in the browser window.');
      logger.warn(`A screenshot has been saved as image-captcha-${Date.now()}.png`);
      
      // Wait for manual solving
      await new Promise(resolve => setTimeout(resolve, 30000)); // Give 30 seconds for manual solving
      
      // Take a screenshot after manual solving
      await page.screenshot({ path: `image-captcha-after-${Date.now()}.png` });
      
      return true;
    } catch (error) {
      logger.error('Error handling image CAPTCHA:', error);
      return false;
    }
  }
  
  /**
   * Handle hCaptcha with human-like behavior
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<boolean>} Whether the hCaptcha was handled successfully
   */
  async handleHCaptcha(page) {
    try {
      logger.log('Attempting to solve hCaptcha in a human-like way...');
      
      // Take a screenshot before interaction for diagnostics
      await page.screenshot({ path: `hcaptcha-before-${Date.now()}.png` });
      
      // Find the hCaptcha iframe using multiple strategies
      const frames = await page.frames();
      let hcaptchaFrame = frames.find(frame => {
        const url = frame.url();
        return url && (url.includes('hcaptcha') || url.includes('hcaptcha.com'));
      });
      
      if (!hcaptchaFrame) {
        // Try to find hCaptcha elements directly on the page
        const hcaptchaElements = await page.$$('iframe[src*="hcaptcha"], .h-captcha, div[data-hcaptcha-widget-id]');
        
        if (hcaptchaElements.length > 0) {
          logger.log(`Found ${hcaptchaElements.length} hCaptcha elements on page, attempting to interact...`);
          
          // Try to click the first element with human-like movement
          await this.simulateMouseMovement(page, hcaptchaElements[0]);
          await hcaptchaElements[0].click();
          
          // Wait for iframe to appear after clicking
          await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
          
          // Check again for frames
          const newFrames = await page.frames();
          hcaptchaFrame = newFrames.find(frame => {
            const url = frame.url();
            return url && (url.includes('hcaptcha') || url.includes('hcaptcha.com'));
          });
        }
      }
      
      if (!hcaptchaFrame) {
        logger.warn('Could not find hCaptcha frame');
        return false;
      }
      
      // Find the checkbox within the frame using multiple selectors
      const selectors = [
        '#checkbox',
        '.checkbox',
        'div[role="checkbox"]',
        '.checkbox-container',
        'span[role="checkbox"]'
      ];
      
      let checkbox = null;
      for (const selector of selectors) {
        checkbox = await hcaptchaFrame.$(selector);
        if (checkbox) {
          logger.log(`Found hCaptcha checkbox using selector: ${selector}`);
          break;
        }
      }
      
      if (!checkbox) {
        logger.warn('Could not find hCaptcha checkbox');
        return false;
      }
      
      // Add a random delay before clicking (human-like behavior)
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      
      // Get the bounding box of the checkbox
      const box = await checkbox.boundingBox();
      if (!box) {
        logger.warn('Could not get checkbox bounding box');
        
        // Try direct click as fallback
        try {
          await checkbox.click();
          logger.log('Direct clicked hCaptcha checkbox');
        } catch (clickError) {
          logger.error(`Error clicking checkbox: ${clickError.message}`);
          return false;
        }
      } else {
        // Simulate realistic human mouse movement with slight jitter
        // First move to a random position near the checkbox
        const randomStartX = box.x + box.width / 2 + (Math.random() * 100 - 50);
        const randomStartY = box.y + box.height / 2 + (Math.random() * 100 - 50);
        
        await hcaptchaFrame.mouse.move(randomStartX, randomStartY);
        
        // Then move to the checkbox with human-like movement (curved path with variable speed)
        const steps = 10 + Math.floor(Math.random() * 15); // Variable number of steps
        
        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          
          // Create a curved path using sine function
          const curve = Math.sin(progress * Math.PI) * (Math.random() * 10 - 5);
          
          // Calculate current position with curve
          const currentX = randomStartX + (box.x + box.width/2 - randomStartX) * progress + curve;
          const currentY = randomStartY + (box.y + box.height/2 - randomStartY) * progress + curve;
          
          // Move to the position
          await hcaptchaFrame.mouse.move(currentX, currentY);
          
          // Variable delay between movements (slower at beginning and end)
          const movementDelay = 10 + Math.sin(progress * Math.PI) * 40 + Math.random() * 30;
          await new Promise(r => setTimeout(r, movementDelay));
        }
        
        // Random pause before clicking (as humans do)
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
        
        // Add slight jitter to click position (humans aren't perfect)
        await hcaptchaFrame.mouse.click(
          box.x + box.width / 2 + (Math.random() * 6 - 3),
          box.y + box.height / 2 + (Math.random() * 6 - 3)
        );
        
        logger.log('Clicked hCaptcha checkbox with human-like movement');
      }
      
      // Wait for the challenge to appear or for success
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      
      // Take a screenshot after clicking
      await page.screenshot({ path: `hcaptcha-after-click-${Date.now()}.png` });
      
      // Check if a challenge appeared
      const challengeAppeared = await page.evaluate(() => {
        // Look for challenge content
        const challengeContent = document.querySelector('.challenge-container') ||
                               document.querySelector('.task-image') ||
                               document.querySelector('.challenge-example');
        return !!challengeContent;
      });
      
      if (challengeAppeared) {
        logger.warn('hCaptcha challenge appeared, manual intervention required');
        await page.screenshot({ path: `hcaptcha-challenge-${Date.now()}.png` });
        logger.warn('Please solve the hCaptcha challenge manually in the browser window.');
        
        // Wait for manual solving
        await new Promise(resolve => setTimeout(resolve, 30000)); // Give 30 seconds for manual solving
        
        // Take a screenshot after manual solving
        await page.screenshot({ path: `hcaptcha-after-manual-${Date.now()}.png` });
        return true;
      }
      
      // Check if the CAPTCHA was solved
      const solved = await page.evaluate(() => {
        // Check for success indicators
        const successIndicators = [
          '.checkbox.checked',
          '.success-message',
          '.captcha-success'
        ];
        
        for (const indicator of successIndicators) {
          if (document.querySelector(indicator)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (solved) {
        logger.log('hCaptcha appears to be solved successfully!');
      } else {
        logger.warn('hCaptcha may not have been solved successfully');
      }
      
      return solved;
    } catch (error) {
      logger.error('Error handling hCaptcha:', error);
      return false;
    }
  }
  
  /**
   * Configure a new browser session with anti-detection measures
   * @param {Object} browser - Puppeteer browser instance
   * @returns {Promise<Object>} Configured page
   */
  async setupHumanLikeSession(browser) {
    const page = await browser.newPage();
    
    // Apply anti-detection measures
    await this.configureAntiDetection(page);
    
    // Set cookies to appear more like a returning user
    await page.setCookie({
      name: 'returning_visitor',
      value: 'true',
      domain: '.example.com',
      expires: Date.now() / 1000 + 3600 * 24 * 7 // 1 week
    });
    
    // Simulate some random initial browsing behavior
    await this.simulateInitialBrowsing(page);
    
    return page;
  }
  
  /**
   * Simulate initial browsing behavior to appear more human-like
   * @param {Object} page - Puppeteer page
   */
  async simulateInitialBrowsing(page) {
    // Random scrolling
    if (Math.random() > 0.3) {
      await this.simulateScroll(page);
    }
    
    // Random mouse movements
    if (Math.random() > 0.5) {
      const x = Math.random() * page.viewport().width;
      const y = Math.random() * page.viewport().height;
      await page.mouse.move(x, y);
    }
    
    // Simulate viewing the page for a while
    await this.simulatePageView(page);
  }
}

// Export singleton instance
export const humanBehavior = new HumanBehaviorSimulator();

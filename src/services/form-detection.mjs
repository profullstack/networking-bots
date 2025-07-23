import { logger } from '../utils/logger.mjs';
import { makeAICall } from './llm.mjs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Initialize puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

class FormDetectionService {
  constructor() {
    this.formCache = new Map(); // Cache form structures for platforms
    this.captchaDetected = false;
    this.verificationRequired = false;
    this.maxRetries = 3;
  }

  /**
   * Analyze a webpage and detect form fields
   * @param {Object} page - Puppeteer page object
   * @param {string} platform - The platform name (e.g., 'linkedin', 'facebook')
   * @returns {Promise<Object>} - Detected form structure
   */
  async detectFormFields(page, platform) {
    try {
      logger.log(`Analyzing ${platform} signup page for form fields...`);
      
      // Check if we have cached form structure for this platform
      if (this.formCache.has(platform)) {
        logger.log(`Using cached form structure for ${platform}`);
        return this.formCache.get(platform);
      }
      
      // Extract page content for analysis
      const pageContent = await this.extractPageContent(page);
      
      // Use AI to analyze the page content and identify form fields
      const formStructure = await this.analyzePageWithAI(pageContent, platform);
      
      // Cache the form structure for future use
      this.formCache.set(platform, formStructure);
      
      return formStructure;
    } catch (error) {
      logger.error(`Error detecting form fields: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Extract relevant content from the page for AI analysis
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<Object>} - Extracted page content
   */
  async extractPageContent(page) {
    try {
      // Extract all input fields, buttons, and form elements
      const formElements = await page.evaluate(() => {
        const extractAttributes = (element) => {
          const attributes = {};
          for (const attr of element.attributes) {
            attributes[attr.name] = attr.value;
          }
          return attributes;
        };
        
        // Extract input fields
        const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
          type: el.tagName.toLowerCase(),
          inputType: el.type || null,
          id: el.id || null,
          name: el.name || null,
          placeholder: el.placeholder || null,
          value: el.value || null,
          required: el.required || false,
          attributes: extractAttributes(el),
          label: el.labels && el.labels.length > 0 ? el.labels[0].textContent.trim() : null,
          xpath: getXPath(el)
        }));
        
        // Extract buttons
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).map(el => ({
          type: el.tagName.toLowerCase(),
          id: el.id || null,
          text: el.textContent.trim() || el.value || null,
          attributes: extractAttributes(el),
          xpath: getXPath(el)
        }));
        
        // Helper function to get XPath
        function getXPath(element) {
          if (!element) return null;
          
          try {
            const parts = [];
            let current = element;
            
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let part = current.nodeName.toLowerCase();
              
              if (current.id) {
                part += `[@id="${current.id}"]`;
                parts.unshift(part);
                break;
              } else {
                const siblings = Array.from(current.parentNode.children).filter(c => c.nodeName === current.nodeName);
                
                if (siblings.length > 1) {
                  const index = siblings.indexOf(current) + 1;
                  part += `[${index}]`;
                }
                
                parts.unshift(part);
                current = current.parentNode;
              }
            }
            
            return `/${parts.join('/')}`;
          } catch (e) {
            return null;
          }
        }
        
        // Extract page title and URL
        const pageInfo = {
          title: document.title,
          url: window.location.href,
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent.trim())
        };
        
        return { inputs, buttons, pageInfo };
      });
      
      return formElements;
    } catch (error) {
      logger.error(`Error extracting page content: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Use AI to analyze the page content and identify form fields
   * @param {Object} pageContent - Extracted page content
   * @param {string} platform - The platform name
   * @returns {Promise<Object>} - Analyzed form structure
   */
  async analyzePageWithAI(pageContent, platform) {
    try {
      const system_prompt = `You are an AI expert in web form analysis. Your task is to analyze a webpage's form elements and identify the purpose of each input field. You will receive JSON data containing information about input fields, buttons, and page metadata from a ${platform} signup page. Analyze this data and return a structured JSON response that maps each form field to its purpose (e.g., first name, last name, email, password, etc.) and provides selectors to target these elements.`;
      
      const prompt = `Analyze the following ${platform} signup page elements and identify the purpose of each form field. Return a JSON object with field mappings and selectors:
      
      ${JSON.stringify(pageContent, null, 2)}
      
      Return ONLY a JSON object with the following structure:
      {
        "fields": {
          "firstName": { "selectors": ["#selector1", "input[name='firstName']"] },
          "lastName": { "selectors": ["#selector2", "input[name='lastName']"] },
          "email": { "selectors": ["#selector3", "input[type='email']"] },
          "password": { "selectors": ["#selector4", "input[type='password']"] },
          // Add any other fields you identify
        },
        "buttons": {
          "submit": { "selectors": ["#submitButton", "button[type='submit']"] },
          "continue": { "selectors": ["#continueButton", "button:contains('Continue')"] },
          // Add any other buttons you identify
        },
        "steps": [
          { "name": "initialForm", "requiredFields": ["firstName", "lastName"] },
          { "name": "contactInfo", "requiredFields": ["email"] },
          { "name": "credentials", "requiredFields": ["password"] }
          // Add any steps you identify in the signup flow
        ]
      }`;
      
      const response = await makeAICall(system_prompt, prompt, 'profullstack');
      
      try {
        // Parse the AI response to get the form structure
        let formStructure;
        
        // Handle different response formats
        if (typeof response === 'string') {
          // Extract JSON from the response if it's wrapped in markdown code blocks
          const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                           response.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            formStructure = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          } else {
            formStructure = JSON.parse(response);
          }
        } else if (typeof response === 'object') {
          formStructure = response;
        }
        
        logger.log(`Successfully analyzed ${platform} form structure`);
        return formStructure;
      } catch (parseError) {
        logger.error(`Error parsing AI response: ${parseError.message}`);
        logger.debug(`Raw AI response: ${response}`);
        return null;
      }
    } catch (error) {
      logger.error(`Error analyzing page with AI: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Fill a form based on the detected structure and user data
   * @param {Object} page - Puppeteer page object
   * @param {Object} formStructure - Detected form structure
   * @param {Object} userData - User data to fill in the form
   * @param {Object} humanBehavior - Human behavior simulator
   * @returns {Promise<boolean>} - Success status
   */
  async fillForm(page, formStructure, userData, humanBehavior) {
    try {
      logger.log('Filling form fields with human-like behavior...');
      
      if (!formStructure || !formStructure.fields) {
        logger.error('Invalid form structure');
        return false;
      }
      
      // Map user data to form fields
      const fieldMappings = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        password: userData.password,
        username: userData.username || `${userData.firstName.toLowerCase()}${userData.lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`,
        birthDate: userData.birthDate || '1990-01-01',
        phone: userData.phone || '',
        country: userData.country || 'United States',
        zipCode: userData.zipCode || '10001',
        gender: userData.gender || 'prefer not to say',
        bio: userData.bio || `Hi, I'm ${userData.firstName}. Nice to meet you!`
      };
      
      // Randomize the order of fields slightly to appear more human-like
      const fieldEntries = Object.entries(fieldMappings);
      if (Math.random() > 0.5) {
        // Sometimes shuffle the order of non-critical fields
        const criticalFields = ['firstName', 'lastName', 'email', 'password'];
        const criticalEntries = fieldEntries.filter(([key]) => criticalFields.includes(key));
        const nonCriticalEntries = fieldEntries.filter(([key]) => !criticalFields.includes(key));
        
        // Shuffle non-critical entries
        for (let i = nonCriticalEntries.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [nonCriticalEntries[i], nonCriticalEntries[j]] = [nonCriticalEntries[j], nonCriticalEntries[i]];
        }
        
        fieldEntries.length = 0;
        fieldEntries.push(...criticalEntries, ...nonCriticalEntries);
      }
      
      // Fill each field with human-like behavior
      for (const [fieldName, fieldValue] of fieldEntries) {
        if (!fieldValue) continue;
        
        const field = formStructure.fields[fieldName];
        if (!field || !field.selectors || field.selectors.length === 0) continue;
        
        // Before filling this field, sometimes perform random human-like actions
        await humanBehavior.beforeAction(page);
        
        // Try each selector until one works
        let filled = false;
        for (const selector of field.selectors) {
          try {
            // Check if the selector exists on the page
            const elementExists = await page.evaluate((sel) => !!document.querySelector(sel), selector);
            
            if (elementExists) {
              logger.log(`Filling ${fieldName} using selector: ${selector}`);
              
              // Move mouse to the field first with human-like movement
              await humanBehavior.simulateMouseMovement(page, selector);
              
              // Click on the field
              await page.click(selector);
              
              // Small pause before typing (as humans do)
              await new Promise(r => setTimeout(r, 100 + Math.random() * 300));
              
              // Type with human-like delays
              await humanBehavior.simulateTyping(page, selector, fieldValue);
              
              // Sometimes perform a random action after filling a field
              if (Math.random() < 0.3) {
                await humanBehavior.afterAction(page);
              }
              
              filled = true;
              break;
            }
          } catch (e) {
            // Continue to the next selector
            continue;
          }
        }
        
        if (!filled) {
          logger.warn(`Could not fill ${fieldName} - no matching selector found`);
        }
        
        // Random delay between fields
        await new Promise(r => setTimeout(r, 300 + Math.random() * 1200));
      }
      
      return true;
    } catch (error) {
      logger.error(`Error filling form: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Submit a form by clicking the appropriate button
   * @param {Object} page - Puppeteer page object
   * @param {Object} formStructure - Detected form structure
   * @param {string} buttonType - Type of button to click (e.g., 'submit', 'continue')
   * @param {Object} humanBehavior - Human behavior simulator (optional)
   * @returns {Promise<boolean>} - Success status
   */
  async submitForm(page, formStructure, buttonType = 'submit', humanBehavior = null) {
    try {
      logger.log(`Attempting to submit form using ${buttonType} button with human-like behavior...`);
      
      // Sometimes pause before submitting (as humans do)
      if (humanBehavior) {
        await humanBehavior.simulateDelay();
      }
      
      if (!formStructure || !formStructure.buttons || !formStructure.buttons[buttonType]) {
        logger.warn(`No ${buttonType} button found in form structure`);
        
        // Try to find a button by common patterns if not in form structure
        const buttonSelectors = [
          `button:contains(${buttonType})`,
          `button[type="${buttonType}"]`,
          `input[type="${buttonType}"]`,
          `[role="button"]:contains(${buttonType})`,
          `.btn:contains(${buttonType})`,
          `#${buttonType}Button`,
          `[data-testid*="${buttonType}"]`,
          `[aria-label*="${buttonType}"]`
        ];
        
        for (const selector of buttonSelectors) {
          try {
            const buttonExists = await page.evaluate((sel) => {
              // Custom contains selector implementation
              if (sel.includes(':contains(')) {
                const parts = sel.split(':contains(');
                const elementType = parts[0];
                const text = parts[1].slice(0, -1);
                const elements = document.querySelectorAll(elementType);
                for (const el of elements) {
                  if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
                    return true;
                  }
                }
                return false;
              }
              return !!document.querySelector(sel);
            }, selector);
            
            if (buttonExists) {
              logger.log(`Found ${buttonType} button using fallback selector: ${selector}`);
              
              // Use human-like behavior if available
              if (humanBehavior) {
                // Extract the actual selector for the button
                const actualSelector = await page.evaluate((sel) => {
                  if (sel.includes(':contains(')) {
                    const parts = sel.split(':contains(');
                    const elementType = parts[0];
                    const text = parts[1].slice(0, -1);
                    const elements = document.querySelectorAll(elementType);
                    for (const el of elements) {
                      if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
                        // Add a temporary ID to the element
                        const tempId = 'temp-button-' + Date.now();
                        el.id = tempId;
                        return '#' + tempId;
                      }
                    }
                  }
                  return sel;
                }, selector);
                
                // Move mouse to button with human-like movement
                await humanBehavior.simulateMouseMovement(page, actualSelector);
                
                // Slight pause before clicking (as humans do)
                await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
                
                // Click the button
                await page.click(actualSelector);
              } else {
                // Fallback to direct click if no human behavior simulator
                await page.evaluate((sel) => {
                  if (sel.includes(':contains(')) {
                    const parts = sel.split(':contains(');
                    const elementType = parts[0];
                    const text = parts[1].slice(0, -1);
                    const elements = document.querySelectorAll(elementType);
                    for (const el of elements) {
                      if (el.textContent.toLowerCase().includes(text.toLowerCase())) {
                        el.click();
                        return true;
                      }
                    }
                  }
                  document.querySelector(sel).click();
                  return true;
                }, selector);
              }
              
              // Random delay after clicking (as humans do)
              const waitTime = 2000 + Math.random() * 1000;
              await page.waitForTimeout(waitTime);
              return true;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        return false;
      }
      
      const button = formStructure.buttons[buttonType];
      
      // Try each selector until one works
      for (const selector of button.selectors) {
        try {
          // Check if the selector exists on the page
          const elementExists = await page.evaluate((sel) => !!document.querySelector(sel), selector);
          
          if (elementExists) {
            logger.log(`Clicking ${buttonType} button using selector: ${selector}`);
            
            // Use human-like behavior if available
            if (humanBehavior) {
              // Move mouse to button with human-like movement
              await humanBehavior.simulateMouseMovement(page, selector);
              
              // Slight pause before clicking (as humans do)
              await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
              
              // Click the button
              await page.click(selector);
            } else {
              // Fallback to direct click
              await page.click(selector);
            }
            
            // Random delay after clicking (as humans do)
            const waitTime = 2000 + Math.random() * 1000;
            await page.waitForTimeout(waitTime);
            return true;
          }
        } catch (e) {
          // Continue to the next selector
          continue;
        }
      }
      
      logger.warn(`Could not click ${buttonType} button - no matching selector found`);
      return false;
    } catch (error) {
      logger.error(`Error submitting form: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Detect if a CAPTCHA is present on the page
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<Object>} - Information about detected CAPTCHA
   */
  async detectCaptcha(page) {
    try {
      logger.log('Detecting CAPTCHA...');
      
      // Check for common CAPTCHA elements
      const captchaInfo = await page.evaluate(() => {
        const result = { detected: false, type: null, confidence: 0 };
        
        // Check for Google reCAPTCHA
        const recaptchaElements = document.querySelectorAll(
          '.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"], div[data-sitekey]'
        );
        if (recaptchaElements.length > 0) {
          result.detected = true;
          result.type = 'recaptcha';
          result.confidence = 0.9;
          return result;
        }
        
        // Check for hCaptcha
        const hcaptchaElements = document.querySelectorAll(
          '.h-captcha, iframe[src*="hcaptcha.com"], div[data-sitekey][data-callback]'
        );
        if (hcaptchaElements.length > 0) {
          result.detected = true;
          result.type = 'hcaptcha';
          result.confidence = 0.9;
          return result;
        }
        
        // Check for image CAPTCHAs
        const potentialImageCaptchas = document.querySelectorAll(
          'img[alt*="captcha" i], img[src*="captcha" i], img[id*="captcha" i], img[class*="captcha" i]'
        );
        if (potentialImageCaptchas.length > 0) {
          result.detected = true;
          result.type = 'image';
          result.confidence = 0.8;
          return result;
        }
        
        // Check for text indicating CAPTCHA
        const bodyText = document.body.innerText.toLowerCase();
        if (
          bodyText.includes('captcha') ||
          bodyText.includes('security check') ||
          bodyText.includes('verify you are human') ||
          bodyText.includes('prove you\'re not a robot') ||
          bodyText.includes('bot check')
        ) {
          result.detected = true;
          result.type = 'text';
          result.confidence = 0.6;
          return result;
        }
        
        return result;
      });
      
      return captchaInfo;
    } catch (error) {
      logger.error(`Error detecting CAPTCHA: ${error.message}`);
      return { detected: false, type: null, confidence: 0 };
    }
  }
  
  /**
   * Handle CAPTCHA detection
   * @param {Object} page - Puppeteer page object
   * @param {Object} humanBehavior - Human behavior simulator
   * @returns {Promise<boolean>} - Whether CAPTCHA was detected and handled
   */
  async handleCaptcha(page, humanBehavior) {
    try {
      logger.log('Checking for CAPTCHA...');
      
      // Use our dedicated CAPTCHA detection method
      const captchaInfo = await this.detectCaptcha(page);
      
      if (captchaInfo.detected) {
        logger.warn(`CAPTCHA detected! Type: ${captchaInfo.type}`);
        
        // Take a screenshot of the CAPTCHA
        await page.screenshot({ path: `captcha-${Date.now()}.png` });
        
        let handled = false;
        
        // Handle different types of CAPTCHAs
        if (captchaInfo.type === 'hcaptcha') {
          handled = await this.handleHCaptcha(page, humanBehavior);
        } else if (captchaInfo.type === 'recaptcha') {
          logger.log('Attempting to solve reCAPTCHA with human-like behavior...');
          handled = await this.handleReCaptcha(page, humanBehavior);
        } else if (captchaInfo.type === 'image') {
          logger.log('Image CAPTCHA detected. Requires manual intervention.');
          // Take a screenshot and wait for manual solving
          await page.screenshot({ path: `image-captcha-${Date.now()}.png` });
          logger.warn('Please solve the image CAPTCHA manually in the browser window.');
          await page.waitForTimeout(30000); // Give 30 seconds for manual solving
          handled = true;
        } else if (captchaInfo.type === 'text') {
          logger.log('Text CAPTCHA detected. Requires manual intervention.');
          // Take a screenshot and wait for manual solving
          await page.screenshot({ path: `text-captcha-${Date.now()}.png` });
          logger.warn('Please solve the text CAPTCHA manually in the browser window.');
          await page.waitForTimeout(30000); // Give 30 seconds for manual solving
          handled = true;
        } else {
          logger.warn('Unknown CAPTCHA type. Manual intervention required.');
          await page.screenshot({ path: `unknown-captcha-${Date.now()}.png` });
          logger.warn('Please solve the CAPTCHA manually in the browser window.');
          await page.waitForTimeout(30000); // Give 30 seconds for manual solving
          handled = true;
        }
        
        if (handled) {
          logger.log('CAPTCHA handling completed.');
        } else {
          logger.warn('Failed to handle CAPTCHA automatically.');
        }
        
        this.captchaDetected = true;
        return handled;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error handling CAPTCHA: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle reCAPTCHA with human-like behavior
   * @param {Object} page - Puppeteer page object
   * @param {Object} humanBehavior - Human behavior simulator
   * @returns {Promise<boolean>} - Whether reCAPTCHA was handled successfully
   */
  async handleReCaptcha(page, humanBehavior) {
    try {
      logger.log('Handling Google reCAPTCHA with advanced human-like behavior...');
      
      // First try the advanced human-like approach using the enhanced implementation
      logger.log('Attempting automated human-like reCAPTCHA solving...');
      const automatedResult = await humanBehavior.handleReCaptcha(page);
      
      if (automatedResult) {
        logger.log('Advanced human-like reCAPTCHA handling succeeded!');
        return true;
      } else {
        logger.warn('Advanced human-like approach failed, falling back to manual intervention');
        
        // Take a screenshot for diagnostic purposes
        const screenshotPath = `recaptcha-manual-fallback-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });
        logger.log(`Screenshot saved to ${screenshotPath}`);
        
        // Use a manual intervention approach as fallback
        logger.warn('Manual reCAPTCHA solving required.');
        logger.warn('Please solve the reCAPTCHA in the browser window.');
        
        const waitTime = 30000; // 30 seconds
        logger.log(`Waiting ${waitTime/1000} seconds for manual CAPTCHA solving...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Take a screenshot after the waiting period
        const afterScreenshotPath = `recaptcha-after-manual-${Date.now()}.png`;
        await page.screenshot({ path: afterScreenshotPath });
        logger.log(`After-solving screenshot saved to ${afterScreenshotPath}`);
        
        logger.log('reCAPTCHA handling completed via manual fallback.');
        return true;
      }
    } catch (error) {
      logger.error(`Error handling reCAPTCHA: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle hCaptcha with human-like behavior
   * @param {Object} page - Puppeteer page object
   * @param {Object} humanBehavior - Human behavior simulator
   * @returns {Promise<boolean>} - Whether hCaptcha was handled successfully
   */
  async handleHCaptcha(page, humanBehavior) {
    try {
      logger.log('Handling hCaptcha with advanced human-like behavior...');
      
      // First try the advanced human-like approach using the enhanced implementation
      logger.log('Attempting automated human-like hCaptcha solving...');
      const automatedResult = await humanBehavior.handleHCaptcha(page);
      
      if (automatedResult) {
        logger.log('Advanced human-like hCaptcha handling succeeded!');
        return true;
      } else {
        logger.warn('Advanced human-like approach failed, falling back to manual intervention');
        
        // Take a screenshot for diagnostic purposes
        const screenshotPath = `hcaptcha-manual-fallback-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });
        logger.log(`Screenshot saved to ${screenshotPath}`);
        
        // Use a manual intervention approach as fallback
        logger.warn('hCaptcha detected. Manual intervention required.');
        logger.warn('Please solve the hCaptcha manually in the browser window.');
        logger.warn(`A screenshot has been saved to ${screenshotPath} for reference.`);
        
        // Wait for manual solving
        const waitTime = 30000; // 30 seconds
        logger.log(`Waiting ${waitTime/1000} seconds for manual CAPTCHA solving...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Take a screenshot after the waiting period
        const afterScreenshotPath = `hcaptcha-after-manual-${Date.now()}.png`;
        await page.screenshot({ path: afterScreenshotPath });
        logger.log(`After-solving screenshot saved to ${afterScreenshotPath}`);
        
        logger.log('hCaptcha handling completed via manual fallback.');
        return true;
      }
    } catch (error) {
      logger.error(`Error handling hCaptcha: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Handle email/phone verification
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<boolean>} - Whether verification was detected
   */
  async handleVerification(page) {
    try {
      logger.log('Checking for verification requirements...');
      
      // Check for common verification indicators
      const verificationDetected = await page.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        const verificationKeywords = [
          'verify', 'verification', 'confirm', 'code', 'sent to your email',
          'check your email', 'phone verification', 'sms code', 'authentication'
        ];
        
        for (const keyword of verificationKeywords) {
          if (pageText.includes(keyword)) {
            return true;
          }
        }
        
        // Check for common verification input fields
        return !!(document.querySelector('input[placeholder*="code"]') ||
                document.querySelector('input[placeholder*="verification"]') ||
                document.querySelector('input[aria-label*="verification"]'));
      });
      
      if (verificationDetected) {
        logger.warn('Verification step detected!');
        this.verificationRequired = true;
        
        // Take a screenshot of the verification page
        await page.screenshot({ path: 'verification-required.png' });
        
        // For now, we'll need to notify that verification requires external email/SMS access
        logger.warn('Automated verification requires integration with email/SMS access services');
        logger.warn('For full automation, integrate an email/SMS access API in this method');
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error handling verification: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Autonomously create an account on a platform
   * @param {string} platform - Platform name (e.g., 'linkedin', 'facebook')
   * @param {Object} userData - User data for account creation
   * @param {Object} existingBrowser - Optional existing browser instance
   * @param {boolean} headless - Whether to run browser in headless mode
   * @returns {Promise<Object>} - Created account details or null if failed
   */
  async createAccountAutonomously(platform, userData, existingBrowser = null, headless = true) {
    let browser;
    let page;
    
    // Track CAPTCHA handling results
    const captchaResults = {
      detected: false,
      type: null,
      attempted: false,
      solved: false
    };
    
    try {
      logger.log(`Starting autonomous account creation for ${platform}...`);
      
      // Import human behavior simulator first
      const { humanBehavior } = await import('./human-behavior.mjs');
      
      // Use existing browser or launch a new one with enhanced anti-detection
      if (existingBrowser) {
        browser = existingBrowser;
      } else {
        // Launch browser in headless mode with stealth plugin
        puppeteer.use(StealthPlugin());
        
        // Generate random viewport size to avoid fingerprinting
        const width = 1100 + Math.floor(Math.random() * 300); // 1100-1400
        const height = 700 + Math.floor(Math.random() * 300); // 700-1000
        
        browser = await puppeteer.launch({
          headless: headless ? 'new' : false, // Use new headless mode when headless is true
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            `--window-size=${width},${height}`,
            '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
            '--disable-blink-features=AutomationControlled', // Disable automation flag
            '--disable-infobars' // Remove "Chrome is being controlled by automated software"
          ],
          ignoreDefaultArgs: ['--enable-automation'] // Ignore default automation args
        });
      }
      
      // Create a new page with anti-detection measures
      page = await browser.newPage();
      
      // Setup human-like session with anti-detection measures
      page = await humanBehavior.setupHumanLikeSession(browser, page);
      
      // Define signup URLs for different platforms
      const signupUrls = {
        linkedin: 'https://www.linkedin.com/signup',
        x: 'https://twitter.com/i/flow/signup',
        tiktok: 'https://www.tiktok.com/signup',
        youtube: 'https://accounts.google.com/signup',
        facebook: 'https://www.facebook.com/signup',
        reddit: 'https://www.reddit.com/register/'
      };
      
      if (!signupUrls[platform]) {
        logger.error(`Unsupported platform: ${platform}`);
        await browser.close();
        return null;
      }
      
      logger.log(`Navigating to ${platform} signup page...`);
      await page.goto(signupUrls[platform], { waitUntil: 'networkidle2' });
      
      // Take a screenshot of the initial page
      await page.screenshot({ path: `${platform}-signup-initial.png` });
      
      // Setup human-like session with anti-detection measures
      // Note: humanBehavior was already imported at the beginning of this method
      
      // Navigate to signup page with human-like behavior
      logger.log(`Navigating to ${platform} signup page with human-like behavior...`);
      await page.goto(signupUrls[platform], { waitUntil: 'networkidle2' });
      await humanBehavior.simulatePageView(page);
      
      // Take a screenshot of the initial page
      await page.screenshot({ path: `${platform}-signup-initial.png` });
      
      // Process multi-step signup
      let success = false;
      let username = userData.username || `${userData.firstName.toLowerCase()}${userData.lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
      let currentStep = 0;
      let maxSteps = 5; // Prevent infinite loops
      
      while (currentStep < maxSteps) {
        logger.log(`Processing signup step ${currentStep + 1}...`);
        
        // Random delay between steps to appear more human-like
        await humanBehavior.simulateDelay();
        
        // Check for CAPTCHA with human-like handling
        const captchaInfo = await this.detectCaptcha(page);
        if (captchaInfo.detected) {
          captchaResults.detected = true;
          captchaResults.type = captchaInfo.type;
          
          logger.log(`CAPTCHA detected (${captchaInfo.type}). Attempting to handle...`);
          captchaResults.attempted = true;
          
          const captchaHandled = await this.handleCaptcha(page, humanBehavior);
          captchaResults.solved = captchaHandled;
          
          if (captchaHandled) {
            logger.log('CAPTCHA handling completed successfully.');
          } else {
            logger.warn('CAPTCHA handling may not have been successful.');
          }
        }
        
        // Check for verification
        const verificationDetected = await this.handleVerification(page);
        if (verificationDetected) {
          logger.warn('Verification step detected and cannot be automatically completed. Account creation paused.');
          break;
        }
        
        // Detect form fields
        const formStructure = await this.detectFormFields(page, platform);
        
        if (!formStructure) {
          logger.warn('Could not detect form structure. Trying generic form detection...');
          
          // Try generic form detection as fallback with human-like behavior
          const inputs = await page.$$('input');
          if (inputs.length > 0) {
            // Randomize the order slightly to appear more human-like
            if (Math.random() > 0.5) {
              // Shuffle the non-critical inputs
              for (let i = inputs.length - 1; i > 0; i--) {
                if (Math.random() > 0.7) { // Only shuffle some inputs
                  const j = Math.floor(Math.random() * (i + 1));
                  [inputs[i], inputs[j]] = [inputs[j], inputs[i]];
                }
              }
            }
            
            for (const input of inputs) {
              // Sometimes perform random human-like actions before filling a field
              await humanBehavior.beforeAction(page);
              
              const type = await page.evaluate(el => el.type, input);
              const placeholder = await page.evaluate(el => el.placeholder, input);
              const name = await page.evaluate(el => el.name, input);
              const id = await page.evaluate(el => el.id, input);
              
              // Get the selector for this input
              const selector = await page.evaluate(el => {
                // Try to get a unique selector for this element
                if (el.id) return `#${el.id}`;
                if (el.name) return `[name="${el.name}"]`;
                
                // If no good identifier, create a temporary one
                const tempId = 'temp-input-' + Date.now();
                el.id = tempId;
                return `#${tempId}`;
              }, input);
              
              // Try to determine field type and fill accordingly with human-like behavior
              let valueToFill = null;
              
              if (type === 'email' || placeholder?.includes('email') || name?.includes('email') || id?.includes('email')) {
                valueToFill = userData.email;
                logger.log('Filling email field using generic detection with human-like behavior');
              } else if (type === 'password' || placeholder?.includes('password') || name?.includes('password') || id?.includes('password')) {
                valueToFill = userData.password;
                logger.log('Filling password field using generic detection with human-like behavior');
              } else if (placeholder?.includes('first') || name?.includes('first') || id?.includes('first')) {
                valueToFill = userData.firstName;
                logger.log('Filling first name field using generic detection with human-like behavior');
              } else if (placeholder?.includes('last') || name?.includes('last') || id?.includes('last')) {
                valueToFill = userData.lastName;
                logger.log('Filling last name field using generic detection with human-like behavior');
              } else if (placeholder?.includes('user') || name?.includes('user') || id?.includes('user')) {
                valueToFill = username;
                logger.log('Filling username field using generic detection with human-like behavior');
              }
              
              if (valueToFill) {
                // Move mouse to the field with human-like movement
                await humanBehavior.simulateMouseMovement(page, selector);
                
                // Click on the field
                await page.click(selector);
                
                // Small pause before typing (as humans do)
                await new Promise(r => setTimeout(r, 100 + Math.random() * 300));
                
                // Type with human-like delays
                await humanBehavior.simulateTyping(page, selector, valueToFill);
                
                // Sometimes perform a random action after filling a field
                if (Math.random() < 0.3) {
                  await humanBehavior.afterAction(page);
                }
                
                // Random delay between fields
                await new Promise(r => setTimeout(r, 300 + Math.random() * 1200));
              }
            }
            
            // Sometimes move mouse around or scroll before submitting
            if (Math.random() > 0.5) {
              await humanBehavior.simulateRandomMouseMovement(page);
            }
            
            if (Math.random() > 0.7) {
              await humanBehavior.simulateScrolling(page);
            }
            
            // Try to find and click a submit button with human-like behavior
            const buttons = await page.$$('button, input[type="submit"]');
            for (const button of buttons) {
              const buttonText = await page.evaluate(el => el.textContent || el.value, button);
              const buttonType = await page.evaluate(el => el.type, button);
              
              if (buttonText?.toLowerCase().includes('sign') || 
                  buttonText?.toLowerCase().includes('continue') || 
                  buttonText?.toLowerCase().includes('next') || 
                  buttonType === 'submit') {
                
                // Get the selector for this button
                const buttonSelector = await page.evaluate(el => {
                  // Try to get a unique selector for this element
                  if (el.id) return `#${el.id}`;
                  if (el.name) return `[name="${el.name}"]`;
                  
                  // If no good identifier, create a temporary one
                  const tempId = 'temp-button-' + Date.now();
                  el.id = tempId;
                  return `#${tempId}`;
                }, button);
                
                // Move mouse to button with human-like movement
                await humanBehavior.simulateMouseMovement(page, buttonSelector);
                
                // Slight pause before clicking (as humans do)
                await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
                
                // Click the button
                await page.click(buttonSelector);
                logger.log('Clicked submit button using generic detection with human-like behavior');
                
                // Random delay after clicking (as humans do)
                const waitTime = 2000 + Math.random() * 1000;
                await page.waitForTimeout(waitTime);
                break;
              }
            }
          } else {
            logger.error('No input fields found on page. Cannot proceed with account creation.');
            break;
          }
        } else {
          // Fill the form using detected fields with human-like behavior
          await this.fillForm(page, formStructure, userData, humanBehavior);
          
          // Random delay after filling form before submission (as humans do)
          await humanBehavior.simulateDelay();
          
          // Sometimes move mouse around or scroll before submitting
          if (Math.random() > 0.5) {
            await humanBehavior.simulateRandomMouseMovement(page);
          }
          
          if (Math.random() > 0.7) {
            await humanBehavior.simulateScrolling(page);
          }
          
          // Submit the form with human-like behavior
          const submitted = await this.submitForm(page, formStructure, 'continue', humanBehavior) || 
                           await this.submitForm(page, formStructure, 'submit', humanBehavior) || 
                           await this.submitForm(page, formStructure, 'next', humanBehavior) || 
                           await this.submitForm(page, formStructure, 'signup', humanBehavior);
          
          if (!submitted) {
            logger.warn('Could not submit form. Trying to find any clickable button with human-like behavior...');
            
            // Try to find any button as a last resort
            try {
              const anyButton = await page.$('button, input[type="submit"], [role="button"]');
              if (anyButton) {
                // Get the selector for this button
                const buttonSelector = await page.evaluate(el => {
                  // Try to get a unique selector for this element
                  if (el.id) return `#${el.id}`;
                  if (el.name) return `[name="${el.name}"]`;
                  if (el.className) {
                    const classes = el.className.split(' ').filter(c => c.trim().length > 0);
                    if (classes.length > 0) {
                      return `.${classes.join('.')}`;  
                    }
                  }
                  
                  // If no good identifier, create a temporary one
                  const tempId = 'temp-fallback-button-' + Date.now();
                  el.id = tempId;
                  return `#${tempId}`;
                }, anyButton);
                
                // Sometimes move mouse around or scroll before clicking
                if (Math.random() > 0.5) {
                  await humanBehavior.simulateRandomMouseMovement(page);
                }
                
                // Move mouse to button with human-like movement
                await humanBehavior.simulateMouseMovement(page, buttonSelector);
                
                // Slight pause before clicking (as humans do)
                await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
                
                // Click the button
                await page.click(buttonSelector);
                logger.log('Clicked a button as fallback with human-like behavior');
                
                // Random delay after clicking (as humans do)
                const waitTime = 2000 + Math.random() * 1000;
                await page.waitForTimeout(waitTime);
              }
            } catch (e) {
              logger.warn(`Could not click any button: ${e.message}`);
            }
          }
        }
        
        // Wait for navigation or content change
        await page.waitForTimeout(3000);
        
        // Take a screenshot after this step
        await page.screenshot({ path: `${platform}-signup-step-${currentStep + 1}.png` });
        
        // Check if we've reached a success indicator
        const successIndicators = await page.evaluate(() => {
          const pageText = document.body.innerText.toLowerCase();
          return {
            welcomeMessage: pageText.includes('welcome') || pageText.includes('get started'),
            dashboard: pageText.includes('dashboard') || pageText.includes('feed') || pageText.includes('home'),
            accountCreated: pageText.includes('account created') || pageText.includes('successfully'),
            profileSetup: pageText.includes('set up your profile') || pageText.includes('complete your profile'),
            url: window.location.href
          };
        });
        
        logger.log(`Current URL: ${successIndicators.url}`);
        
        if (successIndicators.welcomeMessage || successIndicators.dashboard || 
            successIndicators.accountCreated || successIndicators.profileSetup) {
          logger.log('Success indicators detected! Account likely created successfully.');
          success = true;
          break;
        }
        
        currentStep++;
      }
      
      // Final screenshot
      await page.screenshot({ path: `${platform}-signup-final.png` });
      
      // Close browser
      await browser.close();
      
      if (success) {
        logger.log(`\n✅ ${platform} profile created successfully!`);
        logger.log(`👤 Username: ${username || userData.email}`);
        
        return {
          success: true,
          username: username || userData.email,
          password: userData.password,
          email: userData.email,
          profileUrl: null,
          notes: notes,
          captchaDetected: captchaResults.detected,
          captchaType: captchaResults.type,
          captchaAttempted: captchaResults.attempted,
          captchaSolved: captchaResults.solved,
          active: true,
          dateAdded: new Date().toISOString(),
          autonomous: true
        };
      } else {
        if (captchaResults.detected) {
          notes.push(`CAPTCHA (${captchaResults.type}) was detected during signup process`);
          notes.push(`CAPTCHA solving ${captchaResults.solved ? 'was successful' : 'may have failed'}`);
        }
        
        if (this.verificationRequired) {
          notes.push('Email/phone verification was required during signup');
        }
        
        logger.warn(`\n❌ ${platform} profile creation failed or uncertain.`);
        return {
          success: false,
          error: 'Could not confirm successful account creation',
          notes: notes,
          captchaDetected: captchaResults.detected,
          captchaType: captchaResults.type,
          captchaAttempted: captchaResults.attempted,
          captchaSolved: captchaResults.solved
        };
      }
    } catch (error) {
      logger.error(`Error during autonomous account creation: ${error.message}`);
      
      // Take error screenshot
      if (page) {
        try {
          await page.screenshot({ path: `${platform}-signup-error.png` });
        } catch (e) {
          // Ignore screenshot errors
        }
      }
      
      // Close browser if it's still open
      if (browser && !existingBrowser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore browser close errors
        }
      }
      
      return {
        success: false,
        error: error.message,
        captchaDetected: captchaResults.detected,
        captchaType: captchaResults.type,
        captchaAttempted: captchaResults.attempted,
        captchaSolved: captchaResults.solved
      };
    }
  }
}

// Export singleton instance
export const formDetection = new FormDetectionService();

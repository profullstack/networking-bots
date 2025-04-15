import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { setTimeout as wait } from 'timers/promises';
import dayjs from 'dayjs';
import { logger } from '../utils/logger.mjs';
import { humanBehavior } from '../services/human-behavior.mjs';
import { rateLimiter } from '../services/rate-limiter.mjs';
import { proxyManager } from '../services/proxy-manager.mjs';

export default class X {
  constructor() {
    this.browser = null;
    this.page = null;
    this.loginSuccessful = false;
  }

  /**
   * Check if we need to log in to X.com
   * @returns {Promise<boolean>} True if login is needed
   */
  async needsLogin() {
    if (!this.page) {
      throw new Error('X.com browser not initialized');
    }

    try {
      // Check if we're on the login page or home page
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('i/flow/login')) {
        return true;
      }

      // Check for login button
      const loginButton = await this.page.$('[data-testid="loginButton"]');
      return !!loginButton;
    } catch (error) {
      logger.error(`Error checking login status: ${error.message}`);
      return true; // Assume login needed on error
    }
  }

  /**
   * Login to X.com
   * @returns {Promise<boolean>} Success status
   */
  async login() {
    try {
      const username = process.env.X_USERNAME;
      const password = process.env.X_PASSWORD;

    // Debug environment variables
    logger.log('Debugging X credentials:');
    logger.log(`X_USERNAME exists: ${!!process.env.X_USERNAME}`);
    logger.log(`X_PASSWORD exists: ${!!process.env.X_PASSWORD}`);

    if (!username || !password) {
      logger.warn('X.com credentials not found in environment variables');
      return false;
    }

    try {
      logger.log('Preparing to log in to X.com with human-like behavior...');

      // Use a random delay before starting (3-8 seconds)
      const initialDelay = 3000 + Math.floor(Math.random() * 5000);
      logger.log(`Waiting ${initialDelay / 1000} seconds before starting login process...`);
      await new Promise(r => setTimeout(r, initialDelay));

      // First visit the X.com homepage instead of directly going to login
      // This is more natural - humans rarely go directly to the login URL
      logger.log('Visiting X.com homepage first...');
      await page.goto('https://x.com', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Random delay to simulate reading the homepage (5-15 seconds)
      const homepageViewTime = 5000 + Math.floor(Math.random() * 10000);
      logger.log(`Viewing homepage for ${homepageViewTime / 1000} seconds...`);
      await new Promise(r => setTimeout(r, homepageViewTime));

      // Scroll down a bit to simulate human browsing
      logger.log('Scrolling down homepage...');
      await page.evaluate(() => {
        window.scrollBy(0, 300 + Math.floor(Math.random() * 500));
      });

      // Another delay (2-5 seconds)
      await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 3000)));

      // Now look for a login button on the homepage
      logger.log('Looking for login button on homepage...');
      const loginButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
        return buttons
          .filter(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('log in') || text.includes('login') || text.includes('sign in');
          })
          .map((el, index) => ({
            index,
            text: el.textContent.trim()
          }));
      });

      if (loginButtons.length > 0) {
        logger.log(`Found ${loginButtons.length} login buttons on homepage. Clicking the first one...`);
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('a, button, div[role="button"]'));
          const loginButton = buttons.find(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('log in') || text.includes('login') || text.includes('sign in');
          });
          if (loginButton) loginButton.click();
        });

        // Wait for the login page to load
        await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
      } else {
        // If no login button found, navigate to login page directly
        logger.log('No login button found on homepage. Navigating to login page directly...');
        await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 3000)));

        await page.goto('https://x.com/i/flow/login', {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
      }

      // Random delay after page load (2-5 seconds)
      const pageLoadDelay = 2000 + Math.floor(Math.random() * 3000);
      logger.log(`Waiting ${pageLoadDelay / 1000} seconds for login page to settle...`);
      await new Promise(r => setTimeout(r, pageLoadDelay));

      // Wait for login form with multiple selector strategies
      logger.log('Looking for username input field...');

      // Try multiple selectors to find the username input
      let usernameInput = null;
      const selectors = [
        'input[autocomplete="username"]',
        'input[name="text"]',
        'input[data-testid="text-input"]',
        'input[autocomplete="on"]',
        'input[type="text"]'
      ];

      // Try each selector
      for (const selector of selectors) {
        logger.log(`Trying selector: ${selector}`);
        await new Promise(r => setTimeout(r, 500));
        usernameInput = await page.$(selector);
        if (usernameInput) {
          logger.log(`Found username input with selector: ${selector}`);
          break;
        }
      }

      // If still not found, try to get all inputs and use the first visible one
      if (!usernameInput) {
        logger.log('Trying to find any visible input field...');
        const allInputs = await page.$$('input');
        for (const input of allInputs) {
          const isVisible = await input.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });

          if (isVisible) {
            usernameInput = input;
            logger.log('Found a visible input field');
            break;
          }
        }
      }

      if (!usernameInput) {
        // Take a screenshot to debug
        await page.screenshot({ path: 'screenshots/login-page-debug.png' });
        logger.log('Saved screenshot to login-page-debug.png');
        throw new Error('Could not find username input field');
      }

      // Enter username with human-like typing behavior
      logger.log('Entering username with human-like typing behavior...');

      // Determine if we should make a typo (20% chance)
      const shouldMakeTypo = Math.random() < 0.2;

      if (shouldMakeTypo) {
        // Determine where in the username to make the typo
        const typoIndex = Math.floor(Math.random() * (username.length - 1));
        const wrongChar = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];

        // Type the first part correctly
        if (typoIndex > 0) {
          for (let i = 0; i < typoIndex; i++) {
            // Variable typing speed (30-150ms per character)
            const charDelay = 30 + Math.floor(Math.random() * 120);
            await usernameInput.type(username[i], { delay: charDelay });

            // Occasionally pause while typing (5% chance)
            if (Math.random() < 0.05) {
              const pauseTime = 500 + Math.floor(Math.random() * 1000);
              await new Promise(r => setTimeout(r, pauseTime));
            }
          }
        }

        // Type the wrong character
        await usernameInput.type(wrongChar, { delay: 100 });

        // Pause briefly as if noticing the mistake (500-1500ms)
        await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random() * 1000)));

        // Delete the wrong character
        await page.keyboard.press('Backspace');

        // Pause briefly (200-500ms)
        await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 300)));

        // Type the correct character
        await usernameInput.type(username[typoIndex], { delay: 100 });

        // Type the rest of the username
        for (let i = typoIndex + 1; i < username.length; i++) {
          // Variable typing speed (30-150ms per character)
          const charDelay = 30 + Math.floor(Math.random() * 120);
          await usernameInput.type(username[i], { delay: charDelay });

          // Occasionally pause while typing (5% chance)
          if (Math.random() < 0.05) {
            const pauseTime = 500 + Math.floor(Math.random() * 1000);
            await new Promise(r => setTimeout(r, pauseTime));
          }
        }
      } else {
        // Type normally but with variable speed
        for (let i = 0; i < username.length; i++) {
          // Variable typing speed (30-150ms per character)
          const charDelay = 30 + Math.floor(Math.random() * 120);
          await usernameInput.type(username[i], { delay: charDelay });

          // Occasionally pause while typing (5% chance)
          if (Math.random() < 0.05) {
            const pauseTime = 500 + Math.floor(Math.random() * 1000);
            await new Promise(r => setTimeout(r, pauseTime));
          }
        }
      }

      // Random delay after typing username (1-3 seconds)
      const postUsernameDelay = 1000 + Math.floor(Math.random() * 2000);
      logger.log(`Waiting ${postUsernameDelay / 1000} seconds after typing username...`);
      await new Promise(r => setTimeout(r, postUsernameDelay));

      // Click next button with multiple selector strategies
      logger.log('Looking for Next button...');

      // Try multiple strategies to find the Next button
      let nextButtonFound = false;

      // Add a random delay before looking for the Next button (1-2 seconds)
      const preNextButtonDelay = 1000 + Math.floor(Math.random() * 1000);
      logger.log(`Waiting ${preNextButtonDelay / 1000} seconds before looking for Next button...`);
      await new Promise(r => setTimeout(r, preNextButtonDelay));

      try {

        try { // Main try block for all Next button strategies
          // Strategy 1: Try to find the Next button by its data-testid first (most reliable)
          const nextButtonByTestId = await page.$('[data-testid="ocfEnterTextNextButton"]');
          if (nextButtonByTestId) {
            logger.log('Found Next button by data-testid');

            // Take a screenshot before clicking
            await page.screenshot({ path: 'screenshots/before-next-click.png' });

            // Click with a slight offset to simulate human click (not perfectly centered)
            const box = await nextButtonByTestId.boundingBox();
            if (box) {
              const x = box.x + box.width / 2 + (Math.random() * 10 - 5);  // +/- 5px from center
              const y = box.y + box.height / 2 + (Math.random() * 6 - 3);   // +/- 3px from center

              // Move mouse to button with a slight curve (more human-like)
              await page.mouse.move(x - 50, y - 30, { steps: 10 }); // Move to a point before the button
              await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
              await page.mouse.move(x, y, { steps: 10 }); // Move to the button

              // Small delay before clicking (100-300ms)
              await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));

              // Click the button
              await page.mouse.down();
              await new Promise(r => setTimeout(r, 50 + Math.floor(Math.random() * 50)));
              await page.mouse.up();

              nextButtonFound = true;
              logger.log('Clicked Next button using mouse movement and coordinates');

              // Take a screenshot after clicking
              await new Promise(r => setTimeout(r, 500));
              await page.screenshot({ path: 'screenshots/after-next-click.png' });
            } else {
              // Fallback to regular click if boundingBox fails
              await nextButtonByTestId.click({ delay: 50 });
              nextButtonFound = true;
              logger.log('Clicked Next button using element click');
            }
          }
        } catch (error) {
          logger.log(`Error finding Next button by data-testid: ${error.message}`);
        }

        // Strategy 2: Specifically target the Next button with the exact structure
        if (!nextButtonFound) {
          logger.log('Trying to find the Next button with specific structure...');

          // Use evaluate to find the exact button structure
          const foundNextButton = await page.evaluate(() => {
            // Look for button with role=button and type=button containing 'Next' text
            const nextButton = Array.from(document.querySelectorAll('button[role="button"][type="button"]')).find(el => {
              return el.textContent.includes('Next');
            });

            if (nextButton) {
              // Mark the button for easy identification
              nextButton.setAttribute('data-found-next', 'true');
              return true;
            }
            return false;
          });

          if (foundNextButton) {
            logger.log('Found Next button with specific structure');

            // Take a screenshot before clicking
            await page.screenshot({ path: 'screenshots/before-next-click-specific.png' });

            // Click the marked button
            await page.click('button[data-found-next="true"]');
            nextButtonFound = true;
            logger.log('Clicked Next button with specific structure');

            // Wait for navigation or content change
            await new Promise(r => setTimeout(r, 2000));
          } else {
            logger.log('Could not find Next button with specific structure, trying alternative methods');

            // Use evaluate to find any button containing 'Next' text
            const nextButtons = await page.evaluate(() => {
              const elements = Array.from(document.querySelectorAll('button, div[role="button"]'));
              return elements
                .filter(el => el.textContent.includes('Next'))
                .map((el, index) => ({
                  index,
                  tagName: el.tagName,
                  text: el.textContent.trim(),
                  id: el.id,
                  className: el.className,
                  role: el.getAttribute('role')
                }));
            });

            logger.log(`Found ${nextButtons.length} potential Next buttons`);

            if (nextButtons.length > 0) {
              // Take a screenshot before attempting to click
              await page.screenshot({ path: 'screenshots/before-next-text-click.png' });

              // Try clicking using multiple methods
              let clickSuccess = false;

              // Method 1: Direct click on the element
              clickSuccess = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('div, button, span'));
                const nextElement = elements.find(el => el.textContent.includes('Next'));
                if (nextElement) {
                  // Check if the element is visible
                  const rect = nextElement.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    nextElement.click();
                    return true;
                  }
                }
                return false;
              });

              if (clickSuccess) {
                logger.log('Found and clicked Next button via text content search');
                nextButtonFound = true;
                await page.screenshot({ path: 'screenshots/next-button-clicked.png' });
              }

              // Method 2: If first method failed, try to click by using JavaScript directly
              if (!clickSuccess) {
                try {
                  // Try to click by using JavaScript directly
                  clickSuccess = await page.evaluate(() => {
                    // Find by role=button and aria-label containing 'next'
                    const buttons = Array.from(document.querySelectorAll('[role="button"]'));
                    const nextButton = buttons.find(el => {
                      const ariaLabel = el.getAttribute('aria-label');
                      return ariaLabel && ariaLabel.toLowerCase().includes('next');
                    });

                    if (nextButton) {
                      // Try multiple click methods
                      try {
                        nextButton.click();
                        return true;
                      } catch (e) {
                        try {
                          // Create and dispatch a mouse event
                          const event = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                          });
                          nextButton.dispatchEvent(event);
                          return true;
                        } catch (e2) {
                          return false;
                        }
                      }
                    }
                    return false;
                  });

                  if (clickSuccess) {
                    logger.log('Found and clicked Next button using JavaScript event');
                    nextButtonFound = true;
                    await page.screenshot({ path: 'screenshots/next-button-js-clicked.png' });
                  }
                } catch (error) {
                  logger.log(`Error with JavaScript click method: ${error.message}`);
                }
              }

              // Method 3: If previous methods failed, try to click by coordinates
              if (!clickSuccess) {
                try {
                  // Try to find the button by text content and get its position
                  const buttonPosition = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('div, button, span'));
                    const nextElement = elements.find(el => el.textContent.includes('Next'));
                    if (nextElement) {
                      const rect = nextElement.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0) {
                        return {
                          x: rect.left + rect.width / 2,
                          y: rect.top + rect.height / 2
                        };
                      }
                    }
                    return null;
                  });

                  if (buttonPosition) {
                    // Move mouse to the button position and click
                    await page.mouse.move(buttonPosition.x, buttonPosition.y);
                    await new Promise(r => setTimeout(r, 100 + Math.floor(Math.random() * 200)));
                    await page.mouse.down();
                    await new Promise(r => setTimeout(r, 50 + Math.floor(Math.random() * 50)));
                    await page.mouse.up();

                    logger.log('Clicked Next button using mouse coordinates');
                    nextButtonFound = true;
                    await page.screenshot({ path: 'screenshots/next-button-coords-clicked.png' });
                  }
                } catch (error) {
                  logger.log(`Error clicking by coordinates: ${error.message}`);
                }
              }

              // Method 4: Try using direct CSS selectors that are known to work for the Next button
              if (!clickSuccess) {
                try {
                  logger.log('Trying direct CSS selectors for Next button...');

                  // List of known working selectors for the Next button
                  const nextButtonSelectors = [
                    'button[role="button"]',
                    'button.css-175oi2r',
                    'button[type="button"]',
                    'div[role="button"][tabindex="0"][data-testid="ocfEnterTextNextButton"]',
                    'div[data-testid="ocfEnterTextNextButton"]',
                    'div[role="button"][tabindex="0"]',
                    'div[role="button"]',
                    'button[type="submit"]'
                  ];

                  let nextButtonElement = null;

                  // Try each selector
                  for (const selector of nextButtonSelectors) {
                    try {
                      nextButtonElement = await page.$(selector);
                      if (nextButtonElement) {
                        logger.log(`Found Next button with selector: ${selector}`);
                        break;
                      }
                    } catch (err) {
                      // Continue to next selector
                    }
                  }

                  if (nextButtonElement) {
                    // Click the button
                    await nextButtonElement.click({ delay: 50 });
                    logger.log('Clicked Next button using direct selector');
                    nextButtonFound = true;
                    await page.screenshot({ path: 'screenshots/next-button-direct-clicked.png' });
                  }
                } catch (error) {
                  logger.log(`Error using direct selectors: ${error.message}`);
                }
              }

              // Method 5: Last resort - try keyboard navigation
              if (!clickSuccess) {
                try {
                  logger.log('Trying keyboard navigation to find and click Next button...');

                  // First click on the username input to ensure focus is in the form
                  await usernameInput.click();
                  await new Promise(r => setTimeout(r, 500));

                  // Press Tab to move to the Next button (assuming it's the next focusable element)
                  await page.keyboard.press('Tab');
                  await new Promise(r => setTimeout(r, 300));

                  // Take a screenshot to see what's focused
                  await page.screenshot({ path: 'screenshots/after-tab-navigation.png' });

                  // Press Enter to click the focused element (hopefully the Next button)
                  await page.keyboard.press('Enter');

                  logger.log('Attempted to click Next button using keyboard navigation');
                  nextButtonFound = true;
                  await page.screenshot({ path: 'screenshots/next-button-keyboard-clicked.png' });
                } catch (error) {
                  logger.log(`Error using keyboard navigation: ${error.message}`);
                }
              }
            }
          }
        }

        // X.com is a SPA, so we need to wait for the password form to appear
        // instead of waiting for navigation
        logger.log('Waiting for password form to appear after clicking Next...');

        // Take a screenshot right after clicking Next
        await page.screenshot({ path: 'screenshots/after-next-click.png' });

        // Wait for network requests to settle
        await new Promise(r => setTimeout(r, 2000));

        // Check for password form using multiple approaches
        try {
          // Approach 1: Wait for any password input to appear
          await page.evaluate(async () => {
            return new Promise((resolve, reject) => {
              // Check every 100ms for 10 seconds max
              const maxAttempts = 100;
              let attempts = 0;

              const checkForPasswordInput = () => {
                attempts++;
                const passwordInputs = document.querySelectorAll('input[type="password"], input[name="password"], input[autocomplete="current-password"], input.r-30o5oe');

                if (passwordInputs.length > 0) {
                  resolve(true);
                  return;
                }

                // Check for any input that might be for password
                const allInputs = document.querySelectorAll('input');
                for (const input of allInputs) {
                  // Check if this might be a password field
                  if (input.id.toLowerCase().includes('password') ||
                    input.name.toLowerCase().includes('password') ||
                    input.placeholder.toLowerCase().includes('password')) {
                    resolve(true);
                    return;
                  }
                }

                if (attempts >= maxAttempts) {
                  reject(new Error('Password input not found after maximum attempts'));
                  return;
                }

                setTimeout(checkForPasswordInput, 100);
              };

              checkForPasswordInput();
            });
          }).catch(e => {
            logger.log('Password form detection timed out: ' + e.message);
          });

          // Take another screenshot after waiting for password form
          await page.screenshot({ path: 'screenshots/password-form-wait-complete.png' });
        } catch (error) {
          logger.log('Error while waiting for password form: ' + error.message);
        }


        await new Promise(r => setTimeout(r, 1000));

        // Check if we need to enter email instead of username
        const emailInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
        if (emailInput) {
          await page.type('input[data-testid="ocfEnterTextTextInput"]', username, { delay: 100 });
          await new Promise(r => setTimeout(r, 500));
          await page.click('[data-testid="ocfEnterTextNextButton"]');
          await new Promise(r => setTimeout(r, 1000));
        }

        // Username is chosen as login user, wait for password input
        logger.log('Looking for password input field...');
        await page.screenshot({ path: 'screenshots/password-field.png' });

        // Try to find password input using a more dynamic approach for SPA
        logger.log('Searching for password input field using dynamic detection...');

        // First, check if we're on a page that looks like it has a password field
        const pageContent = await page.content();
        const passwordPageIndicators = ['password', 'Enter your password', 'Verify', 'Authenticate'];

        let isLikelyPasswordPage = false;
        for (const indicator of passwordPageIndicators) {
          if (pageContent.toLowerCase().includes(indicator.toLowerCase())) {
            logger.log(`Found password page indicator: ${indicator}`);
            isLikelyPasswordPage = true;
            break;
          }
        }

        if (!isLikelyPasswordPage) {
          logger.log('This does not appear to be a password page. Taking screenshot for analysis...');
          await page.screenshot({ path: 'screenshots/not-password-page.png' });
        }

        // Try multiple approaches to find the password input
        let passwordInput = null;

        // Approach 1: Try common selectors
        const passwordSelectors = [
          'input[name="password"]',
          'input[type="password"]',
          'input[autocomplete="current-password"]',
          'input[data-testid="password-input"]',
          'input[autocomplete="on"]',
          'input[autocomplete="new-password"]'
        ];

        for (const selector of passwordSelectors) {
          try {
            logger.log(`Trying password selector: ${selector}`);
            // Don't wait, just check if it exists now
            passwordInput = await page.$(selector);
            if (passwordInput) {
              logger.log(`Found password input with selector: ${selector}`);
              break;
            }
          } catch (error) {
            logger.log(`Error with selector ${selector}: ${error.message}`);
          }
        }

        // Approach 2: If still not found, try to find any input that might be for password
        if (!passwordInput) {
          logger.log('Trying to identify password field by attributes...');

          try {
            // Use page.evaluate to search for password-like inputs
            const passwordFieldInfo = await page.evaluate(() => {
              const allInputs = document.querySelectorAll('input');
              for (let i = 0; i < allInputs.length; i++) {
                const input = allInputs[i];

                // Check various attributes that might indicate a password field
                if (input.type === 'password' ||
                  input.name.toLowerCase().includes('pass') ||
                  input.id.toLowerCase().includes('pass') ||
                  input.placeholder.toLowerCase().includes('pass') ||
                  input.getAttribute('aria-label')?.toLowerCase().includes('pass')) {

                  return {
                    index: i,
                    id: input.id,
                    name: input.name,
                    type: input.type,
                    placeholder: input.placeholder
                  };
                }
              }
              return null;
            });

            if (passwordFieldInfo) {
              logger.log(`Found potential password field by attributes: ${JSON.stringify(passwordFieldInfo)}`);

              // Get a reference to the input we found
              passwordInput = (await page.$$('input'))[passwordFieldInfo.index];
            }
          } catch (error) {
            logger.log(`Error during attribute-based password detection: ${error.message}`);
          }
        }

        if (!passwordInput) {
          // Take a screenshot to debug
          await page.screenshot({ path: 'screenshots/password-field-debug.png' });
          logger.log('Saved screenshot to screenshots/password-field-debug.png');
          throw new Error('Could not find password input field');
        }

        // Enter password with human-like typing behavior
        logger.log('Entering password with human-like typing behavior...');

        try {
          // Determine if we should make a typo (10% chance - less likely than with username)
          const shouldMakePasswordTypo = Math.random() < 0.1;

          if (shouldMakePasswordTypo) {
            // Determine where in the password to make the typo
            const typoIndex = Math.floor(Math.random() * (password.length - 1));
            const wrongChar = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)];

            // Type the first part correctly
            if (typoIndex > 0) {
              for (let i = 0; i < typoIndex; i++) {
                // Variable typing speed (40-180ms per character)
                const charDelay = 40 + Math.floor(Math.random() * 140);
                await passwordInput.type(password[i], { delay: charDelay });

                // Occasionally pause while typing (3% chance)
                if (Math.random() < 0.03) {
                  const pauseTime = 300 + Math.floor(Math.random() * 700);
                  await new Promise(r => setTimeout(r, pauseTime));
                }
              }
            }

            // Type the wrong character
            await passwordInput.type(wrongChar, { delay: 100 });

            // Pause briefly as if noticing the mistake (400-1200ms)
            await new Promise(r => setTimeout(r, 400 + Math.floor(Math.random() * 800)));

            // Delete the wrong character
            await page.keyboard.press('Backspace');

            // Pause briefly (200-400ms)
            await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 200)));

            // Type the correct character
            await passwordInput.type(password[typoIndex], { delay: 100 });

            // Type the rest of the password
            for (let i = typoIndex + 1; i < password.length; i++) {
              // Variable typing speed (40-180ms per character)
              const charDelay = 40 + Math.floor(Math.random() * 140);
              await passwordInput.type(password[i], { delay: charDelay });

              // Occasionally pause while typing (3% chance)
              if (Math.random() < 0.03) {
                const pauseTime = 300 + Math.floor(Math.random() * 700);
                await new Promise(r => setTimeout(r, pauseTime));
              }
            }
          } else {
            // Type normally but with variable speed
            for (let i = 0; i < password.length; i++) {
              // Variable typing speed (40-180ms per character)
              const charDelay = 40 + Math.floor(Math.random() * 140);
              await passwordInput.type(password[i], { delay: charDelay });

              // Occasionally pause while typing (3% chance)
              if (Math.random() < 0.03) {
                const pauseTime = 300 + Math.floor(Math.random() * 700);
                await new Promise(r => setTimeout(r, pauseTime));
              }
            }
          }
        } catch (error) {
          logger.error(`Error typing password: ${error.message}`);
          throw error; // Re-throw to be caught by the outer try-catch
        }

        // Random delay after typing password (1.5-4 seconds)
        const postPasswordDelay = 1500 + Math.floor(Math.random() * 2500);
        logger.log(`Waiting ${postPasswordDelay / 1000} seconds after typing password...`);
        await new Promise(r => setTimeout(r, postPasswordDelay));

        await new Promise(r => setTimeout(r, 1000));

        // Click login button with multiple selector strategies and human-like behavior
        logger.log('Looking for login button...');

        // Random delay before looking for login button (1-3 seconds)
        const preLoginButtonDelay = 1000 + Math.floor(Math.random() * 2000);
        logger.log(`Waiting ${preLoginButtonDelay / 1000} seconds before looking for login button...`);
        await new Promise(r => setTimeout(r, preLoginButtonDelay));

        // Try multiple strategies to find the login button
        let loginButtonFound = false;

        // Strategy 1: Try various selectors
        const loginSelectors = [
          // Remove invalid selector: 'button:has-text("Log in")',
          '[data-testid="LoginForm_Login_Button"]',
          'button[type="submit"]',
          '[role="button"][tabindex="0"]',
          'button',
          'div[role="button"]'
        ];

        for (const selector of loginSelectors) {
          try {
            logger.log(`Trying login button selector: ${selector}`);
            const loginBtn = await page.$(selector);
            if (loginBtn) {
              logger.log(`Found login button with selector: ${selector}`);
              await loginBtn.click();
              loginButtonFound = true;
              break;
            }
          } catch (error) {
            logger.log(`Selector ${selector} failed: ${error.message}`);
          }
        }

        // Strategy 2: Find all buttons and click the one that might be login
        if (!loginButtonFound) {
          try {
            logger.log('Trying to find any button that might be login...');
            const allButtons = await page.$$('button, div[role="button"]');

            for (const button of allButtons) {
              const buttonText = await button.evaluate(el => el.textContent || '');
              if (buttonText.toLowerCase().includes('log in') ||
                buttonText.toLowerCase().includes('login') ||
                buttonText.toLowerCase().includes('sign in')) {
                logger.log(`Found button with text: ${buttonText}`);
                await button.click();
                loginButtonFound = true;
                break;
              }
            }
          } catch (error) {
            logger.log('Button search strategy failed: ' + error.message);
          }
        }

        if (!loginButtonFound) {
          // Take a screenshot to debug
          await page.screenshot({ path: 'screenshots/login-button-debug.png' });
          logger.log('Saved screenshot to screenshots/login-button-debug.png');
          throw new Error('Could not find login button');
        }

        await new Promise(r => setTimeout(r, 1000));

        // Check for verification code request
        try {
          // Take a screenshot to see what's happening
          await page.screenshot({ path: 'screenshots/login-verification-debug.png' });
          logger.log('Saved screenshot to screenshots/login-verification-debug.png');

          // Check for common verification elements
          const verificationSelectors = [
            'input[name="verfication_code"]',
            'input[placeholder="Verification code"]',
            'input[data-testid="ocfEnterTextTextInput"]',
            'input[type="text"]'
          ];

          for (const selector of verificationSelectors) {
            const verificationInput = await page.$(selector);
            if (verificationInput) {
              logger.log('Verification code input detected. X.com is requesting additional verification.');
              
              // Save screenshot for debugging
              await page.screenshot({ path: 'screenshots/login-verification-debug.png' });
              logger.log('A screenshot has been saved to screenshots/login-verification-debug.png');
              
              // Set up verification code handling
              const verificationCode = await this.handleVerificationCode();
              
              // Enter the verification code
              await verificationInput.type(verificationCode);
              await wait(1000); // Small wait for input to register
              
              // Find and click the verification submit button
              const submitButton = await page.$('div[role="button"][tabindex="0"]');
              if (submitButton) {
                await submitButton.click();
                await wait(3000); // Wait for verification to process
              }
            }
          }

          // Check for suspicious login text
          const pageContent = await page.content();
          if (pageContent.includes('suspicious') || pageContent.includes('verify') || pageContent.includes('confirmation')) {
            logger.log('Suspicious login detection or verification page detected.');
            logger.log('A screenshot has been saved to login-verification-debug.png');
            throw new Error('X.com has detected suspicious login activity. Please check your email and run the bot again.');
          }
        } catch (error) {
          if (error.message.includes('verification') || error.message.includes('suspicious')) {
            throw error; // Re-throw verification errors
          }
          // Otherwise continue with normal flow
        }

        // Wait for home page to load
        try {
          await this.page.waitForFunction(() => document.querySelector('span')?.textContent === 'Everyone', { timeout: 30000 });

          logger.log('Successfully logged in to X.com');
          loginSuccessful = true;
          return true;
        } catch (timeoutError) {
          // Take a screenshot to see what's happening
          await page.screenshot({ path: 'screenshots/login-timeout-debug.png' });
          logger.log('Saved screenshot to screenshots/login-timeout-debug.png');

          // Check if we're actually logged in despite not finding the 'Everyone' text
          if (page.url().includes('home')) {
            logger.log('Detected home page URL. Assuming login successful despite not finding expected element.');
            loginSuccessful = true;
            return true;
          }

          throw timeoutError; // Re-throw if we're not on the home page
        }
      } catch (error) {
        logger.error(`Failed to log in to X.com: ${error.message}`);
        loginSuccessful = false;
        return false;
      }
    } catch (error) {
      logger.error(`Failed to log in to X.com: ${error.message}`);
      loginSuccessful = false;
      return false;
    }
  } catch (error) {
    logger.error(`Failed to log in to X.com: ${error.message}`);
    this.loginSuccessful = false;
    return false;
  }
  }

  /**
   * Initialize X platform
   */
  async initialize() {
    try {
      // Apply stealth plugin to avoid detection
      puppeteer.use(StealthPlugin());

      // Get a proxy for the session
      let proxy = null;
      try {
        proxy = await proxyManager.getNextProxy();
      } catch (error) {
        logger.warn(`Unable to get proxy: ${error.message}`);
        logger.warn('Will continue without proxy');
      }

      // Launch browser with proxy and stealth settings
      const launchOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        `--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36`,
      ]
    };

    // Add proxy if available
    if (proxy) {
      launchOptions.args.push(`--proxy-server=${proxy.proxy_address}:${proxy.port}`);
      logger.log(`Using proxy: ${proxy.proxy_address}:${proxy.port}`);
    } else {
      logger.info('No proxy available, continuing without proxy');
    }

    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();

    // Set proxy authentication if needed
    if (proxy && proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      });
    }

    // Set viewport to simulate a real device
    await page.setViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
    });

    // Enable request interception to modify headers
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Modify headers to look more like a real browser
      const headers = request.headers();
      headers['Accept-Language'] = 'en-US,en;q=0.9';
      headers['sec-ch-ua'] = '"Not A(Brand";v="99", "Google Chrome";v="122", "Chromium";v="122"';
      headers['sec-ch-ua-mobile'] = '?0';
      headers['sec-ch-ua-platform'] = '"macOS"';
      headers['Sec-Fetch-Dest'] = 'document';
      headers['Sec-Fetch-Mode'] = 'navigate';
      headers['Sec-Fetch-Site'] = 'none';
      headers['Sec-Fetch-User'] = '?1';
      headers['Upgrade-Insecure-Requests'] = '1';

      request.continue({ headers });
    });

    // Visit X.com to warm up the session
    await page.goto('https://x.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);

    // Check if login is needed and attempt to log in
    if (await needsLogin()) {
      const loginSuccess = await login();
      if (!loginSuccess) {
        logger.warn('Failed to log in to X.com, some functionality may be limited');
      } else {
        logger.log('Successfully logged in to X.com');
      }
    } else {
      logger.log('Already logged in to X.com');
    }

    logger.log('X.com initialized successfully');
    return true;
  } catch (error) {
    logger.error(`Failed to initialize X.com: ${error.message}`);
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Find potential users based on search terms
 * @param {Array<string>} searchTerms - List of search terms to find users
 * @returns {Promise<Array<string>>} - List of usernames
 */
  async findPotentialUsers(searchTerms) {
    if (!this.page) {
      throw new Error('X.com browser not initialized');
    }

    // Check if login was successful before proceeding
    if (!this.loginSuccessful) {
    logger.warn('Cannot search for users: Login to X.com was not successful');
    return [];
  }

  const users = [];

  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('x_search');
    if (!canProceed) {
      logger.warn('Rate limit reached for X.com search');
      return users;
    }

    // Process each search term
    for (const term of searchTerms) {
      logger.log(`Searching X.com for term: ${term}`);

      // Wait before each search to avoid detection
      await rateLimiter.waitForNextAction();

      try {
        // Use the Nitter guest access approach for better scraping
        // Navigate to X.com search page
        const encodedTerm = encodeURIComponent(term);
        await page.goto(`https://x.com/search?q=${encodedTerm}&f=user`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });

        // Simulate human behavior
        await humanBehavior.simulatePageView(page);

        // Scroll to load more content
        await humanBehavior.simulateScroll(page);

        // Wait for user cards to load
        await page.waitForSelector('[data-testid="UserCell"]', { timeout: 10000 })
          .catch(() => logger.warn(`No user results found for "${term}"`));

        // Extract usernames from search results
        const foundUsers = await page.evaluate(() => {
          const userElements = document.querySelectorAll('[data-testid="UserCell"]');
          return Array.from(userElements).map(el => {
            // Find the username element
            const usernameEl = el.querySelector('[data-testid="User-Name"] a:nth-child(2)');
            if (!usernameEl) return null;

            // Extract username from href attribute
            const href = usernameEl.getAttribute('href');
            if (!href) return null;

            // Username is the part after the slash without the @
            return href.split('/').pop();
          }).filter(Boolean);
        });

        if (foundUsers.length > 0) {
          logger.log(`Found ${foundUsers.length} potential users for term "${term}"`);
          users.push(...foundUsers);
        }

        // Increment search count
        await rateLimiter.incrementActionCount('x_search');

      } catch (error) {
        logger.error(`Error searching X.com for term "${term}": ${error.message}`);

        // Check if we're being rate limited
        const isRateLimited = await rateLimiter.checkForRateLimit(page);
        if (isRateLimited) {
          // If rate limited, break the loop and return current results
          break;
        }
      }

      // Random delay between searches
      await wait(5000 + Math.random() * 5000);
    }

    // Remove duplicates and filter out obvious bot accounts
    const filteredUsers = [...new Set(users)].filter(username => {
      const lowerUsername = username.toLowerCase();
      return !lowerUsername.includes('bot') &&
        !lowerUsername.includes('official') &&
        !lowerUsername.includes('twitter') &&
        !lowerUsername.includes('x_') &&
        !lowerUsername.includes('news');
    });

    return filteredUsers;

  } catch (error) {
    logger.error(`Error finding X.com users: ${error.message}`);
    return [];
  }
}

/**
 * Message an X.com user
 * @param {string} username - X.com username to message
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} - Success status
 */
  async messageUser(username, message) {
    logger.log(`[${dayjs().format('HH:mm')}] Attempting to message X.com user: ${username}`);

    // Check if login was successful before proceeding
    if (!this.loginSuccessful) {
      logger.warn('Cannot message users: Login to X.com was not successful');
    return false;
  }

  try {
    // Check rate limits before proceeding
    const canProceed = await rateLimiter.checkActionLimit('x_message');
    if (!canProceed) {
      logger.warn('Rate limit reached for X.com messaging');
      return false;
    }

    // Try using the Twitter API first if available
    if (twitterClient) {
      try {
        logger.log(`Attempting to message ${username} using Twitter API`);

        // Step 1: Find the user's ID from their username
        const userLookup = await twitterClient.v2.userByUsername(username);
        if (!userLookup.data) {
          logger.warn(`Could not find user ${username} via Twitter API`);
        } else {
          const userId = userLookup.data.id;
          logger.log(`Found user ${username} with ID: ${userId}`);

          // Step 2: Check if we can send a direct message to this user
          // This requires checking if they follow us or have DMs open
          const relationship = await twitterClient.v2.friendship(
            await twitterClient.v2.me().then(me => me.data.id),
            userId
          );

          if (relationship.data.following) {
            logger.log(`User ${username} is following us, can send DM`);

            // Step 3: Send the direct message
            const dmResponse = await twitterClient.v1.sendDm({
              recipient_id: userId,
              text: message
            });

            if (dmResponse && dmResponse.event) {
              logger.log(`Successfully sent DM to ${username} via Twitter API`);

              // Increment message count
              await rateLimiter.incrementActionCount('x_message');

              return true;
            }
          } else {
            logger.log(`User ${username} is not following us, cannot send DM via API`);
            // Try following them first
            await twitterClient.v2.follow(await twitterClient.v2.me().then(me => me.data.id), userId);
            logger.log(`Followed user ${username}, they may follow back later`);
          }
        }
      } catch (apiError) {
        logger.error(`Error using Twitter API to message ${username}: ${apiError.message}`);
        logger.log('Falling back to browser-based approach');
      }
    }

    // Fall back to browser-based approach if API fails or isn't available
    if (!browser || !page) {
      throw new Error('X.com browser not initialized');
    }

    // Wait before action to avoid detection
    await rateLimiter.waitForNextAction();

    // Navigate to user's profile
    await page.goto(`https://x.com/${username}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Simulate human behavior
    await humanBehavior.simulatePageView(page);
    await humanBehavior.simulateScroll(page);

    // Check if the profile exists
    const profileExists = await page.evaluate(() => {
      return !document.body.innerText.includes('This account doesn\'t exist');
    });

    if (!profileExists) {
      logger.warn(`X.com user @${username} not found`);
      return false;
    }

    // X.com doesn't allow direct messaging without login
    // Instead, we'll try to follow the user and mention them in a tweet

    // Check if we can find the follow button
    const followButtonExists = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[data-testid="follow"]'));
      return buttons.length > 0;
    });

    if (followButtonExists) {
      // Click follow button
      await page.click('[data-testid="follow"]');
      logger.log(`Followed X.com user @${username}`);
      await wait(2000 + Math.random() * 2000);
    }

    // Navigate to compose tweet page
    await page.goto('https://x.com/compose/tweet', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Check if we're on the login page
    const isLoginPage = await page.evaluate(() => {
      return document.body.innerText.includes('Sign in to X');
    });

    if (isLoginPage) {
      logger.warn('Cannot compose tweet without login');
      return false;
    }

    // Try to compose a tweet mentioning the user
    try {
      // Wait for tweet composer to load
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });

      // Type message
      await humanBehavior.simulateTyping(page, '[data-testid="tweetTextarea_0"]', `@${username} ${message}`);

      // Click tweet button
      await page.click('[data-testid="tweetButton"]');

      logger.log(`\u2705 Messaged X.com user @${username} via mention`);
    } catch (error) {
      logger.warn(`Could not tweet to @${username}: ${error.message}`);
      return false;
    }

    // Increment message count
    await rateLimiter.incrementActionCount('x_message');

    return true;

  } catch (error) {
    logger.error(`Error messaging X.com user ${username}: ${error.message}`);

    // Check if we're being rate limited
    await rateLimiter.checkForRateLimit(page);

    return false;
  }
}

  /**
   * Close the X.com browser instance
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.log('X.com browser closed');
    }
  }

  /**
   * Handle verification code input through a local web server
   * @returns {Promise<string>} The verification code entered by the user
   */
  async handleVerificationCode() {
    // Create a simple HTTP server to receive the verification code
    const http = await import('http');
    const url = await import('url');
    
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === '/verify') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const { code } = JSON.parse(body);
              if (code) {
                resolve(code);
                res.end(JSON.stringify({ status: 'success' }));
                server.close();
              } else {
                res.end(JSON.stringify({ status: 'error', message: 'No code provided' }));
              }
            } catch (e) {
              res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
            }
          });
        } else {
          // Serve a simple HTML form
          res.end(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>X.com Verification Code</title>
                <style>
                  body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; }
                  input, button { font-size: 16px; padding: 8px; margin: 10px 0; }
                  button { background: #1da1f2; color: white; border: none; padding: 10px 20px; cursor: pointer; }
                </style>
              </head>
              <body>
                <h2>Enter X.com Verification Code</h2>
                <p>Please enter the verification code sent to your email:</p>
                <input type="text" id="code" placeholder="Enter verification code" />
                <button onclick="submitCode()">Submit</button>
                <script>
                  function submitCode() {
                    const code = document.getElementById('code').value;
                    fetch('/verify', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ code })
                    }).then(r => r.json()).then(data => {
                      if (data.status === 'success') {
                        document.body.innerHTML = '<h2>Success!</h2><p>You can close this window now.</p>';
                      }
                    });
                  }
                </script>
              </body>
            </html>
          `);
        }
      }
    });

    const port = 3333;
    server.listen(port, () => {
      logger.log(`Verification page is running at http://localhost:${port}/verify`);
      logger.log('Please open this URL in your browser and enter the verification code when you receive it.');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Verification code input timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
  }
}

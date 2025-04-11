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
      const element = await page.$(targetSelector);
      if (!element) {
        throw new Error(`Element not found: ${targetSelector}`);
      }
      
      const box = await element.boundingBox();
      if (!box) {
        throw new Error('Could not get element position');
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
}

// Export singleton instance
export const humanBehavior = new HumanBehaviorSimulator();

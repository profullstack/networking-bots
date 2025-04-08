import { logger } from '../utils/logger.mjs';

class RateLimiter {
  constructor() {
    // Platform-specific daily limits
    this.limits = {
      tiktok_search: 20,
      tiktok_message: 15,
      x_search: 25,
      x_message: 20
    };
    
    // More human-like delays with wider variance
    this.minActionDelay = 45000; // 45 seconds minimum
    this.maxActionDelay = 180000; // 3 minutes maximum
    
    // Counters for each action type
    this.actionCounts = {};
    this.lastActionTime = {};
    this.lastResetDate = new Date().toDateString();
    
    // Progressive delays for failed attempts
    this.consecutiveFailures = 0;
    this.backoffMultiplier = 1;
    
    // Initialize counters
    Object.keys(this.limits).forEach(action => {
      this.actionCounts[action] = 0;
      this.lastActionTime[action] = 0;
    });
  }

  async resetCounters() {
    const currentDate = new Date().toDateString();
    
    // Reset daily counters
    if (currentDate !== this.lastResetDate) {
      Object.keys(this.limits).forEach(action => {
        this.actionCounts[action] = 0;
      });
      this.lastResetDate = currentDate;
      logger.info('Daily rate limits reset');
      
      // Reset backoff on daily reset
      this.consecutiveFailures = 0;
      this.backoffMultiplier = 1;
    }
  }

  getRandomDelay() {
    // Use a more natural distribution (gaussian-like)
    const baseDelay = (this.maxActionDelay + this.minActionDelay) / 2;
    const variance = (this.maxActionDelay - this.minActionDelay) / 4;
    
    // Sum of multiple random numbers approaches normal distribution
    let delay = 0;
    for (let i = 0; i < 3; i++) {
      delay += Math.random() * variance;
    }
    delay = baseDelay + (delay - (variance * 1.5));
    
    // Apply backoff multiplier for consecutive failures
    delay *= this.backoffMultiplier;
    
    // Ensure delay stays within bounds
    return Math.max(this.minActionDelay, Math.min(this.maxActionDelay * 3, delay));
  }

  async waitForNextAction() {
    await this.resetCounters();
    
    const now = Date.now();
    const timeSinceLastAction = now - this.lastActionTime['any'] || 0;
    const delay = this.getRandomDelay();
    
    if (timeSinceLastAction < delay) {
      const waitTime = delay - timeSinceLastAction;
      logger.info(`Waiting ${Math.round(waitTime/1000)} seconds before next action...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastActionTime['any'] = Date.now();
  }

  async checkActionLimit(actionType) {
    await this.resetCounters();
    
    if (!this.limits[actionType]) {
      logger.warn(`Unknown action type: ${actionType}`);
      return true; // Allow unknown actions
    }
    
    // Check if we've reached the limit
    if (this.actionCounts[actionType] >= this.limits[actionType]) {
      logger.warn(`Daily limit reached for ${actionType}`);
      return false;
    }
    
    // Add time-of-day restrictions
    const hour = new Date().getHours();
    if (hour < 8 || hour > 22) { // Only operate during business hours
      logger.info('Outside of operating hours (8 AM - 10 PM)');
      return false;
    }
    
    return true;
  }

  async incrementActionCount(actionType) {
    await this.resetCounters();
    
    if (!this.limits[actionType]) {
      logger.warn(`Unknown action type: ${actionType}`);
      return;
    }
    
    this.actionCounts[actionType]++;
    this.lastActionTime[actionType] = Date.now();
    
    logger.info(`${actionType} count: ${this.actionCounts[actionType]}/${this.limits[actionType]} daily`);
  }

  async checkForRateLimit(page) {
    // Common rate limit indicators for social media platforms
    const rateLimitIndicators = [
      // TikTok indicators
      'Too many requests',
      'Please try again later',
      'Something went wrong',
      'unusual activity',
      'security check',
      'CAPTCHA',
      // X.com indicators
      'Rate limit exceeded',
      'Too many requests',
      'Try again later',
      'Something went wrong',
      'Verify your identity'
    ];

    try {
      const pageContent = await page.evaluate(() => document.body.innerText);
      
      for (const indicator of rateLimitIndicators) {
        if (pageContent.includes(indicator)) {
          this.consecutiveFailures++;
          
          // Exponential backoff with max cap
          const baseDelay = 3600000; // 1 hour base delay
          this.backoffMultiplier = Math.min(Math.pow(2, this.consecutiveFailures - 1), 8);
          const waitTime = baseDelay * this.backoffMultiplier;
          
          logger.warn(`Rate limit detected (attempt ${this.consecutiveFailures}), waiting for ${waitTime/3600000} hours...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return true;
        }
      }
      
      // Check for CAPTCHA elements
      const hasCaptcha = await page.evaluate(() => {
        return !!document.querySelector('iframe[src*="captcha"]') || 
               !!document.querySelector('div[class*="captcha"]') ||
               !!document.querySelector('input[name*="captcha"]');
      });
      
      if (hasCaptcha) {
        logger.warn('CAPTCHA detected');
        this.consecutiveFailures++;
        const waitTime = 3600000 * this.backoffMultiplier; // 1 hour * backoff
        logger.warn(`Waiting ${waitTime/3600000} hours before trying again...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return true;
      }
      
    } catch (error) {
      logger.error('Error checking rate limit', error);
    }
    
    // If we get here, no rate limit was detected
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1); // Gradually reduce failures
      this.backoffMultiplier = Math.max(1, this.backoffMultiplier * 0.75); // Gradually reduce backoff
    }
    return false;
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

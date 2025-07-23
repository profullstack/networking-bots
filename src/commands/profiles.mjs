import { logger } from '../utils/logger.mjs';
import { createProfiles as createProfilesCore } from '../profile-creator.mjs';

/**
 * Create synthetic profiles command
 */
export async function createProfiles(options = {}) {
  const { number = '1', platform } = options;
  
  try {
    const profileCount = parseInt(number, 10);
    
    if (isNaN(profileCount) || profileCount < 1) {
      logger.error('❌ Invalid number of profiles. Must be a positive integer.');
      return;
    }
    
    if (profileCount > 10) {
      logger.warn('⚠️ Creating more than 10 profiles at once may take a while...');
    }
    
    logger.log('\n🎭 PROFILE CREATION MODE');
    logger.log('='.repeat(30));
    
    if (platform) {
      logger.log(`🎯 Target platform: ${platform}`);
    }
    
    logger.log(`📊 Number of profiles to create: ${profileCount}`);
    logger.log('');
    
    // Call the existing profile creation functionality
    await createProfilesCore({
      count: profileCount,
      platform: platform
    });
    
    logger.log(`\n✅ Successfully created ${profileCount} synthetic profile(s)!`);
    logger.log('💡 Use these profiles when setting up bot accounts');
    
  } catch (error) {
    logger.error(`❌ Failed to create profiles: ${error.message}`);
    throw error;
  }
}
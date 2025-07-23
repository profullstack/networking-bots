#!/usr/bin/env node

/**
 * Test Profile Creation
 * 
 * This script tests profile creation without using browser scraping or APIs.
 * It uses the synthetic profile generator to create realistic user profiles
 * and simulates the account creation process for testing purposes.
 * 
 * Usage: node test-profile-creation.mjs [platform] [count]
 * 
 * platform: Platform to create profiles for (e.g., 'linkedin', 'twitter', 'all')
 * count: Number of profiles to generate (default: 1)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { logger } from './src/utils/logger.mjs';
import { syntheticProfileGenerator } from './src/services/synthetic-profile-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define platforms
const SUPPORTED_PLATFORMS = [
  'linkedin',
  'twitter',
  'tiktok',
  'youtube',
  'facebook',
  'reddit'
];

// Parse command line arguments
const args = process.argv.slice(2);
const platform = args[0]?.toLowerCase() || 'all';
const count = parseInt(args[1]) || 1;

// Validate platform
if (platform !== 'all' && !SUPPORTED_PLATFORMS.includes(platform)) {
  logger.error(`Unsupported platform: ${platform}`);
  logger.log(`Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}, or 'all'`);
  process.exit(1);
}

/**
 * Simulate account creation for a platform
 * @param {string} platform - Platform name
 * @param {Object} profile - User profile data
 * @returns {Object} Simulated account data
 */
function simulateAccountCreation(platform, profile) {
  // Generate platform-specific data
  const timestamp = Date.now();
  const accountId = `${platform}_${Math.random().toString(36).substring(2, 15)}`;
  
  // Simulate success/failure with high success rate (90%)
  const success = Math.random() < 0.9;
  
  // Simulate different outcomes
  let status = 'created';
  let notes = [];
  
  if (!success) {
    status = 'failed';
    const failureReasons = [
      'Email already in use',
      'Username already taken',
      'Invalid data format',
      'Service temporarily unavailable',
      'Rate limit exceeded'
    ];
    notes.push(failureReasons[Math.floor(Math.random() * failureReasons.length)]);
  } else {
    // Add random success notes
    const successNotes = [
      'Account created successfully',
      'Email verification required',
      'Profile setup incomplete',
      'Additional verification may be required later'
    ];
    notes.push(successNotes[Math.floor(Math.random() * successNotes.length)]);
    
    // Simulate verification steps
    if (Math.random() < 0.7) {
      notes.push('Verification email sent');
    }
  }
  
  // Create account data
  return {
    platform,
    accountId,
    username: profile.username,
    email: profile.email,
    password: profile.password, // In a real app, this would be encrypted
    firstName: profile.firstName,
    lastName: profile.lastName,
    status,
    createdAt: new Date(timestamp).toISOString(),
    lastUpdated: new Date(timestamp).toISOString(),
    notes,
    profileData: {
      bio: profile.bio,
      location: profile.location,
      interests: profile.interests,
      skills: profile.skills
    }
  };
}

/**
 * Main function to test profile creation
 */
async function testProfileCreation() {
  try {
    logger.log('=== Test Profile Creation ===');
    logger.log(`Platform: ${platform}`);
    logger.log(`Number of profiles: ${count}`);
    logger.log('Generating synthetic profiles...');
    
    // Generate synthetic profiles
    const profiles = syntheticProfileGenerator.generateMultipleProfiles(count);
    
    // Create output directory if it doesn't exist
    const outputDir = path.join(__dirname, 'test-results');
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err) {
      // Directory already exists or cannot be created
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
    
    // Save generated profiles
    const profilesPath = path.join(outputDir, 'synthetic-profiles.json');
    await syntheticProfileGenerator.saveProfilesToFile(profiles, profilesPath);
    
    // Simulate account creation
    const createdAccounts = [];
    const platforms = platform === 'all' ? SUPPORTED_PLATFORMS : [platform];
    
    for (const profile of profiles) {
      logger.log(`\n=== Processing profile for ${profile.firstName} ${profile.lastName} ===`);
      
      for (const plt of platforms) {
        logger.log(`\nCreating ${plt} account for ${profile.email}...`);
        
        // Simulate account creation with random delay (100-500ms)
        const delay = Math.floor(Math.random() * 400) + 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Create account
        const account = simulateAccountCreation(plt, profile);
        createdAccounts.push(account);
        
        // Log result
        if (account.status === 'created') {
          logger.log(`✅ ${plt} account created successfully: @${account.username}`);
        } else {
          logger.log(`❌ ${plt} account creation failed: ${account.notes[0]}`);
        }
        
        // Log notes
        if (account.notes.length > 0) {
          logger.log('Notes:');
          account.notes.forEach(note => logger.log(`  - ${note}`));
        }
      }
    }
    
    // Save created accounts
    const accountsPath = path.join(outputDir, 'test-accounts.json');
    await fs.writeFile(accountsPath, JSON.stringify(createdAccounts, null, 2));
    logger.log(`\nTest accounts saved to ${accountsPath}`);
    
    // Generate summary
    const successCount = createdAccounts.filter(acc => acc.status === 'created').length;
    const failureCount = createdAccounts.length - successCount;
    const successRate = (successCount / createdAccounts.length * 100).toFixed(2);
    
    logger.log('\n=== Test Summary ===');
    logger.log(`Total accounts attempted: ${createdAccounts.length}`);
    logger.log(`Successful: ${successCount} (${successRate}%)`);
    logger.log(`Failed: ${failureCount}`);
    
    return {
      profiles,
      accounts: createdAccounts,
      summary: {
        total: createdAccounts.length,
        success: successCount,
        failure: failureCount,
        successRate: parseFloat(successRate)
      }
    };
    
  } catch (error) {
    logger.error(`Error in test profile creation: ${error.message}`);
    throw error;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testProfileCreation().catch(error => {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

export { testProfileCreation };

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load messaged users for a specific platform
 * @param {string} platform - The platform name (reddit, bluesky, nostr, x)
 * @returns {Promise<string[]>} Array of user identifiers who have been messaged
 */
export async function loadMessagedUsers(platform) {
  const messagedFile = path.join(__dirname, `../messaged-${platform}.json`);
  
  try {
    return JSON.parse(await fs.readFile(messagedFile));
  } catch {
    return [];
  }
}

/**
 * Save messaged users for a specific platform
 * @param {string} platform - The platform name (reddit, bluesky, nostr, x)
 * @param {string[]} users - Array of user identifiers who have been messaged
 */
export async function saveMessagedUsers(platform, users) {
  const messagedFile = path.join(__dirname, `../messaged-${platform}.json`);
  await fs.writeFile(messagedFile, JSON.stringify(users, null, 2));
}

/**
 * Migrate existing messaged.json to platform-specific file
 * @returns {Promise<void>}
 */
export async function migrateMessagedUsers() {
  const oldMessagedFile = path.join(__dirname, '../messaged.json');
  
  try {
    const oldMessaged = JSON.parse(await fs.readFile(oldMessagedFile));
    
    if (Array.isArray(oldMessaged) && oldMessaged.length > 0) {
      // Migrate to reddit-specific file
      await saveMessagedUsers('reddit', oldMessaged);
      console.log(`Migrated ${oldMessaged.length} messaged users to reddit-specific file`);
    }
  } catch (error) {
    // If file doesn't exist or is invalid, just ignore
    if (error.code !== 'ENOENT') {
      console.error('Error migrating messaged users:', error.message);
    }
  }
}

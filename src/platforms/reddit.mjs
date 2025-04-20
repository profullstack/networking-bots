import snoowrap from 'snoowrap';
import dayjs from 'dayjs';
import { logger } from '../utils/logger.mjs';
import { generatePersonalizedMessage } from '../services/ai.mjs';

let r;

export function initRedditAPI() {
  r = new snoowrap({
    userAgent: 'networking-bot/1.0',
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD
  });
}

export async function findPotentialUsers(searchTerms) {
  const query = searchTerms.join(' OR ');
  const searchResults = await r.search({
    query,
    sort: 'new',
    time: 'day',
    limit: 25
  });

  // Filter out bot accounts and return unique usernames
  return searchResults
    .filter(post => !post.author.name.toLowerCase().includes('bot'))
    .map(post => post.author.name);
}

export async function messageUser(user, message) {
  logger.log(`[${dayjs().format('HH:mm')}] Messaging Reddit user: ${user}`);
  try {
    const userContext = {
      platform: 'reddit',
      username: user,
      seedPrompt: message
    };

    const personalizedMessage = await generatePersonalizedMessage(userContext)
      .catch(() => message); // Fallback to default message if AI fails

    logger.log(personalizedMessage);

    await r.composeMessage({
      to: user,
      subject: 'Tech Founder Networking Group',
      text: personalizedMessage
    });

    logger.log(`✅ Messaged Reddit user ${user}`);
  } catch (error) {
    logger.error(`Error messaging Reddit user ${user}: ${error.message}`);
    throw error;
  }
}

// Cleanup function
async function cleanup() {
  logger.log('Cleaning up Reddit resources');
}

export async function initialize() {
  initRedditAPI();
  return true;
}



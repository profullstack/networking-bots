import axios from 'axios';
import { logger } from '../utils/logger.mjs';
import { makeAICall } from './llm.mjs';

/**
 * Generate a personalized message for a user based on their context
 * @param {Object} userContext - Information about the user and their interests
 * @param {string} userContext.platform - The platform (reddit, bluesky, nostr, x)
 * @param {string} userContext.username - The user's username
 * @param {Object} userContext.content - The user's post/content that triggered the bot
 * @param {string} userContext.content.text - The text content of the user's post
 * @param {string[]} userContext.content.keywords - Keywords found in the user's content
 * @returns {Promise<string>} The generated message
 */
export async function generatePersonalizedMessage(userContext) {
  try {
    const system_prompt = `You are conducting business development outreach on behalf of our company. Use a formal yet friendly tone to craft a cold outreach message tailored to someone who may be interested in our product. Ensure the message feels personalized and relevant to their interests while remaining professional.`;

    const prompt = `Rewrite the following outreach message to sound less spammy and more personalized${
      userContext.username ? ` for ${userContext.username}` : ""
    }${
      userContext.seedPrompt ? `, using this idea: "${userContext.seedPrompt}"` : ""
    }${
      userContext.subFound ? `, referencing their activity in "${userContext.subFound}"` : ""
    }${
      userContext.platform ? `, for the platform ${userContext.platform}` : ""
    }.
    
    Only return the final outreach message. Do not explain anything. Do not include any phrases like "Here's your message" or "This message is...". Do not use emojis or placeholders like [name] or [subreddit].`;

    const response = await makeAICall(system_prompt, prompt, 'profullstack');

    const message = response.trim();

    logger.log(`Generated personalized message for ${userContext.username} on ${userContext.platform}`);

    return message;
  } catch (error) {
    logger.error(`Error generating personalized message: ${error.message}`);
    throw error;
  }
}
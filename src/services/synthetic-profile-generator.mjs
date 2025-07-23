/**
 * Synthetic Profile Generator
 * 
 * This module generates realistic user profiles for testing without 
 * requiring browser automation or API calls to external services.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logger } from '../utils/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data for generating realistic profiles
const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Dorothy', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell'
];

const EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
  'icloud.com', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com'
];

const INTERESTS = [
  'Technology', 'Travel', 'Cooking', 'Photography', 'Fitness', 'Reading',
  'Music', 'Movies', 'Art', 'Sports', 'Fashion', 'Gaming', 'Nature',
  'Science', 'History', 'Politics', 'Business', 'Education', 'Health',
  'Pets', 'Food', 'Cars', 'Home Decor', 'Gardening', 'Writing'
];

const SKILLS = [
  'Programming', 'Marketing', 'Design', 'Writing', 'Public Speaking',
  'Project Management', 'Data Analysis', 'Customer Service', 'Sales',
  'Leadership', 'Communication', 'Problem Solving', 'Critical Thinking',
  'Teamwork', 'Creativity', 'Time Management', 'Adaptability', 'Research'
];

const LOCATIONS = [
  'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX',
  'Phoenix, AZ', 'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA',
  'Dallas, TX', 'San Jose, CA', 'Austin, TX', 'Jacksonville, FL',
  'Fort Worth, TX', 'Columbus, OH', 'San Francisco, CA', 'Charlotte, NC',
  'Indianapolis, IN', 'Seattle, WA', 'Denver, CO', 'Washington, DC'
];

const BIO_TEMPLATES = [
  "Passionate about {interest1} and {interest2}. {skill1} professional with experience in {skill2}.",
  "Exploring the world of {interest1} while developing skills in {skill1}. Based in {location}.",
  "{skill1} enthusiast with a love for {interest1}. Always learning and growing.",
  "Working in {skill1} by day, {interest1} enthusiast by night. {location} native.",
  "Dedicated to {skill1} and {skill2}. Fascinated by {interest1} and its impact on our world."
];

/**
 * Generate a random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get a random item from an array
 * @param {Array} array - Source array
 * @returns {*} Random item
 */
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a secure random password
 * @param {number} length - Password length
 * @returns {string} Generated password
 */
function generatePassword(length = 12) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  let password = '';
  
  // Ensure at least one character from each category
  password += getRandomItem('abcdefghijklmnopqrstuvwxyz');
  password += getRandomItem('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  password += getRandomItem('0123456789');
  password += getRandomItem('!@#$%^&*()_+');
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Generate a username based on name and random numbers
 * @param {string} firstName - First name
 * @param {string} lastName - Last name
 * @returns {string} Generated username
 */
function generateUsername(firstName, lastName) {
  const options = [
    `${firstName.toLowerCase()}${lastName.toLowerCase()}${getRandomInt(1, 999)}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}${getRandomInt(1, 99)}`,
    `${firstName.toLowerCase()}${getRandomInt(1, 9999)}`,
    `${lastName.toLowerCase()}${firstName.toLowerCase()[0]}${getRandomInt(1, 999)}`,
    `${firstName.toLowerCase()[0]}${lastName.toLowerCase()}${getRandomInt(1, 9999)}`
  ];
  
  return getRandomItem(options);
}

/**
 * Generate a bio using templates and random interests/skills
 * @param {Object} profile - User profile data
 * @returns {string} Generated bio
 */
function generateBio(profile) {
  const template = getRandomItem(BIO_TEMPLATES);
  const interest1 = getRandomItem(INTERESTS);
  let interest2 = getRandomItem(INTERESTS);
  while (interest2 === interest1) {
    interest2 = getRandomItem(INTERESTS);
  }
  
  const skill1 = getRandomItem(SKILLS);
  let skill2 = getRandomItem(SKILLS);
  while (skill2 === skill1) {
    skill2 = getRandomItem(SKILLS);
  }
  
  return template
    .replace('{interest1}', interest1)
    .replace('{interest2}', interest2)
    .replace('{skill1}', skill1)
    .replace('{skill2}', skill2)
    .replace('{location}', profile.location);
}

/**
 * Generate a synthetic profile with realistic user data
 * @param {Object} options - Generation options
 * @returns {Object} Generated profile
 */
function generateSyntheticProfile(options = {}) {
  const firstName = options.firstName || getRandomItem(FIRST_NAMES);
  const lastName = options.lastName || getRandomItem(LAST_NAMES);
  const emailDomain = options.emailDomain || getRandomItem(EMAIL_DOMAINS);
  
  // Generate birth date (18-65 years old)
  const currentYear = new Date().getFullYear();
  const birthYear = options.birthYear || getRandomInt(currentYear - 65, currentYear - 18);
  const birthMonth = options.birthMonth || getRandomInt(1, 12);
  const maxDay = new Date(birthYear, birthMonth, 0).getDate();
  const birthDay = options.birthDay || getRandomInt(1, maxDay);
  
  // Generate email options
  const emailOptions = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${emailDomain}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}@${emailDomain}`,
    `${firstName.toLowerCase()}${getRandomInt(1, 999)}@${emailDomain}`,
    `${firstName.toLowerCase()[0]}${lastName.toLowerCase()}@${emailDomain}`,
    `${lastName.toLowerCase()}${firstName.toLowerCase()[0]}@${emailDomain}`
  ];
  
  const email = options.email || getRandomItem(emailOptions);
  const username = options.username || generateUsername(firstName, lastName);
  const password = options.password || generatePassword();
  const location = options.location || getRandomItem(LOCATIONS);
  
  // Create the profile
  const profile = {
    firstName,
    lastName,
    email,
    username,
    password,
    birthDay: birthDay.toString(),
    birthMonth: birthMonth.toString(),
    birthYear: birthYear.toString(),
    location,
    interests: [],
    skills: [],
    bio: ''
  };
  
  // Add random interests and skills
  const numInterests = getRandomInt(2, 5);
  const usedInterests = new Set();
  for (let i = 0; i < numInterests; i++) {
    let interest = getRandomItem(INTERESTS);
    while (usedInterests.has(interest)) {
      interest = getRandomItem(INTERESTS);
    }
    usedInterests.add(interest);
    profile.interests.push(interest);
  }
  
  const numSkills = getRandomInt(2, 4);
  const usedSkills = new Set();
  for (let i = 0; i < numSkills; i++) {
    let skill = getRandomItem(SKILLS);
    while (usedSkills.has(skill)) {
      skill = getRandomItem(SKILLS);
    }
    usedSkills.add(skill);
    profile.skills.push(skill);
  }
  
  // Generate bio
  profile.bio = generateBio(profile);
  
  return profile;
}

/**
 * Generate multiple synthetic profiles
 * @param {number} count - Number of profiles to generate
 * @param {Object} options - Generation options
 * @returns {Array} Array of generated profiles
 */
function generateMultipleProfiles(count = 1, options = {}) {
  const profiles = [];
  for (let i = 0; i < count; i++) {
    profiles.push(generateSyntheticProfile(options));
  }
  return profiles;
}

/**
 * Save generated profiles to a JSON file
 * @param {Array} profiles - Array of profiles
 * @param {string} filePath - Path to save the file
 * @returns {Promise<void>}
 */
async function saveProfilesToFile(profiles, filePath) {
  try {
    const data = JSON.stringify(profiles, null, 2);
    await fs.writeFile(filePath, data);
    logger.log(`Profiles saved to ${filePath}`);
  } catch (error) {
    logger.error(`Error saving profiles: ${error.message}`);
    throw error;
  }
}

/**
 * Load profiles from a JSON file
 * @param {string} filePath - Path to the profiles file
 * @returns {Promise<Array>} Array of profiles
 */
async function loadProfilesFromFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`Profiles file not found: ${filePath}`);
      return [];
    }
    logger.error(`Error loading profiles: ${error.message}`);
    throw error;
  }
}

// Export the module functions
export const syntheticProfileGenerator = {
  generateSyntheticProfile,
  generateMultipleProfiles,
  saveProfilesToFile,
  loadProfilesFromFile
};

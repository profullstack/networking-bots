# Networking Bot - Account Management

This document describes how to use the account management CLI for the networking bot.

## Overview

The account management system allows you to:

- Add, update, and delete accounts for different platforms
- Set active accounts for each platform
- Export active account credentials to the .env file
- Securely store account credentials with encryption

## Getting Started

To start the account management CLI, run:

```bash
npm run accounts
# or
pnpm accounts
```

## Features

### 1. List Accounts

View all accounts organized by platform. Active accounts are marked with (ACTIVE).

### 2. Add Account

Add a new account for a specific platform. You'll be prompted to enter:
- Platform name (linkedin, x, tiktok, youtube, facebook, reddit)
- Username
- Password
- Additional platform-specific credentials (if applicable)

### 3. Update Account

Update an existing account's credentials. You can modify:
- Password
- API keys, secrets, and other platform-specific credentials

### 4. Delete Account

Remove an account from the system.

### 5. Set Active Account

Set an account as active for a specific platform. Only one account can be active per platform at a time.

### 6. Export Active Accounts to .env

Export all active account credentials to the .env file. This allows the networking bot to use these credentials when running.

## Security

Account passwords are encrypted before being stored in the accounts.json file. The encryption uses AES-256-CTR with a secret key.

For production use, it's recommended to set a custom encryption key in your .env file:

```
ENCRYPTION_KEY=your-secure-encryption-key
```

## File Structure

- `accounts.json`: Stores all account information (encrypted)
- `src/account-manager.mjs`: The account management CLI code
- `.env`: Environment variables including exported account credentials

## Integration with Networking Bot

The networking bot automatically uses the active account for each platform when running. If no active account is found, it falls back to the credentials in the .env file.

## Profile Creation

The networking bot includes a profile creation feature that helps you create new accounts on supported platforms. This feature:

1. Guides you through the signup process for each platform
2. Generates secure passwords
3. Sets up profiles with avatars, bios, and SEO links
4. Saves the new accounts to the account management system

To use the profile creation feature, run:

```bash
npm run create-profiles
# or
pnpm create-profiles
```

The profile creation process will:

1. Ask for your first name and last name
2. Display a numbered list of available platforms
3. Let you select which platform to create a profile for by number
4. Request an email address for the selected platform
5. Generate a secure password for you to use
6. Open a browser window to the platform's signup page
7. Automatically fill in form fields where possible (name, email, password)
8. Pause for you to complete email/phone verification steps
9. Save the account credentials to the account management system

This automated approach handles most of the tedious parts of the signup process while still allowing you to complete the necessary verification steps. The system will:

- Generate secure passwords for you
- Automatically fill in signup forms
- Take screenshots at key points for troubleshooting
- Wait for you to complete verification steps
- Save all account credentials securely
- Set the new account as active for the platform

The automation works differently for each platform:

- **LinkedIn**: Fills in name, email, and password fields automatically
- **X (Twitter)**: Clicks the "Create account" button and fills in name field
- **TikTok**: Attempts to fill in name, email, and password fields
- **YouTube/Google**: Attempts to fill in name, email, and password fields
- **Facebook**: Attempts to fill in name, email, and password fields
- **Reddit**: Attempts to fill in email, username, and password fields

If profile creation fails for any platform, you'll have the option to skip and try another platform.

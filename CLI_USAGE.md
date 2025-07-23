# 🤖 nbot - Networking Bot CLI

A powerful command-line interface for automating social media outreach and account management across multiple platforms.

## Installation

### Global Installation
```bash
# Install globally using pnpm
pnpm install -g @profullstack/networking-bots

# Or install globally using npm
npm install -g @profullstack/networking-bots
```

### Local Development
```bash
# Clone the repository
git clone <repository-url>
cd networking-bots

# Install dependencies
pnpm install

# Link for local development
pnpm link --global
```

## Quick Start

1. **Initialize Configuration**
   ```bash
   nbot config --init
   ```

2. **Add Social Media Accounts**
   ```bash
   nbot accounts --add
   ```

3. **Set Active Accounts**
   ```bash
   nbot accounts --set-active
   ```

4. **Configure Platforms**
   ```bash
   nbot config --edit
   ```

5. **Start the Bot**
   ```bash
   nbot run
   ```

## Commands Overview

### 🚀 Run Bot
Start the networking bot to find and message potential users.

```bash
# Run all enabled platforms
nbot run

# Run specific platform only
nbot run --platform linkedin

# Dry run (no actual messages sent)
nbot run --dry-run

# Use custom config file
nbot run --config ./my-config.json
```

### 👤 Account Management
Manage social media accounts for different platforms.

```bash
# List all accounts
nbot accounts --list

# Add new account (interactive)
nbot accounts --add

# Set active account (interactive)
nbot accounts --set-active

# Export active accounts to .env file
nbot accounts --export

# Interactive account management menu
nbot accounts
```

**Supported Platforms:**
- LinkedIn (`linkedin`)
- X/Twitter (`x`)
- TikTok (`tiktok`)
- YouTube (`youtube`)
- Facebook (`facebook`)
- Reddit (`reddit`)

### ⚙️ Configuration Management
Manage bot configuration and platform settings.

```bash
# Show current configuration
nbot config --show

# Initialize default configuration
nbot config --init

# Edit configuration interactively
nbot config --edit

# Configure specific platform
nbot config --platform linkedin
```

### 🎭 Profile Creation
Create synthetic user profiles for bot accounts.

```bash
# Create one profile
nbot create-profiles

# Create multiple profiles
nbot create-profiles --number 5

# Create profiles for specific platform
nbot create-profiles --platform linkedin

# Using alias
nbot profiles -n 3 -p x
```

### 📊 Status & Statistics
View bot status, statistics, and health information.

```bash
# Show overall bot status
nbot status

# Show detailed platform status
nbot status --platform linkedin --detailed

# Show platform-specific status
nbot status --platform x
```

### 🆘 Help & Version
Get help and version information.

```bash
# Show general help
nbot --help

# Show command-specific help
nbot run --help
nbot accounts --help

# Show version
nbot --version
```

## Configuration File Structure

The bot uses a `config.json` file for configuration:

```json
{
  "platforms": {
    "linkedin": {
      "enabled": true,
      "message": "Hi! I noticed your expertise in [topic]. I'd love to connect!"
    },
    "x": {
      "enabled": false,
      "message": "Hey! Saw your post about [topic]. Let's connect!"
    }
  },
  "searchTerms": {
    "linkedin": ["networking", "startup", "entrepreneur"],
    "x": ["tech", "startup", "business"]
  },
  "settings": {
    "respectWorkingHours": true,
    "maxMessagesPerDay": 10,
    "delayBetweenMessages": 300000,
    "retryAttempts": 3
  }
}
```

## Account Management

Accounts are stored securely in `accounts.json` with encrypted passwords:

```json
{
  "linkedin": [
    {
      "username": "your-username",
      "password": { "iv": "...", "content": "..." },
      "active": true,
      "dateAdded": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Environment Variables

The bot can export active account credentials to `.env` file:

```bash
# Export all active accounts
nbot accounts --export
```

This creates/updates your `.env` file with:
```env
LINKEDIN_USERNAME=your-username
LINKEDIN_PASSWORD=your-password
X_USERNAME=your-x-username
X_PASSWORD=your-x-password
# ... etc for other platforms
```

## Workflow Examples

### Basic Setup Workflow
```bash
# 1. Initialize configuration
nbot config --init

# 2. Add accounts for platforms you want to use
nbot accounts --add  # Add LinkedIn account
nbot accounts --add  # Add X account

# 3. Set active accounts
nbot accounts --set-active

# 4. Configure platforms and messages
nbot config --edit

# 5. Check status
nbot status

# 6. Start the bot
nbot run
```

### Daily Operations
```bash
# Check bot status
nbot status

# Run specific platform
nbot run --platform linkedin

# Check results
nbot status --platform linkedin --detailed
```

### Maintenance
```bash
# Update configuration
nbot config --edit

# Add new accounts
nbot accounts --add

# Export credentials
nbot accounts --export

# Create new profiles
nbot create-profiles -n 3
```

## Advanced Usage

### Custom Configuration Files
```bash
# Use custom config file
nbot run --config ./configs/production.json
nbot config --show --config ./configs/staging.json
```

### Platform-Specific Operations
```bash
# Configure only LinkedIn
nbot config --platform linkedin

# Run only TikTok bot
nbot run --platform tiktok

# Check X status
nbot status --platform x
```

### Dry Run Testing
```bash
# Test without sending messages
nbot run --dry-run

# Test specific platform
nbot run --platform linkedin --dry-run
```

## Troubleshooting

### Common Issues

1. **Command not found: nbot**
   ```bash
   # Reinstall globally
   pnpm install -g @profullstack/networking-bots
   
   # Or check if pnpm global bin is in PATH
   echo $PATH
   ```

2. **No configuration found**
   ```bash
   # Initialize default configuration
   nbot config --init
   ```

3. **No accounts configured**
   ```bash
   # Add accounts
   nbot accounts --add
   
   # Set active accounts
   nbot accounts --set-active
   ```

4. **Platform not working**
   ```bash
   # Check platform status
   nbot status --platform linkedin
   
   # Reconfigure platform
   nbot config --platform linkedin
   ```

### Debug Information
```bash
# Show detailed status
nbot status --detailed

# Check configuration
nbot config --show

# List all accounts
nbot accounts --list
```

## Security Notes

- Passwords are encrypted using AES-256-CTR encryption
- Set `ENCRYPTION_KEY` environment variable for custom encryption key
- Never commit `accounts.json` or `.env` files to version control
- Use strong, unique passwords for each platform
- Regularly rotate account credentials

## Support

For issues, feature requests, or contributions:
- GitHub: https://github.com/profullstack/networking-bots
- Documentation: See README.md for detailed setup instructions
- CLI Help: Use `nbot --help` or `nbot <command> --help`
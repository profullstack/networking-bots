# 🤖 nbot - Social Media Networking Bot

A sophisticated CLI tool that automates social media outreach and account management across multiple platforms including TikTok, X (Twitter), YouTube, Facebook, Reddit, and LinkedIn.

## ✨ Features

- **🎯 Professional CLI Interface**: Easy-to-use `nbot` command with comprehensive help and examples
- **🔐 Secure Account Management**: Encrypted credential storage with multi-account support
- **🌐 Multi-Platform Support**: TikTok, X.com, YouTube, Facebook, Reddit, and LinkedIn
- **⚙️ Interactive Configuration**: User-friendly setup and management tools
- **📊 Status & Analytics**: Real-time bot status and performance monitoring
- **🎭 Profile Generation**: Create synthetic user profiles for bot accounts
- **🛡️ Advanced Anti-Detection**: Browser fingerprint randomization, proxy rotation, and human-like behavior
- **⏱️ Intelligent Rate Limiting**: Automatic activity adjustment based on platform responses
- **🔄 Resilient Error Handling**: Graceful handling of platform changes and rate limiting

## 🚀 Quick Start

### Installation

```bash
# Install globally using pnpm (recommended)
pnpm install -g @profullstack/networking-bots

# Or using npm
npm install -g @profullstack/networking-bots
```

### Initial Setup

```bash
# 1. Initialize configuration
nbot config --init

# 2. Add your social media accounts
nbot accounts --add

# 3. Set active accounts for platforms
nbot accounts --set-active

# 4. Configure platforms and messages
nbot config --edit

# 5. Check status
nbot status

# 6. Start the bot
nbot run
```

## 📋 CLI Commands

### 🚀 Run Bot
```bash
# Run all enabled platforms
nbot run

# Run specific platform only
nbot run --platform linkedin

# Test run without sending messages
nbot run --dry-run

# Use custom configuration
nbot run --config ./my-config.json
```

### 👤 Account Management
```bash
# List all accounts
nbot accounts --list

# Add new account (interactive)
nbot accounts --add

# Set active account (interactive)
nbot accounts --set-active

# Export credentials to .env file
nbot accounts --export

# Interactive account menu
nbot accounts
```

### ⚙️ Configuration
```bash
# Show current configuration
nbot config --show

# Edit configuration interactively
nbot config --edit

# Configure specific platform
nbot config --platform linkedin

# Initialize default config
nbot config --init
```

### 🎭 Profile Creation
```bash
# Create synthetic profiles
nbot create-profiles --number 5

# Create profiles for specific platform
nbot profiles --platform x --number 3
```

### 📊 Status & Monitoring
```bash
# Show overall bot status
nbot status

# Show detailed platform status
nbot status --platform linkedin --detailed
```

### 🆘 Help & Information
```bash
# General help
nbot --help

# Command-specific help
nbot run --help

# Show version
nbot --version
```

## 🔧 Configuration

The bot uses a `config.json` file for platform settings:

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
    "delayBetweenMessages": 300000
  }
}
```

## 🔐 Account Security

- **Encrypted Storage**: Passwords are encrypted using AES-256-CTR
- **Multi-Account Support**: Store multiple accounts per platform
- **Active Account Management**: Easy switching between accounts
- **Environment Export**: Export credentials to `.env` files securely

## 🌐 Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| **LinkedIn** | ✅ Active | Profile messaging, connection requests |
| **X (Twitter)** | ✅ Active | Direct messages, mentions, follows |
| **TikTok** | ✅ Active | Comments, follows |
| **YouTube** | ✅ Active | Comments, channel follows |
| **Facebook** | ✅ Active | Comments, page follows |
| **Reddit** | ✅ Active | Direct messages, comments |

## 🛡️ Anti-Detection Features

- **Browser Fingerprint Randomization**: Changes browser signatures to avoid tracking
- **Human-Like Behavior**: Simulates realistic typing speeds, mouse movements, and interactions
- **Intelligent Timing**: Operates during business hours with natural pauses
- **Progressive Backoff**: Automatically slows down when rate limits are detected
- **Proxy Support**: Integrates with proxy services for IP rotation
- **Header Customization**: Uses realistic browser headers

## 📊 Example Workflows

### Daily Operations
```bash
# Check bot status
nbot status

# Run LinkedIn outreach
nbot run --platform linkedin

# Check results
nbot status --platform linkedin --detailed
```

### Setup New Platform
```bash
# Add account for new platform
nbot accounts --add

# Configure platform settings
nbot config --platform tiktok

# Test with dry run
nbot run --platform tiktok --dry-run

# Start actual outreach
nbot run --platform tiktok
```

### Maintenance
```bash
# Update configuration
nbot config --edit

# Export credentials for backup
nbot accounts --export

# Create new profiles
nbot create-profiles -n 5
```

## 📁 File Structure

```
networking-bots/
├── src/
│   ├── cli.mjs              # Main CLI entry point
│   ├── commands/            # Command modules
│   │   ├── run.mjs         # Bot execution
│   │   ├── accounts.mjs    # Account management
│   │   ├── config.mjs      # Configuration
│   │   ├── profiles.mjs    # Profile creation
│   │   └── status.mjs      # Status reporting
│   ├── platforms/          # Platform integrations
│   ├── services/           # Core services
│   └── utils/              # Utilities
├── config.json             # Bot configuration
├── accounts.json           # Encrypted account data
└── CLI_USAGE.md           # Detailed CLI documentation
```

## 🔍 How It Works

The bot operates in intelligent cycles with built-in randomization:

1. **🎯 Platform Selection**: Chooses platforms based on configuration
2. **🔍 Search Phase**: Finds users based on configured keywords
3. **🧹 Filtering Phase**: Removes previously contacted users and bots
4. **💬 Engagement Phase**: Sends personalized messages or interactions
5. **⏱️ Cooldown Phase**: Waits with randomized timing before next cycle

## 🚨 Platform-Specific Notes

### LinkedIn
- Professional networking focus
- Connection requests with personalized messages
- Respects LinkedIn's rate limits and best practices

### X (Twitter)
- Direct messages and mentions
- Tweet engagement and follows
- API integration support for enhanced features

### TikTok
- Video comments and user follows
- Engagement with trending content
- Creator outreach capabilities

### YouTube
- Channel subscriptions and video comments
- Creator collaboration outreach
- Community engagement

### Facebook
- Page follows and post comments
- Business networking focus
- Group engagement capabilities

### Reddit
- Subreddit-specific outreach
- Direct messages and comment replies
- Community-based networking

## 📈 Monitoring & Analytics

- **Real-time Status**: Monitor bot activity and performance
- **Platform Statistics**: Track messages sent, users contacted
- **Error Reporting**: Detailed error logs and troubleshooting
- **Rate Limit Monitoring**: Automatic detection and adjustment
- **Success Metrics**: Track engagement and response rates

## 🛠️ Development

### Local Development Setup
```bash
# Clone repository
git clone <repository-url>
cd networking-bots

# Install dependencies
pnpm install

# Link for local development
pnpm link --global

# Run locally
nbot --help
```

### Testing
```bash
# Test CLI functionality
nbot --help
nbot config --init
nbot status

# Test with dry run
nbot run --dry-run
```

## 📚 Documentation

- **[CLI_USAGE.md](CLI_USAGE.md)** - Comprehensive CLI documentation
- **[ACCOUNT_MANAGEMENT.md](ACCOUNT_MANAGEMENT.md)** - Account setup guide
- Built-in help: `nbot --help` or `nbot <command> --help`

## 🔒 Security & Privacy

- **Encrypted Credentials**: All passwords encrypted with AES-256-CTR
- **No Data Collection**: Bot operates locally, no external data transmission
- **Proxy Support**: Hide your IP address with proxy integration
- **Rate Limiting**: Respects platform limits to avoid account suspension
- **Human-like Behavior**: Advanced anti-detection measures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is for educational and legitimate networking purposes only. Users are responsible for complying with platform terms of service and applicable laws. Always respect rate limits and platform guidelines.

---

**Need Help?** Use `nbot --help` for command assistance or check [CLI_USAGE.md](CLI_USAGE.md) for detailed documentation.

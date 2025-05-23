# Social Media Networking Bot

A sophisticated bot that finds users interested in business networking on TikTok, X (formerly Twitter), YouTube, and Facebook and engages with them using advanced web scraping techniques to avoid detection.

## Features

- **Advanced Anti-Detection Measures**: Uses browser fingerprint randomization, proxy rotation, and human-like behavior simulation
- **Multi-Platform Support**: Targets TikTok, X.com, YouTube, and Facebook
- **Intelligent Rate Limiting**: Automatically adjusts activity based on platform responses
- **Human Behavior Simulation**: Mimics natural typing patterns, scrolling behavior, and timing
- **Proxy Support**: Integrates with proxy services to avoid IP-based blocking
- **Resilient Error Handling**: Gracefully handles platform changes and rate limiting 

## Setup

1. **Configure Proxies** (Optional but Recommended):
   - Add proxies to `proxies.txt` in the format: `host:port:username:password`
   - Or set up a Webshare API token in your `.env` file

2. **Environment Configuration**:
   - Copy `sample.env` to `.env` and configure the settings
   - Set browser and proxy configurations
   - Add platform credentials if you want to use authenticated features

3. **Customize Messages and Search Terms**:
   - Edit `config.json` to customize your outreach messages
   - Adjust search terms to target your specific audience

4. **Install Dependencies and Run**:
```bash
pnpm install
pnpm start
```

## How It Works

The bot operates in cycles, with built-in randomization to appear more human-like:
1. **Platform Selection**: Selects a platform to target for the current cycle
2. **Search Phase**: Searches for users based on configured keywords
3. **Filtering Phase**: Filters out previously contacted users and obvious bots
4. **Engagement Phase**: Follows users and attempts to engage through comments or mentions (if available)
5. **Cooldown Phase**: Waits a randomized period before the next cycle


## Anti-Detection Features

- **Browser Fingerprint Randomization**: Changes browser signatures to avoid tracking
- **Human-Like Behavior**: Simulates realistic typing speeds, mouse movements, and page interactions
- **Intelligent Timing**: Operates only during business hours with natural pauses
- **Progressive Backoff**: Automatically slows down when rate limits are detected
- **Header Customization**: Uses realistic browser headers

## Platform-Specific Notes

### TikTok
Since TikTok doesn't have direct messaging for unauthenticated users, the bot follows users and comments on their latest video.

### X.com (Twitter)
The bot follows users and mentions them in tweets. If you have API access with direct messaging permissions, you can enable those features by setting up the API credentials in your `.env` file.

### YouTube
The bot follows users and comments on their latest video.

### Facebook
The bot follows users and comments on their latest post.

## Maintenance

- The bot persists messaged users in platform-specific files (e.g., `messaged-tiktok.json`, `messaged-x.json`, `messaged-youtube.json`, `messaged-facebook.json`)
- The bot persists proxies in the `proxies.txt` file
- Logs are stored in the `logs` directory for troubleshooting
- Screenshots are stored in the `screenshots` directory for debugging
- Proxies are automatically validated and scored based on reliability

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

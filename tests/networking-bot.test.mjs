import { jest } from '@jest/globals';
import { initializePlatforms, runPlatform } from '../src/networking-bot.mjs';
import * as reddit from '../src/platforms/reddit.mjs';
import * as bluesky from '../src/platforms/bluesky.mjs';
import * as nostr from '../src/platforms/nostr.mjs';
import * as x from '../src/platforms/x.mjs';
import { loadMessagedUsers, saveMessagedUsers } from '../src/utils.mjs';
import { logger } from '../src/utils/logger.mjs';

jest.mock('../src/platforms/reddit.mjs');
jest.mock('../src/platforms/bluesky.mjs');
jest.mock('../src/platforms/nostr.mjs');
jest.mock('../src/platforms/x.mjs');
jest.mock('../src/utils.mjs');
jest.mock('../src/utils/logger.mjs');

describe('Networking Bot Tests', () => {
    const mockConfig = {
        platforms: {
            reddit: { enabled: true, message: 'Hello Reddit!' },
            bluesky: { enabled: true, message: 'Hello Bluesky!' },
            nostr: { enabled: true, message: 'Hello Nostr!' },
            x: { enabled: false, message: 'Hello X!' }
        },
        searchTerms: {
            reddit: 'test search',
            bluesky: 'test search',
            nostr: 'test search',
            x: 'test search'
        }
    };

    beforeEach(() => {
        jest.resetAllMocks();
        jest.spyOn(global, 'JSON').mockImplementation(() => mockConfig);
    });

    test('initializePlatforms should initialize enabled platforms', async () => {
        reddit.initialize.mockResolvedValueOnce();
        bluesky.initialize.mockResolvedValueOnce();
        nostr.initialize.mockResolvedValueOnce();

        await initializePlatforms();

        expect(reddit.initialize).toHaveBeenCalled();
        expect(bluesky.initialize).toHaveBeenCalled();
        expect(nostr.initialize).toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('✅ reddit initialized'));
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('✅ bluesky initialized'));
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('✅ nostr initialized'));
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('⏭️ Skipping disabled platform: x'));
    });

    test('runPlatform should message a user and save them as messaged', async () => {
        const mockCandidates = ['user1', 'user2'];
        const mockMessaged = ['user1'];

        reddit.findPotentialUsers.mockResolvedValueOnce(mockCandidates);
        loadMessagedUsers.mockResolvedValueOnce(mockMessaged);
        reddit.messageUser.mockResolvedValueOnce();

        await runPlatform('reddit');

        expect(reddit.findPotentialUsers).toHaveBeenCalledWith('test search');
        expect(reddit.messageUser).toHaveBeenCalledWith('user2', 'Hello Reddit!');
        expect(saveMessagedUsers).toHaveBeenCalledWith('reddit', ['user1', 'user2']);
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Found 2 potential users on reddit'));
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('1 new candidates on reddit'));
    });

    test('runPlatform should handle no new candidates gracefully', async () => {
        const mockCandidates = ['user1'];
        const mockMessaged = ['user1'];

        reddit.findPotentialUsers.mockResolvedValueOnce(mockCandidates);
        loadMessagedUsers.mockResolvedValueOnce(mockMessaged);

        await runPlatform('reddit');

        expect(reddit.findPotentialUsers).toHaveBeenCalledWith('test search');
        expect(reddit.messageUser).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('No new candidates found for reddit.'));
    });

    test('runPlatform should handle platform errors gracefully', async () => {
        reddit.findPotentialUsers.mockRejectedValueOnce(new Error('Test error'));

        await runPlatform('reddit');

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error running reddit bot: Test error'));
    });
});

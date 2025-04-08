import { makeProfullstackAiCall, makeGroqAiCall, makeOpenaiAiCall, makeAICall, generateCurlCommand } from '../src/services/llm.mjs';
import fetch from 'node-fetch';
import { jest } from '@jest/globals';

jest.mock('node-fetch', () => jest.fn());

describe('LLM Service Tests', () => {
    const mockFetch = fetch;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('makeProfullstackAiCall should return parsed JSON response', async () => {
        const mockResponse = {
            message: { content: '{"key":"value"}' }
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
        });

        const result = await makeProfullstackAiCall('test prompt', 'test system prompt');
        expect(result).toEqual({ key: 'value' });
    });

    test('makeGroqAiCall should handle API errors gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Invalid request' })
        });

        const result = await makeGroqAiCall('test prompt');
        expect(result).toEqual({
            summary: 'Error calling Groq API. Please review the events manually.'
        });
    });

    test('makeOpenaiAiCall should parse valid JSON response', async () => {
        const mockResponse = {
            choices: [{ message: { content: '{"key":"value"}' } }]
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
        });

        const result = await makeOpenaiAiCall('test prompt');
        expect(result).toEqual({ key: 'value' });
    });

    test('makeAICall should call the correct provider based on input', async () => {
        const mockResponse = {
            message: { content: '{"key":"value"}' }
        };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse
        });

        const result = await makeAICall('test prompt', 'test system prompt', 'profullstack');
        expect(result).toEqual({ key: 'value' });
    });

    test('generateCurlCommand should return a valid cURL command', () => {
        const prompt = 'test prompt';
        const systemPrompt = 'test system prompt';
        const curlCommand = generateCurlCommand(prompt, systemPrompt);

        expect(curlCommand).toContain('curl -X POST https://ai.profullstack.com/ollamaapi/api/chat');
        expect(curlCommand).toContain('"content": "test system prompt"');
        expect(curlCommand).toContain('"content": "test prompt"');
    });
});

export async function makeProfullstackAiCall(prompt, system_prompt) {
    try {
        const response = await fetch('https://ai.profullstack.com/ollamaapi/api/chat', {
            method: 'POST',
            body: JSON.stringify({
                model: 'llama3.1:8b',
                messages: [
                    {
                        role: 'system',
                        content: system_prompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                stream: false,
                options: {
                    temperature: 0.6,
                    top_p: 0.9,
                    stop: null
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            console.error('AI API error:', errorData);
            throw new Error(`AI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data?.message?.content) {
            console.error('Invalid AI response format:', data);
            throw new Error('Invalid AI response format');
        }

        // Directly return the content as an object
        return data.message.content;
    } catch (error) {
        console.error('AI call failed:', error);
        return {
            summary: `AI service error: ${error.message}. Please review the events manually.`
        };
    }
}

export async function makeGroqAiCall(prompt) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a helpful assistant in the areas of global threat intelligence and osint. Please only return valid JSON and no other text.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'llama3-70b-8192',
                temperature: 1,
                top_p: 1,
                stream: false,
                stop: null
            })
        });

        if (!response.ok) {
            console.error(await response.json());
            return {
                summary: 'Error calling Groq API. Please review the events manually.'
            };
        }

        const data = await response.json();
        const content = data.choices[0].message?.content;
        console.log(content, '<---- groq.com api');

        try {
            if (typeof content === 'object') {
                return content;
            }

            const contentStr = content.trim();
            try {
                return JSON.parse(contentStr);
            } catch (parseError) {
                const cleanContent = contentStr
                    .replace(/^```json\s*/, '')
                    .replace(/\s*```$/, '')
                    .trim();

                return JSON.parse(cleanContent);
            }
        } catch (parseError) {
            console.error('Failed to parse Groq response:', content);
            return {
                summary: 'Error parsing Groq response. Please review the events manually.'
            };
        }
    } catch (error) {
        console.error('Groq call failed:', error);
        return {
            summary: `Groq service error: ${error.message}. Please review the events manually.`
        };
    }
}

export async function calculateTokenSize(text) {
    const response = await fetch('https://api.openai.com/v1/tokens', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ text: text })
    });

    const data = await response.json();
    return data.tokens;
}

export async function makeOpenaiAiCall(prompt) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant in the areas of global threat intelligence and osint. Please only return valid JSON and no other text.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                response_format: { "type": "json_object" }
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI API error:', errorData);
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices[0].message?.content;
        console.log('OpenAI raw response:', content);

        try {
            // If content is already an object, return it
            if (typeof content === 'object') {
                return content;
            }

            // Try to parse the content as JSON
            const contentStr = content.trim();
            try {
                return JSON.parse(contentStr);
            } catch (parseError) {
                // If there's a parse error, try to clean the string
                const cleanContent = contentStr
                    .replace(/^```json\s*/, '')
                    .replace(/\s*```$/, '')
                    .trim();

                return JSON.parse(cleanContent);
            }
        } catch (parseError) {
            console.error('Failed to parse OpenAI response:', content);
            console.error('Parse error:', parseError);
            return {
                summary: 'Error parsing OpenAI response. Please review the events manually.',
                analysis: 'Error parsing OpenAI response. Please review the events manually.'
            };
        }
    } catch (error) {
        console.error('OpenAI call failed:', error);
        return {
            summary: `OpenAI service error: ${error.message}. Please review the events manually.`,
            analysis: `OpenAI service error: ${error.message}. Please review the events manually.`
        };
    }
}

export async function makeAICall(prompt, system_prompt, aiProvider = null) {
    const provider = aiProvider || process.env.AI_PROVIDER || 'profullstack';

    if (provider === 'profullstack') {
        return await makeProfullstackAiCall(prompt, system_prompt);
    } else if (provider === 'groq') {
        return await makeGroqAiCall(prompt);
    } else if (provider === 'openai') {
        return await makeOpenaiAiCall(prompt);
    }

    return {
        summary: 'No AI provider configured. Please review the events manually.'
    };
}

export function generateCurlCommand(prompt, system_prompt) {
    const curlCommand = `
curl -X POST https://ai.profullstack.com/ollamaapi/api/chat \\
-H "Content-Type: application/json" \\
-d '{
    "model": "llama3.1:8b",
    "messages": [
        {
            "role": "system",
            "content": "${system_prompt.replace(/"/g, '\\"')}"
        },
        {
            "role": "user",
            "content": "${prompt.replace(/"/g, '\\"')}"
        }
    ],
    "stream": false,
    "format": "json",
    "options": {
        "temperature": 0.3,
        "top_p": 0.9,
        "stop": null
    }
}'`;
    return curlCommand.trim();
}
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { MediaItem } from '../db/db.js';
import { cache } from '../cache.js';

const GEN_MODEL = 'gemini-2.0-flash';
const CACHE_TTL = 3600; // Cache recommendations for 1 hour

export interface AIRecommendation {
    title: string;
    year?: number;
    type: 'movie' | 'show' | 'anime';
    reason: string;
}

export async function getGeminiRecommendations(
    userHistory: MediaItem[],
    favoriteGenres: string[]
): Promise<AIRecommendation[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('GEMINI_API_KEY not set');
        return [];
    }

    // Check cache first
    const cacheKey = 'gemini:recommendations';
    const cached = cache.get<AIRecommendation[]>(cacheKey);
    if (cached) {
        console.log('🔮 Returning cached recommendations');
        return cached;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEN_MODEL });

    // Construct Context
    const allTitles = userHistory.map(i => i.title);
    const liked = userHistory.filter(i => i.userRating && i.userRating >= 8).map(i => `${i.title} (${i.type}, rated ${i.userRating}/10)`);
    const watched = userHistory.filter(i => i.status === 'completed').slice(0, 10).map(i => `${i.title} (${i.type})`);

    const prompt = `You are a movie and TV show recommendation engine.

Based on the following user preferences, recommend exactly 20 movies, TV shows, or anime that the user would love. Focus on hidden gems and high-quality titles.

IMPORTANT: Do NOT recommend any titles from the "Already Watched" list below.

User Favorites (Rated 8+): ${liked.length > 0 ? liked.join(', ') : 'None yet'}
Recently Watched: ${watched.length > 0 ? watched.join(', ') : 'None yet'}
Favorite Genres: ${favoriteGenres.length > 0 ? favoriteGenres.join(', ') : 'General'}
Already Watched (DO NOT recommend these): ${allTitles.join(', ')}

Return ONLY a valid JSON array. No markdown, no code blocks, no explanation.
Each object must have: "title" (string), "year" (number), "type" ("movie" or "show"), "reason" (a short personalized explanation why this user would enjoy it).

Example format:
[{"title": "Movie Name", "year": 2020, "type": "movie", "reason": "Because you loved X, you'll enjoy this similar thriller"}]`;

    // Retry with exponential backoff for rate limits
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            console.log(`🔮 Sending prompt to Gemini (attempt ${attempt + 1})...`);
            const result = await model.generateContent(prompt);
            const response = result.response;
            let text = response.text();
            console.log('🔮 Gemini responded. Parsing...');

            // Clean markdown code blocks if present
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const recommendations: AIRecommendation[] = JSON.parse(text);
            console.log(`🔮 Parsed ${recommendations.length} recommendations`);

            // Cache the results
            cache.set(cacheKey, recommendations, CACHE_TTL);

            return recommendations;
        } catch (error: any) {
            if (error?.status === 429 && attempt < 2) {
                const delay = (attempt + 1) * 10; // 10s, 20s
                console.warn(`🔮 Rate limited. Retrying in ${delay}s...`);
                await new Promise(r => setTimeout(r, delay * 1000));
                continue;
            }
            console.error('Gemini API Error:', error?.message || error);
            return [];
        }
    }

    return [];
}

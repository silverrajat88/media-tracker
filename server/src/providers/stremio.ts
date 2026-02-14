/**
 * Stremio Provider — Login and fetch library items via Stremio API.
 * Uses the Stremio API directly (https://api.strem.io).
 */

const STREMIO_API = 'https://api.strem.io/api';

interface StremioLibItem {
    _id: string;
    name: string;
    type: 'movie' | 'series' | 'other';
    poster?: string;
    posterShape?: string;
    imdb_id?: string;
    state?: {
        watched?: string;
        lastWatched?: string;
        timeOffset?: number;
        timeDuration?: number;
        season?: number;
        episode?: number;
    };
    removed?: boolean;
    temp?: boolean;
}

export interface StremioItem {
    name: string;
    type: 'movie' | 'show';
    imdbId: string;
    poster: string | null;
    lastWatched: string | null;
}

/**
 * Login to Stremio with email/password. Returns authKey.
 */
export async function stremioLogin(email: string, password: string): Promise<string> {
    const res = await fetch(`${STREMIO_API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, type: 'Auth' }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Stremio login failed: ${text}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.result?.authKey) throw new Error('No authKey in response');

    return data.result.authKey;
}

/**
 * Fetch library items from Stremio using authKey.
 */
export async function getStremioLibrary(authKey: string): Promise<StremioItem[]> {
    const res = await fetch(`${STREMIO_API}/datastoreGet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            authKey,
            collection: 'libraryItem',
            ids: [],
            all: true,
        }),
    });

    if (!res.ok) {
        throw new Error(`Stremio library fetch failed: ${res.status}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const items: StremioLibItem[] = data.result ?? [];

    // Filter to relevant items (must have imdb_id or _id starting with tt)
    return items
        .filter(item => {
            const imdbId = item.imdb_id || (item._id?.startsWith('tt') ? item._id : undefined);
            return !!imdbId;
        })
        .map(item => ({
            name: item.name,
            type: item.type === 'movie' ? 'movie' as const : 'show' as const,
            imdbId: (item.imdb_id || item._id)!,
            poster: item.poster ?? null,
            lastWatched: item.state?.lastWatched ?? null,
        }));
}

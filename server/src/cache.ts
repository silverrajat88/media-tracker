/**
 * In-memory TTL cache.
 * Avoids hitting external API rate limits for repeated queries.
 */
export class Cache {
    private store = new Map<string, { data: any; expiresAt: number }>();

    /** Get cached value, or undefined if expired/missing */
    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.data as T;
    }

    /** Set a value with a TTL in seconds */
    set(key: string, data: any, ttlSeconds: number): void {
        this.store.set(key, {
            data,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    /** Clear all entries */
    clear(): void {
        this.store.clear();
    }

    /** Number of entries (including possibly expired) */
    get size(): number {
        return this.store.size;
    }
}

/** Singleton cache instance */
export const cache = new Cache();

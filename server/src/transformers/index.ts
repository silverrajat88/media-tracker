/**
 * Transformer registry.
 * Each transformer converts SimklRow[] → { headers, rows } for a specific service format.
 * To add a new service, create a new file and register it here.
 */

import type { SimklRow } from '../types.js';
import { SIMKL_ROW_HEADERS } from '../types.js';
import { traktTransformer } from './trakt.js';

export interface TransformedResult {
    headers: string[];
    rows: Record<string, string>[];
    filename: string;
}

export type Transformer = (rows: SimklRow[]) => TransformedResult;

/** Raw transformer — passes through all SimklRow fields unchanged */
function rawTransformer(rows: SimklRow[]): TransformedResult {
    const headers = [...SIMKL_ROW_HEADERS] as string[];
    return {
        headers,
        rows: rows.map((r) => {
            const out: Record<string, string> = {};
            for (const h of headers) out[h] = r[h as keyof SimklRow] ?? '';
            return out;
        }),
        filename: 'simkl_export_raw.csv',
    };
}

/** Registry of all available transformers */
const transformers: Record<string, Transformer> = {
    raw: rawTransformer,
    trakt: traktTransformer,
};

export function getTransformer(format: string): Transformer | undefined {
    return transformers[format];
}

export function getAvailableFormats(): { id: string; label: string }[] {
    return [
        { id: 'raw', label: 'Raw (All Fields)' },
        { id: 'trakt', label: 'Trakt' },
    ];
}

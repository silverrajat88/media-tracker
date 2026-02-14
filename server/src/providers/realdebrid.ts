import { cache } from '../cache.js';

const RD_API = 'https://api.real-debrid.com/rest/1.0';

export interface RDUser {
    id: number;
    username: string;
    email: string;
    points: number;
    locale: string;
    avatar: string;
    type: 'premium' | 'free';
    premium: number; // seconds left
    expiration: string;
}

export interface RDDownload {
    id: string;
    filename: string;
    mimeType: string;
    filesize: number;
    link: string;
    host: string;
    chunks: number;
    download: string; // generated link
    generated: string;
}

export interface RDUnrestrict {
    id: string;
    filename: string;
    mimeType: string;
    filesize: number;
    link: string;
    host: string;
    chunks: number;
    crc: number;
    download: string;
    streamable: number;
}

export class RealDebridClient {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    private async request<T>(endpoint: string, method = 'GET', body?: any): Promise<T> {
        const url = `${RD_API}${endpoint}`;
        const options: RequestInit = {
            method,
            headers: {
                Authorization: `Bearer ${this.token}`,
            },
        };

        if (body) {
            // RD API often expects form-data for POST, but JSON for some.
            // Documentation says many endpoints accept POST params.
            // Let's use URLSearchParams for simple key-value pairs which is standard for RD.
            const params = new URLSearchParams();
            for (const key in body) {
                params.append(key, body[key]);
            }
            options.body = params;
            // header not needed for URLSearchParams, fetch sets it to application/x-www-form-urlencoded
        }

        const res = await fetch(url, options);
        if (!res.ok) {
            if (res.status === 401) throw new Error('Invalid Real-Debrid Token');
            if (res.status === 403) throw new Error('Permission Denied (Premium required?)');
            throw new Error(`Real-Debrid Error ${res.status}: ${await res.text()}`);
        }

        // Handle empty responses (e.g. 204 No Content)
        if (res.status === 204) {
            return {} as T;
        }

        const text = await res.text();
        return text ? JSON.parse(text) : {} as T;
    }

    async getUser(): Promise<RDUser> {
        return this.request<RDUser>('/user');
    }

    async getDownloads(limit = 50): Promise<RDDownload[]> {
        return this.request<RDDownload[]>(`/downloads?limit=${limit}`);
    }

    async unrestrictLink(link: string): Promise<RDUnrestrict> {
        return this.request<RDUnrestrict>('/unrestrict/link', 'POST', { link });
    }

    async addMagnet(magnet: string): Promise<{ id: string; uri: string }> {
        return this.request<{ id: string; uri: string }>('/torrents/addMagnet', 'POST', { magnet });
    }

    async getTorrentInfo(id: string): Promise<any> {
        return this.request<any>(`/torrents/info/${id}`);
    }

    async selectFiles(id: string, files: string | 'all'): Promise<void> {
        await this.request<void>(`/torrents/selectFiles/${id}`, 'POST', { files });
    }
}

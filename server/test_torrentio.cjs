const fetch = require('node-fetch');

// Inception IMDB ID
const imdbId = 'tt1375666';

async function testTorrentio() {
    // Standard public Torrentio instance
    // Structure: https://torrentio.strem.fun/{configuration}/stream/{type}/{id}.json
    // Config 'manifest.json' is usually at root.
    // Let's try raw stream endpoint without config (default)
    const url = `https://torrentio.strem.fun/stream/movie/${imdbId}.json`;

    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();

        console.log('Streams found:', data.streams?.length);
        if (data.streams?.length > 0) {
            console.log('Top stream:', data.streams[0]);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testTorrentio();

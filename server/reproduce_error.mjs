
// Dummy magnet link for testing
const magnet = 'magnet:?xt=urn:btih:3b52479e394344d32549257223e740345d470512&dn=Ubuntu+ISO';

async function testResolve() {
    try {
        const res = await fetch('http://localhost:3000/api/stream/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ magnet })
        });

        console.log('Status:', res.status);
        const data = await res.json();
        console.log('Response:', data);
    } catch (e) {
        console.error('Error:', e);
    }
}

testResolve();

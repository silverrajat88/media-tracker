import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Palette, RefreshCw, Link2, Tv, Film,
    Download, FileSpreadsheet, Target, Trash2, AlertTriangle,
    Database, Table
} from 'lucide-react';
import './settings.css';

const TOKEN_KEY = 'simkl_exporter_token';

export default function SettingsPage() {
    const navigate = useNavigate();

    // Poster provider (local display preference only — no refresh triggered)
    const [posterProvider, setPosterProvider] = useState<'tmdb' | 'rpdb'>(
        localStorage.getItem('poster_provider') as 'tmdb' | 'rpdb' || 'tmdb'
    );

    // Refresh state
    const [refreshing, setRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('');

    // Simkl
    const [simklToken, setSimklToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
    const [simklImporting, setSimklImporting] = useState(false);
    const [simklStatus, setSimklStatus] = useState('');

    // Stremio
    const [stremioEmail, setStremioEmail] = useState('');
    const [stremioPassword, setStremioPassword] = useState('');
    const [stremioLoggingIn, setStremioLoggingIn] = useState(false);
    const [stremioImporting, setStremioImporting] = useState(false);
    const [stremioAuth, setStremioAuth] = useState(localStorage.getItem('stremio_auth') || '');
    const [stremioStatus, setStremioStatus] = useState('');

    // Danger zone
    const [clearing, setClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Real-Debrid (Managed via .env)
    const [rdUser, setRdUser] = useState<any>(null);
    const [rdLoading, setRdLoading] = useState(false);
    const [rdStatus, setRdStatus] = useState('');

    useEffect(() => {
        checkRdConnection();
    }, []);

    const checkRdConnection = async () => {
        setRdLoading(true);
        try {
            const res = await fetch('/api/settings/rd-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) // No token needed, server checks .env
            });
            const data = await res.json();
            if (res.ok) {
                setRdUser(data.user);
                setRdStatus('✓ Connected via .env');
            } else {
                setRdStatus(`✗ ${data.error}`);
                setRdUser(null);
            }
        } catch (e) {
            setRdStatus('✗ Connection failed');
        } finally {
            setRdLoading(false);
        }
    };

    // ---- Provider Selection (local only, no API call) ----
    const handleProviderChange = (provider: 'tmdb' | 'rpdb') => {
        setPosterProvider(provider);
        localStorage.setItem('poster_provider', provider);
    };

    // ---- Smart Refresh (only fetch missing poster URLs) ----
    const handleSmartRefresh = async () => {
        setRefreshing(true);
        setRefreshStatus('Refreshing missing poster data...');
        try {
            const res = await fetch('/api/library/metadata/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hard: false }),
            });
            const data = await res.json();
            setRefreshStatus(`✓ Processing ${data.processing} of ${data.total} items in background`);
        } catch {
            setRefreshStatus('✗ Refresh failed.');
        } finally {
            setRefreshing(false);
        }
    };

    // ---- Hard Refresh (re-fetch all) ----
    const handleHardRefresh = async () => {
        setRefreshing(true);
        setRefreshStatus('Hard refreshing all poster data...');
        try {
            const res = await fetch('/api/library/metadata/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hard: true }),
            });
            const data = await res.json();
            setRefreshStatus(`✓ Re-fetching all ${data.total} items in background`);
        } catch {
            setRefreshStatus('✗ Refresh failed.');
        } finally {
            setRefreshing(false);
        }
    };

    // ---- Simkl ----
    const handleSimklConnect = async () => {
        try {
            const res = await fetch('/api/auth/simkl-url');
            const { url } = await res.json();
            window.open(url, '_blank');
        } catch {
            setSimklStatus('✗ Failed to get Simkl auth URL.');
        }
    };

    const handleSimklImport = async () => {
        if (!simklToken) return;
        setSimklImporting(true);
        setSimklStatus('Importing from Simkl...');
        try {
            const res = await fetch('/api/library/import/simkl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: simklToken }),
            });
            const data = await res.json();
            if (res.ok) {
                setSimklStatus(`✓ ${data.total} items processed — ${data.inserted} new, ${data.updated} updated`);
            } else {
                setSimklStatus(`✗ ${data.error}`);
            }
        } catch {
            setSimklStatus('✗ Import failed.');
        } finally {
            setSimklImporting(false);
        }
    };

    // ---- Stremio ----
    const handleStremioLogin = async () => {
        if (!stremioEmail || !stremioPassword) return;
        setStremioLoggingIn(true);
        setStremioStatus('Logging in to Stremio...');
        try {
            const res = await fetch('/api/auth/stremio-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: stremioEmail, password: stremioPassword }),
            });
            const data = await res.json();
            if (res.ok && data.authKey) {
                setStremioAuth(data.authKey);
                localStorage.setItem('stremio_auth', data.authKey);
                setStremioStatus('✓ Connected to Stremio!');
                setStremioPassword('');
            } else {
                setStremioStatus(`✗ ${data.error || 'Login failed.'}`);
            }
        } catch {
            setStremioStatus('✗ Login failed.');
        } finally {
            setStremioLoggingIn(false);
        }
    };

    const handleStremioImport = async () => {
        if (!stremioAuth) return;
        setStremioImporting(true);
        setStremioStatus('Importing from Stremio...');
        try {
            const res = await fetch('/api/library/import/stremio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authKey: stremioAuth }),
            });
            const data = await res.json();
            if (res.ok) {
                setStremioStatus(`✓ ${data.total} items processed — ${data.inserted} new, ${data.updated} updated`);
            } else {
                setStremioStatus(`✗ ${data.error}`);
            }
        } catch {
            setStremioStatus('✗ Import failed.');
        } finally {
            setStremioImporting(false);
        }
    };

    const handleStremioDisconnect = () => {
        setStremioAuth('');
        localStorage.removeItem('stremio_auth');
        setStremioStatus('Disconnected.');
    };

    // ---- Clear All ----
    const handleClearAll = async () => {
        setClearing(true);
        try {
            const res = await fetch('/api/library/clear', { method: 'DELETE' });
            if (res.ok) {
                setShowClearConfirm(false);
                alert('Library cleared successfully. Redirecting to home.');
                navigate('/');
            }
        } catch {
            alert('Failed to clear library.');
        } finally {
            setClearing(false);
        }
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                <button className="btn-back" onClick={() => navigate('/')}>
                    <ArrowLeft size={18} /> Back
                </button>
                <h1>Settings</h1>
            </header>

            {/* Poster Provider */}
            <section className="settings-section">
                <h2><Palette size={20} /> Poster Provider</h2>
                <p className="settings-desc">Choose which poster style is displayed. This only changes the display — no data is re-fetched.</p>
                <div className="provider-toggle">
                    <button
                        className={`provider-btn ${posterProvider === 'tmdb' ? 'active' : ''}`}
                        onClick={() => handleProviderChange('tmdb')}
                    >
                        <Film size={20} />
                        <span className="provider-name">TMDB</span>
                        <span className="provider-desc">Standard posters</span>
                    </button>
                    <button
                        className={`provider-btn ${posterProvider === 'rpdb' ? 'active' : ''}`}
                        onClick={() => handleProviderChange('rpdb')}
                    >
                        <Target size={20} />
                        <span className="provider-name">RPDB</span>
                        <span className="provider-desc">Posters with ratings</span>
                    </button>
                </div>
            </section>

            {/* Metadata Refresh */}
            <section className="settings-section">
                <h2><RefreshCw size={20} /> Metadata Refresh</h2>
                <p className="settings-desc">Fetch poster URLs for both TMDB and RPDB. Smart refresh only fetches what's missing.</p>
                <div className="refresh-actions">
                    <button className="btn btn-primary" onClick={handleSmartRefresh} disabled={refreshing}>
                        <RefreshCw size={16} /> {refreshing ? 'Refreshing...' : 'Smart Refresh'}
                    </button>
                    <button className="btn btn-outline" onClick={handleHardRefresh} disabled={refreshing}>
                        <RefreshCw size={16} /> Hard Refresh (re-fetch all)
                    </button>
                </div>
                {refreshStatus && <p className="settings-status">{refreshStatus}</p>}
            </section>

            {/* Library Management */}
            <section className="settings-section">
                <h2><Database size={20} /> Library Management</h2>
                <p className="settings-desc">Manage your library content directly.</p>
                <div className="refresh-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/bulk-edit')}>
                        <Table size={16} /> Bulk Edit Library
                    </button>
                </div>
            </section>

            {/* Real-Debrid */}
            <section className="settings-section">
                <h2><Download size={20} /> Real-Debrid</h2>
                <p className="settings-desc">Connect your Real-Debrid account to enable streaming.</p>

                {/* Real-Debrid Status (Managed via .env) */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Managed via <code>REAL_DEBRID_TOKEN</code> in <code>.env</code>
                    </div>

                    {rdLoading && <div className="spinner"></div>}

                    {rdUser ? (
                        <div style={{ color: '#4ade80' }}>
                            <div>👤 <b>{rdUser.username}</b> ({rdUser.type})</div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Expires: {new Date(rdUser.expiration).toLocaleDateString()}</div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>{rdStatus}</div>
                        </div>
                    ) : (
                        <div style={{ color: '#f87171' }}>
                            {rdStatus || 'Not Connected'}
                            <button
                                onClick={checkRdConnection}
                                style={{
                                    display: 'block', marginTop: '0.5rem',
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    color: 'white', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer'
                                }}
                            >
                                Retry Connection
                            </button>
                        </div>
                    )}
                </div>
            </section>
            <section className="settings-section">
                <h2><Link2 size={20} /> Sync Sources</h2>
                <p className="settings-desc">Connect external services to import your watch history.</p>

                <div className="sync-cards">
                    {/* Simkl Card */}
                    <div className="sync-card">
                        <div className="sync-card-header">
                            <div className="sync-card-icon"><Tv size={24} /></div>
                            <div>
                                <h3>Simkl</h3>
                                <p className="sync-card-desc">Import movies, shows, and anime from your Simkl account.</p>
                            </div>
                            <span className={`sync-badge ${simklToken ? 'connected' : 'disconnected'}`}>
                                {simklToken ? 'Connected' : 'Not Connected'}
                            </span>
                        </div>
                        <div className="sync-card-actions">
                            {simklToken ? (
                                <>
                                    <button className="btn btn-primary btn-sm" onClick={handleSimklImport} disabled={simklImporting}>
                                        <Download size={14} /> {simklImporting ? 'Importing...' : 'Import All'}
                                    </button>
                                    <button className="btn btn-outline btn-sm" onClick={() => { setSimklToken(''); localStorage.removeItem(TOKEN_KEY); }}>
                                        Disconnect
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary btn-sm" onClick={handleSimklConnect}>
                                    <Link2 size={14} /> Connect to Simkl
                                </button>
                            )}
                        </div>
                        {simklStatus && <p className="settings-status">{simklStatus}</p>}
                    </div>

                    {/* Stremio Card */}
                    <div className="sync-card">
                        <div className="sync-card-header">
                            <div className="sync-card-icon"><Film size={24} /></div>
                            <div>
                                <h3>Stremio</h3>
                                <p className="sync-card-desc">Import your Stremio library and watched items.</p>
                            </div>
                            <span className={`sync-badge ${stremioAuth ? 'connected' : 'disconnected'}`}>
                                {stremioAuth ? 'Connected' : 'Not Connected'}
                            </span>
                        </div>
                        {!stremioAuth ? (
                            <div className="sync-card-form">
                                <input
                                    type="email"
                                    placeholder="Stremio email"
                                    value={stremioEmail}
                                    onChange={(e) => setStremioEmail(e.target.value)}
                                    className="settings-input"
                                />
                                <input
                                    type="password"
                                    placeholder="Stremio password"
                                    value={stremioPassword}
                                    onChange={(e) => setStremioPassword(e.target.value)}
                                    className="settings-input"
                                />
                                <button className="btn btn-primary btn-sm" onClick={handleStremioLogin} disabled={stremioLoggingIn || !stremioEmail || !stremioPassword}>
                                    <Link2 size={14} /> {stremioLoggingIn ? 'Logging in...' : 'Connect'}
                                </button>
                            </div>
                        ) : (
                            <div className="sync-card-actions">
                                <button className="btn btn-primary btn-sm" onClick={handleStremioImport} disabled={stremioImporting}>
                                    <Download size={14} /> {stremioImporting ? 'Importing...' : 'Import Library'}
                                </button>
                                <button className="btn btn-outline btn-sm" onClick={handleStremioDisconnect}>
                                    Disconnect
                                </button>
                            </div>
                        )}
                        {stremioStatus && <p className="settings-status">{stremioStatus}</p>}
                    </div>
                </div>
            </section>

            {/* Export */}
            <section className="settings-section">
                <h2><FileSpreadsheet size={20} /> Export</h2>
                <p className="settings-desc">Download your library data in different formats.</p>

                <div className="sync-cards">
                    <div className="sync-card">
                        <div className="sync-card-header">
                            <div className="sync-card-icon"><FileSpreadsheet size={24} /></div>
                            <div>
                                <h3>CSV (All Metadata)</h3>
                                <p className="sync-card-desc">Export all items with full metadata — titles, IDs, ratings, genres, runtime, and more.</p>
                            </div>
                        </div>
                        <div className="sync-card-actions">
                            <a href="/api/export/csv?format=raw" download className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                                <Download size={14} /> Download CSV
                            </a>
                        </div>
                    </div>

                    <div className="sync-card">
                        <div className="sync-card-header">
                            <div className="sync-card-icon"><Target size={24} /></div>
                            <div>
                                <h3>Trakt Import Format</h3>
                                <p className="sync-card-desc">Export in a Trakt-compatible CSV format for importing into your Trakt account.</p>
                            </div>
                        </div>
                        <div className="sync-card-actions">
                            <a href="/api/export/csv?format=trakt" download className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                                <Download size={14} /> Download Trakt CSV
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Danger Zone */}
            <section className="settings-section danger-section">
                <h2><AlertTriangle size={20} /> Danger Zone</h2>
                <p className="settings-desc">Irreversible actions. Please be careful.</p>

                {!showClearConfirm ? (
                    <button className="btn btn-danger" onClick={() => setShowClearConfirm(true)}>
                        <Trash2 size={16} /> Clear All Library Data
                    </button>
                ) : (
                    <div className="clear-confirm">
                        <p className="clear-warning">
                            <AlertTriangle size={16} /> This will permanently delete all items from your library. This action cannot be undone.
                        </p>
                        <div className="clear-confirm-actions">
                            <button className="btn btn-danger" onClick={handleClearAll} disabled={clearing}>
                                <Trash2 size={16} /> {clearing ? 'Clearing...' : 'Yes, delete everything'}
                            </button>
                            <button className="btn btn-outline" onClick={() => setShowClearConfirm(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

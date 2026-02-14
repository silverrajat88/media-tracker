
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EditModal } from '../components/EditModal';
import { RefreshModal } from '../components/RefreshModal';
import CalendarTab from '../components/CalendarTab';
import type { MediaItem, SearchResult, StatusType } from '../types';
import { STATUS_OPTIONS } from '../types';

const TOKEN_KEY = 'simkl_exporter_token';
const PAGE_SIZES = [12, 24, 48, 96];

export default function HomePage() {
    const navigate = useNavigate();
    const [library, setLibrary] = useState<MediaItem[]>([]);
    const [stats, setStats] = useState({ total: 0, movies: 0, series: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searching, setSearching] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Filters
    const [filterType, setFilterType] = useState('all');
    const [filterYear, setFilterYear] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterGenre, setFilterGenre] = useState('all');
    const [filterSearch, setFilterSearch] = useState('');
    const [sortBy, setSortBy] = useState('title-asc');

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(24);

    // Modals
    const [addingItem, setAddingItem] = useState<SearchResult | null>(null);
    const [addStatus, setAddStatus] = useState<StatusType>('plantowatch');
    const [editingItem, setEditingItem] = useState<MediaItem | null>(null);

    // Simkl import
    const [importing, setImporting] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);

    // Recommendations
    const [activeTab, setActiveTab] = useState<'library' | 'foryou' | 'calendar'>('library');
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [recsLoading, setRecsLoading] = useState(false);

    // ---------- data fetching ----------

    const fetchRecommendations = async () => {
        setRecsLoading(true);
        try {
            const res = await fetch('/api/recommendations');
            if (!res.ok) throw new Error('Failed to fetch recommendations');
            const data = await res.json();
            setRecommendations(data);
        } catch (err: any) {
            console.error(err);
        } finally {
            setRecsLoading(false);
        }
    };

    const fetchLibrary = useCallback(async () => {
        try {
            const res = await fetch('/api/library');
            const data = await res.json();
            setLibrary(data);
        } catch (err: any) {
            setError('Failed to load library');
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/library/stats');
            setStats(await res.json());
        } catch { }
    }, []);

    useEffect(() => {
        Promise.all([fetchLibrary(), fetchStats()]).then(() => setLoading(false));
    }, []);

    const handleRefreshMetadata = async (provider: 'tmdb' | 'rpdb') => {
        setRefreshing(true);
        setShowRefreshModal(false);
        try {
            const res = await fetch('/api/library/metadata/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider }),
            });
            if (!res.ok) throw new Error('Refresh failed');
            const data = await res.json();
            console.log(data.message);

            // Poll for updates
            setTimeout(() => {
                setRefreshing(false);
                fetchLibrary();
            }, 5000);
        } catch (err: any) {
            setError(err.message);
            setRefreshing(false);
        }
    };

    // ---------- search ----------

    const handleSearch = useCallback(async (query: string) => {
        if (query.length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
        setSearching(true);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            setSearchResults(data);
            setShowSearchResults(true);
        } catch (err: any) {
            console.error('Search failed:', err);
        } finally {
            setSearching(false);
        }
    }, []);

    const onSearchInput = (value: string) => {
        setSearchQuery(value);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => handleSearch(value), 350);
    };

    // Close search dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ---------- add to library ----------

    const handleAdd = async () => {
        if (!addingItem) return;
        try {
            const res = await fetch('/api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...addingItem, status: addStatus }),
            });
            if (!res.ok) throw new Error('Failed to add');
            setAddingItem(null);
            setSearchQuery('');
            setSearchResults([]);
            setShowSearchResults(false);
            await Promise.all([fetchLibrary(), fetchStats()]);
        } catch (err: any) {
            setError(err.message);
        }
    };

    // ---------- update item ----------

    const handleUpdate = async (id: string, fields: Partial<MediaItem>) => {
        try {
            const res = await fetch(`/api/library/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields),
            });
            if (!res.ok) throw new Error('Failed to update');
            setEditingItem(null);
            await Promise.all([fetchLibrary(), fetchStats()]);
        } catch (err: any) {
            setError(err.message);
        }
    };

    // ---------- delete item ----------

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/library/${id}`, { method: 'DELETE' });
            setEditingItem(null);
            await Promise.all([fetchLibrary(), fetchStats()]);
        } catch (err: any) {
            setError(err.message);
        }
    };

    // ---------- simkl import ----------

    const simklToken = localStorage.getItem(TOKEN_KEY);

    const handleSimklConnect = async () => {
        try {
            const res = await fetch('/api/auth/simkl-url');
            const data = await res.json();
            window.location.href = data.url;
        } catch (err: any) {
            setError('Could not reach backend');
        }
    };

    // Check for Simkl OAuth callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            window.history.replaceState({}, '', '/');
            (async () => {
                try {
                    const res = await fetch('/api/auth/callback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code }),
                    });
                    if (!res.ok) throw new Error('Auth failed');
                    const data = await res.json();
                    localStorage.setItem(TOKEN_KEY, data.access_token);
                    setShowImport(true);
                } catch (err: any) {
                    setError(err.message);
                }
            })();
        }
    }, []);

    const handleImport = async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        setImporting(true);
        setError(null);
        try {
            const res = await fetch('/api/library/import/simkl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Import failed');
            setShowImport(false);
            await Promise.all([fetchLibrary(), fetchStats()]);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setImporting(false);
        }
    };


    // ---------- filtering ----------

    const years = useMemo(() => {
        const set = new Set<number>();
        library.forEach((i) => { if (i.year) set.add(i.year); });
        return [...set].sort((a, b) => b - a);
    }, [library]);

    const genres = useMemo(() => {
        const set = new Set<string>();
        library.forEach((i) => i.genres?.forEach((g) => set.add(g)));
        return [...set].sort();
    }, [library]);

    const filtered = useMemo(() => {
        let items = library;
        if (filterType !== 'all') items = items.filter((i) => i.type === filterType);
        if (filterYear !== 'all') items = items.filter((i) => i.year === Number(filterYear));
        if (filterStatus !== 'all') items = items.filter((i) => i.status === filterStatus);
        if (filterGenre !== 'all') items = items.filter((i) => i.genres?.includes(filterGenre));
        if (filterSearch) {
            const q = filterSearch.toLowerCase();
            items = items.filter((i) => i.title.toLowerCase().includes(q));
        }
        return items;
    }, [library, filterType, filterYear, filterStatus, filterGenre, filterSearch]);

    // Poster provider preference (local display only)
    const posterProvider = localStorage.getItem('poster_provider') || 'tmdb';
    const getDisplayPoster = (item: MediaItem) => {
        if (posterProvider === 'rpdb' && item.posterRpdb) return item.posterRpdb;
        if (item.posterTmdb) return item.posterTmdb;
        return item.poster;
    };

    // Apply sorting
    const sorted = useMemo(() => {
        const items = [...filtered];
        switch (sortBy) {
            case 'title-asc': items.sort((a, b) => a.title.localeCompare(b.title)); break;
            case 'title-desc': items.sort((a, b) => b.title.localeCompare(a.title)); break;
            case 'year-desc': items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)); break;
            case 'year-asc': items.sort((a, b) => (a.year ?? 0) - (b.year ?? 0)); break;
            case 'rating-desc': items.sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0)); break;
            case 'rating-asc': items.sort((a, b) => (a.userRating ?? 0) - (b.userRating ?? 0)); break;
            case 'added-desc': items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
            case 'added-asc': items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
            case 'runtime-desc': items.sort((a, b) => (b.runtime ?? 0) - (a.runtime ?? 0)); break;
            case 'runtime-asc': items.sort((a, b) => (a.runtime ?? 0) - (b.runtime ?? 0)); break;
        }
        return items;
    }, [filtered, sortBy]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

    useEffect(() => { setPage(1); }, [filterType, filterYear, filterStatus, filterGenre, filterSearch, pageSize, sortBy]);

    // ---------- Animation Variants ----------
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 300, damping: 24 } as any
        }
    };

    const tabVariants = {
        inactive: { borderBottomColor: "rgba(0,0,0,0)", color: "var(--text-secondary)" },
        active: { borderBottomColor: "var(--primary)", color: "var(--primary)" }
    };

    // ---------- render ----------

    if (loading) {
        return (
            <div className="card">
                <h1>Media Tracker</h1>
                <div className="status"><div className="spinner" /><span>Loading library…</span></div>
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="header-left">
                    <motion.div
                        className="logo-container"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <img src="/logo.png" alt="Orbit Logo" className="app-logo" />
                        <h1 className="header-title">Orbit</h1>
                    </motion.div>
                    <div className="header-stats">
                        <span className="header-stat">{stats.movies} movies</span>
                        <span className="header-divider">·</span>
                        <span className="header-stat">{stats.series} series</span>
                        <span className="header-divider">·</span>
                        <span className="header-stat">{stats.total} total</span>
                    </div>
                </div>
                <div className="header-actions">
                    {/* Search */}
                    <div className="search-container" ref={searchRef}>
                        <input
                            className="search-input"
                            type="text"
                            placeholder="Search TMDB / Jikan to add…"
                            value={searchQuery}
                            onChange={(e) => onSearchInput(e.target.value)}
                            onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                            id="search-add-input"
                        />
                        {searching && <div className="search-spinner" />}
                        <AnimatePresence>
                            {showSearchResults && searchResults.length > 0 && (
                                <motion.div
                                    className="search-dropdown"
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {searchResults.map((r, i) => {
                                        const inLibrary = !!r.id;
                                        return (
                                            <div
                                                className="search-result"
                                                key={`${r.tmdbId ?? r.malId ?? i}`}
                                                onClick={() => {
                                                    if (inLibrary) {
                                                        navigate(`/item/${r.id}`);
                                                    } else {
                                                        // Navigate to virtual detail page
                                                        const externId = r.tmdbId ?? r.malId;
                                                        if (externId) {
                                                            navigate(`/item/${r.type}-${externId}`);
                                                        }
                                                    }
                                                    setShowSearchResults(false);
                                                }}
                                            >
                                                {r.poster && <img src={r.poster} alt="" className="search-result-poster" />}
                                                <div className="search-result-info">
                                                    <div className="search-result-title">{r.title}</div>
                                                    <div className="search-result-meta">
                                                        <span className={`type-badge type-${r.type}`}>{r.type}</span>
                                                        {r.year && <span>{r.year}</span>}
                                                        {inLibrary && (
                                                            <span style={{
                                                                marginLeft: 'auto',
                                                                fontSize: '0.75rem',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                background: 'var(--primary)',
                                                                color: 'white'
                                                            }}>
                                                                {r.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <Link to="/settings" className="btn-icon" title="Settings" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                        <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.3 }}>
                            <Settings size={20} />
                        </motion.div>
                    </Link>
                </div>
            </header>

            {error && <div className="error" style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={16} /> {error} <button className="error-dismiss" onClick={() => setError(null)}>✕</button></div>}

            {/* Tabs */}
            <div className="tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['library', 'foryou', 'calendar'].map((tab) => (
                    <motion.button
                        key={tab}
                        className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTab(tab as any);
                            if (tab === 'foryou' && recommendations.length === 0) fetchRecommendations();
                        }}
                        initial="inactive"
                        animate={activeTab === tab ? "active" : "inactive"}
                        variants={tabVariants}
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: '2px solid transparent', // base for animation
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            fontWeight: 600
                        }}
                    >
                        {tab === 'library' && 'Library'}
                        {tab === 'foryou' && 'For You ✨'}
                        {tab === 'calendar' && 'Calendar 📅'}
                    </motion.button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'library' && (
                    <motion.div
                        key="library"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Filters */}
                        <div className="filters-bar">
                            <input
                                className="filter-search"
                                type="text"
                                placeholder="Filter titles…"
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                            />
                            <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                                <option value="all">All Types</option>
                                <option value="movie">Movie</option>
                                <option value="show">Show</option>
                                <option value="anime">Anime</option>
                            </select>
                            <select className="filter-select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                                <option value="all">All Years</option>
                                {years.map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                                <option value="all">All Statuses</option>
                                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <select className="filter-select" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
                                <option value="all">All Genres</option>
                                {genres.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                                <option value="title-asc">Title A→Z</option>
                                <option value="title-desc">Title Z→A</option>
                                <option value="year-desc">Year (Newest)</option>
                                <option value="year-asc">Year (Oldest)</option>
                                <option value="rating-desc">Rating (Highest)</option>
                                <option value="rating-asc">Rating (Lowest)</option>
                                <option value="added-desc">Recently Added</option>
                                <option value="added-asc">Oldest Added</option>
                                <option value="runtime-desc">Runtime (Longest)</option>
                                <option value="runtime-asc">Runtime (Shortest)</option>
                            </select>
                        </div>

                        {/* Results info */}
                        <div className="results-info">
                            <span>{sorted.length} titles</span>
                            <span className="results-page-info">Page {safePage} of {totalPages}</span>
                        </div>

                        {/* Media grid */}
                        <motion.div
                            className="media-grid"
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            {paginated.map((item) => (
                                <motion.div
                                    className="media-card"
                                    key={item.id}
                                    onClick={() => navigate('/item/' + item.id)}
                                    variants={itemVariants}
                                    whileHover={{ scale: 1.05, zIndex: 10 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                >
                                    <div className="media-poster">
                                        {getDisplayPoster(item) ? (
                                            <img src={getDisplayPoster(item)!} alt={item.title} loading="lazy" />
                                        ) : (
                                            <div className="media-poster-placeholder">🎬</div>
                                        )}
                                        {item.userRating && <div className="media-rating">★ {item.userRating}</div>}
                                        <div className={`media-type-badge media-type-${item.type}`}>{item.type}</div>
                                    </div>
                                    <div className="media-info">
                                        <div className="media-title" title={item.title}>{item.title}</div>
                                        <div className="media-meta">
                                            {item.year && <span>{item.year}</span>}
                                            {item.runtime && <span>{item.runtime}m</span>}
                                        </div>
                                        {item.genres?.length > 0 && <div className="media-genres">{item.genres.join(', ')}</div>}
                                        <div className={`media-status media-status-${item.status}`}>{item.status}</div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>

                        {filtered.length === 0 && !loading && (
                            <div className="empty-state">
                                {library.length === 0
                                    ? <>Your library is empty. Search above to add titles, or import from Simkl.</>
                                    : <>No titles match your filters.</>
                                }
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="pagination">
                                <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(1)}>⟨⟨</button>
                                <button className="page-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>⟨</button>
                                <span className="page-info">{safePage} / {totalPages}</span>
                                <button className="page-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>⟩</button>
                                <button className="page-btn" disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>⟩⟩</button>
                                <select className="page-size-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} per page</option>)}
                                </select>
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === 'foryou' && (
                    <motion.div
                        key="foryou"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="media-grid"
                    >
                        {recsLoading && <div className="spinner" style={{ margin: '2rem auto' }} />}
                        {!recsLoading && recommendations.length === 0 && (
                            <div className="empty-state">
                                No recommendations yet. Build your library or add a Gemini API Key to prompt the AI!
                            </div>
                        )}
                        {recommendations.map((item: any) => (
                            <motion.div
                                className="media-card"
                                key={item.id}
                                onClick={() => navigate('/item/' + item.id)}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ scale: 1.05 }}
                            >
                                <div className="media-poster">
                                    {item.poster ? (
                                        <img src={item.poster} alt={item.title} loading="lazy" />
                                    ) : (
                                        <div className="media-poster-placeholder">🔮</div>
                                    )}
                                    <div className={`media-type-badge media-type-${item.type}`}>{item.type}</div>
                                </div>
                                <div className="media-info">
                                    <div className="media-title" title={item.title}>{item.title}</div>
                                    <div className="media-meta">
                                        {item.year && <span>{item.year}</span>}
                                    </div>
                                    {item.reason && (
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: 'var(--primary)',
                                            marginTop: '0.5rem',
                                            fontStyle: 'italic',
                                            background: 'rgba(139, 92, 246, 0.1)',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px'
                                        }}>
                                            {item.reason}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}

                {activeTab === 'calendar' && (
                    <motion.div
                        key="calendar"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <CalendarTab />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Modal */}
            {addingItem && (
                <div className="modal-overlay" onClick={() => setAddingItem(null)}>
                    <motion.div
                        className="modal"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <div className="modal-header">
                            <h2>Add to Library</h2>
                            <button className="btn-icon btn-icon-muted" onClick={() => setAddingItem(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-media">
                                {addingItem.poster && <img src={addingItem.poster} alt="" className="modal-poster" />}
                                <div>
                                    <h3>{addingItem.title}</h3>
                                    <p className="modal-meta">
                                        <span className={`type-badge type-${addingItem.type}`}>{addingItem.type}</span>
                                        {addingItem.year && <span>{addingItem.year}</span>}
                                        {addingItem.runtime && <span>{addingItem.runtime}m</span>}
                                    </p>
                                    {addingItem.overview && <p className="modal-overview">{addingItem.overview}</p>}
                                </div>
                            </div>
                            <div className="modal-field">
                                <label>Status</label>
                                <select value={addStatus} onChange={(e) => setAddStatus(e.target.value as StatusType)}>
                                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add to Library</button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Edit Modal */}
            {editingItem && (
                <EditModal
                    item={editingItem}
                    onClose={() => setEditingItem(null)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                />
            )}

            {/* Import Modal */}
            {showImport && (
                <div className="modal-overlay" onClick={() => !importing && setShowImport(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Import from Simkl</h2>
                            <button className="btn-icon btn-icon-muted" onClick={() => !importing && setShowImport(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {simklToken ? (
                                <p>Connected to Simkl. This will import all your watch history into your local library.</p>
                            ) : (
                                <p>Connect to Simkl to import your watch history.</p>
                            )}
                            {importing && (
                                <div className="status" style={{ marginTop: '1rem' }}><div className="spinner" /><span>Importing from Simkl…</span></div>
                            )}
                        </div>
                        <div className="modal-actions">
                            {simklToken ? (
                                <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>
                                    {importing ? 'Importing…' : '📥 Import All'}
                                </button>
                            ) : (
                                <button className="btn btn-primary btn-sm" onClick={handleSimklConnect}>🔗 Connect to Simkl</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {showRefreshModal && (
                <RefreshModal
                    onClose={() => setShowRefreshModal(false)}
                    onConfirm={handleRefreshMetadata}
                    refreshing={refreshing}
                />
            )}
        </div>
    );
}

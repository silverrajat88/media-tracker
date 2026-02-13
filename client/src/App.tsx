import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './App.css';

/* ---------- types ---------- */

interface MediaItem {
  id: string;
  type: 'movie' | 'show' | 'anime';
  title: string;
  year: number | null;
  status: string;
  userRating: number | null;
  watchedAt: string | null;
  memo: string | null;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  malId: number | null;
  simklId: number | null;
  poster: string | null;
  genres: string[];
  runtime: number | null;
  overview: string | null;
  certification: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  type: 'movie' | 'show' | 'anime';
  title: string;
  year: number | null;
  overview: string | null;
  poster: string | null;
  genres: string[];
  runtime: number | null;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  malId: number | null;
}

interface ExportFormat { id: string; label: string; }

type StatusType = 'completed' | 'watching' | 'plantowatch' | 'hold' | 'dropped';

const TOKEN_KEY = 'simkl_exporter_token';
const PAGE_SIZES = [12, 24, 48, 96];
const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'watching', label: 'Watching' },
  { value: 'plantowatch', label: 'Plan to Watch' },
  { value: 'hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
];

/* ---------- App ---------- */

function App() {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState({ total: 0, movies: 0, series: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('raw');

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

  // ... (data fetching)

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

  // ---------- data fetching ----------

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
    fetch('/api/formats')
      .then((r) => r.json())
      .then((data) => { setFormats(data); if (data.length > 0) setSelectedFormat(data[0].id); })
      .catch(() => { });
  }, []);

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

  // ---------- export ----------

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/export/csv?format=${selectedFormat}`);
      if (!res.ok) throw new Error('Export failed');
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media_library_${selectedFormat}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [filterType, filterYear, filterStatus, filterGenre, filterSearch, pageSize]);

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
          <h1 className="header-title">Media Tracker</h1>
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
            {showSearchResults && searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map((r, i) => (
                  <div
                    className="search-result"
                    key={`${r.tmdbId ?? r.malId ?? i}`}
                    onClick={() => { setAddingItem(r); setShowSearchResults(false); }}
                  >
                    {r.poster && <img src={r.poster} alt="" className="search-result-poster" />}
                    <div className="search-result-info">
                      <div className="search-result-title">{r.title}</div>
                      <div className="search-result-meta">
                        <span className={`type-badge type-${r.type}`}>{r.type}</span>
                        {r.year && <span>{r.year}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn-icon" onClick={() => setShowRefreshModal(true)} title="Refresh Metadata" disabled={refreshing}>
            {refreshing ? <div className="spinner" style={{ width: 14, height: 14, borderTopColor: 'currentColor' }} /> : '🔄'}
          </button>
          <button className="btn-icon" onClick={() => setShowImport(true)} title="Import from Simkl" id="import-btn">📥</button>
          <select className="format-dropdown-sm" value={selectedFormat} onChange={(e) => setSelectedFormat(e.target.value)}>
            {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button className="btn btn-success btn-sm" onClick={handleExport} id="export-btn">⬇ Export</button>
        </div>
      </header>

      {error && <div className="error" style={{ margin: '0 0 1rem' }}>⚠️ {error} <button className="error-dismiss" onClick={() => setError(null)}>✕</button></div>}

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
      </div>

      {/* Results info */}
      <div className="results-info">
        <span>{filtered.length} titles</span>
        <span className="results-page-info">Page {safePage} of {totalPages}</span>
      </div>

      {/* Media grid */}
      <div className="media-grid">
        {paginated.map((item) => (
          <div className="media-card" key={item.id} onClick={() => setEditingItem(item)}>
            <div className="media-poster">
              {item.poster ? (
                <img src={item.poster} alt={item.title} loading="lazy" />
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
          </div>
        ))}
      </div>

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

      {/* Add Modal */}
      {addingItem && (
        <div className="modal-overlay" onClick={() => setAddingItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
          </div>
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

/* ---------- Edit Modal Component ---------- */

function RefreshModal({ onClose, onConfirm, refreshing }: { onClose: () => void; onConfirm: (provider: 'tmdb' | 'rpdb') => void; refreshing: boolean }) {
  const [provider, setProvider] = useState<'tmdb' | 'rpdb'>('tmdb');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2>Refresh Metadata</h2>
          <button className="btn-icon btn-icon-muted" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            Choose a source for your posters. This will run in the background.
          </p>

          <div className="modal-field">
            <label>Poster Source</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value as any)}>
              <option value="tmdb">TMDB (High Quality, Standard)</option>
              <option value="rpdb">RPDB (With Ratings via RPDB_API_KEY)</option>
            </select>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {provider === 'rpdb'
              ? 'Requires RPDB_API_KEY in .env. Overlays ratings on posters.'
              : 'Uses official TMDB posters via their API.'}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={() => onConfirm(provider)} disabled={refreshing}>
            {refreshing ? 'Starting...' : 'Start Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ item, onClose, onUpdate, onDelete }: {
  item: MediaItem;
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<MediaItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [rating, setRating] = useState(item.userRating?.toString() ?? '');
  const [memo, setMemo] = useState(item.memo ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Item</h2>
          <button className="btn-icon btn-icon-muted" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-media">
            {item.poster && <img src={item.poster} alt="" className="modal-poster" />}
            <div>
              <h3>{item.title}</h3>
              <p className="modal-meta">
                <span className={`type-badge type-${item.type}`}>{item.type}</span>
                {item.year && <span>{item.year}</span>}
                {item.runtime && <span>{item.runtime}m</span>}
              </p>
              {item.genres?.length > 0 && <p className="modal-genres">{item.genres.join(', ')}</p>}
              {item.overview && <p className="modal-overview">{item.overview}</p>}
            </div>
          </div>
          <div className="modal-field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="modal-field">
            <label>Rating (1-10)</label>
            <input type="number" min="1" max="10" step="0.5" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="—" />
          </div>
          <div className="modal-field">
            <label>Notes</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Add a note…" rows={2} />
          </div>
        </div>
        <div className="modal-actions">
          {confirmDelete ? (
            <>
              <span className="delete-confirm-text">Are you sure?</span>
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(item.id)}>Yes, Delete</button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(false)} style={{ background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>🗑 Delete</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onUpdate(item.id, {
                  status: status as any,
                  userRating: rating ? Number(rating) : null,
                  memo: memo || null,
                })}
              >Save Changes</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

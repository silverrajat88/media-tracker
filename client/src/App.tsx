import { useEffect, useState, useCallback, useMemo } from 'react';
import './App.css';

/* ---------- types ---------- */

type AppState = 'idle' | 'authenticating' | 'authenticated' | 'loading' | 'ready' | 'exporting' | 'error';

interface SimklRow {
  Type: string;
  Title: string;
  Year: string;
  Season: string;
  Episode: string;
  EpisodeTitle: string;
  WatchedAt: string;
  UserRating: string;
  Status: string;
  Memo: string;
  IMDB: string;
  TMDB: string;
  TVDB: string;
  SimklID: string;
  Slug: string;
  Poster: string;
  Genres: string;
  Runtime: string;
  Certification: string;
  Country: string;
}

interface ExportFormat {
  id: string;
  label: string;
}

const TOKEN_KEY = 'simkl_exporter_token';
const PAGE_SIZES = [12, 24, 48, 96];

/* ---------- helpers ---------- */

/** Get unique sorted values for a field from the data */
function uniqueValues(data: SimklRow[], field: keyof SimklRow): string[] {
  const set = new Set<string>();
  for (const row of data) {
    const val = row[field];
    if (val) set.add(val);
  }
  return [...set].sort();
}

/** Deduplicate by Title+Year to get unique titles (not episodes) */
function getUniqueTitles(data: SimklRow[]): SimklRow[] {
  const seen = new Map<string, SimklRow>();
  for (const row of data) {
    const key = `${row.Title}::${row.Year}::${row.Type === 'episode' ? 'show' : row.Type}`;
    if (!seen.has(key)) {
      seen.set(key, {
        ...row,
        Type: row.Type === 'episode' ? 'show' : row.Type,
      });
    }
  }
  return [...seen.values()];
}

/* ---------- component ---------- */

function App() {
  const [state, setState] = useState<AppState>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allData, setAllData] = useState<SimklRow[]>([]);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('raw');

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterGenre, setFilterGenre] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // On mount: check localStorage for token, check URL for code, fetch formats
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const savedToken = localStorage.getItem(TOKEN_KEY);

    if (code) {
      window.history.replaceState({}, '', '/');
      handleOAuthCode(code);
    } else if (savedToken) {
      setToken(savedToken);
      setState('authenticated');
    }

    fetch('/api/formats')
      .then((r) => r.json())
      .then((data) => {
        setFormats(data);
        if (data.length > 0) setSelectedFormat(data[0].id);
      })
      .catch(() => { });
  }, []);

  // Auto-fetch data when authenticated and no data loaded
  useEffect(() => {
    if (state === 'authenticated' && token && allData.length === 0) {
      fetchData();
    }
  }, [state, token]);

  const handleOAuthCode = async (code: string) => {
    setState('authenticating');
    setError(null);
    try {
      const res = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to authenticate');
      }
      const data = await res.json();
      const accessToken = data.access_token;
      setToken(accessToken);
      localStorage.setItem(TOKEN_KEY, accessToken);
      setState('authenticated');
    } catch (err: any) {
      setError(err.message);
      setState('error');
    }
  };

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/auth/simkl-url');
      const data = await res.json();
      window.location.href = data.url;
    } catch (err: any) {
      setError('Could not reach backend. Is the server running?');
      setState('error');
    }
  };

  const fetchData = useCallback(async () => {
    if (!token) return;
    setState('loading');
    setError(null);
    try {
      const res = await fetch(`/api/data?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch data');
      }
      const data: SimklRow[] = await res.json();
      setAllData(data);
      setState('ready');
    } catch (err: any) {
      setError(err.message);
      setState('error');
    }
  }, [token]);

  const handleDisconnect = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAllData([]);
    setState('idle');
  };

  const handleExport = useCallback(async () => {
    if (!token) return;
    setState('exporting');
    setError(null);
    try {
      const res = await fetch(`/api/export/csv?token=${encodeURIComponent(token)}&format=${selectedFormat}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simkl_export_${selectedFormat}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setState('ready');
    } catch (err: any) {
      setError(err.message);
      setState('error');
    }
  }, [token, selectedFormat]);

  // Derived data: unique titles (deduplicated from episodes)
  const titles = useMemo(() => getUniqueTitles(allData), [allData]);

  // Filter options
  const years = useMemo(() => uniqueValues(titles, 'Year'), [titles]);
  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const row of titles) {
      if (row.Genres) row.Genres.split(', ').forEach((g) => set.add(g));
    }
    return [...set].sort();
  }, [titles]);
  const statuses = useMemo(() => uniqueValues(titles, 'Status'), [titles]);
  const types = useMemo(() => uniqueValues(titles, 'Type'), [titles]);

  // Filtered + paginated
  const filtered = useMemo(() => {
    let items = titles;
    if (filterType !== 'all') items = items.filter((r) => r.Type === filterType);
    if (filterYear !== 'all') items = items.filter((r) => r.Year === filterYear);
    if (filterStatus !== 'all') items = items.filter((r) => r.Status === filterStatus);
    if (filterGenre !== 'all') items = items.filter((r) => r.Genres.includes(filterGenre));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((r) => r.Title.toLowerCase().includes(q));
    }
    return items;
  }, [titles, filterType, filterYear, filterStatus, filterGenre, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [filterType, filterYear, filterStatus, filterGenre, searchQuery, pageSize]);

  // Stats
  const movieCount = titles.filter((r) => r.Type === 'movie').length;
  const seriesCount = titles.filter((r) => r.Type === 'show' || r.Type === 'anime').length;

  /* ---------- render ---------- */

  // Landing / Connect
  if (state === 'idle' || (state === 'error' && !token)) {
    return (
      <div className="card">
        <div className="icon-row">
          <div className="icon-badge">🎬</div>
          <span className="icon-arrow">→</span>
          <div className="icon-badge">📁</div>
        </div>
        <h1>Simkl Exporter</h1>
        <p>Export your Simkl watch history as a CSV file.</p>
        <p className="subtitle">Connect to Simkl, browse your library, and download your data.</p>
        <button className="btn btn-primary" onClick={handleConnect} id="connect-btn">
          🔗 Connect to Simkl
        </button>
        {error && <div className="error">⚠️ {error}</div>}
      </div>
    );
  }

  // Authenticating
  if (state === 'authenticating') {
    return (
      <div className="card">
        <h1>Simkl Exporter</h1>
        <div className="status"><div className="spinner" /><span>Authenticating with Simkl…</span></div>
      </div>
    );
  }

  // Loading data
  if (state === 'loading') {
    return (
      <div className="card">
        <h1>Simkl Exporter</h1>
        <div className="status"><div className="spinner" /><span>Fetching your watch history…</span></div>
        <p className="subtitle" style={{ marginTop: '1rem' }}>This may take a moment for large libraries.</p>
      </div>
    );
  }

  // Exporting
  if (state === 'exporting') {
    return (
      <div className="card">
        <h1>Simkl Exporter</h1>
        <div className="status"><div className="spinner" /><span>Generating CSV…</span></div>
      </div>
    );
  }

  // Main view: ready with data
  return (
    <div className="app-container">
      {/* Header bar */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="header-title">Simkl Exporter</h1>
          <div className="header-stats">
            <span className="header-stat">{movieCount} movies</span>
            <span className="header-divider">·</span>
            <span className="header-stat">{seriesCount} series</span>
            <span className="header-divider">·</span>
            <span className="header-stat">{allData.length} total rows</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-icon" onClick={fetchData} title="Refresh data" id="refresh-btn">↻</button>
          <select
            className="format-dropdown-sm"
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
          >
            {formats.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <button className="btn btn-success btn-sm" onClick={handleExport} id="export-btn">⬇ Export CSV</button>
          <button className="btn-icon btn-icon-muted" onClick={handleDisconnect} title="Disconnect">✕</button>
        </div>
      </header>

      {error && <div className="error" style={{ margin: '0 1.5rem' }}>⚠️ {error}</div>}

      {/* Filters bar */}
      <div className="filters-bar">
        <input
          className="filter-search"
          type="text"
          placeholder="Search titles…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          id="search-input"
        />
        <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select className="filter-select" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
          <option value="all">All Years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select className="filter-select" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
          <option value="all">All Genres</option>
          {genres.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* Results count */}
      <div className="results-info">
        <span>{filtered.length} titles</span>
        <span className="results-page-info">
          Page {safePage} of {totalPages}
        </span>
      </div>

      {/* Media grid */}
      <div className="media-grid">
        {paginated.map((item, i) => (
          <div className="media-card" key={`${item.SimklID}-${i}`}>
            <div className="media-poster">
              {item.Poster ? (
                <img src={item.Poster} alt={item.Title} loading="lazy" />
              ) : (
                <div className="media-poster-placeholder">🎬</div>
              )}
              {item.UserRating && (
                <div className="media-rating">★ {item.UserRating}</div>
              )}
              <div className={`media-type-badge media-type-${item.Type}`}>
                {item.Type}
              </div>
            </div>
            <div className="media-info">
              <div className="media-title" title={item.Title}>{item.Title}</div>
              <div className="media-meta">
                {item.Year && <span>{item.Year}</span>}
                {item.Runtime && <span>{item.Runtime}m</span>}
                {item.Certification && <span>{item.Certification}</span>}
              </div>
              {item.Genres && (
                <div className="media-genres">{item.Genres}</div>
              )}
              <div className={`media-status media-status-${item.Status}`}>
                {item.Status}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">No titles match your filters.</div>
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
    </div>
  );
}

export default App;

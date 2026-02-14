import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, Clock, Calendar, Globe,
  Pencil, Plus, User, ChevronRight, Play, Copy
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { MediaItem } from '../types';
import { EditModal } from '../components/EditModal';

interface DetailData extends MediaItem {
  backdrop?: string | null;
  voteAverage?: number;
  voteCount?: number;
  cast?: { id: number; name: string; character: string; profile: string | null }[];
  recommendations?: { tmdbId: number; title: string; poster: string | null; year: number | null }[];
  director?: string | null;
}

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Get poster provider preference
  const posterProvider = localStorage.getItem('poster_provider') || 'tmdb';

  const getDisplayPoster = (item: any) => {
    if (posterProvider === 'rpdb' && item.posterRpdb) return item.posterRpdb;
    if (item.posterTmdb) return item.posterTmdb;
    return item.poster;
  };

  const fetchData = () => {
    setLoading(true);
    fetch(`/api/library/${id}/details`)
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(setData)
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (id) fetchData();
  }, [id, navigate]);

  const handleUpdate = async (itemId: string, fields: Partial<MediaItem>) => {
    try {
      if (itemId === 'virtual' && data) {
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, ...fields }),
        });
        if (!res.ok) throw new Error('Failed to add to library');
        const newItem = await res.json();
        setEditing(false);
        navigate(`/item/${newItem.id}`, { replace: true });
      } else {
        const res = await fetch(`/api/library/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error('Failed to update');
        setEditing(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update item');
    }
  };

  const handleDelete = async (itemId: string) => {
    if (itemId === 'virtual') {
      setEditing(false);
      return;
    }
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await fetch(`/api/library/${itemId}`, { method: 'DELETE' });
      navigate('/');
    } catch (err) {
      console.error(err);
      alert('Failed to delete item');
    }
  };

  if (loading || !data) return <div className="app-container"><div className="spinner"></div></div>;

  const isVirtual = data.id === 'virtual';
  const displayPoster = getDisplayPoster(data);

  const statusLabels: Record<string, string> = {
    completed: 'Completed',
    watching: 'Watching',
    plantowatch: 'Plan to Watch',
    hold: 'On Hold',
    dropped: 'Dropped',
  };

  const statusColors: Record<string, string> = {
    completed: '#22c55e',
    watching: '#3b82f6',
    plantowatch: '#a855f7',
    hold: '#f59e0b',
    dropped: '#ef4444',
  };

  return (
    <div className="detail-page" style={{
      minHeight: '100vh',
      background: 'var(--bg-app)',
      color: 'white',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Backdrop */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '70vh',
        backgroundImage: `url(${data.backdrop || displayPoster})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        opacity: 0.2,
        maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
        zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '3rem 2rem' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '2rem', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
            padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
            fontSize: '0.9rem', transition: 'all 0.2s'
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '3rem',
          alignItems: 'start'
        }}>
          {/* Left Column: Poster & Actions */}
          <div style={{ flex: '1 1 240px', maxWidth: '300px', width: '100%', margin: '0 auto' }}>
            <div style={{
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              aspectRatio: '2/3',
              marginBottom: '1.5rem',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <img src={displayPoster || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setEditing(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                  width: '100%', padding: '0.75rem', fontSize: '0.95rem', marginBottom: '0.5rem',
                  background: isVirtual ? '#22c55e' : 'var(--primary)', color: '#fff',
                  border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600,
                  transition: 'filter 0.2s'
                }}
              >
                {isVirtual ? <><Plus size={18} /> Add to Library</> : <><Pencil size={16} /> Edit Details</>}
              </motion.button>
            </div>
          </div>

          {/* Right Column: Info */}
          <div style={{ flex: '1 1 300px', minWidth: '0' }}>
            {/* Title */}
            <h1 style={{
              fontSize: '3rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '0.75rem',
              letterSpacing: '-0.02em'
            }}>
              {data.title}
            </h1>

            {/* Meta line */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.95rem',
              color: 'var(--text-muted)', marginBottom: '2rem', flexWrap: 'wrap'
            }}>
              {data.year && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Calendar size={14} /> {data.year}
                </span>
              )}
              {data.runtime && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Clock size={14} /> {data.runtime} min
                </span>
              )}
              {data.certification && (
                <span style={{
                  padding: '0.15rem 0.5rem', borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.8rem',
                  fontWeight: 600, letterSpacing: '0.5px'
                }}>
                  {data.certification}
                </span>
              )}
              {(data.director || data.director) && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <User size={14} /> {data.director}
                </span>
              )}
              {data.country && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Globe size={14} /> {data.country}
                </span>
              )}
              <span className={`type-badge type-${data.type}`} style={{ fontSize: '0.8rem' }}>{data.type}</span>
            </div>

            {/* Genres */}
            {data.genres && data.genres.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                {data.genres.map(g => (
                  <span key={g} style={{
                    fontSize: '0.75rem', padding: '0.2rem 0.6rem',
                    borderRadius: '12px', background: 'rgba(255,255,255,0.1)',
                    color: 'var(--text-secondary)'
                  }}>
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Simple Stats & Status Control */}
            <div style={{
              display: 'flex', gap: '0.8rem',
              marginBottom: '2rem', flexWrap: 'wrap'
            }}>
              {/* TMDB Score */}
              <div style={{
                padding: '0.6rem 0.9rem', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '1.1rem', fontWeight: 700 }}>
                  <Star size={16} style={{ color: '#f59e0b' }} />
                  {data.voteAverage ? data.voteAverage.toFixed(1) : '—'}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TMDB</div>
              </div>

              {/* User Rating */}
              <div style={{
                padding: '0.6rem 0.9rem', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '80px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '1.1rem', fontWeight: 700 }}>
                  <Star size={16} style={{ color: 'var(--primary)' }} />
                  {data.userRating || '—'}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Yo</div>
              </div>

              {/* Status Dropdown */}
              <div style={{ position: 'relative' }}>
                <select
                  value={data.status}
                  onChange={(e) => handleUpdate(data.id, { status: e.target.value as any })}
                  style={{
                    appearance: 'none', height: '100%', padding: '0 2.5rem 0 1rem', width: '160px',
                    background: `${statusColors[data.status]}20`,
                    border: `1px solid ${statusColors[data.status]}40`,
                    color: statusColors[data.status],
                    fontSize: '0.9rem', fontWeight: 600, borderRadius: '10px', cursor: 'pointer',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(statusColors[data.status])}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center'
                  }}
                >
                  {Object.entries(statusLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* External Search Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
              <a
                href={`https://web.stremio.com/#/search?search=${encodeURIComponent(data.title + ' ' + (data.year || ''))}`}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1.2rem',
                  borderRadius: '12px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', color: 'white', textDecoration: 'none',
                  fontSize: '0.95rem', fontWeight: 600, transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <img src="/assets/stremio.png" alt="Stremio" style={{ width: 20, height: 20, borderRadius: '4px' }} />
                Stremio
              </a>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(data.title)}`}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1.2rem',
                  borderRadius: '12px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', color: 'white', textDecoration: 'none',
                  fontSize: '0.95rem', fontWeight: 600, transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <img src="/assets/youtube.png" alt="YouTube" style={{ width: 20, height: 20, borderRadius: '4px' }} />
                YouTube
              </a>
              <a
                href={`https://www.imdb.com/find/?q=${encodeURIComponent(data.title)}`}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1.2rem',
                  borderRadius: '12px', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', color: 'white', textDecoration: 'none',
                  fontSize: '0.95rem', fontWeight: 600, transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <img src="/assets/imdb.png" alt="IMDb" style={{ width: 20, height: 20, borderRadius: '4px' }} />
                IMDb
              </a>
            </div>

            {/* Overview */}
            {data.overview && (
              <p style={{
                fontSize: '1.1rem', lineHeight: 1.7, color: 'var(--text-secondary)',
                marginBottom: '2.5rem', maxWidth: '700px'
              }}>
                {data.overview}
              </p>
            )}

            {/* Genres */}
            {data.genres.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
                {data.genres.map(g => (
                  <span key={g} style={{
                    padding: '0.35rem 0.9rem', borderRadius: '100px',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: '0.85rem', color: 'var(--text-secondary)'
                  }}>{g}</span>
                ))}
              </div>
            )}

            {/* Cast */}
            {data.cast && data.cast.length > 0 && (
              <div style={{ marginBottom: '2.5rem' }}>
                <h3 style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '1rem', fontWeight: 600,
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '1px', fontSize: '0.8rem'
                }}>
                  <User size={14} /> Top Cast
                </h3>
                <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  {data.cast.map(c => (
                    <div key={c.id} style={{ minWidth: '90px', textAlign: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: '72px', height: '72px', borderRadius: '50%',
                        overflow: 'hidden', margin: '0 auto 0.5rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: '2px solid rgba(255,255,255,0.08)'
                      }}>
                        {c.profile ? (
                          <img src={c.profile} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={24} style={{ opacity: 0.3 }} />
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3 }}>{c.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{c.character}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {data.recommendations && data.recommendations.length > 0 && (
              <div>
                <h3 style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '1rem', textTransform: 'uppercase',
                  letterSpacing: '1px', fontSize: '0.8rem',
                  fontWeight: 600, color: 'var(--text-muted)'
                }}>
                  <ChevronRight size={14} /> Similar Titles
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                  {data.recommendations.map(r => (
                    <div
                      key={r.tmdbId}
                      style={{
                        minWidth: '150px', cursor: 'pointer', flexShrink: 0,
                        transition: 'transform 0.2s', width: '150px'
                      }}
                      onClick={() => navigate(`/item/${data.type === 'movie' ? 'movie' : 'show'}-${r.tmdbId}`)}
                    >
                      <img
                        src={r.poster || ''}
                        style={{
                          width: '100%', borderRadius: '10px',
                          aspectRatio: '2/3', background: 'rgba(255,255,255,0.05)',
                          objectFit: 'cover', border: '1px solid rgba(255,255,255,0.06)'
                        }}
                      />
                      <div style={{
                        fontSize: '0.6rem', marginTop: '0.3rem',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis', color: 'var(--text-secondary)',
                        textAlign: 'center'
                      }}>{r.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Streaming Section */}
            {!isVirtual && data.imdbId && (
              <StreamingSection
                imdbId={data.imdbId}
                type={data.type as 'movie' | 'show'}
                title={data.title}
                seasons={data.type === 'show' ? 1 : undefined} // Simple season support for now
              />
            )}

          </div>
        </div>
      </div>

      {
        editing && data && (
          <EditModal
            item={data}
            onClose={() => setEditing(false)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            mode={isVirtual ? 'create' : 'edit'}
          />
        )
      }
    </div >
  );
}



// ---------- Streaming Component ----------

function StreamingSection({ imdbId, type, title: _title, seasons: _seasons }: { imdbId: string, type: 'movie' | 'show', title: string, seasons?: number }) {
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // For shows: Season/Episode selection
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);

  useEffect(() => {
    fetchStreams();
  }, [imdbId, type, season, episode]);

  const fetchStreams = async () => {
    setLoading(true);
    setError(null);
    setStreams([]);

    // Construct query
    let url = `/api/stream/search/${imdbId}`;
    if (type === 'show') {
      url += `?season=${season}&episode=${episode}`;
    }

    try {
      const res = await fetch(url);
      if (res.status === 401) {
        setError('Real-Debrid Token missing in Settings');
        return;
      }
      const data = await res.json();
      // Combine cloud and magnets, present nicely
      // For now just show magnets
      setStreams(data.magnets || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load streams');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (stream: any, player: 'browser' | 'copy') => {
    if (resolving) return;
    setResolving(stream.infoHash);

    try {
      // 1. Resolve Magnet -> Direct Link
      const res = await fetch('/api/stream/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: stream.magnet })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to resolve link');

      // 2. Play or Copy
      if (player === 'browser') {
        const isPlayable = data.mime?.startsWith('video/mp4') || data.mime?.startsWith('video/webm');
        if (isPlayable) {
          setPlayUrl(data.link);
        } else {
          // Fallback to new tab for download/external
          window.open(data.link, '_blank');
        }
      } else if (player === 'copy') {
        await navigator.clipboard.writeText(data.link);
        alert('Stream link copied to clipboard!');
      }

    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
    } finally {
      setResolving(null);
    }
  };

  return (
    <div style={{ marginTop: '3rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <Globe size={20} /> Streaming Sources
      </h3>

      {/* Show Controls */}
      {type === 'show' && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="input-group">
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Season</label>
            <input
              type="number" min="1" value={season}
              onChange={e => setSeason(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem', color: 'white', borderRadius: '6px', width: '60px' }}
            />
          </div>
          <div className="input-group">
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Episode</label>
            <input
              type="number" min="1" value={episode}
              onChange={e => setEpisode(Number(e.target.value))}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.5rem', color: 'white', borderRadius: '6px', width: '60px' }}
            />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#fca5a5', marginBottom: '1rem' }}>
          {error} {(error.includes('Token') ? <a href="/settings" style={{ textDecoration: 'underline', color: 'inherit' }}>Go to Settings</a> : '')}
        </div>
      )}

      {loading && <div className="spinner" style={{ marginBottom: '2rem' }}></div>}

      {!loading && !error && streams.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No streams found via Torrentio.</div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {streams.map((stream, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1rem', background: 'rgba(255,255,255,0.03)',
            borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)',
            flexWrap: 'wrap', gap: '0.8rem'
          }}>
            <div style={{ minWidth: '0', flex: 1, marginRight: '0.5rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
                {stream.quality} <span style={{ opacity: 0.5 }}>•</span> {stream.size} <span style={{ opacity: 0.5 }}>•</span> {stream.seeds}👤
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', wordBreak: 'break-all', lineHeight: '1.4' }}>
                {stream.title}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePlay(stream, 'browser')}
                disabled={!!resolving}
                style={{
                  padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem',
                  background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer',
                  opacity: resolving === stream.infoHash ? 0.7 : 1,
                  whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}
              >
                {resolving === stream.infoHash ? 'Unlocking...' : <><Play size={14} fill="currentColor" /> Play</>}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePlay(stream, 'copy')}
                disabled={!!resolving}
                style={{
                  padding: '0.4rem', borderRadius: '6px', fontSize: '0.8rem',
                  background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: 'pointer'
                }}
                title="Copy Stream Link"
              >
                <Copy size={16} />
              </motion.button>
            </div>
          </div>
        ))}
      </div>

      {/* Video Modal */}
      {playUrl && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.95)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setPlayUrl(null)}>
          <div style={{ width: '90%', maxWidth: '1200px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPlayUrl(null)}
              style={{
                position: 'absolute', top: '-40px', right: 0,
                background: 'none', border: 'none', color: 'white', cursor: 'pointer'
              }}
            >Close ✕</button>
            <video
              src={playUrl}
              controls
              autoPlay
              style={{ width: '100%', borderRadius: '12px', boxShadow: '0 0 50px rgba(0,0,0,0.5)' }}
            />
            <div style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              If video doesn't play, it might be an MKV file (not supported by browsers). Use the Copy Link button and open in VLC.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';

interface RefreshModalProps {
    onClose: () => void;
    onConfirm: (provider: 'tmdb' | 'rpdb') => void;
    refreshing: boolean;
}

export function RefreshModal({ onClose, onConfirm, refreshing }: RefreshModalProps) {
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

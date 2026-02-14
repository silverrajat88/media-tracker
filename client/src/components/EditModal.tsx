import { useState } from 'react';
import type { MediaItem } from '../types';
import { STATUS_OPTIONS } from '../types';

interface EditModalProps {
    item: MediaItem;
    onClose: () => void;
    onUpdate: (id: string, fields: Partial<MediaItem>) => void;
    onDelete: (id: string) => void;
    mode?: 'edit' | 'create';
}

export function EditModal({ item, onClose, onUpdate, onDelete, mode = 'edit' }: EditModalProps) {
    const [status, setStatus] = useState(item.status);
    const [rating, setRating] = useState(item.userRating?.toString() ?? '');
    const [memo, setMemo] = useState(item.memo ?? '');
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{mode === 'create' ? 'Add to Library' : 'Edit Item'}</h2>
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
                    {mode === 'edit' && (
                        confirmDelete ? (
                            <>
                                <span className="delete-confirm-text">Are you sure?</span>
                                <button className="btn btn-danger btn-sm" onClick={() => onDelete(item.id)}>Yes, Delete</button>
                                <button className="btn btn-sm" onClick={() => setConfirmDelete(false)} style={{ background: 'rgba(255,255,255,0.1)' }}>Cancel</button>
                            </>
                        ) : (
                            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>🗑 Delete</button>
                        )
                    )}
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onUpdate(item.id, {
                            status: status as any,
                            userRating: rating ? Number(rating) : null,
                            memo: memo || null,
                        })}
                    >
                        {mode === 'create' ? 'Add to Library' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

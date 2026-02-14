import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { ModuleRegistry, ClientSideRowModelModule, ValidationModule, TextEditorModule, SelectEditorModule } from 'ag-grid-community';
import { ArrowLeft, Save, Plus, Loader2 } from 'lucide-react';
import type { MediaItem } from '../types';
import { STATUS_OPTIONS } from '../types';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Register modules
ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    ValidationModule,
    TextEditorModule,
    SelectEditorModule
]);

export function BulkEditPage() {
    const navigate = useNavigate();
    const [rowData, setRowData] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch data
    useEffect(() => {
        fetch('/api/library')
            .then(res => res.json())
            .then(data => {
                setRowData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load library data');
                setLoading(false);
            });
    }, []);

    // Column Definitions
    const columnDefs = useMemo<ColDef<MediaItem>[]>(() => [
        { field: 'id', headerName: 'ID', editable: false, width: 300 },
        { field: 'title', headerName: 'Title', editable: true, flex: 2, minWidth: 200 },
        {
            field: 'year',
            headerName: 'Year',
            editable: true,
            width: 100,
            valueParser: (params) => Number(params.newValue) || null
        },
        {
            field: 'type',
            headerName: 'Type',
            editable: true,
            width: 100,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: ['movie', 'show', 'anime']
            }
        },
        {
            field: 'status',
            headerName: 'Status',
            editable: true,
            width: 130,
            cellEditor: 'agSelectCellEditor',
            cellEditorParams: {
                values: STATUS_OPTIONS.map(o => o.value)
            },
            valueFormatter: (params) => STATUS_OPTIONS.find(o => o.value === params.value)?.label || params.value
        },
        {
            field: 'userRating',
            headerName: 'My Rating',
            editable: true,
            width: 100,
            valueParser: (params) => Number(params.newValue) || null
        },
        { field: 'watchedAt', headerName: 'Watched Date', editable: true, width: 140 },
        { field: 'runtime', headerName: 'Runtime (min)', editable: true, width: 130, valueParser: (params) => Number(params.newValue) || null },
        { field: 'director', headerName: 'Director', editable: true, width: 150 },
        { field: 'certification', headerName: 'Cert.', editable: true, width: 100 },
        { field: 'country', headerName: 'Country', editable: true, width: 100 },
        { field: 'overview', headerName: 'Overview', editable: true, width: 250, autoHeight: true, wrapText: true },
        { field: 'memo', headerName: 'Memo/Notes', editable: true, width: 200 },

        // IDs
        { field: 'imdbId', headerName: 'IMDB ID', editable: true, width: 110 },
        { field: 'tmdbId', headerName: 'TMDB ID', editable: true, width: 110, valueParser: (params) => Number(params.newValue) || null },
        { field: 'tvdbId', headerName: 'TVDB ID', editable: true, width: 110, valueParser: (params) => Number(params.newValue) || null },
        { field: 'malId', headerName: 'MAL ID', editable: true, width: 110, valueParser: (params) => Number(params.newValue) || null },
        { field: 'simklId', headerName: 'Simkl ID', editable: true, width: 110, valueParser: (params) => Number(params.newValue) || null },

        // Metadata
        {
            field: 'genres', headerName: 'Genres', editable: true, width: 150, valueGetter: (p: any) => p.data?.genres?.join(', '), valueSetter: (p: any) => {
                if (p.newValue) { p.data.genres = p.newValue.split(',').map((s: string) => s.trim()); return true; } return false;
            }
        },
        { field: 'poster', headerName: 'Poster URL', editable: true, width: 150 },
        { field: 'posterTmdb', headerName: 'TMDB Poster', editable: true, width: 150 },
        { field: 'posterRpdb', headerName: 'RPDB Poster', editable: true, width: 150 },
        {
            field: 'createdAt',
            headerName: 'Added On',
            width: 120,
            editable: false,
            valueFormatter: (params) => params.value ? new Date(params.value).toLocaleDateString() : ''
        },
        {
            field: 'updatedAt',
            headerName: 'Updated On',
            width: 120,
            editable: false,
            valueFormatter: (params) => params.value ? new Date(params.value).toLocaleDateString() : ''
        },
    ], []);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true,
    }), []);

    const handleAddRow = useCallback(() => {
        const newRow: Partial<MediaItem> = {
            title: 'New Item',
            type: 'movie',
            status: 'plantowatch',
            year: new Date().getFullYear(),
            createdAt: new Date().toISOString() // Temporary
        };
        // We accept that newRow doesn't have an ID yet. 
        // We can exclude it from the array type check or just cast it
        setRowData(prev => [newRow as MediaItem, ...prev]);
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        setError(null);

        // In a real app we would track changes. Here we will just save EVERYTHING that is new (no ID) and updated?
        // Actually simpler: 
        // 1. New items have no ID -> POST
        // 2. Existing items have ID -> PATCH

        // This is heavy if we save everything. 
        // Let's assume the user edited some rows. We can't easily know which ones without tracking.
        // For this MVP version, we will assume the grid state IS the truth.
        // BUT sending 1000 PATCH requests is bad.

        // OPTIMIZATION: We could try to track modified rows, but ag-grid standard doesn't give "dirty" rows easily without API.
        // Let's iterate all rows.

        try {
            const promises = rowData.map(async (item) => {
                if (!item.id) {
                    // New Item -> POST
                    const res = await fetch('/api/library', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(item)
                    });
                    if (!res.ok) throw new Error(`Failed to create ${item.title}`);
                    return await res.json();
                } else {
                    // Existing Item -> PATCH
                    // TODO: only if changed? We skip that check for now (MVP)
                    const res = await fetch(`/api/library/${item.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(item)
                    });
                    if (!res.ok) throw new Error(`Failed to update ${item.title}`);
                    return await res.json();
                }
            });

            await Promise.all(promises);

            // Refresh data to get IDs for new items
            const res = await fetch('/api/library');
            const data = await res.json();
            setRowData(data);
            alert('Saved successfully!');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    }, [rowData]);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', color: 'white' }}>
            <div style={{ padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                        <ArrowLeft />
                    </button>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Bulk Edit Library</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={handleAddRow}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px',
                            color: 'white', cursor: 'pointer'
                        }}
                    >
                        <Plus size={16} /> Add Row
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem',
                            background: 'var(--primary)', border: 'none', borderRadius: '6px',
                            color: 'white', cursor: 'pointer', opacity: saving ? 0.7 : 1
                        }}
                    >
                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, padding: '1rem' }}>
                {error && <div style={{ marginBottom: '1rem', padding: '1rem', background: '#ef444420', color: '#fca5a5', borderRadius: '8px' }}>{error}</div>}
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <Loader2 className="animate-spin" size={32} />
                    </div>
                ) : (
                    <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
                        <AgGridReact
                            rowData={rowData}
                            columnDefs={columnDefs}
                            defaultColDef={defaultColDef}
                            animateRows={true}
                            onCellValueChanged={(params) => {
                                // We could track dirty rows here
                                console.log('Cell changed:', params);
                            }}
                        />
                    </div>
                )}
            </div>
            {/* AG Grid Styles Hack for Dark Mode override if needed */}
            <style>{`
                .ag-theme-alpine-dark {
                    --ag-background-color: #1a1a1a;
                    --ag-foreground-color: #eee;
                    --ag-header-background-color: #2a2a2a;
                    --ag-odd-row-background-color: #222;
                    --ag-border-color: #333;
                }
            `}</style>
        </div>
    );
}

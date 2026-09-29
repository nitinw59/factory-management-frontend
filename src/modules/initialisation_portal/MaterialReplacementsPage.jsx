import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { materialReplacementApi } from '../../api/materialReplacementApi';
import {
    LuPackageX, LuCheck, LuX, LuClock, LuHistory, LuPackageCheck,
    LuLayoutGrid, LuTable, LuSettings2, LuChevronUp, LuChevronDown,
} from 'react-icons/lu';

// --- SHARED UI COMPONENTS (matches AlterPiecesDashboardPage.jsx's style) ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;

const TABS = [
    { key: 'REQUESTED', label: 'Pending',   icon: LuClock },
    { key: 'ACCEPTED',  label: 'Accepted',  icon: LuPackageCheck },
    { key: 'FULFILLED', label: 'Fulfilled', icon: LuCheck },
    { key: 'CANCELLED', label: 'Cancelled', icon: LuX },
];

const STATUS_STYLES = {
    REQUESTED: 'bg-amber-100 text-amber-700',
    ACCEPTED:  'bg-sky-100 text-sky-700',
    FULFILLED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-gray-200 text-gray-500',
};

// Table (mode 2) column metadata — label + filterValue are plain data, used
// for both the settings panel and per-column header filtering. 'status' and
// 'actions' need JSX/handlers, so their actual cell content is special-cased
// in renderCell/renderFilterValue below rather than living here.
const ALL_COLUMNS = [
    { key: 'batch',     label: 'Batch',      render: r => `#${r.batch_id}${r.batch_code ? ' · ' + r.batch_code : ''}`, filterValue: r => `${r.batch_id} ${r.batch_code || ''}` },
    { key: 'line',      label: 'Line',       render: r => r.line_name || '—', filterValue: r => r.line_name || '' },
    { key: 'roll',      label: 'Roll',       render: r => `#${r.fabric_roll_id}`, filterValue: r => String(r.fabric_roll_id ?? '') },
    { key: 'piece',     label: 'Piece #',    render: r => `#${r.piece_sequence}`, filterValue: r => String(r.piece_sequence ?? '') },
    { key: 'part',      label: 'Part',       render: r => r.part_name, filterValue: r => r.part_name || '' },
    { key: 'size',      label: 'Size',       render: r => r.size, filterValue: r => String(r.size ?? '') },
    { key: 'defect',    label: 'Defect',     render: r => `${r.defect_code || ''}${r.defect_description ? ' — ' + r.defect_description : ''}`, filterValue: r => `${r.defect_code || ''} ${r.defect_description || ''}` },
    { key: 'status',    label: 'Status',     render: null, filterValue: r => r.status || '' },
    { key: 'requested', label: 'Requested',  render: r => `${r.requested_by_name || '—'} · ${new Date(r.created_at).toLocaleString()}`, filterValue: r => r.requested_by_name || '' },
    { key: 'accepted',  label: 'Accepted',   render: r => r.accepted_at ? `${r.accepted_by_name || '—'} · ${new Date(r.accepted_at).toLocaleString()}` : '—', filterValue: r => r.accepted_by_name || '' },
    { key: 'resolved',  label: 'Resolved',   render: r => r.resolved_at ? `${r.resolved_by_name || '—'} · ${new Date(r.resolved_at).toLocaleString()}` : '—', filterValue: r => r.resolved_by_name || '' },
    { key: 'notes',     label: 'Notes',      render: r => r.notes || '—', filterValue: r => r.notes || '' },
    { key: 'actions',   label: 'Actions',    render: null, filterValue: null },
];
const DEFAULT_COLUMN_ORDER = ALL_COLUMNS.map(c => c.key);
const COLUMN_SETTINGS_LS_KEY = 'material-replacements-table-columns';
const VIEW_MODE_LS_KEY = 'material-replacements-view-mode';

// One request row (card mode). Accept shows on Pending; Fulfil/Cancel show on
// Accepted (fulfilling can't skip the accept step); Cancel alone still shows
// on Pending too (a mistake can be caught before ever accepting).
const RequestRow = ({ req, onAccept, onFulfill, onCancel, busy }) => (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-gray-800">
                #{req.piece_sequence} · {req.part_name} · Size {req.size}
            </p>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[req.status]}`}>
                {req.status}
            </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="font-bold text-gray-700">{req.defect_code}</span>
            {req.defect_description && <span>{req.defect_description}</span>}
            <span>Requested by {req.requested_by_name || '—'} · {new Date(req.created_at).toLocaleString()}</span>
            {req.accepted_at && (
                <span>Accepted by {req.accepted_by_name || '—'} · {new Date(req.accepted_at).toLocaleString()}</span>
            )}
            {req.status !== 'REQUESTED' && req.status !== 'ACCEPTED' && (
                <span>{req.status === 'FULFILLED' ? 'Fulfilled' : 'Cancelled'} by {req.resolved_by_name || '—'} · {req.resolved_at ? new Date(req.resolved_at).toLocaleString() : '—'}</span>
            )}
        </div>
        {req.notes && <p className="mt-1.5 text-xs italic text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5">"{req.notes}"</p>}

        {(req.status === 'REQUESTED' || req.status === 'ACCEPTED') && (
            <div className="mt-3 flex gap-2">
                {req.status === 'REQUESTED' && (
                    <button
                        onClick={() => onAccept(req.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-bold bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition"
                    >
                        <LuPackageCheck size={13} /> Accept
                    </button>
                )}
                {req.status === 'ACCEPTED' && (
                    <button
                        onClick={() => onFulfill(req.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
                    >
                        <LuCheck size={13} /> Mark Fulfilled
                    </button>
                )}
                <button
                    onClick={() => onCancel(req.id)}
                    disabled={busy}
                    className="flex items-center gap-1.5 text-xs font-bold bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
                >
                    <LuX size={13} /> Cancel Request
                </button>
            </div>
        )}
    </div>
);

// Actions cell shared by table mode — same three buttons/rules as RequestRow's,
// just inline for a table row instead of stacked in a card.
const ActionsCell = ({ req, onAccept, onFulfill, onCancel, busy }) => {
    if (req.status !== 'REQUESTED' && req.status !== 'ACCEPTED') return <span className="text-gray-300">—</span>;
    return (
        <div className="flex gap-1.5 whitespace-nowrap">
            {req.status === 'REQUESTED' && (
                <button onClick={() => onAccept(req.id)} disabled={busy} className="flex items-center gap-1 text-xs font-bold bg-sky-600 text-white px-2 py-1 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition">
                    <LuPackageCheck size={12} /> Accept
                </button>
            )}
            {req.status === 'ACCEPTED' && (
                <button onClick={() => onFulfill(req.id)} disabled={busy} className="flex items-center gap-1 text-xs font-bold bg-emerald-600 text-white px-2 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition">
                    <LuCheck size={12} /> Fulfill
                </button>
            )}
            <button onClick={() => onCancel(req.id)} disabled={busy} className="flex items-center gap-1 text-xs font-bold bg-white text-red-600 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 transition">
                <LuX size={12} /> Cancel
            </button>
        </div>
    );
};

// Mode-2 settings: reorder (up/down) + show/hide, persisted to localStorage.
const ColumnSettingsPanel = ({ columnOrder, setColumnOrder, hiddenColumns, setHiddenColumns, onClose }) => {
    const panelRef = useRef(null);
    useEffect(() => {
        const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    const moveColumn = (key, direction) => {
        setColumnOrder(prev => {
            const idx = prev.indexOf(key);
            const newIdx = idx + direction;
            if (newIdx < 0 || newIdx >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
            return next;
        });
    };
    const toggleVisible = (key) => {
        setHiddenColumns(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    return (
        <div ref={panelRef} className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-20 w-72 p-3">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Columns — sequence &amp; visibility</p>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><LuX size={14} /></button>
            </div>
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
                {columnOrder.map((key, idx) => {
                    const col = ALL_COLUMNS.find(c => c.key === key);
                    if (!col) return null;
                    const isHidden = hiddenColumns.has(key);
                    return (
                        <div key={key} className="flex items-center gap-2 py-1 rounded-lg hover:bg-gray-50 px-1">
                            <div className="flex flex-col shrink-0">
                                <button onClick={() => moveColumn(key, -1)} disabled={idx === 0} className="text-gray-400 hover:text-violet-600 disabled:opacity-20 disabled:hover:text-gray-400">
                                    <LuChevronUp size={12} />
                                </button>
                                <button onClick={() => moveColumn(key, 1)} disabled={idx === columnOrder.length - 1} className="text-gray-400 hover:text-violet-600 disabled:opacity-20 disabled:hover:text-gray-400">
                                    <LuChevronDown size={12} />
                                </button>
                            </div>
                            <label className="flex items-center gap-2 flex-1 text-sm cursor-pointer select-none">
                                <input type="checkbox" checked={!isHidden} onChange={() => toggleVisible(key)} className="accent-violet-600" />
                                <span className={isHidden ? 'text-gray-400' : 'text-gray-700 font-medium'}>{col.label}</span>
                            </label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const MaterialReplacementsPage = () => {
    const [tab, setTab] = useState('REQUESTED');
    const [dataByTab, setDataByTab] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    // Mode 1 (cards, grouped by Batch → Roll) vs Mode 2 (flat table, with
    // configurable/reorderable/hideable columns and a per-column header filter).
    const [viewMode, setViewMode] = useState(() => {
        try { return localStorage.getItem(VIEW_MODE_LS_KEY) || 'cards'; } catch { return 'cards'; }
    });
    useEffect(() => {
        try { localStorage.setItem(VIEW_MODE_LS_KEY, viewMode); } catch {}
    }, [viewMode]);

    const [columnOrder, setColumnOrder] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(COLUMN_SETTINGS_LS_KEY) || 'null');
            if (Array.isArray(stored?.order)) {
                const known = stored.order.filter(k => DEFAULT_COLUMN_ORDER.includes(k));
                const missing = DEFAULT_COLUMN_ORDER.filter(k => !known.includes(k));
                return [...known, ...missing];
            }
        } catch {}
        return DEFAULT_COLUMN_ORDER;
    });
    const [hiddenColumns, setHiddenColumns] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(COLUMN_SETTINGS_LS_KEY) || 'null');
            if (Array.isArray(stored?.hidden)) return new Set(stored.hidden);
        } catch {}
        return new Set();
    });
    useEffect(() => {
        try { localStorage.setItem(COLUMN_SETTINGS_LS_KEY, JSON.stringify({ order: columnOrder, hidden: [...hiddenColumns] })); }
        catch {}
    }, [columnOrder, hiddenColumns]);
    const [showColumnSettings, setShowColumnSettings] = useState(false);

    // Per-column header filters — mode 2 only, intentionally not persisted
    // (a filter left over from a previous visit silently hiding rows would
    // be more confusing than useful).
    const [columnFilters, setColumnFilters] = useState({});

    const visibleColumns = useMemo(
        () => columnOrder.map(k => ALL_COLUMNS.find(c => c.key === k)).filter(c => c && !hiddenColumns.has(c.key)),
        [columnOrder, hiddenColumns]
    );

    const load = useCallback((status) => {
        setLoading(true);
        setError(null);
        materialReplacementApi.getAllRequests(status)
            .then(res => setDataByTab(prev => ({ ...prev, [status]: res.data?.requests ?? [] })))
            .catch(err => setError(err.response?.data?.error || 'Could not load replacement requests.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(tab); }, [tab, load]);

    const switchTab = (key) => setTab(key);
    const refreshCurrentTab = () => load(tab);

    const handleAccept = async (id) => {
        setBusyId(id);
        try {
            await materialReplacementApi.acceptRequest(id);
            refreshCurrentTab();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to accept request.');
        } finally {
            setBusyId(null);
        }
    };

    const handleFulfill = async (id) => {
        setBusyId(id);
        try {
            await materialReplacementApi.fulfillRequest(id);
            refreshCurrentTab();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to fulfill request.');
        } finally {
            setBusyId(null);
        }
    };

    const handleCancel = async (id) => {
        if (!window.confirm('Cancel this replacement request? The piece goes back to pending rework as-is.')) return;
        setBusyId(id);
        try {
            await materialReplacementApi.cancelRequest(id);
            refreshCurrentTab();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to cancel request.');
        } finally {
            setBusyId(null);
        }
    };

    // Batch → Roll → requests, so a busy queue reads as "which batches/rolls
    // need attention" rather than a flat list of unrelated pieces. Mode 1 only.
    const groupedRows = useMemo(() => {
        const rows = dataByTab[tab] || [];
        const batchMap = new Map();
        rows.forEach(r => {
            if (!batchMap.has(r.batch_id)) {
                batchMap.set(r.batch_id, { batch_id: r.batch_id, batch_code: r.batch_code, line_name: r.line_name, rolls: new Map() });
            }
            const batch = batchMap.get(r.batch_id);
            if (!batch.rolls.has(r.fabric_roll_id)) batch.rolls.set(r.fabric_roll_id, []);
            batch.rolls.get(r.fabric_roll_id).push(r);
        });
        return [...batchMap.values()].map(b => ({
            ...b,
            rolls: [...b.rolls.entries()].map(([roll_id, requests]) => ({ roll_id, requests })),
        }));
    }, [dataByTab, tab]);

    // Flat + per-column-filtered rows. Mode 2 only.
    const tableRows = useMemo(() => {
        const rows = dataByTab[tab] || [];
        const activeFilters = visibleColumns.filter(c => c.filterValue && (columnFilters[c.key] || '').trim());
        if (activeFilters.length === 0) return rows;
        return rows.filter(r => activeFilters.every(c => {
            const q = columnFilters[c.key].trim().toLowerCase();
            return c.filterValue(r).toLowerCase().includes(q);
        }));
    }, [dataByTab, tab, columnFilters, visibleColumns]);

    const renderCell = (colKey, req) => {
        if (colKey === 'status') {
            return (
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${STATUS_STYLES[req.status]}`}>
                    {req.status}
                </span>
            );
        }
        if (colKey === 'actions') {
            return <ActionsCell req={req} onAccept={handleAccept} onFulfill={handleFulfill} onCancel={handleCancel} busy={busyId === req.id} />;
        }
        const col = ALL_COLUMNS.find(c => c.key === colKey);
        return col?.render ? col.render(req) : '—';
    };

    return (
        <div className="space-y-6 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
                        <LuPackageX className="text-violet-600" /> Material Replacements
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                        Pieces a checker already found defective (sitting in their Pending Rework queue) and flagged
                        as needing a material swap instead of a normal repair. Accept first to acknowledge and start
                        sourcing the material, then Mark Fulfilled once it's actually swapped — that's what clears the
                        piece and sends it back to the checking queue as a fresh, unchecked piece, with no new record.
                        Cancelling (from either stage) leaves the piece exactly as it was, still pending rework.
                    </p>
                </div>
                <div className="flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-xl p-1 shrink-0">
                    <button
                        onClick={() => setViewMode('cards')}
                        title="Card view"
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${viewMode === 'cards' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LuLayoutGrid size={14} /> Cards
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        title="Table view"
                        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition ${viewMode === 'table' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LuTable size={14} /> Table
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between border-b border-gray-200">
                <div className="flex">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.key}
                                onClick={() => switchTab(t.key)}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold transition ${
                                    tab === t.key ? 'text-violet-700 border-b-2 border-violet-600' : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                <Icon size={14} /> {t.label}
                                {dataByTab[t.key] && <span className="ml-1 text-xs text-gray-400">({dataByTab[t.key].length})</span>}
                            </button>
                        );
                    })}
                </div>
                {viewMode === 'table' && (
                    <div className="relative mb-2">
                        <button
                            onClick={() => setShowColumnSettings(v => !v)}
                            className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-violet-600 border border-gray-200 hover:border-violet-300 px-3 py-1.5 rounded-lg transition bg-white shadow-sm"
                        >
                            <LuSettings2 size={13} /> Columns
                        </button>
                        {showColumnSettings && (
                            <ColumnSettingsPanel
                                columnOrder={columnOrder}
                                setColumnOrder={setColumnOrder}
                                hiddenColumns={hiddenColumns}
                                setHiddenColumns={setHiddenColumns}
                                onClose={() => setShowColumnSettings(false)}
                            />
                        )}
                    </div>
                )}
            </div>

            {loading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : viewMode === 'table' ? (
                tableRows.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <LuHistory size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="font-semibold">Nothing here.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    {visibleColumns.map(col => (
                                        <th key={col.key} className="px-3 py-2 text-left text-xs font-black uppercase tracking-widest text-gray-500 whitespace-nowrap">
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                                <tr className="bg-white border-b border-gray-200">
                                    {visibleColumns.map(col => (
                                        <th key={col.key} className="px-3 py-1.5">
                                            {col.filterValue && (
                                                <input
                                                    value={columnFilters[col.key] || ''}
                                                    onChange={e => setColumnFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                                                    placeholder="Filter…"
                                                    className="w-full min-w-[90px] text-xs font-normal border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-violet-400"
                                                />
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map(req => (
                                    <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                                        {visibleColumns.map(col => (
                                            <td key={col.key} className="px-3 py-2.5 text-gray-700">
                                                {renderCell(col.key, req)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            ) : groupedRows.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <LuHistory size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="font-semibold">Nothing here.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {groupedRows.map(batch => (
                        <div key={batch.batch_id}>
                            <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
                                #{batch.batch_id} · {batch.batch_code || 'Batch'} {batch.line_name && `· ${batch.line_name}`}
                            </p>
                            <div className="space-y-3 pl-3 border-l-2 border-gray-100">
                                {batch.rolls.map(rollGroup => (
                                    <div key={rollGroup.roll_id}>
                                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                                            Roll #{rollGroup.roll_id}
                                        </p>
                                        <div className="space-y-2">
                                            {rollGroup.requests.map(req => (
                                                <RequestRow
                                                    key={req.id}
                                                    req={req}
                                                    onAccept={handleAccept}
                                                    onFulfill={handleFulfill}
                                                    onCancel={handleCancel}
                                                    busy={busyId === req.id}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MaterialReplacementsPage;

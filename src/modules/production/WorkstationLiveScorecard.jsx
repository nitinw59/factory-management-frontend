// ─── LIVE SCORECARD — BY WORKSTATION ─────────────────────────────────────────
// Self-contained widget: fetches its own data, subscribes to live QC events
// itself, and persists its own row order / column order / text size to
// localStorage per browser. Drop <WorkstationLiveScorecard /> into any
// portal page with no props at all — that's the whole point of this file.
//
// "Live": every piece/bundle/garment check-in already broadcasts a
// QC_LIVE_EVENT over the shared /ws socket (see utils/liveQc.js on the
// backend — covers APPROVED/REPAIRED/NEEDS_REWORK/QC_REJECTED across
// numbering, sewing, preparatory bundling, assembly, post-assembly and
// finishing), so on each event this re-fetches the lightweight scorecard
// endpoint instead of waiting for a poll timer.
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GripVertical, SlidersHorizontal, Minus, Plus } from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import useLiveQcSocket from '../qc_live/useLiveQcSocket';
import AnchoredPopover from '../../shared/AnchoredPopover';

const ROW_ORDER_KEY = 'wls_row_order_v1';
const COL_ORDER_KEY = 'wls_col_order_v1';
const TEXT_SIZE_KEY = 'wls_text_size_v1';

// Discrete density levels rather than a CSS zoom/transform — Tailwind's
// text-* utilities are rem-based (relative to the document root, not the
// nearest ancestor), so an em/zoom wrapper wouldn't scale them predictably.
const SIZE_LEVELS = [
    { header: 'text-[10px]', body: 'text-xs',   big: 'text-lg' },
    { header: 'text-[11px]', body: 'text-sm',   big: 'text-2xl' }, // default — matches the original look
    { header: 'text-xs',     body: 'text-base', big: 'text-3xl' },
    { header: 'text-sm',     body: 'text-lg',   big: 'text-4xl' },
];
const DEFAULT_SIZE_IDX = 1;

const fmtCount = (n, cls, sz) =>
    n == null
        ? <span className={`${sz} text-gray-700`}>—</span>
        : <span className={`${sz} font-black tabular-nums ${n > 0 ? cls : 'text-gray-600'}`}>{n.toLocaleString()}</span>;

const ALL_COLUMNS = [
    { key: 'workstation', label: 'Workstation', align: 'left',
      render: (w, sz) => <span className={`${sz} font-bold text-white whitespace-nowrap`}>{w.workstation_name}</span> },
    { key: 'operator', label: 'Operator', align: 'left',
      render: (w, sz) => <span className={`${sz} whitespace-nowrap`} style={{ color: w.user_name ? '#d1d5db' : '#4b5563' }}>{w.user_name || 'Unassigned'}</span> },
    { key: 'line', label: 'Line', align: 'left',
      render: (w, sz) => <span className={`${sz} text-gray-500 whitespace-nowrap`}>{w.line_name || '—'}</span> },
    { key: 'line_type', label: 'Line Type', align: 'left',
      render: (w, sz) => <span className={`${sz} text-gray-500 whitespace-nowrap`}>{w.line_type_name || '—'}</span> },
    { key: 'approved', label: 'Approved', align: 'right', render: (w, sz) => fmtCount(w.today_approved, 'text-emerald-400', sz) },
    { key: 'repaired', label: 'Repaired', align: 'right', render: (w, sz) => fmtCount(w.today_repaired, 'text-amber-400', sz) },
    { key: 'rework',   label: 'Rework',   align: 'right', render: (w, sz) => fmtCount(w.today_rework, 'text-orange-400', sz) },
    { key: 'rejected', label: 'Rejected', align: 'right', render: (w, sz) => fmtCount(w.today_rejected, 'text-red-400', sz) },
    { key: 'today', label: 'Today', align: 'right',
      render: (w, sz) => w.today_output == null
          ? <span className={`${sz} text-gray-700`}>—</span>
          : <span className={`${sz} font-black ${w.today_output > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>{w.today_output.toLocaleString()}</span> },
    { key: 'this_hour', label: 'This Hour', align: 'right',
      render: (w, sz) => w.checked_this_hour == null
          ? <span className={`${sz} text-gray-700`}>—</span>
          : <span className={`${sz} text-gray-400`}>{w.checked_this_hour.toLocaleString()}</span> },
];
const DEFAULT_COL_ORDER = ALL_COLUMNS.map(c => c.key);

const loadJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
};

const LiveBadge = ({ live }) => (
    <span
        className={`inline-flex items-center gap-1 normal-case tracking-normal font-bold px-1.5 py-0.5 rounded ${live ? 'text-emerald-400' : 'text-gray-600'}`}
        title={live ? 'Live — updates instantly on every check-in' : 'Reconnecting…'}
    >
        <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
        {live ? 'Live' : 'Offline'}
    </span>
);

export default function WorkstationLiveScorecard() {
    const [rows, setRows]       = useState(null);
    const [loading, setLoading] = useState(true);

    const [rowOrder, setRowOrder] = useState([]); // workstation_id[] as strings
    const [colOrder, setColOrder] = useState(() => {
        const saved = loadJson(COL_ORDER_KEY, null);
        if (!Array.isArray(saved)) return DEFAULT_COL_ORDER;
        const filtered = saved.filter(k => DEFAULT_COL_ORDER.includes(k));
        DEFAULT_COL_ORDER.forEach(k => { if (!filtered.includes(k)) filtered.push(k); });
        return filtered;
    });
    const [sizeIdx, setSizeIdx] = useState(() => {
        const saved = parseInt(localStorage.getItem(TEXT_SIZE_KEY), 10);
        return Number.isInteger(saved) && saved >= 0 && saved < SIZE_LEVELS.length ? saved : DEFAULT_SIZE_IDX;
    });

    const [customizeOpen, setCustomizeOpen] = useState(false);
    const [dragRowId, setDragRowId]         = useState(null);
    const [dragColKey, setDragColKey]       = useState(null);
    const settingsBtnRef = useRef(null);

    const fetchRows = useCallback(() => {
        productionManagerApi.getWorkstationLiveScorecard()
            .then(res => setRows(res.data))
            .catch(err => console.error('[WorkstationLiveScorecard] fetch error', err))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    // Reconcile saved row order against whatever workstations actually came
    // back (one added/removed since last visit) — keep the saved relative
    // order for ids still present, append any new ones at the end.
    useEffect(() => {
        if (!rows) return;
        const currentIds = rows.map(r => String(r.workstation_id));
        const saved = loadJson(ROW_ORDER_KEY, []);
        const order = saved.filter(id => currentIds.includes(id));
        currentIds.forEach(id => { if (!order.includes(id)) order.push(id); });
        setRowOrder(order);
    }, [rows]);

    useEffect(() => {
        if (rowOrder.length > 0) localStorage.setItem(ROW_ORDER_KEY, JSON.stringify(rowOrder));
    }, [rowOrder]);

    useEffect(() => {
        localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder));
    }, [colOrder]);

    useEffect(() => {
        localStorage.setItem(TEXT_SIZE_KEY, String(sizeIdx));
    }, [sizeIdx]);

    // Debounced so a burst of check-ins (e.g. a multi-piece bundle approval)
    // triggers one re-fetch, not one per event.
    const wsDebounceRef = useRef(null);
    const handleLiveQcEvent = useCallback(() => {
        if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
        wsDebounceRef.current = setTimeout(fetchRows, 800);
    }, [fetchRows]);
    useEffect(() => () => { if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current); }, []);
    const liveConnected = useLiveQcSocket(handleLiveQcEvent);

    const orderedRows = useMemo(() => {
        if (!rows) return [];
        const byId = new Map(rows.map(r => [String(r.workstation_id), r]));
        const ordered = rowOrder.map(id => byId.get(id)).filter(Boolean);
        rows.forEach(r => { if (!rowOrder.includes(String(r.workstation_id))) ordered.push(r); });
        return ordered;
    }, [rows, rowOrder]);

    const orderedColumns = useMemo(() => {
        const byKey = new Map(ALL_COLUMNS.map(c => [c.key, c]));
        return colOrder.map(k => byKey.get(k)).filter(Boolean);
    }, [colOrder]);

    const handleRowDragOver = (e, overId) => {
        e.preventDefault();
        if (!dragRowId || dragRowId === overId) return;
        setRowOrder(order => {
            const next = [...order];
            const from = next.indexOf(dragRowId);
            const to = next.indexOf(overId);
            if (from === -1 || to === -1) return order;
            next.splice(from, 1);
            next.splice(to, 0, dragRowId);
            return next;
        });
    };

    const handleColDragOver = (e, overKey) => {
        e.preventDefault();
        if (!dragColKey || dragColKey === overKey) return;
        setColOrder(order => {
            const next = [...order];
            const from = next.indexOf(dragColKey);
            const to = next.indexOf(overKey);
            if (from === -1 || to === -1) return order;
            next.splice(from, 1);
            next.splice(to, 0, dragColKey);
            return next;
        });
    };

    const resetLayout = () => {
        setColOrder(DEFAULT_COL_ORDER);
        if (rows) setRowOrder(rows.map(r => String(r.workstation_id)));
    };

    if (loading && !rows) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                Loading workstation scorecard…
            </div>
        );
    }
    if (!rows || rows.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                No active workstations configured.
            </div>
        );
    }

    const totalToday = rows.reduce((s, w) => s + (w.today_output || 0), 0);
    const sz = SIZE_LEVELS[sizeIdx];

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
                            Live Scorecard — By Workstation
                            <LiveBadge live={liveConnected} />
                        </p>
                        <h2 className={`${sz.big} font-black text-white`}>Today's Output</h2>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-0.5 bg-gray-800 border border-gray-700 rounded-lg p-0.5">
                            <button
                                onClick={() => setSizeIdx(i => Math.max(0, i - 1))}
                                disabled={sizeIdx === 0}
                                title="Decrease text size"
                                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <Minus size={13} />
                            </button>
                            <span className="text-[10px] text-gray-500 font-bold w-8 text-center tabular-nums">
                                {sizeIdx + 1}/{SIZE_LEVELS.length}
                            </span>
                            <button
                                onClick={() => setSizeIdx(i => Math.min(SIZE_LEVELS.length - 1, i + 1))}
                                disabled={sizeIdx === SIZE_LEVELS.length - 1}
                                title="Increase text size"
                                className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            >
                                <Plus size={13} />
                            </button>
                        </div>

                        <button
                            ref={settingsBtnRef}
                            onClick={() => setCustomizeOpen(o => !o)}
                            title="Reorder rows and columns"
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${customizeOpen ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        >
                            <SlidersHorizontal size={12} /> Arrange
                        </button>

                        <div className="text-center">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Factory Total</p>
                            <span className={`${sz.big} font-black text-white tabular-nums`}>
                                {totalToday.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className={`${sz.header} text-gray-600 uppercase tracking-widest`}>
                            {orderedColumns.map(col => (
                                <th key={col.key} className={`px-4 py-3 font-bold whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                        {orderedRows.map(w => (
                            <tr key={w.workstation_id} className="hover:bg-gray-800/30">
                                {orderedColumns.map(col => (
                                    <td key={col.key} className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : 'text-left'} tabular-nums`}>
                                        {col.render(w, sz.body)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {customizeOpen && (
                <AnchoredPopover
                    anchorEl={settingsBtnRef.current}
                    onClose={() => setCustomizeOpen(false)}
                    width={280}
                    align="right"
                    className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3"
                >
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Column order</p>
                            <div className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
                                {orderedColumns.map(col => (
                                    <div
                                        key={col.key}
                                        draggable
                                        onDragStart={() => setDragColKey(col.key)}
                                        onDragOver={e => handleColDragOver(e, col.key)}
                                        onDragEnd={() => setDragColKey(null)}
                                        className={`flex items-center gap-2 px-1.5 py-1 rounded-lg text-xs cursor-move select-none ${dragColKey === col.key ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
                                    >
                                        <GripVertical size={12} className="text-gray-600 shrink-0" />
                                        <span className="text-gray-300">{col.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Row order</p>
                            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                                {orderedRows.map(w => {
                                    const id = String(w.workstation_id);
                                    return (
                                        <div
                                            key={id}
                                            draggable
                                            onDragStart={() => setDragRowId(id)}
                                            onDragOver={e => handleRowDragOver(e, id)}
                                            onDragEnd={() => setDragRowId(null)}
                                            className={`flex items-center gap-2 px-1.5 py-1 rounded-lg text-xs cursor-move select-none ${dragRowId === id ? 'bg-gray-700' : 'hover:bg-gray-800'}`}
                                        >
                                            <GripVertical size={12} className="text-gray-600 shrink-0" />
                                            <span className="text-gray-300 truncate">{w.user_name || 'Unassigned'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-gray-800">
                            <button onClick={resetLayout} className="text-[11px] text-gray-500 hover:text-gray-300">
                                Reset to default
                            </button>
                        </div>
                    </div>
                </AnchoredPopover>
            )}
        </div>
    );
}

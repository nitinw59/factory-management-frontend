// ─── PUBLIC WORKSTATION SCORECARD (KIOSK / TV DISPLAY) ───────────────────────
// Deliberately unauthenticated — meant to be opened on a factory-floor TV or
// shared via a plain link, no login required. Full-screen, up to 6
// workstations visible at once, auto-rotating every 5s through the rest;
// a horizontal ticker across the top gives the full-factory overview at a
// glance. Live via the public WebSocket channel (see usePublicSocket.js /
// backend utils/websocket.js's ?public=1 opt-in) — falls back to a 60s
// safety-net poll in case a socket event is ever missed on an unattended
// screen with nobody around to notice.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SlidersHorizontal, GripVertical } from 'lucide-react';
import { publicApi } from '../../api/publicApi';
import usePublicSocket from './usePublicSocket';
import AnchoredPopover from '../../shared/AnchoredPopover';

const ROWS_PER_PAGE = 6;
const ROTATE_MS = 5000;
const SAFETY_POLL_MS = 60000;
// Own key, separate from the admin dashboard widget's (wls_row_order_v1) —
// this is set per kiosk device, not tied to whoever's logged into the admin
// portal, and the two screens may reasonably want different orders.
const ROW_ORDER_KEY = 'kiosk_wls_row_order_v1';

const loadJson = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
};

const STAT_COLORS = {
    approved: 'text-emerald-400',
    repaired: 'text-amber-400',
    rework:   'text-orange-400',
    rejected: 'text-red-400',
};

const StatBlock = ({ label, value, cls }) => (
    <div className="flex flex-col items-center justify-center px-4 min-w-[6rem]">
        <span className="text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-1">{label}</span>
        <span className={`text-4xl font-black tabular-nums ${value > 0 ? cls : 'text-gray-700'}`}>
            {(value ?? 0).toLocaleString()}
        </span>
    </div>
);

const WorkstationRow = ({ w }) => (
    <div className="flex-1 flex items-center justify-between px-10 border-b border-gray-800 last:border-b-0">
        <div className="min-w-0 flex-1">
            <p className="text-4xl font-black text-white truncate">{w.workstation_name}</p>
            <p className="text-xl text-gray-400 truncate mt-1">
                {w.user_name || <span className="text-gray-600">Unassigned</span>}
                {w.line_name && <span className="text-gray-600"> · {w.line_name}</span>}
            </p>
        </div>
        <div className="flex items-center shrink-0">
            <StatBlock label="Approved" value={w.today_approved} cls={STAT_COLORS.approved} />
            <StatBlock label="Repaired" value={w.today_repaired} cls={STAT_COLORS.repaired} />
            <StatBlock label="Rework"   value={w.today_rework}   cls={STAT_COLORS.rework} />
            <StatBlock label="Rejected" value={w.today_rejected} cls={STAT_COLORS.rejected} />
            <div className="flex flex-col items-center justify-center px-6 ml-2 border-l border-gray-800 min-w-[7rem]">
                <span className="text-[11px] uppercase tracking-widest font-bold text-gray-500 mb-1">Today</span>
                <span className="text-5xl font-black text-white tabular-nums">
                    {(w.today_output ?? 0).toLocaleString()}
                </span>
            </div>
        </div>
    </div>
);

export default function PublicWorkstationScorecardPage() {
    const [rows, setRows]       = useState(null);
    const [pageIdx, setPageIdx] = useState(0);

    const [rowOrder, setRowOrder]     = useState([]); // workstation_id[] as strings
    const [arrangeOpen, setArrangeOpen] = useState(false);
    const [dragRowId, setDragRowId]     = useState(null);
    const settingsBtnRef = useRef(null);

    const fetchRows = useCallback(() => {
        publicApi.getWorkstationScorecard()
            .then(res => setRows(res.data))
            .catch(err => console.error('[PublicWorkstationScorecard] fetch error', err));
    }, []);

    useEffect(() => {
        fetchRows();
        const poll = setInterval(fetchRows, SAFETY_POLL_MS);
        return () => clearInterval(poll);
    }, [fetchRows]);

    const wsDebounceRef = useRef(null);
    const handleEvent = useCallback(() => {
        if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
        wsDebounceRef.current = setTimeout(fetchRows, 800);
    }, [fetchRows]);
    useEffect(() => () => { if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current); }, []);
    const live = usePublicSocket(handleEvent);

    // Reconcile the saved order against whatever came back (a workstation
    // added/removed since this screen was last set up) — keep the saved
    // relative order for ids still present, append any new ones at the end.
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

    // Single source of truth for display order — both the rotating rows and
    // the ticker read from this, so they always agree.
    const orderedRows = useMemo(() => {
        if (!rows) return [];
        const byId = new Map(rows.map(r => [String(r.workstation_id), r]));
        const ordered = rowOrder.map(id => byId.get(id)).filter(Boolean);
        rows.forEach(r => { if (!rowOrder.includes(String(r.workstation_id))) ordered.push(r); });
        return ordered;
    }, [rows, rowOrder]);

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

    const pages = useMemo(() => {
        const out = [];
        for (let i = 0; i < orderedRows.length; i += ROWS_PER_PAGE) out.push(orderedRows.slice(i, i + ROWS_PER_PAGE));
        return out.length > 0 ? out : [[]];
    }, [orderedRows]);

    // Clamp + rotate — clamp handles the list shrinking (e.g. a workstation
    // deactivated) leaving the index pointing past the new last page.
    useEffect(() => { setPageIdx(i => (pages.length ? i % pages.length : 0)); }, [pages.length]);
    useEffect(() => {
        if (pages.length <= 1) return;
        const t = setInterval(() => setPageIdx(i => (i + 1) % pages.length), ROTATE_MS);
        return () => clearInterval(t);
    }, [pages.length]);

    const tickerText = useMemo(() => {
        if (orderedRows.length === 0) return '';
        return orderedRows
            .map(w => `${w.workstation_name} — ${w.user_name || 'Unassigned'} (${w.today_output ?? 0})`)
            .join('     •     ');
    }, [orderedRows]);

    const currentRows = pages[pageIdx] || [];

    return (
        <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
            <style>{`
                @keyframes wls-marquee {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .wls-marquee-track {
                    animation: wls-marquee 45s linear infinite;
                }
            `}</style>

            {/* Ticker */}
            <div className="shrink-0 h-14 bg-gray-950 border-b border-gray-800 flex items-center overflow-hidden relative">
                <div className="shrink-0 px-4 h-full flex items-center bg-black border-r border-gray-800 z-10">
                    <span className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                        Factory Live
                    </span>
                </div>
                <div className="flex-1 overflow-hidden whitespace-nowrap">
                    {tickerText && (
                        <div className="inline-flex wls-marquee-track">
                            <span className="text-lg font-bold text-gray-300 px-4">{tickerText}</span>
                            <span className="text-lg font-bold text-gray-300 px-4">{tickerText}</span>
                        </div>
                    )}
                </div>

                {/* Small, unobtrusive — this is a TV display, not a control
                    panel, but whoever sets up the screen still needs a way to
                    fix the row order once. */}
                <button
                    ref={settingsBtnRef}
                    onClick={() => setArrangeOpen(o => !o)}
                    title="Arrange row order"
                    className={`shrink-0 h-full px-3 flex items-center border-l border-gray-800 z-10 transition-colors ${arrangeOpen ? 'text-white bg-gray-800' : 'text-gray-600 hover:text-gray-300'}`}
                >
                    <SlidersHorizontal size={14} />
                </button>
            </div>

            {/* Rows — up to 6, filling the rest of the screen */}
            <div className="flex-1 flex flex-col">
                {rows === null ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-2xl font-bold">
                        Loading factory floor…
                    </div>
                ) : currentRows.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-2xl font-bold">
                        No active workstations configured.
                    </div>
                ) : (
                    currentRows.map(w => <WorkstationRow key={w.workstation_id} w={w} />)
                )}
            </div>

            {/* Page indicator, only when there's more than one page */}
            {pages.length > 1 && (
                <div className="shrink-0 flex items-center justify-center gap-1.5 py-2 bg-gray-950 border-t border-gray-800">
                    {pages.map((_, i) => (
                        <span key={i} className={`h-1.5 rounded-full transition-all ${i === pageIdx ? 'w-6 bg-emerald-400' : 'w-1.5 bg-gray-700'}`} />
                    ))}
                </div>
            )}

            {arrangeOpen && (
                <AnchoredPopover
                    anchorEl={settingsBtnRef.current}
                    onClose={() => setArrangeOpen(false)}
                    width={280}
                    align="right"
                    className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3"
                >
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Row order — also sets the ticker order
                    </p>
                    <div className="max-h-96 overflow-y-auto space-y-0.5 pr-1">
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
                                    <span className="text-gray-300 truncate">{w.workstation_name}</span>
                                    <span className="text-gray-600 truncate">— {w.user_name || 'Unassigned'}</span>
                                </div>
                            );
                        })}
                    </div>
                </AnchoredPopover>
            )}
        </div>
    );
}

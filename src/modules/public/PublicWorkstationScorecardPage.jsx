// ─── PUBLIC WORKSTATION SCORECARD (KIOSK / TV DISPLAY) ───────────────────────
// Deliberately unauthenticated — meant to be opened on a factory-floor TV or
// shared via a plain link, no login required. Full-screen, up to 6
// workstations visible at once, auto-rotating every 5s through the rest;
// a horizontal ticker across the top gives the full-factory overview at a
// glance. Live via the public WebSocket channel (see usePublicSocket.js /
// backend utils/websocket.js's ?public=1 opt-in) — falls back to a 60s
// safety-net poll in case a socket event is ever missed on an unattended
// screen with nobody around to notice.
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { SlidersHorizontal, GripVertical } from 'lucide-react';
import { publicApi } from '../../api/publicApi';
import usePublicSocket from './usePublicSocket';
import AnchoredPopover from '../../shared/AnchoredPopover';

const ROWS_PER_PAGE = 3;
const ROTATE_MS = 15000;
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
    dhu:      'text-cyan-400',
};

// DHU (Defects per Hundred Units), as defined for this scorecard: approved
// good pieces per defective piece — repaired + rework + rejected all count
// as a "defect" for this ratio. Null (rendered as "—") when there are no
// defects yet, rather than showing a division-by-zero artifact.
const computeDhu = (w) => {
    const defects = (w.today_repaired ?? 0) + (w.today_rework ?? 0) + (w.today_rejected ?? 0);
    return defects === 0 ? null : (w.today_approved ?? 0) / defects;
};

// Shortens a display name to at most MAX_NAME_LEN characters for the TV row
// and ticker — but if the name carries a trailing numeric id/code (e.g. an
// operator number like "Ravi Kumar 042"), that number is kept intact and the
// text before it is what gets cut, rather than truncating blindly from the
// end and risking chopping the number itself.
const MAX_NAME_LEN = 10;
const shortenUserName = (name) => {
    if (!name || name.length <= MAX_NAME_LEN) return name;

    const match = name.match(/^(.*?)[\s-]*(\d+)\s*$/);
    if (match) {
        const [, textPart, numPart] = match;
        const trimmedText = textPart.trim();
        const budget = MAX_NAME_LEN - numPart.length - 1; // -1 for the joining space
        if (budget > 0) {
            const shortText = trimmedText.length > budget ? trimmedText.slice(0, budget) : trimmedText;
            return shortText ? `${shortText} ${numPart}` : numPart;
        }
        return numPart.slice(0, MAX_NAME_LEN);
    }

    return name.slice(0, MAX_NAME_LEN);
};

// Font sizes are driven off the row's own MEASURED pixel height (see
// rowHeightPx in the page component, via ResizeObserver on the rows
// container) rather than a guessed vh fraction — that guess only held for
// whatever ROWS_PER_PAGE/ticker-height happened to be true at the time it was
// tuned, and silently went stale the moment either changed. Measuring is the
// only way to *guarantee* "fills the row" regardless of row count or the TV's
// reported resolution. Ratios below are of that measured row height; label +
// value (with its own gap) are sized to land close to the same total height
// as the single-line name/output text they sit beside, so the row reads as
// evenly filled left-to-right.
const NAME_RATIO  = 0.68;
const VALUE_RATIO = 0.50;
const LABEL_RATIO = 0.11;

// Shared column template — every row is its own CSS Grid using these exact
// fractions, so Approved/Repaired/Rework/Rejected/DHU/Today line up in
// identical X positions from row to row regardless of how wide any one
// row's name or numbers happen to render (a flex `min-w` layout doesn't
// guarantee that: a wider number in one row can push its own column wider
// than its neighbor above/below it, since each row's flex children size
// off their own content). Name gets the most room and stays left-aligned;
// every stat column is equal width and center-aligned; Today gets a little
// extra width plus its divider, same as before.
const ROW_GRID_COLS = '2fr 1fr 1fr 1fr 1fr 1fr 1.25fr';

const StatBlock = ({ label, value, cls, rowH }) => (
    <div className="flex flex-col items-center justify-center">
        <span
            className="uppercase tracking-widest font-bold text-gray-500 mb-1 leading-tight"
            style={{ fontSize: rowH * LABEL_RATIO }}
        >
            {label}
        </span>
        <span
            className={`leading-none font-black tabular-nums ${value > 0 ? cls : 'text-gray-700'}`}
            style={{ fontSize: rowH * VALUE_RATIO }}
        >
            {(value ?? 0).toLocaleString()}
        </span>
    </div>
);

const DhuBlock = ({ dhu, rowH }) => (
    <div className="flex flex-col items-center justify-center">
        <span
            className="uppercase tracking-widest font-bold text-gray-500 mb-1 leading-tight"
            style={{ fontSize: rowH * LABEL_RATIO }}
        >
            DHU
        </span>
        <span
            className={`leading-none font-black tabular-nums ${dhu !== null ? STAT_COLORS.dhu : 'text-gray-700'}`}
            style={{ fontSize: rowH * VALUE_RATIO }}
        >
            {dhu !== null ? dhu.toFixed(2) : '—'}
        </span>
    </div>
);

const WorkstationRow = ({ w, rowH }) => (
    <div
        className="flex-1 grid items-center gap-x-4 px-14 border-b border-gray-800 last:border-b-0"
        style={{ gridTemplateColumns: ROW_GRID_COLS }}
    >
        <div className="min-w-0">
            <p className="leading-none font-black text-white truncate" style={{ fontSize: rowH * NAME_RATIO }}>
                {w.user_name ? shortenUserName(w.user_name) : <span className="text-gray-600">Unassigned</span>}
            </p>
        </div>
        <StatBlock label="Approved" value={w.today_approved} cls={STAT_COLORS.approved} rowH={rowH} />
        <StatBlock label="Repaired" value={w.today_repaired} cls={STAT_COLORS.repaired} rowH={rowH} />
        <StatBlock label="Rework"   value={w.today_rework}   cls={STAT_COLORS.rework}   rowH={rowH} />
        <StatBlock label="Rejected" value={w.today_rejected} cls={STAT_COLORS.rejected} rowH={rowH} />
        <DhuBlock dhu={computeDhu(w)} rowH={rowH} />
        <div className="flex flex-col items-center justify-center pl-6 border-l border-gray-800 h-full">
            <span
                className="uppercase tracking-widest font-bold text-gray-500 mb-1 leading-tight"
                style={{ fontSize: rowH * LABEL_RATIO }}
            >
                Today
            </span>
            <span
                className="leading-none font-black text-white tabular-nums"
                style={{ fontSize: rowH * NAME_RATIO }}
            >
                {(w.today_output ?? 0).toLocaleString()}
            </span>
        </div>
    </div>
);

// ─── Mobile phone layout ──────────────────────────────────────────────────
// Same data, rendered as a plain scrollable list instead of the TV's
// timed-rotation pages — a phone has no "someone standing across the room"
// constraint, so there's no reason to hide rows behind a 15s rotation.
// Per request: only the user's name is shown per row, not the workstation.
const MOBILE_BREAKPOINT = 768;

function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < breakpoint
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const onChange = () => setIsMobile(mq.matches);
        onChange();
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, [breakpoint]);
    return isMobile;
}

const MobileStat = ({ label, value, cls }) => (
    <div className="flex flex-col items-center">
        <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500">{label}</span>
        <span className={`text-sm font-black tabular-nums ${value > 0 ? cls : 'text-gray-700'}`}>
            {(value ?? 0).toLocaleString()}
        </span>
    </div>
);

const MobileDhu = ({ dhu }) => (
    <div className="flex flex-col items-center">
        <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500">DHU</span>
        <span className={`text-sm font-black tabular-nums ${dhu !== null ? STAT_COLORS.dhu : 'text-gray-700'}`}>
            {dhu !== null ? dhu.toFixed(2) : '—'}
        </span>
    </div>
);

const MobileWorkstationRow = ({ w }) => (
    <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2 gap-2">
            <p className="text-base font-black text-white truncate">
                {w.user_name || <span className="text-gray-600">Unassigned</span>}
            </p>
            <span className="text-2xl font-black text-white tabular-nums shrink-0">
                {(w.today_output ?? 0).toLocaleString()}
            </span>
        </div>
        <div className="grid grid-cols-5 gap-1">
            <MobileStat label="Appr" value={w.today_approved} cls={STAT_COLORS.approved} />
            <MobileStat label="Rep"  value={w.today_repaired} cls={STAT_COLORS.repaired} />
            <MobileStat label="Rwk"  value={w.today_rework}   cls={STAT_COLORS.rework} />
            <MobileStat label="Rej"  value={w.today_rejected} cls={STAT_COLORS.rejected} />
            <MobileDhu dhu={computeDhu(w)} />
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

    // Measured height (px) of ONE row, from the actual rows container —
    // ResizeObserver-driven so font sizes (see NAME_RATIO etc. above) always
    // resolve against real available space, not a guessed viewport fraction.
    // Divides by ROWS_PER_PAGE (not currentRows.length) so text size stays
    // constant across pages even when the last page has fewer rows.
    const rowsContainerRef = useRef(null);
    const [rowHeightPx, setRowHeightPx] = useState(0);
    useLayoutEffect(() => {
        const el = rowsContainerRef.current;
        if (!el) return;
        const measure = () => setRowHeightPx(el.clientHeight / ROWS_PER_PAGE);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

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

    // Built as JSX items, not one joined string — so the count can carry its
    // own color (emerald once real output has landed today, muted otherwise)
    // instead of the whole ticker being flat gray text.
    const renderTickerItems = (copyKey) => orderedRows.map((w, i) => {
        const count = w.today_output ?? 0;
        return (
            <span key={`${copyKey}-${w.workstation_id}-${i}`} className="text-3xl font-bold whitespace-nowrap">
                <span className="text-gray-300">{w.user_name ? shortenUserName(w.user_name) : 'Unassigned'} </span>
                <span className={`font-black tabular-nums ${count > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                    ({count.toLocaleString()})
                </span>
                <span className="text-gray-700 mx-5">•</span>
            </span>
        );
    });

    const currentRows = pages[pageIdx] || [];
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
                <div className="shrink-0 h-12 bg-gray-950 border-b border-gray-800 flex items-center px-4 gap-2">
                    <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400">Factory Live</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {rows === null ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-base font-bold px-6 text-center">
                            Loading factory floor…
                        </div>
                    ) : orderedRows.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-base font-bold px-6 text-center">
                            No active workstations configured.
                        </div>
                    ) : (
                        orderedRows.map(w => <MobileWorkstationRow key={w.workstation_id} w={w} />)
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
            <style>{`
                @keyframes wls-marquee {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .wls-marquee-track {
                    animation: wls-marquee 60s linear infinite;
                }
            `}</style>

            {/* Ticker */}
            <div className="shrink-0 h-20 bg-gray-950 border-b border-gray-800 flex items-center overflow-hidden relative">
                <div className="shrink-0 px-6 h-full flex items-center bg-black border-r border-gray-800 z-10">
                    <span className="text-base font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                        Factory Live
                    </span>
                </div>
                <div className="flex-1 overflow-hidden whitespace-nowrap">
                    {orderedRows.length > 0 && (
                        <div className="inline-flex wls-marquee-track px-4">
                            {renderTickerItems('a')}
                            {renderTickerItems('b')}
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
                    className={`shrink-0 h-full px-4 flex items-center border-l border-gray-800 z-10 transition-colors ${arrangeOpen ? 'text-white bg-gray-800' : 'text-gray-600 hover:text-gray-300'}`}
                >
                    <SlidersHorizontal size={20} />
                </button>
            </div>

            {/* Rows — up to 6, filling the rest of the screen */}
            <div ref={rowsContainerRef} className="flex-1 flex flex-col">
                {rows === null ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-5xl font-bold">
                        Loading factory floor…
                    </div>
                ) : currentRows.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-5xl font-bold">
                        No active workstations configured.
                    </div>
                ) : (
                    currentRows.map(w => <WorkstationRow key={w.workstation_id} w={w} rowH={rowHeightPx} />)
                )}
            </div>

            {/* Page indicator, only when there's more than one page */}
            {pages.length > 1 && (
                <div className="shrink-0 flex items-center justify-center gap-2 py-3 bg-gray-950 border-t border-gray-800">
                    {pages.map((_, i) => (
                        <span key={i} className={`h-2.5 rounded-full transition-all ${i === pageIdx ? 'w-10 bg-emerald-400' : 'w-2.5 bg-gray-700'}`} />
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

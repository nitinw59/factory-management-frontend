// ─── PUBLIC WORKSTATION SCORECARD (KIOSK / TV DISPLAY) ───────────────────────
// Deliberately unauthenticated — meant to be opened on a factory-floor TV or
// shared via a plain link, no login required. Full-screen, up to 6
// workstations visible at once, auto-rotating every 5s through the rest;
// a horizontal ticker across the top gives the full-factory overview at a
// glance. Live via the public WebSocket channel (see usePublicSocket.js /
// backend utils/websocket.js's ?public=1 opt-in) — falls back to a 60s
// safety-net poll in case a socket event is ever missed on an unattended
// screen with nobody around to notice.
//
// Row order is set by an admin on /admin/company-profile (Kiosk Scorecard —
// Row Order card), not on this page — a TV has no keyboard/mouse to
// drag-reorder with, so it just reads whatever order was last saved there
// (see publicApi.getWorkstationScorecardOrder, refreshed on the same cycle
// as the scorecard data itself) instead of keeping its own per-device
// localStorage copy.
//
// Idle-screen cycle (TV layout only): the grid shows for GRID_MS, then an
// animated idle screen takes over for IDLE_MS, then back to the grid, and so
// on. There are two idle screens — the animated MC logo and the "MATRIX
// OVERSEAS" wordmark — each switched on/off by an admin on /admin/company-
// profile. When both are on they alternate (logo, wordmark, logo, …), one per
// idle window; when both are off the grid simply stays up. The grid stays
// mounted underneath (the idle screen is a fixed overlay) so its size
// measurements, live data and websocket keep running — the grid is already
// current the instant the overlay fades out.
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { publicApi } from '../../api/publicApi';
import usePublicSocket from './usePublicSocket';
import AnimatedMatrixLogo from './AnimatedMatrixLogo';
import AnimatedMatrixWordmark from './AnimatedMatrixWordmark';

const ROWS_PER_PAGE = 3;
const ROTATE_MS = 15000;
const SAFETY_POLL_MS = 60000;
const GRID_MS = 60000;  // how long the scorecard grid shows before the logo
const IDLE_MS = 12000;  // how long an idle animation shows before the grid returns
const FADE_MS = 700;    // cross-fade between grid and idle screen

const STAT_COLORS = {
    approved: 'text-emerald-400',
    repaired: 'text-amber-400',
    rework:   'text-orange-400',
    rejected: 'text-red-400',
    dhu:      'text-cyan-400',
};

// DHU — Defects per Hundred Units, the standard definition (lower is better):
//   DHU = defects ÷ units checked × 100
// defects       = repaired + rework + rejected (every piece that needed
//                 attention, including ones already fixed)
// units checked = approved + defects (every piece that reached a final
//                 status today at this workstation)
// Null (rendered as "—") only when nothing has been checked yet; a workstation
// with checked units and no defects is a real 0.00, not "no data".
const computeDhu = (w) => {
    const defects = (w.today_repaired ?? 0) + (w.today_rework ?? 0) + (w.today_rejected ?? 0);
    const units = (w.today_approved ?? 0) + defects;
    return units === 0 ? null : (defects / units) * 100;
};

// Names are shown IN FULL, wrapped onto at most two lines (no character cap).
// The name font size is shared by every row (so the column looks uniform) and
// is chosen so the LONGEST name still fits on two lines: charsPerLineNeeded()
// simulates greedy word-wrapping to find the narrowest line width (in
// characters) at which a given name needs no more than two lines, and the
// page takes the max across all workstations. Names that are short enough
// for one line just use one; NAME_ONE_LINE_CHARS is the width the size was
// originally tuned for, so a roster of short names looks exactly as before.
const NAME_ONE_LINE_CHARS = 10;
const charsPerLineNeeded = (name) => {
    const text = (name || '').trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    const longestWord = Math.max(...words.map(w => w.length));
    const linesAt = (cpl) => {
        let lines = 1, cur = 0;
        for (const w of words) {
            if (cur === 0) cur = w.length;
            else if (cur + 1 + w.length <= cpl) cur += 1 + w.length;
            else { lines++; cur = w.length; }
        }
        return lines;
    };
    for (let cpl = longestWord; cpl < text.length; cpl++) if (linesAt(cpl) <= 2) return cpl;
    return text.length;
};

// Font sizes come from the row's MEASURED size (see `dims` in the page
// component, via ResizeObserver on the rows container), and each one is the
// SMALLER of two limits: a fraction of the row height (so text scales with
// the screen and fills the row sensibly) and whatever actually fits inside
// that column's measured width (so a wide number / long label can never
// spill into its neighbour). Sizing from height alone is what let text
// overlap on wide-but-short or narrow columns.
const NAME_RATIO  = 0.30;
const VALUE_RATIO = 0.26;
const LABEL_RATIO = 0.07;

// Shared column template — every row is its own CSS Grid using these exact
// percentages, so Approved/Repaired/Rework/Rejected/DHU/Today line up in
// identical X positions from row to row. Name is locked to 30%; the other
// six columns split the remaining 70% (five equal + Today slightly wider).
// NO grid gap: the percentages already sum to 100% of the row's content box,
// so any gap would push the last column past the right edge. Spacing comes
// from per-cell padding instead (CELL_PAD_X etc. below, which the width-fit
// maths also subtracts).
const ROW_GRID_COLS = '30% 11.2% 11.2% 11.2% 11.2% 11.2% 14%';
const COL_FRAC = { name: 0.30, stat: 0.112, today: 0.14 };
const ROW_PAD_X    = 32; // px-8 on the row, each side
const CELL_PAD_X   = 8;  // px-2 on stat cells, each side
const TODAY_PAD_X  = 12; // px-3 on the Today cell, each side
const NAME_PAD_R   = 16; // pr-4 on the name cell
const DIGIT_EM     = 0.62; // approx width of a font-black tabular digit, in em
const LABEL_EM     = 0.85; // approx width of an uppercase tracking-widest label char, in em

const fit = (availPx, chars, em) => Math.max(10, availPx / (chars * em));

// rowH = height of one row (px), contentW = row content width (px, i.e. the
// rows container width minus the row's own horizontal padding).
const computeSizes = (rowH, containerW, nameCpl) => {
    const contentW = Math.max(0, containerW - ROW_PAD_X * 2);
    const statW  = contentW * COL_FRAC.stat  - CELL_PAD_X * 2;
    const todayW = contentW * COL_FRAC.today - TODAY_PAD_X * 2;
    const nameW  = contentW * COL_FRAC.name  - NAME_PAD_R;
    return {
        name:       Math.min(rowH * NAME_RATIO,  fit(nameW,  Math.max(NAME_ONE_LINE_CHARS, nameCpl), 0.66)),
        value:      Math.min(rowH * VALUE_RATIO, fit(statW,  6, DIGIT_EM)),   // e.g. "12,345"
        today:      Math.min(rowH * NAME_RATIO,  fit(todayW, 6, DIGIT_EM)),
        label:      Math.min(rowH * LABEL_RATIO, fit(statW,  8, LABEL_EM)),   // "APPROVED"
        todayLabel: Math.min(rowH * LABEL_RATIO, fit(todayW, 5, LABEL_EM)),
    };
};

const StatBlock = ({ label, value, cls, sz }) => (
    <div className="min-w-0 overflow-hidden px-2 flex flex-col items-center justify-center">
        <span
            className="uppercase tracking-widest font-bold text-gray-500 mb-1 leading-tight whitespace-nowrap"
            style={{ fontSize: sz.label }}
        >
            {label}
        </span>
        <span
            className={`leading-none font-black tabular-nums whitespace-nowrap ${value > 0 ? cls : 'text-gray-700'}`}
            style={{ fontSize: sz.value }}
        >
            {(value ?? 0).toLocaleString()}
        </span>
    </div>
);

const DhuBlock = ({ dhu, sz }) => (
    <div className="min-w-0 overflow-hidden px-2 flex flex-col items-center justify-center">
        <span
            className="uppercase tracking-widest font-bold text-gray-500 mb-1 leading-tight whitespace-nowrap"
            style={{ fontSize: sz.label }}
        >
            DHU
        </span>
        <span
            className={`leading-none font-black tabular-nums whitespace-nowrap ${dhu !== null ? STAT_COLORS.dhu : 'text-gray-700'}`}
            style={{ fontSize: sz.value }}
        >
            {dhu !== null ? dhu.toFixed(2) : '—'}
        </span>
    </div>
);

const WorkstationRow = ({ w, sz }) => (
    <div
        className="flex-1 grid items-center px-8 border-b border-gray-800 last:border-b-0"
        style={{ gridTemplateColumns: ROW_GRID_COLS }}
    >
        <div className="min-w-0 pr-4">
            <p
                className="font-black text-white break-words"
                style={{
                    fontSize: sz.name, lineHeight: 1.15,
                    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
                }}
            >
                {w.user_name || <span className="text-gray-600">Unassigned</span>}
            </p>
        </div>
        <StatBlock label="Approved" value={w.today_approved} cls={STAT_COLORS.approved} sz={sz} />
        <StatBlock label="Repaired" value={w.today_repaired} cls={STAT_COLORS.repaired} sz={sz} />
        <StatBlock label="Rework"   value={w.today_rework}   cls={STAT_COLORS.rework}   sz={sz} />
        <StatBlock label="Rejected" value={w.today_rejected} cls={STAT_COLORS.rejected} sz={sz} />
        <DhuBlock dhu={computeDhu(w)} sz={sz} />
        <div className="min-w-0 overflow-hidden px-3 flex flex-col items-center justify-center border-l border-gray-800 h-full">
            <span
                className="uppercase tracking-widest font-bold text-gray-500 mb-1 leading-tight whitespace-nowrap"
                style={{ fontSize: sz.todayLabel }}
            >
                Today
            </span>
            <span
                className="leading-none font-black text-white tabular-nums whitespace-nowrap"
                style={{ fontSize: sz.today }}
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

    // Server-saved order (set by an admin on /admin/company-profile), not a
    // per-device localStorage copy — refreshed on the same cycle as the
    // scorecard data itself so a remote order change is picked up here
    // without needing to reload this screen.
    const [rowOrder, setRowOrder] = useState([]); // workstation_id[] as strings
    // Which idle animations an admin has left switched on (both default on,
    // and stay on if the setting can't be read).
    const [options, setOptions] = useState({ show_logo: true, show_wordmark: true });

    // Measured size of the rows container — ResizeObserver-driven so font
    // sizes (see computeSizes above) always resolve against real available
    // space, not a guessed viewport fraction. Row height divides by
    // ROWS_PER_PAGE (not currentRows.length) so text size stays constant
    // across pages even when the last page has fewer rows.
    const rowsContainerRef = useRef(null);
    const [dims, setDims] = useState({ rowH: 0, w: 0 });
    useLayoutEffect(() => {
        const el = rowsContainerRef.current;
        if (!el) return;
        const measure = () => setDims({ rowH: el.clientHeight / ROWS_PER_PAGE, w: el.clientWidth });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const fetchRows = useCallback(() => {
        Promise.all([
            publicApi.getWorkstationScorecard(),
            publicApi.getWorkstationScorecardOrder(),
        ])
            .then(([dataRes, orderRes]) => {
                setRows(dataRes.data);
                setRowOrder((orderRes.data?.order ?? []).map(String));
                const o = orderRes.data?.options;
                setOptions(prev => {
                    const next = { show_logo: o?.show_logo !== false, show_wordmark: o?.show_wordmark !== false };
                    return prev.show_logo === next.show_logo && prev.show_wordmark === next.show_wordmark ? prev : next;
                });
            })
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

    // Grid ⇄ idle-screen timer. `phase` is what's logically showing;
    // `idleMounted` lags it on the way OUT so the overlay can fade away
    // instead of vanishing. `idleKind` holds which animation is up.
    const idleKinds = [options.show_logo && 'logo', options.show_wordmark && 'wordmark'].filter(Boolean);
    const idleKindsRef = useRef(idleKinds);
    idleKindsRef.current = idleKinds;
    const nextIdleRef = useRef(0);
    const [phase, setPhase] = useState('grid'); // 'grid' | 'idle'
    const [idleKind, setIdleKind] = useState(null); // 'logo' | 'wordmark'
    const [idleMounted, setIdleMounted] = useState(false);
    const [windowN, setWindowN] = useState(0); // bumps to re-arm the grid timer when nothing is enabled
    useEffect(() => {
        const t = setTimeout(() => {
            if (phase === 'grid') {
                const kinds = idleKindsRef.current; // read at fire time, so a settings change applies to the very next window
                if (kinds.length === 0) { setWindowN(n => n + 1); return; }
                setIdleKind(kinds[nextIdleRef.current % kinds.length]);
                nextIdleRef.current += 1;
                setIdleMounted(true);
                setPhase('idle');
            } else {
                setPhase('grid');
            }
        }, phase === 'grid' ? GRID_MS : IDLE_MS);
        return () => clearTimeout(t);
    }, [phase, windowN]);
    useEffect(() => {
        if (phase !== 'grid' || !idleMounted) return;
        const t = setTimeout(() => setIdleMounted(false), FADE_MS + 100);
        return () => clearTimeout(t);
    }, [phase, idleMounted]);

    // Single source of truth for display order — both the rotating rows and
    // the ticker read from this, so they always agree. Any workstation not
    // (yet) in the saved order — new since an admin last set it — is appended
    // at the end rather than dropped.
    const orderedRows = useMemo(() => {
        if (!rows) return [];
        const byId = new Map(rows.map(r => [String(r.workstation_id), r]));
        const ordered = rowOrder.map(id => byId.get(id)).filter(Boolean);
        rows.forEach(r => { if (!rowOrder.includes(String(r.workstation_id))) ordered.push(r); });
        return ordered;
    }, [rows, rowOrder]);

    // One shared name font size, chosen so the longest name across ALL
    // workstations still fits on two lines (see charsPerLineNeeded above).
    const nameCpl = useMemo(
        () => Math.max(0, ...orderedRows.map(w => charsPerLineNeeded(w.user_name || 'Unassigned'))),
        [orderedRows]
    );
    const sizes = useMemo(() => computeSizes(dims.rowH, dims.w, nameCpl), [dims, nameCpl]);

    const pages = useMemo(() => {
        const out = [];
        for (let i = 0; i < orderedRows.length; i += ROWS_PER_PAGE) out.push(orderedRows.slice(i, i + ROWS_PER_PAGE));
        return out.length > 0 ? out : [[]];
    }, [orderedRows]);

    // Clamp + rotate — clamp handles the list shrinking (e.g. a workstation
    // deactivated) leaving the index pointing past the new last page.
    useEffect(() => { setPageIdx(i => (pages.length ? i % pages.length : 0)); }, [pages.length]);
    useEffect(() => {
        // Held while an idle animation is showing so no page is silently skipped behind it.
        if (pages.length <= 1 || phase === 'idle') return;
        const t = setInterval(() => setPageIdx(i => (i + 1) % pages.length), ROTATE_MS);
        return () => clearInterval(t);
    }, [pages.length, phase]);

    // Built as JSX items, not one joined string — so the count can carry its
    // own color (emerald once real output has landed today, muted otherwise)
    // instead of the whole ticker being flat gray text.
    const renderTickerItems = (copyKey) => orderedRows.map((w, i) => {
        const count = w.today_output ?? 0;
        return (
            <span key={`${copyKey}-${w.workstation_id}-${i}`} className="text-4xl font-bold whitespace-nowrap">
                <span className="text-gray-300">{w.user_name || 'Unassigned'} </span>
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
                @keyframes wls-idle-in  { from { opacity: 0; } to { opacity: 1; } }
                @keyframes wls-idle-out { from { opacity: 1; } to { opacity: 0; } }
                .wls-marquee-track {
                    animation: wls-marquee 60s linear infinite;
                }
            `}</style>

            {/* Ticker */}
            <div className="shrink-0 h-24 bg-gray-950 border-b border-gray-800 flex items-center overflow-hidden relative">
                <div className="shrink-0 px-5 h-full flex items-center bg-black border-r border-gray-800 z-10">
                    <span className="text-base font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
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
            </div>

            {/* Rows — up to 6, filling the rest of the screen */}
            <div ref={rowsContainerRef} className="flex-1 flex flex-col">
                {rows === null ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-4xl font-bold">
                        Loading factory floor…
                    </div>
                ) : currentRows.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-4xl font-bold">
                        No active workstations configured.
                    </div>
                ) : (
                    currentRows.map(w => <WorkstationRow key={w.workstation_id} w={w} sz={sizes} />)
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

            {/* Idle screen — an animation laid OVER the still-mounted grid,
                fading in/out; unmounted after the fade so it restarts from
                the top on its next turn. */}
            {idleMounted && (
                <div
                    className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden"
                    style={{ animation: `${phase === 'idle' ? 'wls-idle-in' : 'wls-idle-out'} ${FADE_MS}ms ease forwards` }}
                >
                    {idleKind === 'wordmark' ? <AnimatedMatrixWordmark /> : <AnimatedMatrixLogo />}
                </div>
            )}
        </div>
    );
}

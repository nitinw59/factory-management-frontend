import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { liveQcApi } from '../../api/liveQcApi';
import { productionManagerApi } from '../../api/productionManagerApi';
import useLiveQcSocket from './useLiveQcSocket';
import LiveDrilldownModal from './LiveDrilldownModal';
import LiveLineStatsModal from './LiveLineStatsModal';
import { dhuLevel, DHU_STYLES, FRESH_MS } from './liveQcConstants';
import {
    Loader2, AlertCircle, Wifi, WifiOff,
    Scissors, Shirt, Activity, Radio, ChevronLeft, ChevronRight,
} from 'lucide-react';

// Manager-only — narrower than the broader /qa-portal shell gate, matching
// the roles the backend actually broadcasts QC_LIVE_EVENT to (see
// backend/utils/websocket.js LIVE_QC_VIEWER_ROLES).
const LIVE_QC_ROLES = ['factory_admin', 'production_manager', 'quality_manager', 'cutting_manager'];

const MAX_FEED = 50;
const LINES_PER_PAGE = 4;
const ROTATE_MS = 20_000; // auto-advance to the next 4 lines every 20s

const STATUS_CLS = {
    APPROVED:     'bg-emerald-100 text-emerald-700 border-emerald-200',
    REPAIRED:     'bg-sky-100 text-sky-700 border-sky-200',
    NEEDS_REWORK: 'bg-amber-100 text-amber-700 border-amber-200',
    QC_REJECTED:  'bg-red-100 text-red-700 border-red-200',
};

const timeAgo = (iso) => {
    if (!iso) return null;
    const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
};

const SectionCard = ({ title, children, right }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{title}</h3>
            {right}
        </div>
        {children}
    </div>
);

// One line's full tree: header (name + today's checked/defects/DHU + a
// freshness pulse, click opens LiveLineStatsModal for the top-defects
// breakdown) with its workstations branching below it using literal
// box-drawing connectors (├────► / └────►), each independently clickable
// into that workstation's checker-scoped log.
const LineTreeCard = ({ line, now, onHeaderClick, onWorkstationClick }) => {
    const { checked = 0, defects = 0, lastAt = null, workstations = [] } = line;
    const dhu = checked > 0 ? (defects / checked) * 100 : null;
    const style = DHU_STYLES[dhuLevel(dhu)];
    const isFresh = lastAt && (now - new Date(lastAt).getTime()) < FRESH_MS;

    return (
        <div className={`rounded-xl border shadow-sm p-4 ${style.bg}`}>
            <button onClick={onHeaderClick} className="w-full text-left mb-3 group">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-black text-slate-800 truncate group-hover:underline">{line.name}</p>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600"><strong className="text-slate-800">{checked.toLocaleString()}</strong> checked</span>
                    <span className="text-red-500 font-bold">{defects.toLocaleString()} defect{defects === 1 ? '' : 's'}</span>
                    <span className={`font-bold ${style.text}`}>{dhu != null ? `${dhu.toFixed(1)} DHU` : '— DHU'}</span>
                </div>
            </button>

            {workstations.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No workstations configured for this line.</p>
            ) : (
                <div className="font-mono text-[11px] leading-relaxed">
                    <p className="text-slate-300">│</p>
                    {workstations.map((ws, i) => {
                        const isLast = i === workstations.length - 1;
                        const wsFresh = ws.last_check_at && (now - new Date(ws.last_check_at).getTime()) < FRESH_MS;
                        return (
                            <button
                                key={ws.workstation_id}
                                onClick={() => onWorkstationClick(ws)}
                                className="w-full flex items-center gap-1.5 text-left hover:bg-white/60 rounded px-1 -mx-1 transition"
                            >
                                <span className="text-slate-300 shrink-0">{isLast ? '└────►' : '├────►'}</span>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${wsFresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                <span className="font-sans font-semibold text-slate-700 truncate">{ws.workstation_name}</span>
                                <span className="font-sans text-slate-400 truncate ml-auto shrink-0 text-[10px]">
                                    {ws.checked_today}✓{ws.defects_today > 0 ? ` ${ws.defects_today}✗` : ''}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const FeedRow = ({ e, onClick }) => {
    const Icon = e.level === 'garment' ? Shirt : Scissors;
    const hasDetail = e.check_log_ids?.length > 0;
    return (
        <div
            onClick={hasDetail ? onClick : undefined}
            className={`flex items-center gap-3 py-2 px-1 hover:bg-slate-50 rounded-lg text-sm ${hasDetail ? 'cursor-pointer' : ''}`}
        >
            <Icon size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 w-16 shrink-0 tabular-nums">{timeAgo(e.created_at)}</span>
            <span className="font-semibold text-slate-700 truncate w-32 shrink-0">{e.line_name || `Line #${e.line_id}`}</span>
            <span className="text-slate-500 truncate w-28 shrink-0">{e.batch_code || `Batch #${e.batch_id}`}</span>
            <span className="text-slate-600 tabular-nums shrink-0">{e.qty_checked} pcs</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${STATUS_CLS[e.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {e.status?.replace(/_/g, ' ')}
            </span>
            {e.defect_code && (
                <span className="text-xs text-slate-400 truncate">{e.defect_code} — {e.description}</span>
            )}
            <span className="text-xs text-slate-400 truncate ml-auto shrink-0">{e.detected_by_name}</span>
        </div>
    );
};

const LiveQcTrackingPage = () => {
    const { user } = useAuth();
    const [lines, setLines] = useState({}); // line_id -> { name, checked, defects, lastAt, lastBy }
    const [workstationsByLine, setWorkstationsByLine] = useState({}); // line_id -> [{ workstation_id, ... }]
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [now, setNow] = useState(Date.now());
    // { mode: 'line', lineId, lineName, defectsOnly?, checkedByUserId?, checkerName? } | { mode: 'ids', ids, title } | null
    const [drilldown, setDrilldown] = useState(null);
    // { lineId, lineName } | null — the stats summary opened by clicking a line's header
    const [statsLine, setStatsLine] = useState(null);
    const [page, setPage] = useState(0); // which batch of LINES_PER_PAGE lines is showing
    const [hovering, setHovering] = useState(false);

    // Re-render every few seconds so "Xs ago" / freshness pulses stay current
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(t);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [lineRes, summaryRes, workstationsRes] = await Promise.all([
                productionManagerApi.getAllProductionLines(),
                liveQcApi.getTodaySummary(),
                liveQcApi.getAllWorkstations(),
            ]);
            const summaryByLine = {};
            (summaryRes.data || []).forEach(s => { summaryByLine[s.line_id] = s; });
            const next = {};
            (lineRes.data || []).filter(l => l.is_active).forEach(l => {
                const s = summaryByLine[l.id];
                next[l.id] = {
                    name: l.name,
                    checked: parseInt(s?.checked_count, 10) || 0,
                    defects: parseInt(s?.defect_count, 10) || 0,
                    lastAt: s?.updated_at || null,
                    lastBy: null,
                };
            });
            setLines(next);

            const wsByLine = {};
            (workstationsRes.data || []).forEach(ws => {
                (wsByLine[ws.line_id] ??= []).push({
                    workstation_id: ws.workstation_id,
                    workstation_name: ws.workstation_name,
                    type_name: ws.type_name,
                    sequence_no: ws.sequence_no,
                    checker_user_id: ws.checker_user_id,
                    checker_name: ws.checker_name,
                    checked_today: parseInt(ws.checked_today, 10) || 0,
                    defects_today: parseInt(ws.defects_today, 10) || 0,
                    last_check_at: ws.last_check_at,
                });
            });
            setWorkstationsByLine(wsByLine);
        } catch (e) {
            setError(e?.response?.data?.error || 'Failed to load live QC data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onEvent = useCallback((e) => {
        setFeed(prev => [e, ...prev].slice(0, MAX_FEED));
        setLines(prev => {
            const existing = prev[e.line_id] || { name: e.line_name || `Line #${e.line_id}`, checked: 0, defects: 0 };
            return {
                ...prev,
                [e.line_id]: {
                    ...existing,
                    name: existing.name || e.line_name,
                    checked: existing.checked + (e.qty_checked || 0),
                    defects: existing.defects + (e.qty_defect || 0),
                    lastAt: e.created_at,
                    lastBy: e.detected_by_name,
                },
            };
        });
        // Bump the matching workstation too — today's counts only (no
        // rolling last-hour window to drift here, unlike the deeper modals'
        // fresh server fetches), keyed by checker since a workstation has no
        // id of its own in qc_live_check_log.
        setWorkstationsByLine(prev => {
            const list = prev[e.line_id];
            if (!list) return prev;
            let matched = false;
            const nextList = list.map(ws => {
                if (ws.checker_user_id !== e.detected_by_user_id) return ws;
                matched = true;
                return {
                    ...ws,
                    checked_today: ws.checked_today + (e.qty_checked || 0),
                    defects_today: ws.defects_today + (e.qty_defect || 0),
                    last_check_at: e.created_at,
                };
            });
            return matched ? { ...prev, [e.line_id]: nextList } : prev;
        });
    }, []);

    const connected = useLiveQcSocket(onEvent);

    const lineTrees = useMemo(
        () => Object.entries(lines)
            .map(([id, l]) => ({ id, ...l, workstations: workstationsByLine[id] || [] }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        [lines, workstationsByLine]
    );

    const linePages = useMemo(() => {
        const pages = [];
        for (let i = 0; i < lineTrees.length; i += LINES_PER_PAGE) pages.push(lineTrees.slice(i, i + LINES_PER_PAGE));
        return pages;
    }, [lineTrees]);

    const totalPages = linePages.length;

    // Clamp page if the line count shrinks (e.g. a line goes inactive)
    useEffect(() => {
        if (page > 0 && page >= totalPages) setPage(0);
    }, [totalPages, page]);

    // Auto-rotate through the pages — paused while a modal from this page is
    // open (reading detail shouldn't get yanked away) or while hovering the
    // board (someone's actively looking at it on a laptop, not a wall TV).
    const paused = !!statsLine || !!drilldown || hovering;
    useEffect(() => {
        if (paused || totalPages <= 1) return undefined;
        const t = setInterval(() => setPage(p => (p + 1) % totalPages), ROTATE_MS);
        return () => clearInterval(t);
    }, [paused, totalPages]);

    const currentLines = linePages[page] || [];

    // This page is the /qa-portal index route — roles that can't see it land
    // on Analytics instead of a dead end.
    if (!LIVE_QC_ROLES.includes(user?.role)) {
        return <Navigate to="/qa-portal/analytics" replace />;
    }

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                        <Activity size={22} className="text-indigo-600" /> Live QC Tracking
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Today's floor activity, pushed live from every checking workstation</p>
                </div>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${connected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {connected ? <Wifi size={13} /> : <WifiOff size={13} />} {connected ? 'Live' : 'Reconnecting…'}
                </span>
            </div>

            {loading && (
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="animate-spin h-10 w-10 text-indigo-500" />
                </div>
            )}
            {!loading && error && (
                <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            {!loading && !error && (
                <>
                    <SectionCard
                        title="Lines"
                        right={totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPage(p => (p - 1 + totalPages) % totalPages)} className="p-1 rounded hover:bg-slate-100 text-slate-400 transition" title="Previous 4 lines">
                                    <ChevronLeft size={15} />
                                </button>
                                <div className="flex items-center gap-1">
                                    {linePages.map((_, i) => (
                                        <button
                                            key={i} onClick={() => setPage(i)}
                                            className={`h-1.5 rounded-full transition-all ${i === page ? 'w-4 bg-indigo-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'}`}
                                            title={`Lines ${i * LINES_PER_PAGE + 1}–${Math.min((i + 1) * LINES_PER_PAGE, lineTrees.length)}`}
                                        />
                                    ))}
                                </div>
                                <button onClick={() => setPage(p => (p + 1) % totalPages)} className="p-1 rounded hover:bg-slate-100 text-slate-400 transition" title="Next 4 lines">
                                    <ChevronRight size={15} />
                                </button>
                                {!paused && <span className="text-[9px] text-slate-300 ml-1">auto</span>}
                            </div>
                        )}
                    >
                        {lineTrees.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-8">No active production lines found.</p>
                        ) : (
                            <div
                                onMouseEnter={() => setHovering(true)}
                                onMouseLeave={() => setHovering(false)}
                                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                            >
                                {currentLines.map(l => (
                                    <LineTreeCard
                                        key={l.id} line={l} now={now}
                                        onHeaderClick={() => setStatsLine({ lineId: l.id, lineName: l.name })}
                                        onWorkstationClick={(ws) => setDrilldown({
                                            mode: 'line', lineId: l.id, lineName: l.name,
                                            checkedByUserId: ws.checker_user_id, checkerName: ws.checker_name,
                                        })}
                                    />
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard
                        title="Live Feed"
                        right={<span className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><Radio size={11} /> most recent {MAX_FEED}</span>}
                    >
                        {feed.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-8">No checks logged yet since this page opened — the feed fills in as checks come through.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                                {feed.map((e, i) => (
                                    <FeedRow
                                        key={`${e.created_at}-${i}`} e={e}
                                        onClick={() => setDrilldown({
                                            mode: 'ids', ids: e.check_log_ids,
                                            title: `${e.line_name || `Line #${e.line_id}`} · ${e.batch_code || `Batch #${e.batch_id}`}`,
                                        })}
                                    />
                                ))}
                            </div>
                        )}
                    </SectionCard>
                </>
            )}

            {statsLine && (
                <LiveLineStatsModal
                    lineId={statsLine.lineId}
                    lineName={statsLine.lineName}
                    onClose={() => setStatsLine(null)}
                    onViewLog={() => {
                        setDrilldown({ mode: 'line', lineId: statsLine.lineId, lineName: statsLine.lineName });
                        setStatsLine(null);
                    }}
                />
            )}
            {drilldown && <LiveDrilldownModal {...drilldown} onClose={() => setDrilldown(null)} />}
        </div>
    );
};

export default LiveQcTrackingPage;

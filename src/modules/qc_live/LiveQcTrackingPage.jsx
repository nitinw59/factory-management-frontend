import { useState, useEffect, useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { liveQcApi } from '../../api/liveQcApi';
import { productionManagerApi } from '../../api/productionManagerApi';
import useLiveQcSocket from './useLiveQcSocket';
import LiveDrilldownModal from './LiveDrilldownModal';
import {
    Loader2, AlertCircle, Wifi, WifiOff,
    Scissors, Shirt, Activity, Radio,
} from 'lucide-react';

// Manager-only — narrower than the broader /qa-portal shell gate, matching
// the roles the backend actually broadcasts QC_LIVE_EVENT to (see
// backend/utils/websocket.js LIVE_QC_VIEWER_ROLES).
const LIVE_QC_ROLES = ['factory_admin', 'production_manager', 'quality_manager', 'cutting_manager'];

const MAX_FEED = 50;
const FRESH_MS = 30_000; // "active now" pulse window

const dhuLevel = (dhu) => {
    if (dhu == null) return 'neutral';
    if (dhu < 5)   return 'good';
    if (dhu < 20)  return 'warn';
    if (dhu < 50)  return 'bad';
    return 'critical';
};
const DHU_STYLES = {
    good:     { text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    warn:     { text: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
    bad:      { text: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
    critical: { text: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
    neutral:  { text: 'text-slate-400',   bg: 'bg-slate-50 border-slate-200' },
};

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

const LineCard = ({ line, now, onClick }) => {
    const { checked = 0, defects = 0, lastAt = null, lastBy = null } = line;
    const dhu = checked > 0 ? (defects / checked) * 100 : null;
    const style = DHU_STYLES[dhuLevel(dhu)];
    const isFresh = lastAt && (now - new Date(lastAt).getTime()) < FRESH_MS;

    return (
        <div
            onClick={onClick}
            className={`rounded-xl border shadow-sm p-4 cursor-pointer hover:shadow-md hover:brightness-[0.98] transition ${style.bg}`}
        >
            <div className="flex items-center justify-between mb-2">
                <p className="font-black text-slate-800 truncate">{line.name}</p>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isFresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Checked</p>
                    <p className="text-xl font-extrabold text-slate-800">{checked.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Defects</p>
                    <p className="text-xl font-extrabold text-slate-800">{defects.toLocaleString()}</p>
                </div>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className={`font-bold ${style.text}`}>{dhu != null ? `${dhu.toFixed(1)} DHU` : '— DHU'}</span>
                <span className="text-slate-400 truncate ml-2">
                    {lastAt ? `${timeAgo(lastAt)}${lastBy ? ` · ${lastBy}` : ''}` : 'no checks yet'}
                </span>
            </div>
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
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [now, setNow] = useState(Date.now());
    // { mode: 'line', lineId, lineName } | { mode: 'ids', ids, title } | null
    const [drilldown, setDrilldown] = useState(null);

    // Re-render every few seconds so "Xs ago" / freshness pulses stay current
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(t);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [lineRes, summaryRes] = await Promise.all([
                productionManagerApi.getAllProductionLines(),
                liveQcApi.getTodaySummary(),
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
    }, []);

    const connected = useLiveQcSocket(onEvent);

    const lineCards = useMemo(
        () => Object.entries(lines).map(([id, l]) => ({ id, ...l })).sort((a, b) => a.name.localeCompare(b.name)),
        [lines]
    );

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
                    <SectionCard title="Lines">
                        {lineCards.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-8">No active production lines found.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {lineCards.map(l => (
                                    <LineCard
                                        key={l.id} line={l} now={now}
                                        onClick={() => setDrilldown({ mode: 'line', lineId: l.id, lineName: l.name })}
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

            {drilldown && <LiveDrilldownModal {...drilldown} onClose={() => setDrilldown(null)} />}
        </div>
    );
};

export default LiveQcTrackingPage;

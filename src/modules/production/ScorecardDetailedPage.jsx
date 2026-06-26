import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuRefreshCw, LuUsers, LuClock, LuFilter } from 'react-icons/lu';
import LineCard, { buildLineData, pctColor, dhuColor, fmt2 } from './LineCard';

const REFRESH_SECONDS = 300;
const STORAGE_KEY     = 'scorecard_detailed_selected_lines';

export default function ScorecardDetailedPage() {
    const today = new Date().toISOString().split('T')[0];
    const [date,        setDate]        = useState(today);
    const [lineData,    setLineData]    = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [countdown,   setCountdown]   = useState(REFRESH_SECONDS);
    const countdownRef                   = useRef(REFRESH_SECONDS);

    // Selected line ids (persisted)
    const [selectedIds, setSelectedIds] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch {
            return new Set();
        }
    });

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedIds])); } catch {}
    }, [selectedIds]);

    // ── Data loading ────────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [formRes, summaryRes, outputRes] = await Promise.allSettled([
                productionManagerApi.getTargetFormData(date),
                productionManagerApi.getTargetSummary({ target_date: date }),
                productionManagerApi.getLineOutput({ date }),
            ]);

            const formLines   = formRes.status    === 'fulfilled' ? (formRes.value.data?.lines   ?? []) : [];
            const summaryRows = summaryRes.status === 'fulfilled' ? (summaryRes.value.data       ?? []) : [];
            const outputLines = outputRes.status  === 'fulfilled' ? (outputRes.value.data?.lines ?? []) : [];

            setLineData(buildLineData(formLines, summaryRows, outputLines));
            setLastRefresh(new Date());
            countdownRef.current = REFRESH_SECONDS;
            setCountdown(REFRESH_SECONDS);
        } catch (err) {
            console.error('[ScorecardDetailed] load error', err);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, REFRESH_SECONDS * 1000);
        return () => clearInterval(interval);
    }, [loadData]);

    useEffect(() => {
        const tick = setInterval(() => {
            countdownRef.current = Math.max(0, countdownRef.current - 1);
            setCountdown(countdownRef.current);
        }, 1000);
        return () => clearInterval(tick);
    }, []);

    const handleRefresh = () => {
        countdownRef.current = REFRESH_SECONDS;
        setCountdown(REFRESH_SECONDS);
        loadData();
    };

    // ── Selection helpers ───────────────────────────────────────────────────────
    const toggleLine = (id) => {
        setSelectedIds(prev => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id); else s.add(id);
            return s;
        });
    };
    const selectAll = () => setSelectedIds(new Set(lineData.map(l => String(l.line_id))));
    const clearAll  = () => setSelectedIds(new Set());

    const visibleLines = useMemo(
        () => lineData.filter(l => selectedIds.has(String(l.line_id))),
        [lineData, selectedIds]
    );

    // ── KPIs over selected lines ────────────────────────────────────────────────
    const totalPresent  = visibleLines.reduce((s, l) => s + (l.manpower_present  ?? 0), 0);
    const totalAssigned = visibleLines.reduce((s, l) => s + (l.manpower_assigned ?? 0), 0);
    const grandDefects  = visibleLines.reduce((s, l) => s + (l.total_defects     ?? 0), 0);
    const grandOutput   = visibleLines.reduce((s, l) => s + (l.total_output      ?? 0), 0);
    const grandChecked  = visibleLines.reduce((s, l) =>
        s + (l.total_approved ?? 0) + (l.total_rework ?? 0), 0);
    const grandTarget   = visibleLines.reduce((s, l) =>
        s + l.parts.reduce((ps, p) => ps + p.target_quantity, 0), 0);
    const grandActual   = visibleLines.reduce((s, l) =>
        s + l.parts.reduce((ps, p) => ps + p.actual, 0), 0);
    const grandPct      = grandTarget > 0 ? Math.round(grandActual * 100 / grandTarget) : null;
    const grandDHU      = grandChecked > 0 ? (grandDefects / grandChecked) * 100
                        : grandOutput  > 0 ? (grandDefects / grandOutput)  * 100
                        : null;

    // ── Date display ───────────────────────────────────────────────────────────
    const d         = new Date(date + 'T12:00:00');
    const weekday   = d.toLocaleDateString('en-IN', { weekday: 'long' });
    const dateStr   = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const cntMins   = String(Math.floor(countdown / 60)).padStart(2, '0');
    const cntSecs   = String(countdown % 60).padStart(2, '0');
    const refreshAt = lastRefresh
        ? lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Sticky header */}
            <div className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-gray-800 px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-xl font-black tracking-widest text-white uppercase">
                                Detailed Scorecard
                            </h1>
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                </span>
                                <span className="text-sm text-emerald-400 font-black tracking-widest">LIVE</span>
                            </div>
                            <span className="text-xs text-gray-600 font-bold uppercase tracking-wider">
                                {visibleLines.length}/{lineData.length} lines
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-5">
                            <div className="flex items-center gap-2">
                                <LuUsers size={15} className="text-gray-500" />
                                <span className="text-lg font-black text-white tabular-nums">{totalPresent}</span>
                                <span className="text-sm text-gray-600">/ {totalAssigned} present</span>
                            </div>

                            {grandTarget > 0 && (
                                <>
                                    <span className="text-gray-800 hidden sm:inline">│</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 uppercase tracking-wide">Output</span>
                                        <span className="text-lg font-black tabular-nums"
                                              style={{ color: pctColor(grandPct) }}>
                                            {grandActual.toLocaleString()}
                                        </span>
                                        <span className="text-sm text-gray-600">
                                            / {grandTarget.toLocaleString()}
                                        </span>
                                        {grandPct != null && (
                                            <span className="text-sm font-black px-2 py-0.5 rounded tabular-nums"
                                                  style={{
                                                      color: pctColor(grandPct),
                                                      backgroundColor: `${pctColor(grandPct)}22`,
                                                  }}>
                                                {grandPct}%
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}

                            {grandDHU != null && (
                                <>
                                    <span className="text-gray-800 hidden sm:inline">│</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 uppercase tracking-wide">DHU</span>
                                        <span className="text-lg font-black tabular-nums"
                                              style={{ color: dhuColor(grandDHU) }}>
                                            {fmt2(grandDHU)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 uppercase tracking-wide">Defects</span>
                                        <span className="text-lg font-black text-red-400 tabular-nums">
                                            {grandDefects.toLocaleString()}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                        <div className="text-right">
                            <p className="text-lg font-black text-white">{dateStr}</p>
                            <p className="text-sm text-gray-500 uppercase tracking-widest">{weekday}</p>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="bg-gray-900 border border-gray-800 text-gray-400 text-sm
                                           rounded px-2 py-1 focus:outline-none focus:border-gray-700"
                            />
                            <div className="flex items-center gap-1 text-sm text-gray-600 tabular-nums font-mono">
                                <LuClock size={12} />
                                {cntMins}:{cntSecs}
                            </div>
                            <button
                                onClick={handleRefresh}
                                disabled={loading}
                                className="flex items-center gap-1 text-sm text-gray-500 hover:text-white
                                           border border-gray-800 hover:border-gray-600
                                           px-2.5 py-1 rounded transition-colors disabled:opacity-40"
                            >
                                <LuRefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>

                        {refreshAt && (
                            <p className="text-xs text-gray-700">Updated {refreshAt}</p>
                        )}
                    </div>
                </div>

                {/* Line picker */}
                <div className="mt-4 pt-4 border-t border-gray-900">
                    <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest font-bold pt-1">
                            <LuFilter size={12} />
                            <span>Lines</span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 flex-1">
                            {lineData.length === 0 ? (
                                <span className="text-xs text-gray-700 italic pt-1">No lines available for this date.</span>
                            ) : lineData.map(l => {
                                const id  = String(l.line_id);
                                const sel = selectedIds.has(id);
                                return (
                                    <button
                                        key={id}
                                        onClick={() => toggleLine(id)}
                                        className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                                            sel
                                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                                : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300'
                                        }`}
                                    >
                                        {l.line_name}
                                    </button>
                                );
                            })}
                        </div>

                        {lineData.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={selectAll}
                                    className="text-xs text-gray-500 hover:text-white px-2 py-1 border border-gray-800 hover:border-gray-600 rounded transition-colors"
                                >
                                    Select all
                                </button>
                                <button
                                    onClick={clearAll}
                                    className="text-xs text-gray-500 hover:text-white px-2 py-1 border border-gray-800 hover:border-gray-600 rounded transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5">
                {loading && lineData.length === 0 && (
                    <div className="flex justify-center items-center py-32 text-gray-700">
                        <LuRefreshCw className="animate-spin mr-2" size={20} />
                        <span className="text-base">Loading scorecard…</span>
                    </div>
                )}

                {!loading && lineData.length === 0 && (
                    <p className="text-center py-32 text-gray-700 text-base">
                        No active lines found for this date.
                    </p>
                )}

                {!loading && lineData.length > 0 && visibleLines.length === 0 && (
                    <div className="text-center py-32 text-gray-700">
                        <p className="text-base mb-2">No lines selected.</p>
                        <p className="text-xs text-gray-800">
                            Pick one or more lines above to display their progress.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {visibleLines.map(line => (
                        <LineCard
                            key={line.line_id}
                            line={line}
                            defaultExpandEmployees={true}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuRefreshCw, LuUsers, LuClock } from 'react-icons/lu';
import LineCard, { buildLineData, pctColor, dhuColor, fmt2 } from './LineCard';

const REFRESH_SECONDS            = 300;  // 5-min data refresh
const PAGE_SIZE                  = 12;   // 4-col × 3-row grid per page
const ROTATE_SECONDS             = 10;   // seconds before rotating to next page
const FACTORY_OUTPUT_TYPES_KEY   = 'scoreboard_factory_output_line_types';

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScoreboardPage() {
    const today = new Date().toISOString().split('T')[0];
    const [date,        setDate]        = useState(today);
    const [lineData,    setLineData]    = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [countdown,   setCountdown]   = useState(REFRESH_SECONDS);
    const countdownRef  = useRef(REFRESH_SECONDS);

    // Pagination state
    const [pageIndex, setPageIndex] = useState(0);

    // Line-type filter for factory output KPIs (null = all types included)
    const [selectedTypes, setSelectedTypes] = useState(() => {
        try {
            const saved = localStorage.getItem(FACTORY_OUTPUT_TYPES_KEY);
            return saved ? new Set(JSON.parse(saved)) : null;
        } catch { return null; }
    });

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

            const built = buildLineData(formLines, summaryRows, outputLines);
            console.log('[Scorecard] raw formLines (type fields):', formLines.map(l => ({
                line_id: l.line_id, line_name: l.line_name,
                production_line_type_id: l.production_line_type_id,
                type_name: l.type_name, target_type: l.target_type,
            })));
            setLineData(built);
            countdownRef.current = REFRESH_SECONDS;
            setCountdown(REFRESH_SECONDS);
        } catch (err) {
            console.error('[Scorecard] load error', err);
        } finally {
            setLoading(false);
        }
    }, [date]);

    // Initial load + 5-min auto-refresh
    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, REFRESH_SECONDS * 1000);
        return () => clearInterval(interval);
    }, [loadData]);

    // Countdown tick
    useEffect(() => {
        const tick = setInterval(() => {
            countdownRef.current = Math.max(0, countdownRef.current - 1);
            setCountdown(countdownRef.current);
        }, 1000);
        return () => clearInterval(tick);
    }, []);

    // Reset to page 0 when data reloads
    useEffect(() => {
        setPageIndex(0);
    }, [lineData]);

    // Auto-rotate pages every ROTATE_SECONDS
    useEffect(() => {
        if (lineData.length <= PAGE_SIZE) return;
        const totalPages = Math.ceil(lineData.length / PAGE_SIZE);
        const rot = setInterval(() => {
            setPageIndex(prev => (prev + 1) % totalPages);
        }, ROTATE_SECONDS * 1000);
        return () => clearInterval(rot);
    }, [lineData.length]);

    const handleRefresh = () => {
        countdownRef.current = REFRESH_SECONDS;
        setCountdown(REFRESH_SECONDS);
        loadData();
    };

    // ── Line-type filter helpers ────────────────────────────────────────────────
    const availableTypes = useMemo(() =>
        [...new Set(lineData.map(l => l.line_type_name ?? l.target_type ?? 'OTHER'))].sort(),
        [lineData]
    );

    useEffect(() => {
        try {
            if (selectedTypes === null) localStorage.removeItem(FACTORY_OUTPUT_TYPES_KEY);
            else localStorage.setItem(FACTORY_OUTPUT_TYPES_KEY, JSON.stringify([...selectedTypes]));
        } catch {}
    }, [selectedTypes]);

    const toggleType = (t) => setSelectedTypes(prev => {
        const s = new Set(prev ?? availableTypes);
        if (s.has(t)) s.delete(t); else s.add(t);
        return s.size === availableTypes.length ? null : s;
    });
    const selectAllTypes = () => setSelectedTypes(null);

    // ── Derived factory-wide stats (over selected line types only) ──────────────
    const outputLines    = selectedTypes === null
        ? lineData
        : lineData.filter(l => selectedTypes.has(l.line_type_name ?? l.target_type ?? 'OTHER'));

    const totalPresent   = outputLines.reduce((s, l) => s + (l.manpower_present  ?? 0), 0);
    const totalAssigned  = outputLines.reduce((s, l) => s + (l.manpower_assigned ?? 0), 0);
    const grandDefects   = outputLines.reduce((s, l) => s + (l.total_defects     ?? 0), 0);
    const grandOutput    = outputLines.reduce((s, l) => s + (l.total_output      ?? 0), 0);
    const grandChecked   = outputLines.reduce((s, l) =>
        s + (l.total_approved ?? 0) + (l.total_rework ?? 0), 0);
    const grandTarget    = outputLines.reduce((s, l) =>
        s + l.parts.reduce((ps, p) => ps + p.target_quantity, 0), 0);
    const grandActual    = outputLines.reduce((s, l) =>
        s + l.parts.reduce((ps, p) => ps + p.actual, 0), 0);
    const grandPct       = grandTarget > 0 ? Math.round(grandActual * 100 / grandTarget) : null;
    const grandDHU       = grandChecked > 0 ? (grandDefects / grandChecked) * 100
                         : grandOutput  > 0 ? (grandDefects / grandOutput)  * 100
                         : null;

    // ── Pagination — lines sorted by target_type so groups stay together ────────
    const sortedLines  = [...lineData].sort((a, b) =>
        (a.target_type ?? '').localeCompare(b.target_type ?? ''));
    const totalPages   = Math.max(1, Math.ceil(sortedLines.length / PAGE_SIZE));
    const visibleLines = sortedLines.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

    // Group visible lines by target_type for section headers
    const lineGroups = visibleLines.reduce((acc, line) => {
        const key = line.target_type ?? 'OTHER';
        if (!acc[key]) acc[key] = [];
        acc[key].push(line);
        return acc;
    }, {});

    // ── Date display ───────────────────────────────────────────────────────────
    const d       = new Date(date + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const cntMins = String(Math.floor(countdown / 60)).padStart(2, '0');
    const cntSecs = String(countdown % 60).padStart(2, '0');


    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-black text-white">

            {/* ── Sticky header ── */}
            <div className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-gray-800 px-4 py-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">

                    {/* Left: title + KPIs all on one row */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-black tracking-widest text-white uppercase">Scorecard</span>
                        <div className="flex items-center gap-1">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                        </div>

                        <span className="text-gray-800">│</span>

                        <div className="flex items-center gap-1.5">
                            <LuUsers size={13} className="text-gray-500" />
                            <span className="text-sm font-black text-white tabular-nums">{totalPresent}</span>
                            <span className="text-xs text-gray-600">/ {totalAssigned}</span>
                        </div>

                        {grandTarget > 0 && (
                            <>
                                <span className="text-gray-800">│</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Out</span>
                                    <span className="text-sm font-black tabular-nums" style={{ color: pctColor(grandPct) }}>
                                        {grandActual.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-gray-600">/ {grandTarget.toLocaleString()}</span>
                                    {grandPct != null && (
                                        <span className="text-xs font-black px-1.5 py-0.5 rounded tabular-nums"
                                              style={{ color: pctColor(grandPct), backgroundColor: `${pctColor(grandPct)}22` }}>
                                            {grandPct}%
                                        </span>
                                    )}
                                </div>
                            </>
                        )}

                        {grandDHU != null && (
                            <>
                                <span className="text-gray-800">│</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">DHU</span>
                                    <span className="text-sm font-black tabular-nums" style={{ color: dhuColor(grandDHU) }}>
                                        {fmt2(grandDHU)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-500 uppercase tracking-wide">Def</span>
                                    <span className="text-sm font-black text-red-400 tabular-nums">
                                        {grandDefects.toLocaleString()}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Right: controls */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 hidden sm:inline">{dateStr}</span>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="bg-gray-900 border border-gray-800 text-gray-400 text-xs
                                       rounded px-2 py-1 focus:outline-none focus:border-gray-700"
                        />
                        <div className="flex items-center gap-1 text-xs text-gray-600 tabular-nums font-mono">
                            <LuClock size={11} />
                            {cntMins}:{cntSecs}
                        </div>
                        <button
                            onClick={handleRefresh}
                            disabled={loading}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-white
                                       border border-gray-800 hover:border-gray-600
                                       px-2 py-1 rounded transition-colors disabled:opacity-40"
                        >
                            <LuRefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* ── Line-type filter for factory output ── */}
                {availableTypes.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-gray-900">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                                Factory Output Includes
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {availableTypes.map(t => {
                                    const active = selectedTypes === null || selectedTypes.has(t);
                                    return (
                                        <button
                                            key={t}
                                            onClick={() => toggleType(t)}
                                            className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                                                active
                                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                                    : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-300'
                                            }`}
                                        >
                                            {t}
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedTypes !== null && (
                                <button
                                    onClick={selectAllTypes}
                                    className="text-xs text-gray-500 hover:text-white px-2 py-1 border border-gray-800 hover:border-gray-600 rounded transition-colors"
                                >
                                    All
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Content ── */}
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

                {/* Lines grouped by target type, 4-col grid */}
                <div className="space-y-6">
                    {Object.entries(lineGroups).map(([type, lines]) => (
                        <div key={type}>
                            <div className="flex items-center gap-3 mb-3">
                                <span className={`text-xs font-black px-3 py-1 rounded tracking-widest uppercase
                                    ${type === 'PIECE'   ? 'bg-blue-950 text-blue-400'
                                    : type === 'GARMENT' ? 'bg-purple-950 text-purple-400'
                                    : 'bg-gray-800 text-gray-400'}`}>
                                    {type}
                                </span>
                                <span className="text-xs text-gray-700">{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                                <div className="flex-1 border-t border-gray-800" />
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                {lines.map(line => (
                                    <LineCard key={line.line_id} line={line} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Page indicator dots */}
                {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-3 mt-6">
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setPageIndex(i)}
                                className={`rounded-full transition-all duration-300 ${
                                    i === pageIndex
                                        ? 'w-6 h-3 bg-white'
                                        : 'w-3 h-3 bg-gray-700 hover:bg-gray-500'
                                }`}
                            />
                        ))}
                        <span className="text-xs text-gray-700 ml-1 tabular-nums">
                            {pageIndex + 1} / {totalPages}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

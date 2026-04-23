import React, { useState, useEffect, useCallback, useRef } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuRefreshCw, LuUsers, LuClock } from 'react-icons/lu';

const REFRESH_SECONDS = 300;  // 5-min data refresh
const PAGE_SIZE       = 6;    // lines visible per screen
const ROTATE_SECONDS  = 10;   // seconds before rotating to next page

// ── Color helpers ──────────────────────────────────────────────────────────────

const pctColor = (pct) => {
    if (pct == null) return '#4b5563';
    if (pct >= 90)   return '#10b981';
    if (pct >= 70)   return '#f59e0b';
    if (pct >= 50)   return '#f97316';
    return '#ef4444';
};

const dhuColor = (dhu) => {
    if (dhu <= 2)  return '#10b981';
    if (dhu <= 5)  return '#f59e0b';
    if (dhu <= 10) return '#f97316';
    return '#ef4444';
};

const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

// ── Happy face SVG ─────────────────────────────────────────────────────────────

function HappyFace({ size = 64 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
            {/* Glow circle */}
            <circle cx="50" cy="50" r="47" fill="#10b981" opacity="0.10" />
            {/* Outline */}
            <circle cx="50" cy="50" r="44" stroke="#10b981" strokeWidth="4" />
            {/* Eyes */}
            <circle cx="34" cy="41" r="7" fill="#10b981" />
            <circle cx="66" cy="41" r="7" fill="#10b981" />
            {/* Smile */}
            <path d="M 25 62 Q 50 88 75 62" stroke="#10b981" strokeWidth="6"
                  strokeLinecap="round" fill="none" />
        </svg>
    );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ actual, target, pct }) {
    const computed = pct ?? (target > 0 ? Math.round(actual * 100 / target) : null);
    const width    = Math.min(100, Math.max(0, computed ?? 0));
    const fill     = pctColor(computed);

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-gray-400 tabular-nums">
                    {actual.toLocaleString()} / {target.toLocaleString()}
                </span>
                {computed != null && (
                    <span className="text-lg font-black tabular-nums" style={{ color: fill }}>
                        {computed}%
                    </span>
                )}
            </div>
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${width}%`, backgroundColor: fill }}
                />
            </div>
        </div>
    );
}

// ── Line card ──────────────────────────────────────────────────────────────────

function LineCard({ line }) {
    const [showEmp, setShowEmp] = React.useState(false);

    const present  = line.manpower_present  ?? 0;
    const assigned = line.manpower_assigned ?? 0;
    const mpRatio  = assigned > 0 ? present / assigned : 0;
    const mpClr    = mpRatio >= 0.9 ? '#10b981'
                   : mpRatio >= 0.7 ? '#f59e0b'
                   : present === 0 && assigned > 0 ? '#ef4444'
                   : '#6b7280';

    const parts     = line.parts ?? [];
    const hasTarget = parts.some(p => p.target_quantity > 0);
    const output    = line.total_output  ?? 0;
    const defects   = line.total_defects ?? 0;
    const dhu       = output > 0 ? (defects / output) * 100 : null;

    const batches      = line.batches ?? [];
    const employeesAll = line.employees_assigned ?? [];
    const absentees        = employeesAll.filter(e => !e.is_present);

    // Achieved = every part with a target is at ≥100%
    const targetedParts = parts.filter(p => p.target_quantity > 0);
    const isAchieved    = hasTarget && targetedParts.length > 0 && targetedParts.every(p => {
        const pct = p.achievement_pct
            ?? (p.target_quantity > 0 ? Math.round(p.actual * 100 / p.target_quantity) : 0);
        return pct >= 100;
    });

    return (
        <div className={`bg-gray-900 border rounded-2xl overflow-hidden flex flex-col relative
            ${isAchieved
                ? 'border-emerald-600 shadow-lg shadow-emerald-900/40'
                : 'border-gray-800'}`}>

            {/* Happy face — top-right corner */}
            {isAchieved && (
                <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-0.5">
                    <HappyFace size={60} />
                    <span className="text-xs font-black text-emerald-400 tracking-widest uppercase">
                        Done!
                    </span>
                </div>
            )}

            {/* Card header */}
            <div className={`px-5 py-4 border-b border-gray-800 ${isAchieved ? 'pr-20' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                    <div className="flex flex-col gap-1 min-w-0">
                        <span className="font-black text-white text-2xl uppercase tracking-wide leading-tight truncate">
                            {line.line_name}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded font-bold tracking-wide
                                ${line.target_type === 'PIECE'   ? 'bg-blue-950 text-blue-400'
                                : line.target_type === 'GARMENT' ? 'bg-purple-950 text-purple-400'
                                : 'bg-gray-800 text-gray-500'}`}>
                                {line.target_type ?? '—'}
                            </span>
                            {line.processing_mode && (
                                <span className="text-xs text-gray-600 font-mono">{line.processing_mode}</span>
                            )}
                        </div>
                    </div>
                    {/* Manpower chip — clickable to toggle employee list */}
                    <button
                        onClick={() => setShowEmp(v => !v)}
                        className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
                    >
                        <LuUsers size={16} style={{ color: mpClr }} />
                        <span className="font-black text-2xl tabular-nums" style={{ color: mpClr }}>
                            {present}
                        </span>
                        <span className="text-gray-600 text-base">/{assigned}</span>
                    </button>
                </div>

                {/* Batch codes */}
                {batches.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {batches.map(b => (
                            <span key={b.batch_id}
                                className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                {b.batch_code}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Employee list (expandable) */}
            {showEmp && employeesAll.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-36 overflow-y-auto">
                        {employeesAll.map(e => (
                            <div key={e.emp_id} className="flex items-center justify-between gap-1">
                                <span className={`text-xs truncate ${e.is_present ? 'text-gray-300' : 'text-red-500 line-through'}`}>
                                    {e.name}
                                </span>
                                {e.is_present && e.punch_in && (
                                    <span className="text-[10px] text-gray-600 font-mono shrink-0">{e.punch_in}</span>
                                )}
                            </div>
                        ))}
                    </div>
                    {absentees.length > 0 && (
                        <p className="text-[10px] text-red-500 font-bold mt-1.5 uppercase tracking-widest">
                            {absentees.length} absent
                        </p>
                    )}
                </div>
            )}

            {/* Target progress rows */}
            <div className="flex-1 px-5 py-4 space-y-5">
                {!hasTarget ? (
                    <p className="text-base text-gray-600 italic py-2">No targets set for today.</p>
                ) : (
                    parts.map((part, i) => (
                        <div key={part.part_id ?? `g-${i}`}>
                            <p className="text-sm text-gray-400 mb-2 font-bold uppercase tracking-widest">
                                {part.part_name ?? 'Garments'}
                                {part.part_type && (
                                    <span className="ml-1 text-gray-600 text-xs font-normal normal-case">
                                        · {part.part_type.toLowerCase()}
                                    </span>
                                )}
                            </p>
                            <ProgressBar
                                actual={part.actual}
                                target={part.target_quantity}
                                pct={part.achievement_pct}
                            />
                        </div>
                    ))
                )}
            </div>

            {/* Footer stats */}
            <div className="px-5 py-4 border-t border-gray-800 grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Output</p>
                    <p className="text-xl font-black text-white tabular-nums">{output.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Defects</p>
                    <p className="text-xl font-black tabular-nums"
                       style={{ color: defects > 0 ? '#f87171' : '#4b5563' }}>
                        {defects.toLocaleString()}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">DHU</p>
                    <p className="text-xl font-black tabular-nums"
                       style={{ color: dhu != null ? dhuColor(dhu) : '#4b5563' }}>
                        {dhu != null ? fmt2(dhu) : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScoreboardPage() {
    const today = new Date().toISOString().split('T')[0];
    const [date,        setDate]        = useState(today);
    const [lineData,    setLineData]    = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [countdown,   setCountdown]   = useState(REFRESH_SECONDS);
    const countdownRef  = useRef(REFRESH_SECONDS);

    // Pagination state
    const [pageIndex, setPageIndex] = useState(0);

    // ── Data loading ────────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [formRes, summaryRes, outputRes] = await Promise.allSettled([
                productionManagerApi.getTargetFormData(date),
                productionManagerApi.getTargetSummary({ target_date: date }),
                productionManagerApi.getLineOutput({ date }),
            ]);
            console.log('Data load results:', { formRes, summaryRes, outputRes });

            const formLines   = formRes.status    === 'fulfilled' ? (formRes.value.data?.lines   ?? []) : [];
            const summaryRows = summaryRes.status === 'fulfilled' ? (summaryRes.value.data       ?? []) : [];
            const outputLines = outputRes.status  === 'fulfilled' ? (outputRes.value.data?.lines ?? []) : [];

            // summary: line_id → parts[]
            const summaryByLine = new Map();
            for (const row of summaryRows) {
                const id = String(row.line_id);
                if (!summaryByLine.has(id)) summaryByLine.set(id, []);
                summaryByLine.get(id).push({
                    part_id:         row.part_id,
                    part_name:       row.part_name,
                    part_type:       row.part_type,
                    target_quantity: parseInt(row.target_quantity) || 0,
                    actual:          parseInt(row.actual)          || 0,
                    achievement_pct: row.achievement_pct != null
                        ? parseInt(row.achievement_pct) : null,
                });
            }

            // output: line_id → { total_output, total_defects }
            const outputByLine = new Map();
            for (const ol of outputLines) {
                outputByLine.set(String(ol.line_id), {
                    total_output:  parseInt(ol.summary?.total_output)  || 0,
                    total_defects: parseInt(ol.summary?.total_defects) || 0,
                });
            }

            // Merge
            const merged = formLines.map(line => {
                const id  = String(line.line_id);
                const out = outputByLine.get(id) ?? { total_output: 0, total_defects: 0 };

                // Use summaryRes parts if available; otherwise build from formRes batch targets
                let parts = summaryByLine.get(id) ?? [];
                if (parts.length === 0) {
                    const batches = line.batches ?? [];
                    if (line.target_type === 'GARMENT') {
                        const totalTarget = batches.reduce((s, b) =>
                            s + (b.garment_target?.existing_quantity ?? 0), 0);
                        if (totalTarget > 0) {
                            parts = [{ part_id: 'garment', part_name: 'Garments', part_type: null,
                                       target_quantity: totalTarget, actual: 0, achievement_pct: null }];
                        }
                    } else {
                        const partMap = {};
                        for (const batch of batches) {
                            for (const pp of batch.piece_parts ?? []) {
                                if (!partMap[pp.part_id]) {
                                    partMap[pp.part_id] = { part_id: pp.part_id, part_name: pp.part_name,
                                        part_type: pp.part_type, target_quantity: 0, actual: 0, achievement_pct: null };
                                }
                                partMap[pp.part_id].target_quantity += pp.existing_quantity ?? 0;
                            }
                        }
                        parts = Object.values(partMap);
                    }
                }

                return {
                    ...line,
                    parts,
                    total_output:       out.total_output,
                    total_defects:      out.total_defects,
                    batches:            line.batches ?? [],
                    employees_assigned: line.employees_assigned ?? [],
                    employees_present:  line.employees_present  ?? [],
                };
            });

            setLineData(merged);
            setLastRefresh(new Date());
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

    // ── Derived factory-wide stats ──────────────────────────────────────────────
    const totalPresent  = lineData.reduce((s, l) => s + (l.manpower_present  ?? 0), 0);
    const totalAssigned = lineData.reduce((s, l) => s + (l.manpower_assigned ?? 0), 0);
    const grandDefects  = lineData.reduce((s, l) => s + (l.total_defects     ?? 0), 0);
    const grandOutput   = lineData.reduce((s, l) => s + (l.total_output      ?? 0), 0);
    const grandTarget   = lineData.reduce((s, l) =>
        s + l.parts.reduce((ps, p) => ps + p.target_quantity, 0), 0);
    const grandActual   = lineData.reduce((s, l) =>
        s + l.parts.reduce((ps, p) => ps + p.actual, 0), 0);
    const grandPct      = grandTarget > 0 ? Math.round(grandActual * 100 / grandTarget) : null;
    const grandDHU      = grandOutput  > 0 ? (grandDefects / grandOutput) * 100 : null;

    // ── Pagination ──────────────────────────────────────────────────────────────
    const totalPages   = Math.max(1, Math.ceil(lineData.length / PAGE_SIZE));
    const visibleLines = lineData.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);

    // ── Date display ───────────────────────────────────────────────────────────
    const d         = new Date(date + 'T12:00:00');
    const weekday   = d.toLocaleDateString('en-IN', { weekday: 'long' });
    const dateStr   = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const cntMins   = String(Math.floor(countdown / 60)).padStart(2, '0');
    const cntSecs   = String(countdown % 60).padStart(2, '0');
    const refreshAt = lastRefresh
        ? lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-black text-white">

            {/* ── Sticky header ── */}
            <div className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-gray-800 px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">

                    {/* Left: title + factory KPIs */}
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-xl font-black tracking-widest text-white uppercase">
                                Production Scorecard
                            </h1>
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                </span>
                                <span className="text-sm text-emerald-400 font-black tracking-widest">LIVE</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-5">
                            {/* Manpower */}
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
                                        <span className="text-xs text-gray-500 uppercase tracking-wide">Factory DHU</span>
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

                    {/* Right: date + controls */}
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

                {/* 6-line grid */}
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
                    {visibleLines.map(line => (
                        <LineCard key={line.line_id} line={line} />
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

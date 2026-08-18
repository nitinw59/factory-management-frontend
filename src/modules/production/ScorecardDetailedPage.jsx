import { useState, useEffect, useCallback, useRef } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { hrApi } from '../../api/hrApi';
import { LuRefreshCw, LuClock, LuIndianRupee } from 'react-icons/lu';
import TypeScorecardCard from './TypeScorecardCard';

const REFRESH_SECONDS = 900; // 15 minutes
const STORAGE_KEY      = 'scorecard_detailed_selected_line_type';

// ── Date helpers (local time, no UTC/timezone drift) ────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const currentMonthStr = () => todayStr().slice(0, 7);

function getMonthRange(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const startDate = `${monthStr}-01`;
    const isCurrent = monthStr === currentMonthStr();
    const endDate = isCurrent
        ? todayStr()
        : `${monthStr}-${pad2(new Date(y, m, 0).getDate())}`; // last day of that month
    return { startDate, endDate, isCurrent };
}

const fmtDate = (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function ScorecardDetailedPage() {
    const [selectedMonth, setSelectedMonth] = useState(() => currentMonthStr());

    const [lineTypes, setLineTypes] = useState([]);
    const [selectedLineTypeId, setSelectedLineTypeId] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });

    const [rangeSummary, setRangeSummary] = useState(null);
    const [salaryData,   setSalaryData]   = useState(null);
    const [salaryFailed, setSalaryFailed] = useState(false);
    const [monthlyTarget, setMonthlyTarget] = useState(null);
    const [savingMonthlyTarget, setSavingMonthlyTarget] = useState(false);

    const [loading,     setLoading]     = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [countdown,   setCountdown]   = useState(REFRESH_SECONDS);
    const countdownRef                   = useRef(REFRESH_SECONDS);

    const { startDate, endDate, isCurrent } = getMonthRange(selectedMonth);

    // ── Load line types once, auto-select first if nothing valid saved ──────
    useEffect(() => {
        productionManagerApi.getLineTypes()
            .then(res => {
                const types = res.data ?? [];
                setLineTypes(types);
                setSelectedLineTypeId(prev => {
                    if (prev && types.some(t => String(t.id) === String(prev))) return prev;
                    return types[0] ? String(types[0].id) : null;
                });
            })
            .catch(err => console.error('[ScorecardDetailed] getLineTypes error', err));
    }, []);

    // ── Persist selected type ────────────────────────────────────────────────
    useEffect(() => {
        if (!selectedLineTypeId) return;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedLineTypeId)); } catch {}
    }, [selectedLineTypeId]);

    // ── Data loading ──────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        if (!selectedLineTypeId) return;
        setLoading(true);
        const { startDate: sd, endDate: ed } = getMonthRange(selectedMonth);
        try {
            const [rangeRes, salaryRes, monthlyTargetRes] = await Promise.allSettled([
                productionManagerApi.getRangeSummary({
                    start_date: sd, end_date: ed, line_type_id: selectedLineTypeId,
                }),
                hrApi.getExpenseDrilldown(ed),
                productionManagerApi.getMonthlyTarget({
                    line_type_id: selectedLineTypeId, month: selectedMonth,
                }),
            ]);

            setRangeSummary(rangeRes.status === 'fulfilled' ? rangeRes.value.data : null);
            setSalaryData(salaryRes.status === 'fulfilled' ? salaryRes.value.data : null);
            setSalaryFailed(salaryRes.status !== 'fulfilled');
            setMonthlyTarget(monthlyTargetRes.status === 'fulfilled' ? monthlyTargetRes.value.data : null);

            setLastRefresh(new Date());
            countdownRef.current = REFRESH_SECONDS;
            setCountdown(REFRESH_SECONDS);
        } catch (err) {
            console.error('[ScorecardDetailed] load error', err);
        } finally {
            setLoading(false);
        }
    }, [selectedLineTypeId, selectedMonth]);

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

    const handleSaveMonthlyTarget = async (draftValue) => {
        const target_quantity = parseInt(draftValue, 10);
        if (!selectedLineTypeId || !Number.isInteger(target_quantity) || target_quantity < 0) return;

        setSavingMonthlyTarget(true);
        try {
            const res = await productionManagerApi.setMonthlyTarget({
                line_type_id: selectedLineTypeId,
                month: selectedMonth,
                target_quantity,
            });
            setMonthlyTarget(res.data);
        } catch (err) {
            console.error('[ScorecardDetailed] save monthly target error', err);
        } finally {
            setSavingMonthlyTarget(false);
        }
    };

    const cntMins = String(Math.floor(countdown / 60)).padStart(2, '0');
    const cntSecs = String(countdown % 60).padStart(2, '0');
    const refreshAt = lastRefresh
        ? lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null;

    const selectedTypeName = lineTypes.find(t => String(t.id) === String(selectedLineTypeId))?.type_name;

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Sticky header */}
            <div className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-gray-800 px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <h1 className="text-xl font-black tracking-widest text-white uppercase">
                                Detailed Scorecard
                            </h1>
                            {isCurrent && (
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                    </span>
                                    <span className="text-sm text-emerald-400 font-black tracking-widest">LIVE</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <select
                                value={selectedLineTypeId ?? ''}
                                onChange={e => setSelectedLineTypeId(e.target.value)}
                                className="bg-gray-900 border border-gray-800 text-white text-sm font-bold
                                           rounded px-3 py-1.5 focus:outline-none focus:border-gray-600"
                            >
                                {lineTypes.length === 0 && <option value="">Loading…</option>}
                                {lineTypes.map(t => (
                                    <option key={t.id} value={t.id}>{t.type_name}</option>
                                ))}
                            </select>

                            <input
                                type="month"
                                value={selectedMonth}
                                max={currentMonthStr()}
                                onChange={e => setSelectedMonth(e.target.value)}
                                className="bg-gray-900 border border-gray-800 text-gray-300 text-sm
                                           rounded px-2 py-1.5 focus:outline-none focus:border-gray-600"
                            />

                            <span className="text-xs text-gray-500">
                                {fmtDate(startDate)} – {fmtDate(endDate)}
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
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
                        {refreshAt && <p className="text-xs text-gray-700">Updated {refreshAt}</p>}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5">
                {loading && !rangeSummary && !salaryData && (
                    <div className="flex justify-center items-center py-32 text-gray-700">
                        <LuRefreshCw className="animate-spin mr-2" size={20} />
                        <span className="text-base">Loading scorecard…</span>
                    </div>
                )}

                {/* Salary card — always visible, independent of line type */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">
                                Salary Spent — All Departments
                            </p>
                            <p className="text-xs text-gray-600">
                                {fmtDate(startDate)} – {fmtDate(endDate)}
                            </p>
                        </div>
                        {salaryFailed ? (
                            <span className="text-sm text-gray-600 italic">Salary data unavailable</span>
                        ) : (
                            <div className="flex items-center gap-2">
                                <LuIndianRupee size={22} className="text-amber-400" />
                                <span className="text-3xl font-black text-amber-400 tabular-nums">
                                    {(salaryData?.total_estimated_expense ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-sm text-gray-600 ml-2">
                                    {salaryData?.total_employees ?? 0} employees
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Merged production-type scorecard */}
                {(!loading || rangeSummary) && (
                    <TypeScorecardCard
                        lineTypeName={selectedTypeName}
                        summary={rangeSummary}
                        monthlyTarget={monthlyTarget}
                        onSaveMonthlyTarget={handleSaveMonthlyTarget}
                        savingMonthlyTarget={savingMonthlyTarget}
                    />
                )}
            </div>
        </div>
    );
}

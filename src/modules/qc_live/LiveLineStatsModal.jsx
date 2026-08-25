import { useState, useEffect, useCallback } from 'react';
import { liveQcApi } from '../../api/liveQcApi';
import { Loader2, X, AlertCircle, Clock, CalendarDays, ClipboardList } from 'lucide-react';

const CATEGORY_COLORS = {
    SEWING:    '#6366f1',
    CUTTING:   '#f59e0b',
    FABRIC:    '#10b981',
    FINISHING: '#ef4444',
    PACKING:   '#8b5cf6',
};

const TopDefectRow = ({ d, rank }) => (
    <div className="flex items-center gap-3 py-2">
        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black flex items-center justify-center shrink-0">{rank}</span>
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-black text-indigo-600">{d.code}</span>
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                    style={{ background: `${CATEGORY_COLORS[d.category] ?? '#94a3b8'}22`, color: CATEGORY_COLORS[d.category] ?? '#64748b' }}>
                    {d.category}
                </span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">{d.description}</p>
        </div>
        <span className="text-lg font-extrabold text-slate-800 shrink-0">{d.count}</span>
    </div>
);

const StatChip = ({ label, checked, defects }) => (
    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-black text-slate-800">{checked} <span className="text-slate-400 font-medium">checked</span></p>
        <p className="text-xs font-bold text-red-500">{defects} defect{defects === 1 ? '' : 's'}</p>
    </div>
);

// Shown when a line card is clicked — a stats summary (top 3 defects in the
// last hour, top 3 today) rather than jumping straight to the full checks
// list. "View Full Log" hands off to LiveDrilldownModal showing every check
// (passes and defects) — not filtered to defects, so the checker's full
// activity on this line is visible, not just the failures.
const LiveLineStatsModal = ({ lineId, lineName, onClose, onViewLog }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await liveQcApi.getLineDefectSummary({ line_id: lineId });
            setData(res.data);
        } catch (e) {
            setError(e?.response?.data?.error || 'Failed to load line stats.');
        } finally {
            setLoading(false);
        }
    }, [lineId]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <h2 className="text-base font-black text-slate-800">{lineName}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                    {loading ? (
                        <div className="flex justify-center items-center py-16"><Loader2 className="animate-spin h-8 w-8 text-indigo-500" /></div>
                    ) : error ? (
                        <div className="flex items-center gap-2 py-8 text-red-700 text-sm"><AlertCircle size={16} /> {error}</div>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                <StatChip label="Last Hour" checked={data.totals?.checked_last_hour || 0} defects={data.totals?.defects_last_hour || 0} />
                                <StatChip label="Today" checked={data.totals?.checked_today || 0} defects={data.totals?.defects_today || 0} />
                            </div>

                            <div>
                                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                    <Clock size={11} /> Top Defects — Last Hour
                                </p>
                                {data.last_hour?.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                        {data.last_hour.map((d, i) => <TopDefectRow key={d.code} d={d} rank={i + 1} />)}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic py-2">No defects in the last hour.</p>
                                )}
                            </div>

                            <div>
                                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                                    <CalendarDays size={11} /> Top Defects — Today
                                </p>
                                {data.today?.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                        {data.today.map((d, i) => <TopDefectRow key={d.code} d={d} rank={i + 1} />)}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic py-2">No defects logged today.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 py-3 border-t border-slate-100 shrink-0">
                    <button
                        onClick={onViewLog}
                        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-lg transition"
                    >
                        <ClipboardList size={15} /> View Full Log
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LiveLineStatsModal;

import { useState, useEffect, useCallback, useMemo } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import {
    Loader2, RefreshCw, Package, ChevronDown, ChevronRight,
    AlertCircle, X, CheckCircle2, Layers, Truck,
} from 'lucide-react';

const STATUS_CFG = {
    PENDING:     { cls: 'bg-slate-100 text-slate-600 border-slate-200',   label: 'Pending'     },
    IN_PROGRESS: { cls: 'bg-blue-50 text-blue-700 border-blue-200',       label: 'In Progress' },
    COMPLETED:   { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Complete' },
    BLOCKED:     { cls: 'bg-red-50 text-red-700 border-red-200',          label: 'Blocked'     },
};

const StatusPill = ({ status }) => {
    const cfg = STATUS_CFG[status] || { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: status || '—' };
    return (
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

// ── Roll Detail Modal ─────────────────────────────────────────────────────────

const RollDetailModal = ({ batch, roll, onClose }) => {
    const piecesByPart = useMemo(() => {
        const map = new Map();
        (roll.pieces || []).forEach(p => {
            const key = p.part_name || `Part #${p.part_id ?? '—'}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(p);
        });
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [roll]);

    const totalPieces     = roll.piece_count ?? (roll.pieces || []).length;
    const completedPieces = roll.completed_piece_count
        ?? (roll.pieces || []).filter(p => p.is_completed).length;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Package size={16} className="text-violet-500" />
                            <h2 className="text-base font-black text-slate-800">
                                Roll #{roll.roll_id}
                                {roll.bale_no ? <span className="text-slate-400 font-bold"> · Bale {roll.bale_no}</span> : ''}
                            </h2>
                            {roll.ready_to_load_next_cycle && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                    Ready to load
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                            {batch.batch_code}{batch.product_name ? ` · ${batch.product_name}` : ''}
                            {batch.line_name ? ` · ${batch.line_name}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                {/* Summary tiles */}
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Fabric</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{roll.fabric_type || '—'}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Color</p>
                        <p className="text-sm font-bold text-slate-700 truncate">
                            {roll.color_name || '—'}
                            {roll.color_number ? ` · ${roll.color_number}` : ''}
                        </p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Quantity</p>
                        <p className="text-sm font-bold text-slate-700 tabular-nums">
                            {Number(roll.meter ?? 0).toFixed(2)} {roll.uom || 'm'}
                        </p>
                    </div>
                    <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Pieces</p>
                        <p className="text-sm font-bold text-slate-700 tabular-nums">
                            <span className="text-emerald-600">{completedPieces}</span>
                            <span className="text-slate-400"> / {totalPieces}</span>
                        </p>
                    </div>
                </div>

                {/* Pieces by part */}
                <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
                    {piecesByPart.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-6">No pieces on this roll.</p>
                    ) : piecesByPart.map(([partName, pieces]) => {
                        const sizesMap = pieces.reduce((acc, p) => {
                            const sz = p.size || '—';
                            if (!acc[sz]) acc[sz] = { total: 0, completed: 0 };
                            acc[sz].total += 1;
                            if (p.is_completed) acc[sz].completed += 1;
                            return acc;
                        }, {});
                        const sizes = Object.entries(sizesMap).sort((a, b) => a[0].localeCompare(b[0]));
                        const partType = pieces[0]?.part_type;
                        const allDone  = pieces.every(p => p.is_completed);

                        return (
                            <div key={partName} className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-black text-sm text-slate-700 capitalize truncate">{partName}</span>
                                        {partType && (
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                                {partType}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs font-bold tabular-nums text-slate-600">
                                            {pieces.filter(p => p.is_completed).length} / {pieces.length}
                                        </span>
                                        {allDone && <CheckCircle2 size={14} className="text-emerald-500" />}
                                    </div>
                                </div>
                                <div className="px-4 py-2.5">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">By Size</p>
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        {sizes.map(([sz, c]) => (
                                            <span key={sz}
                                                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                                    c.completed === c.total
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>
                                                {sz} <span className="font-black tabular-nums">{c.completed}/{c.total}</span>
                                            </span>
                                        ))}
                                    </div>
                                    <details className="text-xs">
                                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700 font-semibold">
                                            Show {pieces.length} individual piece{pieces.length === 1 ? '' : 's'}
                                        </summary>
                                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                            {pieces.map(p => (
                                                <div key={p.cut_piece_id}
                                                    className={`text-[11px] flex items-center justify-between px-2 py-1 rounded border ${
                                                        p.is_completed
                                                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                                            : 'bg-slate-50 border-slate-100 text-slate-500'
                                                    }`}>
                                                    <span className="font-mono">#{p.cut_piece_id}</span>
                                                    <span className="font-bold">{p.size || '—'}</span>
                                                    {p.is_completed
                                                        ? <CheckCircle2 size={11} />
                                                        : <span className="text-[9px] uppercase">pending</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ── Roll card ─────────────────────────────────────────────────────────────────

const RollCard = ({ roll, onOpen }) => {
    const totalPieces     = roll.piece_count ?? (roll.pieces || []).length;
    const completedPieces = roll.completed_piece_count
        ?? (roll.pieces || []).filter(p => p.is_completed).length;
    const pct = totalPieces > 0 ? Math.round((completedPieces / totalPieces) * 100) : 0;

    return (
        <button
            onClick={onOpen}
            className="w-full text-left bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-sm rounded-xl px-4 py-3 transition flex items-center gap-3"
        >
            <div className="p-2 bg-emerald-50 rounded-lg shrink-0">
                <Package size={16} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-800">Roll #{roll.roll_id}</span>
                    {roll.bale_no && (
                        <span className="text-[10px] font-bold font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {roll.bale_no}
                        </span>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {roll.fabric_type || '—'}
                    {(roll.color_name || roll.color_number) ? ` · ${roll.color_name || ''}${roll.color_number ? ` (${roll.color_number})` : ''}` : ''}
                </p>
            </div>
            <div className="text-right shrink-0">
                <p className="text-xs text-slate-500 tabular-nums">
                    {Number(roll.meter ?? 0).toFixed(2)} {roll.uom || 'm'}
                </p>
                <p className="text-[10px] font-bold tabular-nums">
                    <span className="text-emerald-600">{completedPieces}</span>
                    <span className="text-slate-400"> / {totalPieces} pcs</span>
                    <span className="ml-1 text-slate-400">({pct}%)</span>
                </p>
            </div>
            <ChevronRight size={14} className="text-slate-300 shrink-0" />
        </button>
    );
};

// ── Batch card ────────────────────────────────────────────────────────────────

const BatchCard = ({ batch, expanded, onToggle, onSelectRoll }) => {
    const readyRolls = (batch.rolls || []).filter(r => r.ready_to_load_next_cycle);

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition text-left"
            >
                <div className="shrink-0">
                    {expanded
                        ? <ChevronDown size={16} className="text-slate-400" />
                        : <ChevronRight size={16} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-slate-800">{batch.batch_code}</span>
                        <span className="text-[10px] font-bold font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{batch.batch_id}
                        </span>
                        <StatusPill status={batch.seq1_progress_status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {batch.product_name || '—'}
                        {batch.line_name ? ` · ${batch.line_name}` : ''}
                    </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        {readyRolls.length} ready
                    </span>
                </div>
            </button>

            {expanded && (
                <div className="border-t border-slate-100 bg-slate-50/40">
                    {/* Cycle metadata */}
                    <div className="px-4 py-2.5 grid grid-cols-2 gap-3 text-xs border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <Layers size={12} className="text-violet-500" />
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Seq 1</p>
                                <p className="font-mono text-[10px] text-slate-600 truncate">
                                    {batch.seq1?.tracking_table || '—'}
                                    {batch.seq1?.processing_mode ? ` · ${batch.seq1.processing_mode}` : ''}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Truck size={12} className="text-emerald-500" />
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Seq 2 (next)</p>
                                <p className="font-mono text-[10px] text-slate-600 truncate">
                                    {batch.seq2?.tracking_table || '—'}
                                    {batch.seq2?.processing_mode ? ` · ${batch.seq2.processing_mode}` : ''}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Ready rolls list */}
                    <div className="p-3 space-y-2">
                        {readyRolls.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-4">
                                No rolls currently ready to load.
                            </p>
                        ) : readyRolls.map(roll => (
                            <RollCard
                                key={roll.roll_id}
                                roll={roll}
                                onOpen={() => onSelectRoll(roll)}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReadyToLoadPage() {
    const [batches,    setBatches]    = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [err,        setErr]        = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [selectedRoll, setSelectedRoll] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res  = await initializationPortalApi.getRollsReadyForNextCycle();
            const data = res.data?.data ?? res.data ?? [];
            setBatches(Array.isArray(data) ? data : (data.batches || []));
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to load ready-to-load list');
            setBatches([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Filter batches to only those that have at least one ready roll
    const visibleBatches = useMemo(
        () => batches.filter(b => (b.rolls || []).some(r => r.ready_to_load_next_cycle)),
        [batches]
    );

    const totalReadyRolls = useMemo(
        () => visibleBatches.reduce((s, b) => s + (b.rolls || []).filter(r => r.ready_to_load_next_cycle).length, 0),
        [visibleBatches]
    );

    const toggleBatch = (id) => setExpandedId(prev => prev === id ? null : id);

    const selectRollFromBatch = (batch, roll) => setSelectedRoll({ batch, roll });

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                        <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            <Truck size={20} className="text-emerald-600" />
                            Ready to Load
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Rolls fully cleared from cycle 1 and not yet loaded into cycle 2.
                            {!loading && (
                                <>
                                    {' '}<span className="font-bold text-slate-700">{totalReadyRolls}</span> roll{totalReadyRolls === 1 ? '' : 's'}
                                    {' across '}<span className="font-bold text-slate-700">{visibleBatches.length}</span> batch{visibleBatches.length === 1 ? '' : 'es'}
                                </>
                            )}
                        </p>
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50 bg-white shadow-sm"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {/* Error */}
                {err && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
                        <AlertCircle size={15} /> {err}
                    </div>
                )}

                {/* Body */}
                {loading && batches.length === 0 ? (
                    <div className="flex justify-center items-center py-32 text-slate-400 gap-2">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-sm">Loading…</span>
                    </div>
                ) : visibleBatches.length === 0 ? (
                    <div className="text-center py-24 text-slate-400">
                        <CheckCircle2 size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="text-base font-medium">No rolls ready to load right now.</p>
                        <p className="text-xs mt-1">Rolls appear here when every cut piece is completed in cycle 1 and the roll has not yet entered cycle 2.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleBatches.map(batch => (
                            <BatchCard
                                key={batch.batch_id}
                                batch={batch}
                                expanded={expandedId === batch.batch_id}
                                onToggle={() => toggleBatch(batch.batch_id)}
                                onSelectRoll={(roll) => selectRollFromBatch(batch, roll)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {selectedRoll && (
                <RollDetailModal
                    batch={selectedRoll.batch}
                    roll={selectedRoll.roll}
                    onClose={() => setSelectedRoll(null)}
                />
            )}
        </div>
    );
}

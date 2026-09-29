// ─── MATERIAL REPLACEMENT — CHECKER-SIDE MODALS ──────────────────────────────
// Two modals used by /universal-checker/dashboard:
//   MaterialReplacementRequestModal — opened from the "Pending Rework" tile.
//     Shows every still-PENDING piece across the checker's whole queue;
//     the checker selects some, picks a reason (defect code + optional
//     note), and submits — those pieces move to FOR_REPLACEMENT and drop
//     out of the normal checking queue until a cutting_manager resolves them.
//   MaterialReplacementStatusModal — opened from the "For Replacement"
//     button. Read-only: Current (REQUESTED) / Fulfilled / Cancelled tabs,
//     scoped to the checker's own line, each row with full detail.
// PIECE-mode only (matches how these pieces are individually trackable at
// all) — the caller is responsible for only offering pieces sourced from
// PIECE-mode batches that are currently sitting in the checker's own
// pending-rework queue (an unresolved NEEDS_REWORK defect).
import { useState, useEffect, useMemo } from 'react';
import { X, PackageX, Search, Loader2, AlertCircle } from 'lucide-react';

const STATUS_TABS = [
    { key: 'REQUESTED', label: 'Requested' },
    { key: 'ACCEPTED',  label: 'Accepted' },
    { key: 'FULFILLED', label: 'Fulfilled' },
    { key: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_BADGE_STYLES = {
    REQUESTED: 'bg-amber-100 text-amber-700',
    ACCEPTED:  'bg-sky-100 text-sky-700',
    FULFILLED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-slate-200 text-slate-500',
};

// One request's full detail — shared by the status modal's tabs and the
// request modal's "already sent" section (below), so both look identical.
// onClick is optional — when given (the request modal's history section),
// the whole card becomes clickable to jump to that piece in the live queue.
function RequestDetailRow({ r, onClick }) {
    return (
        <div
            onClick={onClick}
            className={`border border-slate-200 rounded-xl p-3 bg-white ${onClick ? 'cursor-pointer hover:border-violet-400 hover:shadow-md transition' : ''}`}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="font-black text-slate-800 text-sm">
                    #{r.piece_sequence} · {r.part_name} · Size {r.size}
                </p>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE_STYLES[r.status] || 'bg-slate-200 text-slate-500'}`}>
                    {r.status}
                </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="font-bold text-slate-700">{r.defect_code}</span>
                {r.defect_description && <span>{r.defect_description}</span>}
                <span>Requested by {r.requested_by_name || '—'} · {new Date(r.created_at).toLocaleString()}</span>
                {r.accepted_at && (
                    <span>Accepted by {r.accepted_by_name || '—'} · {new Date(r.accepted_at).toLocaleString()}</span>
                )}
                {(r.status === 'FULFILLED' || r.status === 'CANCELLED') && (
                    <span>{r.status === 'FULFILLED' ? 'Fulfilled' : 'Cancelled'} by {r.resolved_by_name || '—'} · {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '—'}</span>
                )}
            </div>
            {r.notes && <p className="mt-1.5 text-xs italic text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">"{r.notes}"</p>}
        </div>
    );
}

// fetchRequests/scopePieceIds are optional — passed only when opened from a
// size/roll row's own "Replacement" button (UniversalWorkstationDashboard.jsx's
// openReplacementRequest), so the modal can also show what's already been
// sent for THIS row (waiting for acceptance, accepted, fulfilled, or
// cancelled) instead of just the blank pick-pieces UI. Omitted for the
// whole-queue "Pending Rework" tile entry point — unscoped history there
// would mean pulling the line's entire all-time history for no scoped reason.
// No reason/defect-code picker here — redundant, since every piece already
// carries the defect that put it in Pending Rework in the first place; the
// backend carries that same defect_code_id straight onto the request.
export function MaterialReplacementRequestModal({ pieces, onClose, onSubmit, fetchRequests, scopePieceIds, onOpenPiece }) {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [search, setSearch] = useState('');
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [historyRows, setHistoryRows] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (!fetchRequests || !scopePieceIds) { setHistoryRows(null); return; }
        let cancelled = false;
        // String-normalized — cut_piece_log is BIGINT, which pg can serialize
        // as either a JS string or number depending on the query path; this
        // avoids a silent empty-history bug if the two endpoints ever differ.
        const scopeIdStrings = new Set([...scopePieceIds].map(String));
        setHistoryLoading(true);
        Promise.all(['REQUESTED', 'ACCEPTED', 'FULFILLED', 'CANCELLED'].map(status =>
            fetchRequests(status).then(res => res.data?.requests ?? []).catch(() => [])
        )).then(([requested, accepted, fulfilled, cancelledReqs]) => {
            if (cancelled) return;
            const all = [...requested, ...accepted, ...fulfilled, ...cancelledReqs]
                .filter(r => scopeIdStrings.has(String(r.piece_id)))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setHistoryRows(all);
        }).finally(() => { if (!cancelled) setHistoryLoading(false); });
        return () => { cancelled = true; };
    }, [fetchRequests, scopePieceIds]);

    const filteredPieces = useMemo(() => {
        if (!search.trim()) return pieces;
        const q = search.trim().toLowerCase();
        return pieces.filter(p =>
            String(p.piece_sequence || '').includes(q) ||
            String(p.batch_id || '').includes(q) ||
            String(p.part_name || '').toLowerCase().includes(q) ||
            String(p.size || '').toLowerCase().includes(q) ||
            String(p.roll_id || '').includes(q)
        );
    }, [pieces, search]);

    // Grouped by batch — a busy rework queue reads as "which batches need
    // attention" rather than a flat, unrelated grid of piece tiles.
    const groupedPieces = useMemo(() => {
        const batchMap = new Map();
        filteredPieces.forEach(p => {
            if (!batchMap.has(p.batch_id)) batchMap.set(p.batch_id, []);
            batchMap.get(p.batch_id).push(p);
        });
        return [...batchMap.entries()].map(([batch_id, batchPieces]) => ({ batch_id, pieces: batchPieces }));
    }, [filteredPieces]);

    const togglePiece = (id) => setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const handleSubmit = async () => {
        if (selectedIds.size === 0) return;
        setSubmitting(true);
        setError(null);
        try {
            await onSubmit(Array.from(selectedIds), notes.trim() || null);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/95 z-[150] flex flex-col p-0 font-inter">
            <div className="bg-violet-600 text-white px-3 sm:px-5 py-2.5 sm:py-3 flex justify-between items-start sm:items-center gap-2 shrink-0 border-b-2 border-violet-800">
                <div className="flex flex-col sm:flex-row sm:items-center min-w-0">
                    <div className="flex items-center">
                        <PackageX className="w-5 h-5 mr-2 shrink-0" />
                        <span className="font-black uppercase tracking-widest text-xs sm:text-sm">Request Material Replacement</span>
                    </div>
                    <span className="sm:ml-3 text-[11px] sm:text-xs font-bold text-violet-200">{pieces.length} piece{pieces.length !== 1 ? 's' : ''} in your pending rework queue</span>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-violet-700 rounded-full transition shrink-0"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Filter by sequence #, batch, part, size, roll…"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                    />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto bg-slate-100 p-3 sm:p-6">
                {scopePieceIds && (
                    <div className="mb-5 sm:mb-6">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                            Already Sent For This Row
                        </p>
                        {historyLoading ? (
                            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
                        ) : !historyRows || historyRows.length === 0 ? (
                            <p className="text-xs text-slate-400 font-bold">None yet — nothing from this row has been sent for replacement.</p>
                        ) : (
                            <div className="space-y-2">
                                {historyRows.map(r => (
                                    <RequestDetailRow key={r.id} r={r} onClick={onOpenPiece ? () => onOpenPiece(r.piece_id) : undefined} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {filteredPieces.length === 0 ? (
                    <p className="text-center text-slate-400 font-bold py-12">No pending rework pieces match.</p>
                ) : (
                    <div className="space-y-5 sm:space-y-6">
                        {groupedPieces.map(({ batch_id, pieces: batchPieces }) => (
                            <div key={batch_id}>
                                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                                    Batch #{batch_id}
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                    {batchPieces.map(p => {
                                        const isSelected = selectedIds.has(p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => togglePiece(p.id)}
                                                className={`text-left rounded-xl border-2 p-2.5 sm:p-3 transition active:scale-95 ${
                                                    isSelected ? 'bg-violet-600 border-violet-700 text-white shadow-lg' : 'bg-white border-slate-200 hover:border-violet-300'
                                                }`}
                                            >
                                                <div className={`text-[10px] sm:text-xs font-black uppercase tracking-wide truncate ${isSelected ? 'text-violet-200' : 'text-slate-400'}`}>
                                                    Batch #{p.batch_id} · Roll #{p.roll_id}
                                                </div>
                                                <div className={`font-mono font-black text-base sm:text-lg ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                                                    #{p.piece_sequence}
                                                </div>
                                                <div className={`text-xs sm:text-sm font-black rounded-lg px-2 py-1 mt-1 inline-block ${
                                                    isSelected ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'
                                                }`}>
                                                    {p.part_name} · Size {p.size}
                                                </div>
                                                {p.defect_reason && (
                                                    <div className={`mt-1 text-[11px] italic truncate ${isSelected ? 'text-violet-200' : 'text-amber-600'}`} title={p.defect_reason}>
                                                        {p.defect_reason}
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white border-t-4 border-violet-500 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] shrink-0 p-3 sm:p-4 space-y-3">
                {error && (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-2 rounded-lg">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional note — extra detail for the cutting manager…"
                    rows={2}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none"
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm font-bold text-slate-500">
                        {selectedIds.size} piece{selectedIds.size !== 1 ? 's' : ''} selected
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={selectedIds.size === 0 || submitting}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-violet-600 text-white font-black uppercase tracking-widest text-sm px-6 py-3 rounded-xl shadow-lg hover:bg-violet-700 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageX className="w-4 h-4" />}
                        Submit Request
                    </button>
                </div>
            </div>
        </div>
    );
}

export function MaterialReplacementStatusModal({ fetchRequests, onClose }) {
    const [tab, setTab] = useState('REQUESTED');
    const [dataByTab, setDataByTab] = useState({});
    const [loading, setLoading] = useState(false);

    const load = (status) => {
        setLoading(true);
        fetchRequests(status)
            .then(res => setDataByTab(prev => ({ ...prev, [status]: res.data?.requests ?? [] })))
            .catch(() => setDataByTab(prev => ({ ...prev, [status]: [] })))
            .finally(() => setLoading(false));
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { load('REQUESTED'); }, []);

    const switchTab = (key) => {
        setTab(key);
        if (!dataByTab[key]) load(key);
    };

    // Batch → Roll → requests, in first-seen order (rows already arrive
    // newest-first from the backend; grouping preserves that ordering).
    const groupedRows = useMemo(() => {
        const rows = dataByTab[tab] || [];
        const batchMap = new Map();
        rows.forEach(r => {
            if (!batchMap.has(r.batch_id)) {
                batchMap.set(r.batch_id, { batch_id: r.batch_id, batch_code: r.batch_code, rolls: new Map() });
            }
            const batch = batchMap.get(r.batch_id);
            if (!batch.rolls.has(r.fabric_roll_id)) batch.rolls.set(r.fabric_roll_id, []);
            batch.rolls.get(r.fabric_roll_id).push(r);
        });
        return [...batchMap.values()].map(b => ({
            ...b,
            rolls: [...b.rolls.entries()].map(([roll_id, requests]) => ({ roll_id, requests })),
        }));
    }, [dataByTab, tab]);

    return (
        <div className="fixed inset-0 bg-black/70 z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
                <div className="bg-slate-900 text-white px-5 py-3 flex justify-between items-center shrink-0">
                    <span className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                        <PackageX className="w-4 h-4" /> Material Replacements — My Line
                    </span>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-full transition"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex border-b border-slate-200 shrink-0">
                    {STATUS_TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => switchTab(t.key)}
                            className={`flex-1 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition ${
                                tab === t.key ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex-grow overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>
                    ) : groupedRows.length === 0 ? (
                        <p className="text-center text-slate-400 font-bold py-10">Nothing here.</p>
                    ) : (
                        <div className="space-y-4">
                            {groupedRows.map(batch => (
                                <div key={batch.batch_id}>
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                                        #{batch.batch_id} · {batch.batch_code || 'Batch'}
                                    </p>
                                    <div className="space-y-3 pl-3 border-l-2 border-slate-100">
                                        {batch.rolls.map(rollGroup => (
                                            <div key={rollGroup.roll_id}>
                                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                                                    Roll #{rollGroup.roll_id}
                                                </p>
                                                <div className="space-y-2">
                                                    {rollGroup.requests.map(r => <RequestDetailRow key={r.id} r={r} />)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { liveQcApi } from '../../api/liveQcApi';
import { Loader2, X, AlertCircle, ChevronLeft, ChevronRight, Scissors, Shirt, Search } from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 350;

const PAGE_SIZE = 50;

const STATUS_CLS = {
    APPROVED:     'bg-emerald-100 text-emerald-700 border-emerald-200',
    NUMBERED:     'bg-slate-100 text-slate-600 border-slate-200',
    REPAIRED:     'bg-sky-100 text-sky-700 border-sky-200',
    NEEDS_REWORK: 'bg-amber-100 text-amber-700 border-amber-200',
    QC_REJECTED:  'bg-red-100 text-red-700 border-red-200',
};

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// Shared drilldown for the Live QC Tracking page — two modes:
//   { mode: 'line', lineId, lineName, defectsOnly? }  — units checked on this
//                                                        line today (or just
//                                                        the defects among them)
//   { mode: 'ids', ids, title }                       — the exact rows one
//                                                        feed event wrote
const LiveDrilldownModal = ({ mode, lineId, lineName, defectsOnly, ids, title, onClose }) => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // 'line' mode searches server-side (matches unit id, part name, batch
    // code, defect code/description, checker name) so it can reach beyond
    // the current page; 'ids' mode is a small, already-fetched fixed list, so
    // it just filters client-side below instead of round-tripping.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [search]);

    const load = useCallback(async (pageArg) => {
        setLoading(true);
        setError(null);
        try {
            if (mode === 'line') {
                const res = await liveQcApi.getLineUnits({
                    line_id: lineId, page: pageArg, page_size: PAGE_SIZE,
                    ...(defectsOnly && { defects_only: true }),
                    ...(debouncedSearch && { search: debouncedSearch }),
                });
                setRows(res.data?.data || []);
                setTotal(res.data?.total || 0);
                setPage(res.data?.page || pageArg);
            } else {
                const res = await liveQcApi.getUnitsByIds(ids || []);
                setRows(res.data?.data || []);
                setTotal((res.data?.data || []).length);
                setPage(1);
            }
        } catch (e) {
            setError(e?.response?.data?.error || 'Failed to load detail.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [mode, lineId, defectsOnly, debouncedSearch, ids]);

    useEffect(() => { load(1); }, [load]);

    const displayRows = useMemo(() => {
        if (mode !== 'ids' || !debouncedSearch) return rows;
        const term = debouncedSearch.toLowerCase();
        return rows.filter(r => [r.unit_identifier, r.part_name, r.batch_code, r.defect_code, r.description, r.detected_by_name, r.line_name]
            .filter(Boolean).some(v => String(v).toLowerCase().includes(term)));
    }, [mode, rows, debouncedSearch]);

    const totalPages = mode === 'line' ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
    const displayTotal = mode === 'ids' ? displayRows.length : total;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <h2 className="text-base font-black text-slate-800">
                            {mode === 'line'
                                ? `${lineName} — ${defectsOnly ? "Today's Defect Log" : "Today's Checks"}`
                                : (title || 'Check Detail')}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">{displayTotal.toLocaleString()} unit{displayTotal === 1 ? '' : 's'}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="px-5 py-3 border-b border-slate-100 shrink-0 relative">
                    <Search size={14} className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search unit ID, part, batch, defect code, checker…"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                </div>

                <div className="overflow-auto flex-1">
                    {loading ? (
                        <div className="flex justify-center items-center py-16"><Loader2 className="animate-spin h-8 w-8 text-indigo-500" /></div>
                    ) : error ? (
                        <div className="flex items-center gap-2 p-5 text-red-700 text-sm"><AlertCircle size={16} /> {error}</div>
                    ) : displayRows.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-16">
                            {debouncedSearch ? 'No checks match your search.' : 'No checks recorded yet.'}
                        </p>
                    ) : (
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] sticky top-0">
                                <tr>
                                    <th className="text-left px-3 py-2">Level</th>
                                    {mode === 'ids' && <th className="text-left px-3 py-2">Line</th>}
                                    <th className="text-left px-3 py-2">Batch</th>
                                    <th className="text-left px-3 py-2">Roll</th>
                                    <th className="text-left px-3 py-2">Part / Unit ID</th>
                                    <th className="text-left px-3 py-2">Size</th>
                                    <th className="text-left px-3 py-2">Status</th>
                                    <th className="text-left px-3 py-2">Defect</th>
                                    <th className="text-left px-3 py-2">Checked By</th>
                                    <th className="text-left px-3 py-2">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {displayRows.map(r => {
                                    const Icon = r.level === 'garment' ? Shirt : Scissors;
                                    return (
                                        <tr key={r.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-2 text-slate-500"><Icon size={13} className="inline mr-1 -mt-0.5" />{r.level}</td>
                                            {mode === 'ids' && <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.line_name || `#${r.line_id}`}</td>}
                                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.batch_code || `#${r.batch_id}`}</td>
                                            <td className="px-3 py-2 text-slate-500 font-mono">{r.fabric_roll_id ? `#${r.fabric_roll_id}` : '—'}</td>
                                            <td className="px-3 py-2">
                                                <span className="font-mono font-bold text-indigo-600">{r.unit_identifier || '—'}</span>
                                                {r.part_name && <span className="text-slate-500 ml-1.5">{r.part_name}</span>}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600">{r.size || '—'}</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${STATUS_CLS[r.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    {r.status?.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-500">
                                                {r.defect_code ? <>{r.defect_code} <span className="text-slate-400">— {r.description}</span></> : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.detected_by_name || '—'}</td>
                                            <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {mode === 'line' && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 shrink-0">
                        <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
                        <div className="flex items-center gap-2">
                            <button onClick={() => load(page - 1)} disabled={loading || page <= 1}
                                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-2.5 py-1.5 transition">
                                <ChevronLeft size={13} /> Prev
                            </button>
                            <button onClick={() => load(page + 1)} disabled={loading || page >= totalPages}
                                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-2.5 py-1.5 transition">
                                Next <ChevronRight size={13} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiveDrilldownModal;

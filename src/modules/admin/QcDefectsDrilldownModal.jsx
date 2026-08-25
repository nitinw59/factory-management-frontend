import React, { useState, useEffect, useCallback } from 'react';
import { qcApi } from '../../api/qcApi';
import { Loader2, X, AlertCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const PAGE_SIZE = 50;

const SEVERITY_CLS = {
    NEEDS_REWORK: 'bg-amber-100 text-amber-700 border-amber-200',
    QC_REJECTED:  'bg-red-100 text-red-700 border-red-200',
};

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// Row-level drilldown — every clickable row/bar/slice on the QC Analytics
// dashboard opens this, pre-filtered to the dimension that was clicked
// (batch_id / category / defect_code_id / detected_by_user_id /
// responsible_operator_id), backed by GET /qc/analytics/defects.
const QcDefectsDrilldownModal = ({ baseParams, filter, onClose }) => {
    const [level,      setLevel]      = useState('');
    const [isResolved, setIsResolved] = useState('');
    const [page,       setPage]       = useState(1);
    const [rows,       setRows]       = useState([]);
    const [total,      setTotal]      = useState(0);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);

    const load = useCallback(async (pageArg) => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                ...baseParams,
                ...(filter?.params || {}),
                ...(level ? { level } : {}),
                ...(isResolved ? { is_resolved: isResolved } : {}),
                page: pageArg,
                page_size: PAGE_SIZE,
            };
            const res = await qcApi.getQCDefects(params);
            setRows(res.data?.data || []);
            setTotal(res.data?.total || 0);
            setPage(res.data?.page || pageArg);
        } catch (e) {
            setError(e?.response?.data?.error || 'Failed to load defect detail.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [baseParams, filter, level, isResolved]);

    useEffect(() => { load(1); }, [load]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <h2 className="text-base font-black text-slate-800">Defect Detail</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{filter?.label || 'All defects for the selected period'}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                {/* Sub-filters */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 shrink-0 flex-wrap">
                    <Filter size={13} className="text-slate-400" />
                    <select value={level} onChange={e => setLevel(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                        <option value="">All levels</option>
                        <option value="piece">Piece</option>
                        <option value="garment">Garment</option>
                    </select>
                    <select value={isResolved} onChange={e => setIsResolved(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                        <option value="">Resolved + unresolved</option>
                        <option value="true">Resolved only</option>
                        <option value="false">Unresolved only</option>
                    </select>
                    <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} row{total === 1 ? '' : 's'}</span>
                </div>

                <div className="overflow-auto flex-1">
                    {loading ? (
                        <div className="flex justify-center items-center py-16"><Loader2 className="animate-spin h-8 w-8 text-indigo-500" /></div>
                    ) : error ? (
                        <div className="flex items-center gap-2 p-5 text-red-700 text-sm"><AlertCircle size={16} /> {error}</div>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-16">No defects match this filter.</p>
                    ) : (
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] sticky top-0">
                                <tr>
                                    <th className="text-left px-3 py-2">Level</th>
                                    <th className="text-left px-3 py-2">Unit</th>
                                    <th className="text-left px-3 py-2">Size</th>
                                    <th className="text-left px-3 py-2">Defect</th>
                                    <th className="text-left px-3 py-2">Category</th>
                                    <th className="text-left px-3 py-2">Severity</th>
                                    <th className="text-left px-3 py-2">Line</th>
                                    <th className="text-left px-3 py-2">Detected By</th>
                                    <th className="text-left px-3 py-2">Responsible</th>
                                    <th className="text-left px-3 py-2">Resolved</th>
                                    <th className="text-left px-3 py-2">Logged</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map(r => (
                                    <tr key={`${r.level}-${r.id}`} className="hover:bg-slate-50">
                                        <td className="px-3 py-2 text-slate-500 uppercase">{r.level}</td>
                                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{r.unit_identifier || '—'}</td>
                                        <td className="px-3 py-2 text-slate-600">{r.size || '—'}</td>
                                        <td className="px-3 py-2">
                                            <span className="font-mono font-bold text-indigo-600">{r.defect_code}</span>
                                            <span className="text-slate-500 ml-1">{r.description}</span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">{r.category}</td>
                                        <td className="px-3 py-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${SEVERITY_CLS[r.severity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                {r.severity?.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.line_name || '—'}</td>
                                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.detected_by_name || '—'}</td>
                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.responsible_operator_name || '—'}</td>
                                        <td className="px-3 py-2">
                                            {r.is_resolved
                                                ? <span className="text-emerald-600 font-bold">Yes</span>
                                                : <span className="text-slate-400">No</span>}
                                        </td>
                                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
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
            </div>
        </div>
    );
};

export default QcDefectsDrilldownModal;

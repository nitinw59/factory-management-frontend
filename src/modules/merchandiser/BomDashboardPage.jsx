import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Plus, FileText, Edit2, Trash2, Send, Eye, Package,
    AlertCircle, Loader2, X, RefreshCw, Search, ChevronDown,
    ChevronUp, Check, AlertTriangle,
} from 'lucide-react';
import { bomApi } from '../../api/bomApi';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STATUS_CFG = {
    DRAFT:            { label: 'Draft',           cls: 'bg-slate-100  text-slate-600  border-slate-200',  border: 'border-l-slate-400'   },
    PENDING_APPROVAL: { label: 'Pending Approval', cls: 'bg-amber-100  text-amber-700  border-amber-200',  border: 'border-l-amber-400'   },
    APPROVED:         { label: 'Approved',         cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', border: 'border-l-emerald-400' },
    ARCHIVED:         { label: 'Archived',         cls: 'bg-gray-100   text-gray-500   border-gray-200',   border: 'border-l-gray-300'    },
};

// ─── SMALL SHARED ─────────────────────────────────────────────────────────────

const Spinner = ({ h = 64 }) => (
    <div className={`flex justify-center items-center h-${h}`}>
        <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
    </div>
);

const StatusBadge = ({ status }) => {
    const { label, cls } = STATUS_CFG[status] || { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cls}`}>
            {label}
        </span>
    );
};

// ─── BOM DETAIL MODAL ─────────────────────────────────────────────────────────

const BomDetailModal = ({ bomId, onClose }) => {
    const [bom, setBom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    useEffect(() => {
        bomApi.getById(bomId)
            .then(res => setBom(res.data?.data ?? res.data))
            .catch(e => setErr(e?.response?.data?.error || e.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, [bomId]);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="font-extrabold text-slate-800 text-base">
                        {loading ? 'Loading BOM…' : bom?.bom_name || 'BOM Detail'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {loading && <Spinner />}
                    {err && <p className="text-red-500 text-sm">{err}</p>}
                    {bom && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                {[
                                    { label: 'Product',  val: bom.product?.name || '—' },
                                    { label: 'Status',   val: <StatusBadge status={bom.status} /> },
                                    { label: 'Created',  val: new Date(bom.created_at).toLocaleDateString() },
                                    { label: 'Approved', val: bom.approved_by ? bom.approved_by : '—' },
                                ].map(({ label, val }) => (
                                    <div key={label}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                                        {typeof val === 'string' ? <p className="font-semibold text-slate-700 text-xs">{val}</p> : val}
                                    </div>
                                ))}
                            </div>

                            {(bom.ratio_groups || []).length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ratio Groups</p>
                                    <div className="space-y-3">
                                        {bom.ratio_groups.map((rg, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                                                    <p className="font-bold text-slate-700 text-sm">{rg.ratio_group_name}</p>
                                                    {rg.marker_length_inches && (
                                                        <span className="text-[10px] text-slate-400">{rg.marker_length_inches}" marker</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 p-3">
                                                    {(rg.items || []).map((it, j) => (
                                                        <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded-lg px-2.5 py-1 text-xs font-bold">
                                                            {it.size}: {it.number_of_pieces} pcs
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(bom.fabric_consumptions || []).length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Fabric Consumptions</p>
                                    <div className="space-y-2">
                                        {bom.fabric_consumptions.map((fc, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-bold text-slate-700 text-sm">{fc.fabric_type?.name || `Fabric #${fc.fabric_type_id}`}</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{fc.calculation_type}</span>
                                                        {fc.wastage_percentage > 0 && (
                                                            <span className="text-[10px] text-slate-400">{fc.wastage_percentage}% wastage</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {fc.calculation_type === 'AVERAGE'
                                                    ? <p className="text-xs text-slate-600">{fc.average_consumption_inches}" avg per garment</p>
                                                    : (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(fc.size_consumptions || []).map((sc, j) => (
                                                                <span key={j} className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                                                    {sc.size}: {sc.consumption_inches}"
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )
                                                }
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(bom.material_consumptions || []).length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Material / Trim Consumptions</p>
                                    <div className="space-y-2">
                                        {bom.material_consumptions.map((mc, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl p-3">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="font-bold text-slate-700 text-sm">{mc.trim_item?.name || `Trim #${mc.trim_item_id}`}</p>
                                                        {mc.trim_item?.unit_of_measure && (
                                                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">
                                                                {mc.trim_item.unit_of_measure}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{mc.calculation_type}</span>
                                                        {mc.wastage_percentage > 0 && (
                                                            <span className="text-[10px] text-slate-400">{mc.wastage_percentage}% wastage</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {mc.placement_description && (
                                                    <p className="text-[10px] text-slate-400 mb-1.5">Placement: {mc.placement_description}</p>
                                                )}
                                                {mc.calculation_type === 'FIXED' ? (
                                                    <p className="text-xs text-slate-600 font-bold">
                                                        {mc.fixed_quantity} <span className="font-normal text-slate-400">
                                                            {mc.trim_item?.unit_of_measure ? `${mc.trim_item.unit_of_measure} per garment (fixed)` : 'per garment (fixed)'}
                                                        </span>
                                                    </p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(mc.size_consumptions || []).map((sc, j) => (
                                                            <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                                                {sc.size}: {sc.quantity}{mc.trim_item?.unit_of_measure ? ` ${mc.trim_item.unit_of_measure}` : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="border-t border-slate-100 px-6 py-4 flex justify-end bg-slate-50 rounded-b-2xl">
                    <button onClick={onClose} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-sm transition-colors">Close</button>
                </div>
            </div>
        </div>
    );
};

// ─── BOM CARD ─────────────────────────────────────────────────────────────────

const BomCard = ({ bom, onEdit, onView, onSubmit, onDelete }) => {
    const { border } = STATUS_CFG[bom.status] || {};
    return (
        <div className={`bg-white rounded-xl border border-slate-200 border-l-4 ${border} shadow-sm hover:shadow-md transition-shadow`}>
            <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 mr-2">
                        <p className="font-bold text-slate-800 text-sm leading-tight truncate">{bom.bom_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{bom.product?.name}</p>
                    </div>
                    <StatusBadge status={bom.status} />
                </div>
                <div className="grid grid-cols-3 gap-1.5 my-3">
                    {[
                        { label: 'Ratio Groups', val: bom.ratio_groups_count ?? bom.ratio_groups?.length ?? 0 },
                        { label: 'Fabrics',      val: bom.fabric_count      ?? bom.fabric_consumptions?.length ?? 0 },
                        { label: 'Materials',    val: bom.material_count    ?? bom.material_consumptions?.length ?? 0 },
                    ].map(({ label, val }) => (
                        <div key={label} className="bg-slate-50 rounded-lg p-2 text-center border border-black/5">
                            <p className="font-black text-slate-800 text-sm">{val}</p>
                            <p className="text-[8px] font-bold uppercase text-slate-400 leading-tight">{label}</p>
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-slate-400">
                    {new Date(bom.created_at).toLocaleDateString()}
                    {bom.created_by && ` · ${bom.created_by}`}
                </p>
            </div>
            <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-1.5 bg-slate-50 rounded-b-xl">
                <button onClick={() => onView(bom.id)} className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-200 transition-colors">
                    <Eye size={10} /> View
                </button>
                {bom.status === 'DRAFT' && (
                    <>
                        <button onClick={() => onEdit(bom)} className="flex items-center gap-1 text-[11px] font-bold text-violet-600 hover:text-violet-700 px-2 py-1 rounded hover:bg-violet-50 transition-colors">
                            <Edit2 size={10} /> Edit
                        </button>
                        <button onClick={() => onSubmit(bom)} className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">
                            <Send size={10} /> Submit
                        </button>
                        <button onClick={() => onDelete(bom)} className="ml-auto flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                            <Trash2 size={10} /> Delete
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

// ─── STATUS GROUP ─────────────────────────────────────────────────────────────

const BomGroup = ({ title, boms, defaultOpen, onEdit, onView, onSubmit, onDelete }) => {
    const [open, setOpen] = useState(defaultOpen);
    if (!boms.length) return null;
    return (
        <div className="mb-6 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-slate-50 border-b border-slate-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 text-sm">{title}</span>
                    <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{boms.length}</span>
                </div>
                {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {open && (
                <div className="p-5 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {boms.map(b => (
                            <BomCard key={b.id} bom={b} onEdit={onEdit} onView={onView} onSubmit={onSubmit} onDelete={onDelete} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── CONFIRM DIALOG ──────────────────────────────────────────────────────────

const ConfirmDialog = ({ title, message, confirmLabel, confirmColor, onConfirm, onCancel, busy }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="text-amber-500" size={18} />
                <h3 className="font-extrabold text-slate-800 text-base">{title}</h3>
            </div>
            <p className="text-sm text-slate-600 mb-5">{message}</p>
            <div className="flex gap-3 justify-end">
                <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={onConfirm} disabled={busy} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}>
                    {busy && <Loader2 size={13} className="animate-spin" />} {confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function BomDashboardPage() {
    const navigate = useNavigate();
    const [boms, setBoms]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [search, setSearch]   = useState('');
    const [viewBomId, setViewBomId]         = useState(null);
    const [confirmAction, setConfirmAction] = useState(null);
    const [actionBusy, setActionBusy]       = useState(false);
    const [toast, setToast]                 = useState(null);

    const showToast = (msg, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchBoms = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await bomApi.getAll();
            setBoms(res.data?.data ?? res.data ?? []);
        } catch {
            setError('Failed to load BOMs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchBoms(); }, [fetchBoms]);

    const filtered = useMemo(() => {
        if (!search.trim()) return boms;
        const q = search.toLowerCase();
        return boms.filter(b =>
            (b.bom_name || '').toLowerCase().includes(q) ||
            (b.product?.name || '').toLowerCase().includes(q)
        );
    }, [boms, search]);

    const grouped = useMemo(() => ({
        draft:    filtered.filter(b => b.status === 'DRAFT'),
        pending:  filtered.filter(b => b.status === 'PENDING_APPROVAL'),
        approved: filtered.filter(b => b.status === 'APPROVED'),
        archived: filtered.filter(b => b.status === 'ARCHIVED'),
    }), [filtered]);

    const stats = useMemo(() => ({
        total:    boms.length,
        draft:    boms.filter(b => b.status === 'DRAFT').length,
        pending:  boms.filter(b => b.status === 'PENDING_APPROVAL').length,
        approved: boms.filter(b => b.status === 'APPROVED').length,
    }), [boms]);

    const handleCreate = () => navigate('/merchandiser/bom/new');
    const handleEdit   = (bom) => navigate(`/merchandiser/bom/${bom.id}/edit`);
    const handleView   = (id) => setViewBomId(id);
    const handleSubmit = (bom) => setConfirmAction({ type: 'submit', bom });
    const handleDelete = (bom) => setConfirmAction({ type: 'delete', bom });

    const runAction = async () => {
        if (!confirmAction) return;
        setActionBusy(true);
        try {
            if (confirmAction.type === 'submit') {
                await bomApi.submit(confirmAction.bom.id);
                showToast('BOM submitted for approval.');
            } else if (confirmAction.type === 'delete') {
                await bomApi.remove(confirmAction.bom.id);
                showToast('BOM deleted.');
            }
            fetchBoms();
        } catch (e) {
            showToast(e?.response?.data?.error || e.message || 'Action failed.', false);
        } finally {
            setActionBusy(false);
            setConfirmAction(null);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {toast && (
                <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-bold border ${toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                    {toast.ok ? <Check size={15} /> : <AlertCircle size={15} />} {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText className="text-violet-600" size={22} />
                        <h1 className="text-xl font-extrabold text-slate-800">BOM Management</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={fetchBoms} disabled={loading} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                        </button>
                        <button onClick={handleCreate} className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl transition-colors">
                            <Plus size={14} /> New BOM
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                        { label: 'Total',    val: stats.total,    color: 'text-slate-800'   },
                        { label: 'Draft',    val: stats.draft,    color: 'text-slate-600'   },
                        { label: 'Pending',  val: stats.pending,  color: 'text-amber-700'   },
                        { label: 'Approved', val: stats.approved, color: 'text-emerald-700' },
                    ].map(({ label, val, color }) => (
                        <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <p className={`text-2xl font-black ${color}`}>{val}</p>
                            <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search BOM name or product…"
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                    />
                </div>
            </div>

            {/* Body */}
            <div className="p-6">
                {loading ? (
                    <Spinner />
                ) : error ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                        <AlertCircle size={16} /> {error}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
                        <Package size={40} />
                        <p className="font-bold text-lg">{search ? 'No BOMs match your search.' : 'No BOMs yet.'}</p>
                        {!search && (
                            <button onClick={handleCreate} className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl mt-2 transition-colors">
                                <Plus size={14} /> Create first BOM
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <BomGroup title="Draft — Work in Progress"   boms={grouped.draft}    defaultOpen  onEdit={handleEdit} onView={handleView} onSubmit={handleSubmit} onDelete={handleDelete} />
                        <BomGroup title="Pending Approval"           boms={grouped.pending}  defaultOpen  onEdit={handleEdit} onView={handleView} onSubmit={handleSubmit} onDelete={handleDelete} />
                        <BomGroup title="Approved"                   boms={grouped.approved} defaultOpen  onEdit={handleEdit} onView={handleView} onSubmit={handleSubmit} onDelete={handleDelete} />
                        <BomGroup title="Archived"                   boms={grouped.archived} defaultOpen={false} onEdit={handleEdit} onView={handleView} onSubmit={handleSubmit} onDelete={handleDelete} />
                    </>
                )}
            </div>

            {viewBomId && (
                <BomDetailModal bomId={viewBomId} onClose={() => setViewBomId(null)} />
            )}
            {confirmAction && (
                <ConfirmDialog
                    title={confirmAction.type === 'submit' ? 'Submit for Approval?' : 'Delete BOM?'}
                    message={
                        confirmAction.type === 'submit'
                            ? `"${confirmAction.bom.bom_name}" will be submitted for review. You won't be able to edit it after this.`
                            : `"${confirmAction.bom.bom_name}" will be permanently deleted. This cannot be undone.`
                    }
                    confirmLabel={confirmAction.type === 'submit' ? 'Submit' : 'Delete'}
                    confirmColor={confirmAction.type === 'submit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                    busy={actionBusy}
                    onConfirm={runAction}
                    onCancel={() => setConfirmAction(null)}
                />
            )}
        </div>
    );
}

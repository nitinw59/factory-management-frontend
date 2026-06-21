import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, X, AlertTriangle, Ruler } from 'lucide-react';
import { accountingApi } from '../../api/accountingApi';

function SizeModal({ size, onClose, onSaved }) {
    const isEdit = !!size;
    const [name, setName] = useState(size?.name || '');
    const [displayOrder, setDisplayOrder] = useState(size?.display_order ?? '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) { setErr('Size name is required.'); return; }
        setBusy(true); setErr(null);
        const payload = { name: name.trim(), ...(displayOrder !== '' ? { display_order: Number(displayOrder) } : {}) };
        try {
            if (isEdit) {
                await accountingApi.updateSize(size.id, payload);
            } else {
                await accountingApi.createSize(payload);
            }
            onSaved();
        } catch (ex) {
            setErr(ex?.response?.data?.error || ex.message || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h2 className="text-base font-black text-gray-800">{isEdit ? `Edit · ${size.name}` : 'New Size'}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                        <X size={16} className="text-gray-500" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Size Name *</label>
                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., S, M, L, XL"
                            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Display Order</label>
                        <input
                            type="number"
                            value={displayOrder}
                            onChange={e => setDisplayOrder(e.target.value)}
                            placeholder="1"
                            min="0"
                            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                        />
                        <p className="mt-1 text-[10px] text-gray-400">Controls sort order in size dropdowns. Leave blank to sort by name.</p>
                    </div>
                    <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                        <button type="button" onClick={onClose} disabled={busy}
                            className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={busy}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition">
                            {busy && <Loader2 size={13} className="animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Size'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function SizesPage() {
    const [sizes, setSizes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [modal, setModal] = useState(undefined); // undefined=closed, null=create, obj=edit
    const [deleting, setDeleting] = useState(null);
    const [deleteErr, setDeleteErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const res = await accountingApi.getSizes();
            setSizes(res.data?.data ?? res.data ?? []);
        } catch (ex) {
            setErr(ex?.response?.data?.error || 'Failed to load sizes.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (size) => {
        if (!window.confirm(`Delete size "${size.name}"?`)) return;
        setDeleting(size.id); setDeleteErr(null);
        try {
            await accountingApi.deleteSize(size.id);
            setSizes(prev => prev.filter(s => s.id !== size.id));
        } catch (ex) {
            const status = ex?.response?.status;
            const msg = ex?.response?.data?.error || ex.message || 'Delete failed.';
            setDeleteErr(status === 409
                ? `Cannot delete "${size.name}" — it is used in existing batches or cuts.`
                : msg);
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Ruler size={20} className="text-blue-500" /> Size Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Sizes available when creating sales orders. Cannot delete sizes in use.</p>
                </div>
                <button
                    onClick={() => setModal(null)}
                    className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl shadow-sm transition shrink-0"
                >
                    <Plus size={14} /> Add Size
                </button>
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}
            {deleteErr && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-center gap-2"><AlertTriangle size={15} /> {deleteErr}</div>
                    <button onClick={() => setDeleteErr(null)}><X size={14} /></button>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-blue-400" />
                </div>
            ) : sizes.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <Ruler size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No sizes yet</p>
                    <p className="text-sm mt-1">Click "Add Size" to create the first one.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Size</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Display Order</th>
                                <th className="px-4 py-2.5 w-20" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {sizes.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-gray-800">{s.name}</td>
                                    <td className="px-4 py-3 text-gray-500">{s.display_order ?? '—'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setModal(s)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(s)}
                                                disabled={deleting === s.id}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                                                title="Delete"
                                            >
                                                {deleting === s.id
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400">
                        {sizes.length} size{sizes.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}

            {modal !== undefined && (
                <SizeModal
                    size={modal}
                    onClose={() => setModal(undefined)}
                    onSaved={() => { setModal(undefined); load(); }}
                />
            )}
        </div>
    );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    Package, Search, Plus, AlertTriangle, Loader2, CheckCircle2,
    ArrowUpRight, Tags, Pencil, Ban, RotateCcw,
} from 'lucide-react';
import { generalItemsApi } from '../../api/generalItemsApi';
import { CreateEditModal } from '../store_manager/GeneralItemsPage';

const money = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
};

function Toast({ toast }) {
    if (!toast) return null;
    return (
        <div className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-bold transition-all
            ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
            {toast.kind === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {toast.message}
        </div>
    );
}

// ─── Categories panel ────────────────────────────────────────────────────────
function CategoriesPanel({ categories, items, onAdded, showToast }) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const counts = useMemo(() => {
        const m = {};
        items.forEach(it => {
            if (it.category_id != null) m[it.category_id] = (m[it.category_id] || 0) + 1;
        });
        return m;
    }, [items]);

    const handleAdd = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            await generalItemsApi.createCategory({ name: name.trim() });
            setName('');
            onAdded();
            showToast({ kind: 'success', message: 'Category added.' });
        } catch (e) {
            showToast({ kind: 'error', message: e?.response?.data?.error || 'Failed to add category.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-fit">
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-3">
                <Tags size={13} className="text-orange-500" /> Categories
            </h2>
            <div className="flex gap-1.5 mb-3">
                <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="New category name"
                    className="flex-1 min-w-0 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                />
                <button onClick={handleAdd} disabled={busy || !name.trim()} className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-3 py-2 rounded-xl transition">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                </button>
            </div>
            <div className="space-y-1">
                {categories.length === 0 && <p className="text-xs text-slate-400 italic py-2">No categories yet.</p>}
                {categories.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-50">
                        <span className="font-semibold text-slate-700">{c.name}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{counts[c.id] || 0} item{(counts[c.id] || 0) !== 1 ? 's' : ''}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function GeneralItemsMasterPage() {
    const [items,      setItems]      = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [toast,      setToast]      = useState(null);
    const [q,          setQ]          = useState('');
    const [catFilter,  setCatFilter]  = useState('');
    const [status,     setStatus]     = useState('all'); // all | active | inactive
    const [modal,      setModal]      = useState(null);  // null | 'create' | 'edit'
    const [selected,   setSelected]   = useState(null);
    const [togglingId, setTogglingId] = useState(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ir, cr] = await Promise.all([
                generalItemsApi.getItems(),
                generalItemsApi.getCategories(),
            ]);
            setItems(ir.data?.data ?? ir.data ?? []);
            setCategories(cr.data?.data ?? cr.data ?? []);
        } catch {
            setToast({ kind: 'error', message: 'Failed to load master list.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => items.filter(it => {
        const active = it.is_active !== false;
        if (status === 'active' && !active) return false;
        if (status === 'inactive' && active) return false;
        if (catFilter && String(it.category_id) !== catFilter) return false;
        if (q) {
            const s = q.toLowerCase();
            if (!(it.name?.toLowerCase().includes(s) || it.item_code?.toLowerCase().includes(s))) return false;
        }
        return true;
    }), [items, q, catFilter, status]);

    const inactiveCount = items.filter(it => it.is_active === false).length;

    // No hard delete on the backend by design — the ledger and issue history must
    // survive. "Delete" here is a soft deactivate via PATCH is_active.
    const toggleActive = async (it) => {
        const next = !(it.is_active !== false);
        setTogglingId(it.id);
        try {
            await generalItemsApi.updateItem(it.id, { is_active: next });
            setItems(prev => prev.map(p => p.id === it.id ? { ...p, is_active: next } : p));
            setToast({ kind: 'success', message: `"${it.name}" ${next ? 'reactivated' : 'deactivated'}.` });
        } catch (e) {
            setToast({ kind: 'error', message: e?.response?.data?.error || 'Update failed.' });
        } finally {
            setTogglingId(null);
        }
    };

    const handleSaved = () => {
        setModal(null);
        setSelected(null);
        load();
        setToast({ kind: 'success', message: 'Item saved.' });
    };

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Package size={20} className="text-orange-500" />
                        General Items — Master List
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Manage the item master: create, edit, categorize, and deactivate. Stock itself only moves via purchase inwards and issue slips.
                    </p>
                </div>
                <Link
                    to="/store-manager/general-items"
                    title="Opens Store Manager portal"
                    className="flex items-center gap-1 text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl transition"
                >
                    Store view — stock, ledger & issues <ArrowUpRight size={12} className="opacity-60" />
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code…" className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400" />
                        </div>
                        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-400">
                            <option value="">All categories</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                            {[['all', 'All'], ['active', 'Active'], ['inactive', `Inactive${inactiveCount ? ` (${inactiveCount})` : ''}`]].map(([k, label]) => (
                                <button
                                    key={k} onClick={() => setStatus(k)}
                                    className={`text-xs font-semibold px-3 py-2 transition ${status === k ? 'bg-orange-500 text-white' : 'bg-white text-slate-500 hover:text-slate-700'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => { setSelected(null); setModal('create'); }} className="ml-auto text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl transition flex items-center gap-1.5">
                            <Plus size={12} /> New Item
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Category</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right hidden md:table-cell">Unit Cost</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right hidden md:table-cell">Threshold</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Stock</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                                        <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filtered.length === 0 && (
                                        <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400 italic">No items found.</td></tr>
                                    )}
                                    {filtered.map(it => {
                                        const active = it.is_active !== false;
                                        return (
                                            <tr key={it.id} className={`transition-colors hover:bg-slate-50 ${!active ? 'opacity-60' : ''}`}>
                                                <td className="py-2.5 pr-4">
                                                    <p className="font-bold text-slate-800 text-xs">{it.name}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {it.item_code && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{it.item_code}</span>}
                                                        {it.uom && <span className="text-[10px] text-slate-400">{it.uom}</span>}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 pr-4 text-xs text-slate-500 hidden sm:table-cell">{it.category_name || '—'}</td>
                                                <td className="py-2.5 pr-4 text-right text-xs text-slate-700 tabular-nums hidden md:table-cell">{money(it.unit_cost)}</td>
                                                <td className="py-2.5 pr-4 text-right text-xs text-slate-500 tabular-nums hidden md:table-cell">{it.low_stock_threshold ?? '—'}</td>
                                                <td className="py-2.5 pr-4 text-right text-xs font-bold text-slate-700 tabular-nums" title="Read-only — changes only through inwards and issue slips">
                                                    {it.current_stock ?? 0}
                                                </td>
                                                <td className="py-2.5 pr-4 text-center">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${active ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                                                        {active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-right whitespace-nowrap">
                                                    <button onClick={() => { setSelected(it); setModal('edit'); }} className="text-[10px] font-bold text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-2 py-1 rounded-lg transition inline-flex items-center gap-1">
                                                        <Pencil size={10} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(it)}
                                                        disabled={togglingId === it.id}
                                                        title={active ? 'Deactivate — hides the item from new issues; history is kept' : 'Reactivate item'}
                                                        className={`ml-1.5 text-[10px] font-bold border px-2 py-1 rounded-lg transition inline-flex items-center gap-1 disabled:opacity-40 ${
                                                            active
                                                                ? 'text-slate-500 hover:text-red-600 border-slate-200 hover:border-red-200'
                                                                : 'text-slate-500 hover:text-emerald-600 border-slate-200 hover:border-emerald-200'
                                                        }`}
                                                    >
                                                        {togglingId === it.id ? <Loader2 size={10} className="animate-spin" /> : active ? <Ban size={10} /> : <RotateCcw size={10} />}
                                                        {active ? 'Deactivate' : 'Reactivate'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <CategoriesPanel categories={categories} items={items} onAdded={load} showToast={setToast} />
            </div>

            {(modal === 'create' || modal === 'edit') && (
                <CreateEditModal
                    item={modal === 'edit' ? selected : null}
                    categories={categories}
                    onSaved={handleSaved}
                    onClose={() => { setModal(null); setSelected(null); }}
                />
            )}

            <Toast toast={toast} />
        </div>
    );
}

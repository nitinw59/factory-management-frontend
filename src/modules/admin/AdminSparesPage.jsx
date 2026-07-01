import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Pencil, X, AlertTriangle, Search, Package, AlertCircle } from 'lucide-react';
import { sparesApi } from '../../api/sparesApi';

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditSpareModal({ spare, categories, onClose, onSaved }) {
    const [name,            setName]            = useState(spare.name || '');
    const [partNumber,      setPartNumber]      = useState(spare.part_number || '');
    const [categoryId,      setCategoryId]      = useState(spare.category_id ? String(spare.category_id) : '');
    const [minStock,        setMinStock]        = useState(spare.min_stock_threshold ?? '');
    const [unitCost,        setUnitCost]        = useState(spare.unit_cost ?? '');
    const [location,        setLocation]        = useState(spare.location || '');
    const [busy,            setBusy]            = useState(false);
    const [err,             setErr]             = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr(null);

        const payload = {};
        if (name.trim()       !== spare.name)                          payload.name = name.trim();
        if (partNumber.trim() !== (spare.part_number || ''))           payload.part_number = partNumber.trim() || null;
        if (categoryId        !== String(spare.category_id ?? ''))     payload.category_id = categoryId ? parseInt(categoryId, 10) : null;
        if (String(minStock)  !== String(spare.min_stock_threshold ?? '')) payload.min_stock_threshold = minStock !== '' ? parseInt(minStock, 10) : null;
        if (String(unitCost)  !== String(spare.unit_cost ?? ''))       payload.unit_cost = unitCost !== '' ? parseFloat(unitCost) : null;
        if (location.trim()   !== (spare.location || ''))              payload.location = location.trim() || null;

        if (!Object.keys(payload).length) { onClose(); return; }

        setBusy(true);
        try {
            await sparesApi.updateSpare(spare.id, payload);
            onSaved();
        } catch (ex) {
            const status = ex?.response?.status;
            if (status === 409) setErr('Part number is already taken by another spare.');
            else setErr(ex?.response?.data?.error || 'Failed to save changes.');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-black text-gray-800">Edit Spare</h2>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{spare.name}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                        <X size={16} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} className="shrink-0" /> {err}
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Name *</label>
                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Part Number</label>
                            <input
                                type="text"
                                value={partNumber}
                                onChange={e => setPartNumber(e.target.value)}
                                placeholder="SKU-001"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</label>
                            <select
                                value={categoryId}
                                onChange={e => setCategoryId(e.target.value)}
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
                            >
                                <option value="">— Uncategorized —</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Min Stock Threshold</label>
                            <input
                                type="number" min="0" step="1"
                                value={minStock}
                                onChange={e => setMinStock(e.target.value)}
                                placeholder="0"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Unit Cost (₹)</label>
                            <input
                                type="number" min="0" step="0.01"
                                value={unitCost}
                                onChange={e => setUnitCost(e.target.value)}
                                placeholder="0.00"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Location</label>
                        <input
                            type="text"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder="e.g. Shelf B-3"
                            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                        <button type="button" onClick={onClose} disabled={busy}
                            className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={busy || !name.trim()}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition">
                            {busy && <Loader2 size={13} className="animate-spin" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Stock badge ────────────────────────────────────────────────────────────────
function StockBadge({ current, min }) {
    const isLow = min != null && current != null && current <= min;
    const isOut = current != null && current === 0;
    if (isOut) return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            <AlertCircle size={10} /> Out of stock
        </span>
    );
    if (isLow) return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle size={10} /> Low
        </span>
    );
    return null;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminSparesPage() {
    const [spares,     setSpares]     = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [err,        setErr]        = useState(null);
    const [editing,    setEditing]    = useState(null);

    // Filters
    const [search,     setSearch]     = useState('');
    const [catFilter,  setCatFilter]  = useState('');
    const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'low' | 'ok'

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const [sparesData, catsData] = await Promise.all([
                sparesApi.getAllSpares(),
                sparesApi.getCategories(),
            ]);
            setSpares(sparesData?.data ?? sparesData ?? []);
            setCategories(catsData?.data ?? catsData ?? []);
        } catch (ex) {
            setErr(ex?.response?.data?.error || 'Failed to load spares.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return spares.filter(s => {
            if (q && !s.name?.toLowerCase().includes(q) && !s.part_number?.toLowerCase().includes(q)) return false;
            if (catFilter && String(s.category_id) !== catFilter) return false;
            if (stockFilter === 'low') {
                const isLow = s.min_stock_threshold != null && s.current_stock != null && s.current_stock <= s.min_stock_threshold;
                if (!isLow) return false;
            }
            if (stockFilter === 'ok') {
                const isLow = s.min_stock_threshold != null && s.current_stock != null && s.current_stock <= s.min_stock_threshold;
                if (isLow) return false;
            }
            return true;
        });
    }, [spares, search, catFilter, stockFilter]);

    const lowCount = useMemo(() =>
        spares.filter(s => s.min_stock_threshold != null && s.current_stock != null && s.current_stock <= s.min_stock_threshold).length,
    [spares]);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Package size={20} className="text-blue-500" /> Spare Parts
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        {spares.length} parts
                        {lowCount > 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                <AlertTriangle size={10} /> {lowCount} low stock
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-48">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search name or part number…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-400"
                    />
                </div>

                <select
                    value={catFilter}
                    onChange={e => setCatFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400 bg-white"
                >
                    <option value="">All categories</option>
                    {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
                    {[['all', 'All'], ['low', 'Low Stock'], ['ok', 'OK']].map(([val, label]) => (
                        <button
                            key={val}
                            onClick={() => setStockFilter(val)}
                            className={`px-3 py-2 font-medium transition-colors ${
                                stockFilter === val
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-blue-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <Package size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{spares.length === 0 ? 'No spare parts yet' : 'No results match your filters'}</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Name</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Part #</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Category</th>
                                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Stock</th>
                                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Min</th>
                                <th className="text-right px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Unit Cost</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Location</th>
                                <th className="px-4 py-2.5 w-12" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(s => {
                                const isLow = s.min_stock_threshold != null && s.current_stock != null && s.current_stock <= s.min_stock_threshold;
                                return (
                                    <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${isLow ? 'bg-amber-50/40' : ''}`}>
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-gray-800">{s.name}</div>
                                            <StockBadge current={s.current_stock} min={s.min_stock_threshold} />
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{s.part_number || '—'}</td>
                                        <td className="px-4 py-3 text-gray-600">{s.category_name || '—'}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-gray-800">
                                            {s.current_stock ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-500">
                                            {s.min_stock_threshold ?? '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-600">
                                            {s.unit_cost != null ? `₹${parseFloat(s.unit_cost).toFixed(2)}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">{s.location || '—'}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setEditing(s)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400">
                        {filtered.length} of {spares.length} spare{spares.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}

            {editing && (
                <EditSpareModal
                    spare={editing}
                    categories={categories}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}

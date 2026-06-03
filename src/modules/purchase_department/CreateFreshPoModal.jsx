import { useState, useEffect } from 'react';
import {
    X, Loader2, AlertTriangle, Plus, Trash2, Package, Scissors, ShoppingCart,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { trimsApi } from '../../api/trimsApi';
import api from '../../utils/api';

const rk = () => Math.random().toString(36).slice(2);

const blankFabricLine = () => ({ _key: rk(), fabric_color_id: '', quantity: '' });
const blankTrimLine   = () => ({ _key: rk(), trim_item_variant_id: '', quantity: '' });

const blankFabricGroup = () => ({
    _key:           rk(),
    type:           'fabric',
    fabric_type_id: '',
    uom:            'meter',
    unit_price:     '',
    lines:          [blankFabricLine()],
});

const blankTrimGroup = () => ({
    _key:         rk(),
    type:         'trim',
    trim_item_id: '',
    uom:          'pcs',
    unit_price:   '',
    lines:        [blankTrimLine()],
});

export default function CreateFreshPoModal({ onClose, onCreated }) {
    const [supplierId,     setSupplierId]     = useState('');
    const [deliveryDate,   setDeliveryDate]   = useState('');
    const [salesOrderId,   setSalesOrderId]   = useState('');
    const [notes,          setNotes]          = useState('');
    const [groups,         setGroups]         = useState([blankFabricGroup()]);
    const [suppliers,      setSuppliers]      = useState([]);
    const [trimItems,      setTrimItems]      = useState([]);
    const [fabricTypes,    setFabricTypes]    = useState([]);
    const [fabricColors,   setFabricColors]   = useState([]);
    const [variantsByTrim, setVariantsByTrim] = useState({});  // { [trim_item_id]: [{ id, color_name, color_number, variant_size, ... }] }
    const [busy,           setBusy]           = useState(false);
    const [err,            setErr]            = useState(null);

    useEffect(() => {
        api.get('/shared/supplier')
            .then(r => setSuppliers(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data ?? r.data ?? []))
            .catch(() => setTrimItems([]));
        api.get('/shared/fabric_type')
            .then(r => setFabricTypes(r.data?.data ?? r.data ?? []))
            .catch(() => setFabricTypes([]));
        api.get('/shared/fabric_color')
            .then(r => setFabricColors(r.data?.data ?? r.data ?? []))
            .catch(() => setFabricColors([]));
    }, []);

    // Lazily fetch variants for a trim item the first time it's selected.
    const ensureVariants = async (trimItemId) => {
        if (!trimItemId || variantsByTrim[trimItemId]) return;
        try {
            const r = await trimsApi.getVariants(trimItemId);
            setVariantsByTrim(prev => ({ ...prev, [trimItemId]: r.data?.data ?? r.data ?? [] }));
        } catch {
            setVariantsByTrim(prev => ({ ...prev, [trimItemId]: [] }));
        }
    };

    // ── Group + line setters ──────────────────────────────────────────────────
    const setGroupField = (gi, field, value) => {
        setGroups(prev => prev.map((g, i) => {
            if (i !== gi) return g;
            const next = { ...g, [field]: value };
            if (field === 'trim_item_id') {
                // Switching the parent item: clear every variant choice underneath.
                next.lines = g.lines.map(ln => ({ ...ln, trim_item_variant_id: '' }));
                if (value) ensureVariants(value);
            }
            return next;
        }));
    };

    const setLineField = (gi, li, field, value) => {
        setGroups(prev => prev.map((g, i) => {
            if (i !== gi) return g;
            return { ...g, lines: g.lines.map((ln, j) => j === li ? { ...ln, [field]: value } : ln) };
        }));
    };

    const addLine = (gi) => {
        setGroups(prev => prev.map((g, i) => {
            if (i !== gi) return g;
            const blank = g.type === 'fabric' ? blankFabricLine() : blankTrimLine();
            return { ...g, lines: [...g.lines, blank] };
        }));
    };

    const removeLine = (gi, li) => {
        setGroups(prev => prev.map((g, i) => {
            if (i !== gi) return g;
            return { ...g, lines: g.lines.filter((_, j) => j !== li) };
        }));
    };

    const addGroup    = (type) => setGroups(prev => [...prev, type === 'fabric' ? blankFabricGroup() : blankTrimGroup()]);
    const removeGroup = (gi)   => setGroups(prev => prev.filter((_, i) => i !== gi));

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        setErr(null);
        if (groups.length === 0) { setErr('Add at least one fabric or trim card.'); return; }

        // Validate + flatten
        const flat = [];
        for (const [gi, g] of groups.entries()) {
            const label = g.type === 'fabric' ? `Fabric card ${gi + 1}` : `Trim card ${gi + 1}`;
            if (g.type === 'fabric' && !g.fabric_type_id) { setErr(`${label}: pick a fabric type.`); return; }
            if (g.type === 'trim'   && !g.trim_item_id)   { setErr(`${label}: pick a trim item.`);   return; }
            if (!g.lines || g.lines.length === 0)         { setErr(`${label}: add at least one ${g.type === 'fabric' ? 'color' : 'variant'}.`); return; }
            const unitPrice = parseFloat(g.unit_price);
            if (isNaN(unitPrice) || unitPrice < 0) { setErr(`${label}: unit price must be ≥ 0.`); return; }
            const uom = (g.uom || (g.type === 'fabric' ? 'meter' : 'pcs')).trim() || (g.type === 'fabric' ? 'meter' : 'pcs');

            for (const [li, ln] of g.lines.entries()) {
                const lineLabel = `${label}, line ${li + 1}`;
                if (g.type === 'fabric' && !ln.fabric_color_id)      { setErr(`${lineLabel}: pick a color.`); return; }
                if (g.type === 'trim'   && !ln.trim_item_variant_id) { setErr(`${lineLabel}: pick a variant.`); return; }
                const qty = parseFloat(ln.quantity);
                if (!qty || qty <= 0) { setErr(`${lineLabel}: quantity must be > 0.`); return; }

                const base = {
                    type:            g.type,
                    quantity:        qty,
                    uom,
                    unit_price:      unitPrice,
                    requirement_ids: [],
                };
                if (g.type === 'fabric') {
                    flat.push({
                        ...base,
                        fabric_type_id:  parseInt(g.fabric_type_id, 10),
                        fabric_color_id: parseInt(ln.fabric_color_id, 10),
                    });
                } else {
                    flat.push({
                        ...base,
                        trim_item_variant_id: parseInt(ln.trim_item_variant_id, 10),
                    });
                }
            }
        }
        if (flat.length === 0) { setErr('No items to send.'); return; }

        setBusy(true);
        try {
            const payload = {
                supplier_id:            supplierId   ? parseInt(supplierId, 10)   : null,
                expected_delivery_date: deliveryDate || null,
                sales_order_id:         salesOrderId ? parseInt(salesOrderId, 10) : null,
                notes:                  notes.trim() || null,
                items:                  flat,
            };
            const res = await purchaseDeptApi.createOrder(payload);
            onCreated?.(res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to create purchase order');
        } finally {
            setBusy(false);
        }
    };

    // ── Totals ────────────────────────────────────────────────────────────────
    const grandTotal = groups.reduce((sum, g) => {
        const unitPrice = parseFloat(g.unit_price) || 0;
        return sum + g.lines.reduce((s, ln) => s + ((parseFloat(ln.quantity) || 0) * unitPrice), 0);
    }, 0);

    const totalLines = groups.reduce((s, g) => s + (g.lines?.length || 0), 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <ShoppingCart size={16} className="text-orange-500" />
                            New Purchase Order
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Free-form PO — share fabric/trim header and price across multiple colors or variants.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}

                    {/* Header fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supplier</label>
                            <select
                                value={supplierId}
                                onChange={e => setSupplierId(e.target.value)}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400 bg-white"
                            >
                                <option value="">— None —</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name || s.username || `Supplier #${s.id}`}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Delivery</label>
                            <input
                                type="date"
                                value={deliveryDate}
                                onChange={e => setDeliveryDate(e.target.value)}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sales Order ID</label>
                            <input
                                type="number"
                                min="1"
                                value={salesOrderId}
                                onChange={e => setSalesOrderId(e.target.value)}
                                placeholder="optional"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Notes (optional)</span>
                            <span className="text-slate-300 normal-case">{notes.length}/2000</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => { if (e.target.value.length <= 2000) setNotes(e.target.value); }}
                            rows={2}
                            placeholder="Delivery instructions, vendor remarks, special handling…"
                            className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400 resize-y"
                        />
                    </div>

                    {/* Group cards */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {groups.length} card{groups.length !== 1 ? 's' : ''} · {totalLines} line{totalLines !== 1 ? 's' : ''}
                            </p>
                            <div className="flex gap-1.5">
                                <button onClick={() => addGroup('fabric')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Fabric card
                                </button>
                                <button onClick={() => addGroup('trim')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Trim card
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {groups.map((g, gi) => {
                                const isFabric = g.type === 'fabric';
                                const Icon     = isFabric ? Package : Scissors;
                                const variants = !isFabric ? (variantsByTrim[g.trim_item_id] || []) : [];

                                return (
                                    <div key={g._key} className={`border rounded-xl p-3 space-y-3 ${isFabric ? 'border-violet-100 bg-violet-50/40' : 'border-amber-100 bg-amber-50/40'}`}>
                                        {/* Card header */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                <Icon size={13} className={isFabric ? 'text-violet-600' : 'text-amber-600'} />
                                                <span className="uppercase tracking-wider text-[10px]">{isFabric ? 'Fabric' : 'Trim'} card</span>
                                                <span className="text-slate-400 text-[10px] font-normal">#{gi + 1}</span>
                                            </div>
                                            {groups.length > 1 && (
                                                <button onClick={() => removeGroup(gi)} title="Remove card" className="text-slate-300 hover:text-red-500 transition">
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Shared header fields: type/item · uom · unit price */}
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_120px] gap-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">{isFabric ? 'Fabric Type *' : 'Trim Item *'}</label>
                                                {isFabric ? (
                                                    <select
                                                        value={g.fabric_type_id}
                                                        onChange={e => setGroupField(gi, 'fabric_type_id', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400 bg-white"
                                                    >
                                                        <option value="">— Select fabric type —</option>
                                                        {fabricTypes.map(t => (
                                                            <option key={t.id} value={t.id}>
                                                                {t.name || t.fabric_type_name || `Type #${t.id}`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <select
                                                        value={g.trim_item_id}
                                                        onChange={e => setGroupField(gi, 'trim_item_id', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 bg-white"
                                                    >
                                                        <option value="">— Select trim —</option>
                                                        {trimItems.map(t => (
                                                            <option key={t.id} value={t.id}>
                                                                {t.name || t.item_name || `Trim #${t.id}`}{t.item_code ? ` · ${t.item_code}` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">UOM</label>
                                                <input
                                                    type="text"
                                                    value={g.uom}
                                                    onChange={e => setGroupField(gi, 'uom', e.target.value)}
                                                    className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Price *</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={g.unit_price}
                                                    onChange={e => setGroupField(gi, 'unit_price', e.target.value)}
                                                    className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums"
                                                />
                                            </div>
                                        </div>

                                        {/* Lines */}
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {isFabric ? 'Colors' : 'Variants'} · {g.lines.length}
                                                </p>
                                                <button
                                                    onClick={() => addLine(gi)}
                                                    disabled={!isFabric && !g.trim_item_id}
                                                    title={!isFabric && !g.trim_item_id ? 'Pick a trim first' : ''}
                                                    className={`flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded-md transition disabled:opacity-40 ${
                                                        isFabric
                                                            ? 'text-violet-600 hover:bg-violet-100 border-violet-200'
                                                            : 'text-amber-600 hover:bg-amber-100 border-amber-200'
                                                    }`}
                                                >
                                                    <Plus size={10} /> {isFabric ? 'Add color' : 'Add variant'}
                                                </button>
                                            </div>

                                            {g.lines.map((ln, li) => (
                                                <div key={ln._key} className="flex items-end gap-2 bg-white/70 rounded-lg px-2 py-1.5 border border-white">
                                                    <div className="flex-1 min-w-0">
                                                        {isFabric ? (
                                                            <select
                                                                value={ln.fabric_color_id}
                                                                onChange={e => setLineField(gi, li, 'fabric_color_id', e.target.value)}
                                                                className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400 bg-white"
                                                            >
                                                                <option value="">— Color —</option>
                                                                {fabricColors.map(c => (
                                                                    <option key={c.id} value={c.id}>
                                                                        {c.color_name || c.name || `Color #${c.id}`}{c.color_number ? ` (${c.color_number})` : ''}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <select
                                                                value={ln.trim_item_variant_id}
                                                                onChange={e => setLineField(gi, li, 'trim_item_variant_id', e.target.value)}
                                                                disabled={!g.trim_item_id}
                                                                className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                                                            >
                                                                <option value="">{g.trim_item_id ? '— Variant —' : '— Pick a trim first —'}</option>
                                                                {variants.map(v => (
                                                                    <option key={v.id} value={v.id}>
                                                                        {v.color_name || v.name || `Variant #${v.id}`}{v.color_number ? ` (${v.color_number})` : ''}{v.variant_size ? ` · Sz ${v.variant_size}` : ''}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                    <div className="w-24 shrink-0">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            placeholder="Qty"
                                                            value={ln.quantity}
                                                            onChange={e => setLineField(gi, li, 'quantity', e.target.value)}
                                                            className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums"
                                                        />
                                                    </div>
                                                    <div className="w-24 shrink-0 text-right text-[10px] tabular-nums text-slate-500">
                                                        {(parseFloat(ln.quantity) > 0 && parseFloat(g.unit_price) >= 0)
                                                            ? `₹${(parseFloat(ln.quantity) * (parseFloat(g.unit_price) || 0)).toFixed(2)}`
                                                            : ''}
                                                    </div>
                                                    <button
                                                        onClick={() => removeLine(gi, li)}
                                                        disabled={g.lines.length <= 1}
                                                        title={g.lines.length <= 1 ? 'A card must have at least one line' : 'Remove line'}
                                                        className="shrink-0 p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300 transition"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Card subtotal */}
                                        {g.unit_price && g.lines.some(l => parseFloat(l.quantity) > 0) && (
                                            <p className="text-[10px] text-slate-500 text-right">
                                                Card subtotal: <span className="font-bold text-slate-700 tabular-nums">
                                                    ₹{g.lines.reduce((s, l) => s + ((parseFloat(l.quantity) || 0) * (parseFloat(g.unit_price) || 0)), 0).toFixed(2)}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
                    <p className="text-[10px] text-slate-500 tabular-nums">
                        Total: <span className="font-bold text-slate-700">
                            ₹{grandTotal.toFixed(2)}
                        </span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} disabled={busy}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
                            Cancel
                        </button>
                        <button onClick={handleSubmit} disabled={busy}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm">
                            {busy && <Loader2 size={12} className="animate-spin" />}
                            Create Purchase Order
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

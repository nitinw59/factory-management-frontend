import { useState, useEffect } from 'react';
import {
    X, Loader2, AlertTriangle, Plus, Trash2, Package, Scissors, ShoppingCart,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { trimsApi } from '../../api/trimsApi';
import api from '../../utils/api';

const blankItem = (type = 'fabric') => ({
    _key:                 Math.random().toString(36).slice(2),
    type,
    fabric_type_id:       '',
    fabric_color_id:      '',
    trim_item_id:         '',
    trim_item_variant_id: '',
    quantity:             '',
    uom:                  type === 'fabric' ? 'meter' : 'pcs',
    unit_price:           '',
});

export default function CreateFreshPoModal({ onClose, onCreated }) {
    const [supplierId,     setSupplierId]     = useState('');
    const [deliveryDate,   setDeliveryDate]   = useState('');
    const [salesOrderId,   setSalesOrderId]   = useState('');
    const [items,          setItems]          = useState([blankItem('fabric')]);
    const [suppliers,      setSuppliers]      = useState([]);
    const [trimItems,      setTrimItems]      = useState([]);
    const [fabricTypes,    setFabricTypes]    = useState([]);
    const [fabricColors,   setFabricColors]   = useState([]);
    const [variantsByTrim, setVariantsByTrim] = useState({});  // { [trim_item_id]: [{ id, color_name, color_number, ... }] }
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

    const setItemField = (idx, field, value) => {
        setItems(prev => prev.map((it, i) => {
            if (i !== idx) return it;
            const next = { ...it, [field]: value };
            // If type changed, snap uom to a sensible default and clear cross-type ids
            if (field === 'type') {
                next.uom = value === 'fabric' ? 'meter' : 'pcs';
                next.fabric_type_id = '';
                next.fabric_color_id = '';
                next.trim_item_id = '';
                next.trim_item_variant_id = '';
            }
            // Clearing the trim resets the variant
            if (field === 'trim_item_id') {
                next.trim_item_variant_id = '';
                if (value) ensureVariants(value);
            }
            return next;
        }));
    };

    const addItem    = (type = 'fabric') => setItems(prev => [...prev, blankItem(type)]);
    const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async () => {
        setErr(null);
        if (items.length === 0) { setErr('Add at least one item.'); return; }
        for (const [i, it] of items.entries()) {
            const q = parseFloat(it.quantity);
            if (!q || q <= 0) {
                setErr(`Item ${i + 1}: quantity must be greater than 0.`);
                return;
            }
            const p = parseFloat(it.unit_price);
            if (isNaN(p) || p < 0) {
                setErr(`Item ${i + 1}: unit price must be ≥ 0.`);
                return;
            }
        }

        setBusy(true);
        try {
            const payload = {
                supplier_id:            supplierId   ? parseInt(supplierId, 10)   : null,
                expected_delivery_date: deliveryDate || null,
                sales_order_id:         salesOrderId ? parseInt(salesOrderId, 10) : null,
                items: items.map(it => {
                    const base = {
                        type:            it.type,
                        quantity:        parseFloat(it.quantity),
                        uom:             it.uom || (it.type === 'fabric' ? 'meter' : 'pcs'),
                        unit_price:      parseFloat(it.unit_price) || 0,
                        requirement_ids: [],
                    };
                    if (it.type === 'fabric') {
                        return {
                            ...base,
                            fabric_type_id:  it.fabric_type_id  ? parseInt(it.fabric_type_id, 10)  : null,
                            fabric_color_id: it.fabric_color_id ? parseInt(it.fabric_color_id, 10) : null,
                        };
                    }
                    return {
                        ...base,
                        trim_item_variant_id: it.trim_item_variant_id ? parseInt(it.trim_item_variant_id, 10) : null,
                    };
                }),
            };
            const res = await purchaseDeptApi.createOrder(payload);
            onCreated?.(res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to create purchase order');
        } finally {
            setBusy(false);
        }
    };

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
                        <p className="text-xs text-slate-500 mt-0.5">Free-form PO — items don't need to reference any existing requirement.</p>
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

                    {/* Items */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Items · {items.length}</p>
                            <div className="flex gap-1.5">
                                <button onClick={() => addItem('fabric')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Fabric
                                </button>
                                <button onClick={() => addItem('trim')}
                                    className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-2 py-1 rounded-md transition">
                                    <Plus size={11} /> Trim
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {items.map((it, idx) => {
                                const isFabric = it.type === 'fabric';
                                const Icon = isFabric ? Package : Scissors;
                                return (
                                    <div key={it._key} className={`border rounded-xl p-3 space-y-2 ${isFabric ? 'border-violet-100 bg-violet-50/40' : 'border-amber-100 bg-amber-50/40'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                <Icon size={13} className={isFabric ? 'text-violet-600' : 'text-amber-600'} />
                                                <select
                                                    value={it.type}
                                                    onChange={e => setItemField(idx, 'type', e.target.value)}
                                                    className="text-xs font-bold border border-slate-200 rounded px-2 py-0.5 bg-white"
                                                >
                                                    <option value="fabric">Fabric</option>
                                                    <option value="trim">Trim</option>
                                                </select>
                                                <span className="text-slate-400 text-[10px] font-normal">Item {idx + 1}</span>
                                            </div>
                                            {items.length > 1 && (
                                                <button onClick={() => removeItem(idx)} className="text-slate-300 hover:text-red-500 transition">
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>

                                        {isFabric ? (
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Fabric Type</label>
                                                    <select
                                                        value={it.fabric_type_id}
                                                        onChange={e => setItemField(idx, 'fabric_type_id', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400 bg-white"
                                                    >
                                                        <option value="">— Select type —</option>
                                                        {fabricTypes.map(t => (
                                                            <option key={t.id} value={t.id}>
                                                                {t.name || t.fabric_type_name || `Type #${t.id}`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Fabric Color</label>
                                                    <select
                                                        value={it.fabric_color_id}
                                                        onChange={e => setItemField(idx, 'fabric_color_id', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400 bg-white"
                                                    >
                                                        <option value="">— Select color —</option>
                                                        {fabricColors.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.color_name || c.name || `Color #${c.id}`}{c.color_number ? ` (${c.color_number})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Trim Item</label>
                                                    <select
                                                        value={it.trim_item_id}
                                                        onChange={e => setItemField(idx, 'trim_item_id', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 bg-white"
                                                    >
                                                        <option value="">— Select trim —</option>
                                                        {trimItems.map(t => (
                                                            <option key={t.id} value={t.id}>
                                                                {t.name || t.item_name || `Trim #${t.id}`}{t.item_code ? ` · ${t.item_code}` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Variant</label>
                                                    <select
                                                        value={it.trim_item_variant_id}
                                                        onChange={e => setItemField(idx, 'trim_item_variant_id', e.target.value)}
                                                        disabled={!it.trim_item_id}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                                                    >
                                                        <option value="">{it.trim_item_id ? '— Select variant —' : '— Pick a trim first —'}</option>
                                                        {(variantsByTrim[it.trim_item_id] || []).map(v => (
                                                            <option key={v.id} value={v.id}>
                                                                {v.color_name || v.name || `Variant #${v.id}`}{v.color_number ? ` (${v.color_number})` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">Quantity *</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={it.quantity}
                                                    onChange={e => setItemField(idx, 'quantity', e.target.value)}
                                                    className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">UOM</label>
                                                <input
                                                    type="text"
                                                    value={it.uom}
                                                    onChange={e => setItemField(idx, 'uom', e.target.value)}
                                                    className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Price *</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={it.unit_price}
                                                    onChange={e => setItemField(idx, 'unit_price', e.target.value)}
                                                    className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums"
                                                />
                                            </div>
                                        </div>

                                        {(it.quantity && it.unit_price) ? (
                                            <p className="text-[10px] text-slate-500 text-right">
                                                Subtotal: <span className="font-bold text-slate-700 tabular-nums">₹{(parseFloat(it.quantity) * parseFloat(it.unit_price) || 0).toFixed(2)}</span>
                                            </p>
                                        ) : null}
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
                            ₹{items.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0)), 0).toFixed(2)}
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

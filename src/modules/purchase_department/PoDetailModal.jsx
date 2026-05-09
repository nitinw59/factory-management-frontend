import { useState, useMemo, useEffect } from 'react';
import {
    X, Loader2, AlertTriangle, ShoppingCart, Building2, Calendar, Package, Scissors, Tag,
    CheckCircle2, XCircle, Truck, Plus, Edit3, Trash2, Save,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { trimsApi } from '../../api/trimsApi';
import api from '../../utils/api';

const PO_STATUS_CFG = {
    DRAFT:           { cls: 'bg-slate-100 text-slate-600 border-slate-200',     label: 'Draft' },
    ISSUED:          { cls: 'bg-blue-100 text-blue-700 border-blue-200',         label: 'Issued' },
    PARTIAL_RECEIPT: { cls: 'bg-amber-100 text-amber-700 border-amber-200',     label: 'Partial Receipt' },
    COMPLETED:       { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Completed' },
    CANCELLED:       { cls: 'bg-red-100 text-red-700 border-red-200',           label: 'Cancelled' },
};

const TYPE_ICON = { fabric: Package, trim: Scissors, other: Tag };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';
const fmtNum  = (n, dec = 2) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: dec });

const NEXT_STATUSES = {
    DRAFT:           ['ISSUED', 'CANCELLED'],
    ISSUED:          ['PARTIAL_RECEIPT', 'COMPLETED', 'CANCELLED'],
    PARTIAL_RECEIPT: ['COMPLETED', 'CANCELLED'],
    COMPLETED:       [],
    CANCELLED:       [],
};

const STATUS_ACTIONS = {
    ISSUED:          { label: 'Mark Issued',          icon: Truck,        cls: 'bg-blue-600 hover:bg-blue-700 text-white' },
    PARTIAL_RECEIPT: { label: 'Mark Partial Receipt', icon: Truck,        cls: 'bg-amber-500 hover:bg-amber-600 text-white' },
    COMPLETED:       { label: 'Mark Completed',       icon: CheckCircle2, cls: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    CANCELLED:       { label: 'Cancel PO',            icon: XCircle,      cls: 'bg-red-600 hover:bg-red-700 text-white' },
};

const SIDE_EFFECT_NOTES = {
    COMPLETED: 'Linked requirements → FULFILLED. Procurement events → received. Some T&A items may close.',
    CANCELLED: 'Linked requirements revert to PENDING and re-enter the queue.',
};

// ── Item editor (add or edit) ─────────────────────────────────────────────────

function ItemEditor({ poId, item = null, onCancel, onSaved }) {
    const isEdit = !!item;
    const [form, setForm] = useState(() => ({
        type:                 item?.type || 'fabric',
        fabric_type_id:       item?.fabric_type_id ?? '',
        fabric_color_id:      item?.fabric_color_id ?? '',
        trim_item_id:         item?.variant_trim_item_id ?? '',
        trim_item_variant_id: item?.trim_item_variant_id ?? '',
        quantity:             item?.quantity != null ? String(item.quantity) : '',
        uom:                  item?.uom || 'meter',
        unit_price:           item?.unit_price != null ? String(item.unit_price) : '',
    }));
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    // Lookups
    const [trimItems,    setTrimItems]    = useState([]);
    const [fabricTypes,  setFabricTypes]  = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [trimVariants, setTrimVariants] = useState([]);  // for currently-picked trim_item_id

    useEffect(() => {
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

    // Load variants whenever the picked trim item changes (and isn't already loaded for it).
    useEffect(() => {
        if (form.type !== 'trim' || !form.trim_item_id) { return; }
        // If the current variants belong to this trim, skip
        if (trimVariants[0]?.trim_item_id != null &&
            Number(trimVariants[0].trim_item_id) === Number(form.trim_item_id)) {
            return;
        }
        let cancelled = false;
        trimsApi.getVariants(form.trim_item_id)
            .then(r => { if (!cancelled) setTrimVariants(r.data?.data ?? r.data ?? []); })
            .catch(() => { if (!cancelled) setTrimVariants([]); });
        return () => { cancelled = true; };
    }, [form.type, form.trim_item_id, trimVariants]);

    const set = (k, v) => setForm(p => {
        const next = { ...p, [k]: v };
        if (k === 'type') next.uom = v === 'fabric' ? 'meter' : 'pcs';
        if (k === 'trim_item_id') next.trim_item_variant_id = '';  // reset variant when trim changes
        return next;
    });

    const handleSave = async () => {
        setErr(null);
        const q = parseFloat(form.quantity);
        const p = parseFloat(form.unit_price);
        if (!q || q <= 0)             { setErr('Quantity must be greater than 0.'); return; }
        if (isNaN(p) || p < 0)        { setErr('Unit price must be ≥ 0.'); return; }
        setBusy(true);
        try {
            const body = {
                type:       form.type,
                quantity:   q,
                uom:        form.uom || (form.type === 'fabric' ? 'meter' : 'pcs'),
                unit_price: p,
            };
            if (form.type === 'fabric') {
                body.fabric_type_id  = form.fabric_type_id  ? parseInt(form.fabric_type_id, 10)  : null;
                body.fabric_color_id = form.fabric_color_id ? parseInt(form.fabric_color_id, 10) : null;
                body.trim_item_variant_id = null;
            } else {
                body.trim_item_variant_id = form.trim_item_variant_id ? parseInt(form.trim_item_variant_id, 10) : null;
                body.fabric_type_id  = null;
                body.fabric_color_id = null;
            }
            if (isEdit) {
                await purchaseDeptApi.updateOrderItem(poId, item.itemId, body);
            } else {
                body.requirement_ids = [];
                await purchaseDeptApi.addOrderItem(poId, body);
            }
            onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to save item.');
        } finally {
            setBusy(false);
        }
    };

    const isFabric = form.type === 'fabric';
    return (
        <div className={`border rounded-xl p-3 space-y-2 ${isFabric ? 'border-violet-200 bg-violet-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    {isFabric ? <Package size={13} className="text-violet-600" /> : <Scissors size={13} className="text-amber-600" />}
                    <select
                        value={form.type}
                        onChange={e => set('type', e.target.value)}
                        disabled={isEdit}
                        className="text-xs font-bold border border-slate-200 rounded px-2 py-0.5 bg-white disabled:bg-slate-100"
                    >
                        <option value="fabric">Fabric</option>
                        <option value="trim">Trim</option>
                    </select>
                    <span className="text-slate-400 text-[10px] font-normal">
                        {isEdit ? `Edit item #${item.itemId}` : 'New item'}
                    </span>
                </div>
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded px-2 py-1 text-[11px] text-red-600">
                    <AlertTriangle size={11} /> {err}
                </div>
            )}

            {isFabric ? (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Fabric Type</label>
                        <select value={form.fabric_type_id ?? ''}
                            onChange={e => set('fabric_type_id', e.target.value)}
                            className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400 bg-white">
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
                        <select value={form.fabric_color_id ?? ''}
                            onChange={e => set('fabric_color_id', e.target.value)}
                            className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400 bg-white">
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
                        <select value={form.trim_item_id ?? ''}
                            onChange={e => set('trim_item_id', e.target.value)}
                            className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 bg-white">
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
                        <select value={form.trim_item_variant_id ?? ''}
                            onChange={e => set('trim_item_variant_id', e.target.value)}
                            disabled={!form.trim_item_id}
                            className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-400 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                            <option value="">{form.trim_item_id ? '— Select variant —' : '— Pick a trim first —'}</option>
                            {trimVariants.map(v => (
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
                    <input type="number" min="0" step="any" value={form.quantity}
                        onChange={e => set('quantity', e.target.value)}
                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums" />
                </div>
                <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase">UOM</label>
                    <input type="text" value={form.uom}
                        onChange={e => set('uom', e.target.value)}
                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Price *</label>
                    <input type="number" min="0" step="any" value={form.unit_price}
                        onChange={e => set('unit_price', e.target.value)}
                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums" />
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={onCancel} disabled={busy}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700 px-3 py-1 rounded hover:bg-slate-100 disabled:opacity-40">
                    Cancel
                </button>
                <button onClick={handleSave} disabled={busy}
                    className="flex items-center gap-1 text-[11px] font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-3 py-1 rounded shadow-sm">
                    {busy ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    {isEdit ? 'Save Changes' : 'Add Item'}
                </button>
            </div>
        </div>
    );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function PoDetailModal({ po, onClose, onUpdated }) {
    const [busy,    setBusy]    = useState(false);
    const [err,     setErr]     = useState(null);
    const [message, setMessage] = useState(null);
    const [editingItemId, setEditingItemId] = useState(null);  // itemId being edited
    const [adding, setAdding] = useState(false);

    const cfg     = PO_STATUS_CFG[po.status] || PO_STATUS_CFG.DRAFT;
    const next    = NEXT_STATUSES[po.status] || [];
    const isDraft = po.status === 'DRAFT';

    // Group requirements by purchase_order_item_id when present.
    // The backend now returns items[] explicitly; map to the shape the UI uses.
    const items = useMemo(() => (po.items || []).map(i => ({
        key:                  `item-${i.id}`,
        itemId:                i.id,
        type:                  i.item_type,
        requirements:          i.requirements || [],
        requirement_count:     i.requirement_count ?? (i.requirements || []).length,
        substitute_count:      i.substitute_count ?? 0,
        quantity:              parseFloat(i.quantity ?? 0),
        unit_price:            parseFloat(i.unit_price ?? 0),
        total_price:           parseFloat(i.total_price ?? (parseFloat(i.quantity ?? 0) * parseFloat(i.unit_price ?? 0))),
        uom:                   i.uom || (i.item_type === 'fabric' ? 'meter' : 'pcs'),
        // ids
        fabric_type_id:        i.fabric_type_id ?? null,
        fabric_color_id:       i.fabric_color_id ?? null,
        trim_item_variant_id:  i.trim_item_variant_id ?? null,
        variant_trim_item_id:  i.variant_trim_item_id ?? null,  // parent trim_item_id
        // joined names for display
        fabric_type_name:      i.fabric_type_name,
        fabric_color_name:     i.fabric_color_name,
        fabric_color_number:   i.fabric_color_number,
        trim_item_name:        i.trim_item_name,
        trim_item_code:        i.trim_item_code,
        variant_color_name:    i.variant_color_name,
        variant_color_number:  i.variant_color_number,
        variant_in_stock:      i.variant_in_stock,
        variant_last_purchase_price: i.variant_last_purchase_price,
    })), [po]);

    const unassigned = po.unassigned_requirements || [];
    const total = items.reduce((s, it) => s + it.total_price, 0);

    const handleStatus = async (newStatus) => {
        const sideEffect = SIDE_EFFECT_NOTES[newStatus];
        const confirmMsg = `Change status to ${PO_STATUS_CFG[newStatus]?.label}?` +
            (sideEffect ? `\n\nSide effects:\n${sideEffect}` : '');
        if (!window.confirm(confirmMsg)) return;
        setBusy(true); setErr(null); setMessage(null);
        try {
            const res = await purchaseDeptApi.updateOrderStatus(po.id, newStatus);
            setMessage(res.data?.message || `Status updated to ${newStatus}.`);
            onUpdated?.(newStatus);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to update status.');
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteItem = async (item) => {
        if (!window.confirm(`Delete this item? Linked requirements (${item.requirements.length}) will revert to PENDING.`)) return;
        setBusy(true); setErr(null); setMessage(null);
        try {
            const res = await purchaseDeptApi.deleteOrderItem(po.id, item.itemId);
            setMessage(res.data?.message || 'Item deleted.');
            onUpdated?.();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to delete item.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500 flex items-center gap-1">
                                <ShoppingCart size={11} /> Purchase Order
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                                {cfg.label}
                            </span>
                        </div>
                        <h2 className="text-lg font-black text-slate-800 mt-0.5 truncate">{po.po_code}</h2>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {po.order_number ? `${po.order_number} · ` : ''}
                            {po.customer_name || ''}
                            {po.buyer_po_number ? ` · Buyer PO ${po.buyer_po_number}` : ''}
                        </p>
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
                    {message && (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-sm text-emerald-700">
                            <CheckCircle2 size={14} /> {message}
                        </div>
                    )}

                    {/* Summary tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Building2 size={10} />Supplier</p>
                            <p className="text-sm font-bold text-slate-700 truncate mt-0.5">{po.supplier_name || '—'}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Calendar size={10} />Created</p>
                            <p className="text-sm font-bold text-slate-700 mt-0.5">{fmtDate(po.created_at)}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Calendar size={10} />Expected Delivery</p>
                            <p className="text-sm font-bold text-slate-700 mt-0.5">{fmtDate(po.expected_delivery_date)}</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                            <p className="text-[9px] font-bold text-orange-600 uppercase tracking-wider">Total Value</p>
                            <p className="text-sm font-black text-slate-800 tabular-nums mt-0.5">₹{fmtNum(total)}</p>
                        </div>
                    </div>

                    {/* Items */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Items · {items.length}
                            </p>
                            {isDraft && !adding && editingItemId == null && (
                                <button
                                    onClick={() => setAdding(true)}
                                    className="flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:bg-orange-50 border border-orange-200 px-2 py-1 rounded-md transition"
                                >
                                    <Plus size={11} /> Add Item
                                </button>
                            )}
                            {!isDraft && (
                                <span className="text-[9px] text-slate-400 italic">Editing locked — PO is {cfg.label}</span>
                            )}
                        </div>

                        {adding && (
                            <div className="mb-2">
                                <ItemEditor
                                    poId={po.id}
                                    onCancel={() => setAdding(false)}
                                    onSaved={() => { setAdding(false); onUpdated?.(); }}
                                />
                            </div>
                        )}

                        {items.length === 0 && !adding && (
                            <p className="text-sm text-slate-400 italic text-center py-4">No items yet.</p>
                        )}

                        <div className="space-y-2">
                            {items.map(it => {
                                const Icon = TYPE_ICON[it.type] || Tag;
                                const isEditingThis = editingItemId === it.itemId && it.itemId != null;
                                if (isEditingThis) {
                                    return (
                                        <ItemEditor
                                            key={it.key}
                                            poId={po.id}
                                            item={it}
                                            onCancel={() => setEditingItemId(null)}
                                            onSaved={() => { setEditingItemId(null); onUpdated?.(); }}
                                        />
                                    );
                                }
                                const label = it.type === 'fabric'
                                    ? `${it.fabric_type_name || 'Fabric'}${it.fabric_color_name ? ` · ${it.fabric_color_name}` : ''}${it.fabric_color_number ? ` (${it.fabric_color_number})` : ''}`
                                    : `${it.trim_item_name || 'Trim'}${it.variant_color_name ? ` · ${it.variant_color_name}` : ''}${it.variant_color_number ? ` (${it.variant_color_number})` : ''}`;
                                return (
                                    <div key={it.key} className="bg-slate-50 rounded-xl p-2.5">
                                        <div className="flex items-start gap-3">
                                            <Icon size={13} className="text-slate-500 shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className="text-xs font-bold text-slate-800 truncate">{label}</p>
                                                    {it.substitute_count > 0 && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                            🔄 {it.substitute_count} sub{it.substitute_count === 1 ? '' : 's'}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-slate-500 truncate">
                                                    {it.requirement_count === 0
                                                        ? 'Free-form (no requirements)'
                                                        : `${it.requirement_count} requirement${it.requirement_count === 1 ? '' : 's'}`}
                                                    {' · item #'}{it.itemId}
                                                    {it.type === 'trim' && it.variant_in_stock != null && (
                                                        <span className="ml-1">· stock <span className={`font-bold ${Number(it.variant_in_stock) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{Number(it.variant_in_stock).toLocaleString()}</span></span>
                                                    )}
                                                    {it.type === 'trim' && it.variant_last_purchase_price != null && (
                                                        <span className="ml-1">· last @ {parseFloat(it.variant_last_purchase_price).toFixed(2)}</span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs font-bold text-slate-700 tabular-nums">
                                                    {it.quantity.toLocaleString()} {it.uom}
                                                </p>
                                                <p className="text-[10px] text-slate-400 tabular-nums">
                                                    @ {it.unit_price.toFixed(2)} = ₹{it.total_price.toFixed(2)}
                                                </p>
                                            </div>
                                            {isDraft && (
                                                <div className="flex flex-col gap-1 shrink-0">
                                                    <button onClick={() => setEditingItemId(it.itemId)} disabled={busy}
                                                        className="p-1 text-slate-400 hover:text-orange-600 hover:bg-white rounded transition disabled:opacity-40"
                                                        title="Edit item">
                                                        <Edit3 size={12} />
                                                    </button>
                                                    <button onClick={() => handleDeleteItem(it)} disabled={busy}
                                                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded transition disabled:opacity-40"
                                                        title="Delete item">
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Linked requirements (sub-list) */}
                                        {it.requirements.length > 0 && (
                                            <div className="pl-6 mt-2 space-y-0.5">
                                                {it.requirements.map(r => {
                                                    const qty = parseFloat(r.meters_required ?? r.quantity_required ?? 0);
                                                    const unit = r.unit_of_measure || r.trim_uom || (r.type === 'fabric' ? 'm' : 'pcs');
                                                    return (
                                                        <div key={r.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                            <span className="truncate">
                                                                {r.product_name || `req #${r.id}`}
                                                                {r.is_substitute === true ? ` · 🔄 ${r.fabric_color_name || 'planned'} → ${r.variant_color_name || 'variant'}` : ''}
                                                                {r.urgency ? ` · ${r.urgency}` : ''}
                                                            </span>
                                                            <span className="shrink-0 ml-2 tabular-nums">{qty.toLocaleString()} {unit}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Unassigned requirements (legacy / safety net) */}
                        {unassigned.length > 0 && (
                            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">
                                    Unassigned requirements · {unassigned.length}
                                </p>
                                <p className="text-[10px] text-amber-700 mb-2">
                                    These requirements are linked to this PO but not bundled under any item — likely stale data worth cleaning up.
                                </p>
                                <div className="space-y-0.5">
                                    {unassigned.map(r => {
                                        const qty = parseFloat(r.meters_required ?? r.quantity_required ?? 0);
                                        const unit = r.unit_of_measure || r.trim_uom || (r.type === 'fabric' ? 'm' : 'pcs');
                                        return (
                                            <div key={r.id} className="flex items-center justify-between text-[11px] text-amber-800">
                                                <span className="truncate">
                                                    req #{r.id} · {r.type}
                                                    {r.type === 'fabric' ? ` · ${r.fabric_type_name || ''} ${r.fabric_color_name || ''}` : ` · ${r.trim_item_name || ''}`}
                                                    {r.product_name ? ` · ${r.product_name}` : ''}
                                                </span>
                                                <span className="shrink-0 ml-2 tabular-nums">{qty.toLocaleString()} {unit}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer — status actions */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
                    <p className="text-[10px] text-slate-400">
                        {next.length === 0
                            ? 'No further status transitions available.'
                            : `Available transitions: ${next.length}`}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                            onClick={onClose}
                            disabled={busy}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                        >
                            Close
                        </button>
                        {next.map(s => {
                            const a = STATUS_ACTIONS[s];
                            if (!a) return null;
                            const Icon = a.icon;
                            return (
                                <button
                                    key={s}
                                    onClick={() => handleStatus(s)}
                                    disabled={busy}
                                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 transition shadow-sm ${a.cls}`}
                                >
                                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
                                    {a.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

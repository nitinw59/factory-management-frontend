import { useState, useEffect } from 'react';
import {
    X, Loader2, AlertTriangle, Plus, Trash2, Package, Scissors, ShoppingCart, Calculator,
    Wrench, Box,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { trimsApi } from '../../api/trimsApi';
import { sparesApi } from '../../api/sparesApi';
import { generalItemsApi } from '../../api/generalItemsApi';
import api from '../../utils/api';
import SupplierCodePill from './SupplierCodePill';
import SearchableSelect from '../../shared/SearchableSelect';
import UomSelect from '../../shared/UomSelect';

const rk = () => Math.random().toString(36).slice(2);

// Spare/other cards have no color/variant sub-dimension the way fabric/trim
// do — one card is one PO line (matching how RequirementsPage.jsx's
// requirement→PO converter already treats these two types), so they skip
// the `lines[]` array entirely. This map drives their icon/color/labels.
const TYPE_META = {
    spare: { label: 'Spare', Icon: Wrench, accent: 'blue',  border: 'border-blue-100',  bg: 'bg-blue-50/40',  text: 'text-blue-600',  btn: 'text-blue-600 hover:bg-blue-50 border-blue-200' },
    other: { label: 'Other', Icon: Box,    accent: 'slate', border: 'border-slate-200', bg: 'bg-slate-50/60', text: 'text-slate-600', btn: 'text-slate-600 hover:bg-slate-50 border-slate-200' },
};

// Box/pack rate ÷ qty-per-pack rarely divides evenly (e.g. ₹72.5 / 5000m =
// ₹0.0145) — keep up to 5 decimal places so the rounding error doesn't
// compound across a large quantity, but trim trailing zeros so simple
// divisions still read clean.
const formatPricePrecise = (n) => {
    if (n == null || Number.isNaN(n)) return null;
    return n.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
};

const blankFabricLine = () => ({ _key: rk(), fabric_color_id: '', quantity: '' });
// packs is a scratch value for the "packs × default_pack_size" helper shown
// under Qty for pack-sized trim items — not sent to the backend, only used
// to compute quantity.
const blankTrimLine   = () => ({ _key: rk(), trim_item_variant_id: '', quantity: '', packs: '' });

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

const blankSpareGroup = () => ({
    _key:          rk(),
    type:          'spare',
    spare_part_id: '',
    quantity:      '',
    uom:           'pcs',
    unit_price:    '',
});

const blankOtherGroup = () => ({
    _key:             rk(),
    type:             'other',
    general_item_id:  '',
    description:      '',
    quantity:         '',
    uom:              'pcs',
    unit_price:       '',
});

const BLANK_GROUP = {
    fabric: blankFabricGroup,
    trim:   blankTrimGroup,
    spare:  blankSpareGroup,
    other:  blankOtherGroup,
};

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
    const [spareParts,     setSpareParts]     = useState([]);
    const [generalItems,   setGeneralItems]   = useState([]);
    const [busy,           setBusy]           = useState(false);
    const [err,            setErr]            = useState(null);

    // Quick-create a missing general item without leaving the PO form — null
    // when closed, otherwise the index of the "Other" card whose item to fill
    // once the new item is created (mirrors RaiseRequirementPage.jsx).
    const [showQuickCreate, setShowQuickCreate] = useState(null);
    const [quickCreateName, setQuickCreateName] = useState('');
    const [quickCreateCode, setQuickCreateCode] = useState('');
    const [quickCreateBusy, setQuickCreateBusy] = useState(false);
    const [quickCreateErr,  setQuickCreateErr]  = useState(null);

    // Pack-rate → unit-price mini calculator, one card's open at a time
    // (priceCalcKey holds that card's _key). For trim cards, opening it
    // pre-fills "Qty/pack" from the trim item's own default_pack_size/
    // pack_uom master data (set on the trims admin page) so a cone's price
    // doesn't need re-deriving by hand every time a PO is raised — the same
    // divide-by-pack-size math the GRN screens already do.
    const [priceCalcKey,  setPriceCalcKey]  = useState(null);
    const [priceCalcRate, setPriceCalcRate] = useState('');
    const [priceCalcQty,  setPriceCalcQty]  = useState('');
    const togglePriceCalc = (gk, prefillQty) => {
        setPriceCalcKey(prev => {
            if (prev === gk) return null;
            setPriceCalcRate('');
            setPriceCalcQty(prefillQty ? String(prefillQty) : '');
            return gk;
        });
    };

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
        // sparesApi.getAllSpares() unwraps .data itself (returns the raw array),
        // unlike the axios-response callbacks above.
        sparesApi.getAllSpares()
            .then(data => setSpareParts(Array.isArray(data) ? data : (data?.data || [])))
            .catch(() => setSpareParts([]));
        generalItemsApi.getItems({ active: true })
            .then(r => setGeneralItems(r.data?.data ?? r.data ?? []))
            .catch(() => setGeneralItems([]));
    }, []);

    const handleQuickCreate = async () => {
        if (!quickCreateName.trim()) { setQuickCreateErr('Name is required.'); return; }
        setQuickCreateBusy(true); setQuickCreateErr(null);
        try {
            const r = await generalItemsApi.createItem({
                name: quickCreateName.trim(),
                ...(quickCreateCode.trim() ? { item_code: quickCreateCode.trim() } : {}),
            });
            const newItem = r.data?.data ?? r.data;
            setGeneralItems(prev => [...prev, newItem]);
            if (showQuickCreate != null) setGroupField(showQuickCreate, 'general_item_id', String(newItem.id));
            setShowQuickCreate(null);
            setQuickCreateName('');
            setQuickCreateCode('');
        } catch (e) {
            setQuickCreateErr(e?.response?.data?.error || 'Failed to create item.');
        } finally {
            setQuickCreateBusy(false);
        }
    };

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

    const addGroup    = (type) => setGroups(prev => [...prev, (BLANK_GROUP[type] || blankFabricGroup)()]);
    const removeGroup = (gi)   => setGroups(prev => prev.filter((_, i) => i !== gi));

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        setErr(null);
        if (groups.length === 0) { setErr('Add at least one card.'); return; }

        // Validate + flatten
        const flat = [];
        for (const [gi, g] of groups.entries()) {
            const label = g.type === 'fabric' ? `Fabric card ${gi + 1}`
                        : g.type === 'trim'   ? `Trim card ${gi + 1}`
                        : `${TYPE_META[g.type]?.label || 'Item'} card ${gi + 1}`;
            const unitPrice = parseFloat(g.unit_price);
            if (isNaN(unitPrice) || unitPrice < 0) { setErr(`${label}: unit price must be ≥ 0.`); return; }

            // Spare/other — single line per card, no color/variant sub-dimension.
            if (g.type === 'spare' || g.type === 'other') {
                if (g.type === 'spare' && !g.spare_part_id)   { setErr(`${label}: pick a spare part.`); return; }
                if (g.type === 'other' && !g.general_item_id) { setErr(`${label}: pick an item.`); return; }
                const qty = parseFloat(g.quantity);
                if (!qty || qty <= 0) { setErr(`${label}: quantity must be > 0.`); return; }
                const uom = (g.uom || 'pcs').trim() || 'pcs';

                const base = { type: g.type, quantity: qty, uom, unit_price: unitPrice, requirement_ids: [] };
                if (g.type === 'spare') {
                    flat.push({ ...base, spare_part_id: parseInt(g.spare_part_id, 10) });
                } else {
                    flat.push({
                        ...base,
                        general_item_id: parseInt(g.general_item_id, 10),
                        ...(g.description?.trim() ? { description: g.description.trim() } : {}),
                    });
                }
                continue;
            }

            // Fabric/trim — multi-line (color / variant) per card.
            if (g.type === 'fabric' && !g.fabric_type_id) { setErr(`${label}: pick a fabric type.`); return; }
            if (g.type === 'trim'   && !g.trim_item_id)   { setErr(`${label}: pick a trim item.`);   return; }
            if (!g.lines || g.lines.length === 0)         { setErr(`${label}: add at least one ${g.type === 'fabric' ? 'color' : 'variant'}.`); return; }
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
    // Spare/other have no lines[] — one card is one line, quantity lives on the group itself.
    const isSingleLine = (g) => g.type === 'spare' || g.type === 'other';
    const grandTotal = groups.reduce((sum, g) => {
        const unitPrice = parseFloat(g.unit_price) || 0;
        if (isSingleLine(g)) return sum + (parseFloat(g.quantity) || 0) * unitPrice;
        return sum + g.lines.reduce((s, ln) => s + ((parseFloat(ln.quantity) || 0) * unitPrice), 0);
    }, 0);

    const totalLines = groups.reduce((s, g) => s + (isSingleLine(g) ? 1 : (g.lines?.length || 0)), 0);

    const supplierName = suppliers.find(s => String(s.id) === String(supplierId))?.name || '';

    return (
        <>
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <ShoppingCart size={16} className="text-orange-500" />
                            New Purchase Order
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Free-form PO — fabric/trim share a header and price across colors or variants; spare parts and other items are one line per card.</p>
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
                            <SearchableSelect
                                value={supplierId}
                                onChange={v => setSupplierId(v)}
                                options={suppliers.map(s => ({ value: s.id, label: s.name || s.username || `Supplier #${s.id}` }))}
                                placeholder="— None —"
                                className="w-full mt-1"
                            />
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
                                <button onClick={() => addGroup('spare')}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition ${TYPE_META.spare.btn}`}>
                                    <Plus size={11} /> Spare card
                                </button>
                                <button onClick={() => addGroup('other')}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition ${TYPE_META.other.btn}`}>
                                    <Plus size={11} /> Other card
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {groups.map((g, gi) => {
                                if (g.type === 'spare' || g.type === 'other') {
                                    const meta = TYPE_META[g.type];
                                    const Icon = meta.Icon;
                                    const itemOptions = g.type === 'spare'
                                        ? spareParts.map(s => ({ value: s.id, label: `${s.name}${s.part_number ? ` (${s.part_number})` : ''}` }))
                                        : generalItems.map(i => ({ value: i.id, label: `${i.name}${i.item_code ? ` (${i.item_code})` : ''}` }));
                                    const itemField = g.type === 'spare' ? 'spare_part_id' : 'general_item_id';
                                    const itemValue = g[itemField];
                                    const lineTotal = (parseFloat(g.quantity) || 0) * (parseFloat(g.unit_price) || 0);

                                    return (
                                        <div key={g._key} className={`border rounded-xl p-3 space-y-3 ${meta.border} ${meta.bg}`}>
                                            {/* Card header */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                                    <Icon size={13} className={meta.text} />
                                                    <span className="uppercase tracking-wider text-[10px]">{meta.label} card</span>
                                                    <span className="text-slate-400 text-[10px] font-normal">#{gi + 1}</span>
                                                </div>
                                                {groups.length > 1 && (
                                                    <button onClick={() => removeGroup(gi)} title="Remove card" className="text-slate-300 hover:text-red-500 transition">
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Item · uom · unit price */}
                                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_120px] gap-2">
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">{g.type === 'spare' ? 'Spare Part *' : 'Item *'}</label>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <SearchableSelect
                                                            value={itemValue}
                                                            onChange={v => setGroupField(gi, itemField, v)}
                                                            options={itemOptions}
                                                            placeholder={g.type === 'spare' ? '— Select spare part —' : '— Select item —'}
                                                            className="flex-1 min-w-0"
                                                            size="sm"
                                                            accentColor={meta.accent}
                                                        />
                                                        {g.type === 'other' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowQuickCreate(gi)}
                                                                title="Create a new general item"
                                                                className="shrink-0 p-1 text-slate-400 hover:text-slate-700 border border-slate-200 rounded transition"
                                                            >
                                                                <Plus size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">UOM</label>
                                                    <UomSelect
                                                        value={g.uom}
                                                        onChange={v => setGroupField(gi, 'uom', v)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-orange-400"
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

                                            {g.type === 'other' && (
                                                <div>
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Description (optional)</label>
                                                    <input
                                                        type="text"
                                                        value={g.description}
                                                        onChange={e => setGroupField(gi, 'description', e.target.value)}
                                                        placeholder="Notes for this line…"
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400"
                                                    />
                                                </div>
                                            )}

                                            <div className="flex items-end gap-2">
                                                <div className="w-28 shrink-0">
                                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Quantity *</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        placeholder="Qty"
                                                        value={g.quantity}
                                                        onChange={e => setGroupField(gi, 'quantity', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-orange-400 text-right tabular-nums"
                                                    />
                                                </div>
                                                <div className="flex-1 text-right text-[10px] text-slate-500">
                                                    {lineTotal > 0 && (
                                                        <>Line total: <span className="font-bold text-slate-700 tabular-nums">₹{lineTotal.toFixed(2)}</span></>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                const isFabric = g.type === 'fabric';
                                const Icon     = isFabric ? Package : Scissors;
                                const variants = !isFabric ? (variantsByTrim[g.trim_item_id] || []) : [];
                                const trimItemMaster = !isFabric ? trimItems.find(t => String(t.id) === String(g.trim_item_id)) : null;
                                const packWord = trimItemMaster?.pack_uom || 'pack';

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
                                                    <SearchableSelect
                                                        value={g.fabric_type_id}
                                                        onChange={v => setGroupField(gi, 'fabric_type_id', v)}
                                                        options={fabricTypes.map(t => ({ value: t.id, label: t.name || t.fabric_type_name || `Type #${t.id}` }))}
                                                        placeholder="— Select fabric type —"
                                                        className="w-full mt-0.5"
                                                        size="sm"
                                                        accentColor="violet"
                                                    />
                                                ) : (
                                                    <SearchableSelect
                                                        value={g.trim_item_id}
                                                        onChange={v => setGroupField(gi, 'trim_item_id', v)}
                                                        options={trimItems.map(t => ({ value: t.id, label: `${t.name || t.item_name || `Trim #${t.id}`}${t.item_code ? ` · ${t.item_code}` : ''}` }))}
                                                        placeholder="— Select trim —"
                                                        className="w-full mt-0.5"
                                                        size="sm"
                                                        accentColor="amber"
                                                    />
                                                )}
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">UOM</label>
                                                <UomSelect
                                                    value={g.uom}
                                                    onChange={v => setGroupField(gi, 'uom', v)}
                                                    className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-orange-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Price *</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={g.unit_price}
                                                        onChange={e => setGroupField(gi, 'unit_price', e.target.value)}
                                                        className="w-full mt-0.5 text-xs border border-slate-200 rounded px-2 py-1 pr-5 focus:outline-none focus:border-orange-400 text-right tabular-nums"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => togglePriceCalc(g._key, trimItemMaster?.default_pack_size)}
                                                        title={`Calculate from a per-${packWord} rate`}
                                                        className={`absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition ${priceCalcKey === g._key ? 'text-amber-800' : 'text-amber-500 hover:text-amber-700'}`}
                                                    >
                                                        <Calculator size={11} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {priceCalcKey === g._key && (() => {
                                            const computed = (parseFloat(priceCalcRate) > 0 && parseFloat(priceCalcQty) > 0)
                                                ? parseFloat(priceCalcRate) / parseFloat(priceCalcQty)
                                                : null;
                                            return (
                                                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex-wrap">
                                                    <input type="number" min="0" step="any" placeholder={`Rate/${packWord} ₹`}
                                                        value={priceCalcRate}
                                                        onChange={e => setPriceCalcRate(e.target.value)}
                                                        className="w-24 text-[11px] border border-amber-200 rounded px-1.5 py-1 tabular-nums focus:outline-none focus:border-amber-400" />
                                                    <span className="text-[10px] text-amber-500">÷</span>
                                                    <input type="number" min="0" step="any" placeholder={`Qty/${packWord}`}
                                                        value={priceCalcQty}
                                                        onChange={e => setPriceCalcQty(e.target.value)}
                                                        className="w-24 text-[11px] border border-amber-200 rounded px-1.5 py-1 tabular-nums focus:outline-none focus:border-amber-400" />
                                                    <span className="text-[10px] font-bold text-amber-800 flex-1 text-right whitespace-nowrap">
                                                        {computed != null ? `= ₹${formatPricePrecise(computed)}/${g.uom || 'unit'}` : '—'}
                                                    </span>
                                                    <button type="button" disabled={computed == null}
                                                        onClick={() => { setGroupField(gi, 'unit_price', formatPricePrecise(computed)); setPriceCalcKey(null); }}
                                                        className="text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-md transition">
                                                        Use
                                                    </button>
                                                </div>
                                            );
                                        })()}

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
                                                <div key={ln._key} className="bg-white/70 rounded-lg px-2 py-1.5 border border-white">
                                                    <div className="flex items-end gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            {isFabric ? (
                                                                <SearchableSelect
                                                                    value={ln.fabric_color_id}
                                                                    onChange={v => setLineField(gi, li, 'fabric_color_id', v)}
                                                                    options={fabricColors.map(c => ({ value: c.id, label: `${c.color_name || c.name || `Color #${c.id}`}${c.color_number ? ` (${c.color_number})` : ''}` }))}
                                                                    placeholder="— Color —"
                                                                    size="sm"
                                                                    accentColor="violet"
                                                                />
                                                            ) : (
                                                                <SearchableSelect
                                                                    value={ln.trim_item_variant_id}
                                                                    onChange={v => setLineField(gi, li, 'trim_item_variant_id', v)}
                                                                    options={variants.map(v => ({ value: v.id, label: `${v.color_name || v.name || `Variant #${v.id}`}${v.color_number ? ` (${v.color_number})` : ''}${v.variant_size ? ` · Sz ${v.variant_size}` : ''}` }))}
                                                                    placeholder={g.trim_item_id ? '— Variant —' : '— Pick a trim first —'}
                                                                    disabled={!g.trim_item_id}
                                                                    size="sm"
                                                                    accentColor="amber"
                                                                />
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
                                                    {!isFabric && trimItemMaster?.default_pack_size && (() => {
                                                        const packs = parseFloat(ln.packs);
                                                        const computed = packs > 0 ? packs * trimItemMaster.default_pack_size : null;
                                                        return (
                                                            <div className="mt-1.5 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex-wrap">
                                                                <input type="number" min="0" step="any" placeholder="Packs"
                                                                    value={ln.packs}
                                                                    onChange={e => setLineField(gi, li, 'packs', e.target.value)}
                                                                    className="w-16 text-[11px] border border-amber-200 rounded px-1.5 py-1 tabular-nums focus:outline-none focus:border-amber-400" />
                                                                <span className="text-[10px] text-amber-500">×</span>
                                                                <span className="text-[11px] font-bold text-amber-700 whitespace-nowrap">
                                                                    {trimItemMaster.default_pack_size}{trimItemMaster.pack_uom ? `/${trimItemMaster.pack_uom}` : ''}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-amber-800 flex-1 text-right whitespace-nowrap">
                                                                    {computed != null ? `= ${computed.toLocaleString()} ${g.uom || 'unit'}` : '—'}
                                                                </span>
                                                                <button type="button" disabled={computed == null}
                                                                    onClick={() => setLineField(gi, li, 'quantity', String(computed))}
                                                                    className="text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-md transition">
                                                                    Use
                                                                </button>
                                                            </div>
                                                        );
                                                    })()}
                                                    {!isFabric && supplierId && ln.trim_item_variant_id && (
                                                        <div className="mt-1 pl-1">
                                                            <SupplierCodePill
                                                                supplierId={supplierId}
                                                                supplierName={supplierName}
                                                                variantId={ln.trim_item_variant_id}
                                                            />
                                                        </div>
                                                    )}
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

        {/* Quick-create a missing general item, without leaving the PO form. */}
        {showQuickCreate != null && (
            <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowQuickCreate(null)}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-800">New General Item</h3>
                        <button onClick={() => setShowQuickCreate(null)} className="p-1 hover:bg-slate-100 rounded-full transition">
                            <X size={14} className="text-slate-500" />
                        </button>
                    </div>
                    <div className="p-4 space-y-3">
                        {quickCreateErr && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 text-xs text-red-600">
                                <AlertTriangle size={12} /> {quickCreateErr}
                            </div>
                        )}
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name *</label>
                            <input
                                type="text"
                                value={quickCreateName}
                                onChange={e => setQuickCreateName(e.target.value)}
                                placeholder="e.g. Cutting scissors"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Code (optional)</label>
                            <input
                                type="text"
                                value={quickCreateCode}
                                onChange={e => setQuickCreateCode(e.target.value)}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/40">
                        <button onClick={() => setShowQuickCreate(null)} disabled={quickCreateBusy}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40">
                            Cancel
                        </button>
                        <button onClick={handleQuickCreate} disabled={quickCreateBusy}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition">
                            {quickCreateBusy && <Loader2 size={12} className="animate-spin" />}
                            Create &amp; Select
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

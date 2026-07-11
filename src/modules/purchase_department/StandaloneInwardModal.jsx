import { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, Plus, Trash2, Package, Scissors, Wrench, Tag, Upload,
    FileText, AlertTriangle, CheckCircle2, ChevronDown,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { trimsApi } from '../../api/trimsApi';
import { sparesApi } from '../../api/sparesApi';
import { newRoll, sumRolls, mapRolls, rk } from './inwardShared';
import InwardCreateModal from './InwardCreateModal';
import InwardReviewModal from './InwardReviewModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPES = [
    { key: 'fabric', label: 'Fabric',    icon: Package  },
    { key: 'trim',   label: 'Trim',      icon: Scissors },
    { key: 'spare',  label: 'Spare',     icon: Wrench   },
    { key: 'other',  label: 'Other',     icon: Tag      },
];

const CONDITIONS = ['GOOD', 'DAMAGED', 'PARTIAL'];

const emptyLine = (type = 'trim') => ({
    _k:                  rk(),
    type,
    // fabric
    fabric_type_id:      '',
    fabric_color_id:     '',
    rolls:               [newRoll()],
    // trim
    trim_item_id:        '',
    trim_item_variant_id:'',
    qty:                 '',
    // spare
    spare_part_id:       '',
    spare_qty:           '',
    // other
    description:         '',
    other_qty:           '',
    uom:                 'pcs',
    // shared
    unit_price:          '',
});

// ── Roll row editor ───────────────────────────────────────────────────────────

function RollRow({ roll, onChange, onRemove, removable }) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                placeholder="Bale #"
                value={roll.bale_no}
                onChange={e => onChange({ ...roll, bale_no: e.target.value })}
                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400"
            />
            <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Meters"
                value={roll.meter}
                onChange={e => onChange({ ...roll, meter: e.target.value })}
                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums"
            />
            <span className="text-[10px] text-slate-400">m</span>
            {removable && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="p-1 text-slate-300 hover:text-red-500 rounded transition"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
}

// ── Single line-item card ─────────────────────────────────────────────────────

function LineCard({ line, index, fabricTypes, fabricColors, trimItems, variantsByTrim, spareParts, onChange, onRemove }) {
    const [variantsLoading, setVariantsLoading] = useState(false);

    // Load variants when trim item changes
    useEffect(() => {
        if (!line.trim_item_id) return;
        setVariantsLoading(true);
        storeManagerApi.getVariantsByTrimItem(line.trim_item_id)
            .then(r => {
                const variants = r.data?.data || r.data || [];
                onChange({ ...line, _variants: variants, trim_item_variant_id: '' });
            })
            .catch(() => onChange({ ...line, _variants: [] }))
            .finally(() => setVariantsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.trim_item_id]);

    const set = (k, v) => onChange({ ...line, [k]: v });

    const addRoll = () => onChange({ ...line, rolls: [...line.rolls, newRoll()] });
    const setRoll = (i, r) => onChange({ ...line, rolls: line.rolls.map((x, j) => j === i ? r : x) });
    const removeRoll = (i) => onChange({ ...line, rolls: line.rolls.filter((_, j) => j !== i) });

    const Icon = TYPES.find(t => t.key === line.type)?.icon || Tag;
    const rollTotal = sumRolls(line.rolls);

    return (
        <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
            {/* Type selector + remove */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                    {TYPES.map(({ key, label, icon: TIcon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onChange({ ...emptyLine(key), _k: line._k })}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition ${
                                line.type === key
                                    ? 'bg-orange-500 text-white border-orange-500'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                            }`}
                        >
                            <TIcon size={10} /> {label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500 rounded transition">
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Type-specific fields */}
            {line.type === 'fabric' && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Fabric Type *</label>
                            <select value={line.fabric_type_id} onChange={e => set('fabric_type_id', e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                                <option value="">Select type…</option>
                                {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Color</label>
                            <select value={line.fabric_color_id} onChange={e => set('fabric_color_id', e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                                <option value="">No color</option>
                                {fabricColors.map(fc => <option key={fc.id} value={fc.id}>{fc.name}{fc.color_number ? ` (${fc.color_number})` : ''}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                            Rolls · <span className="normal-case text-emerald-600 font-bold">{rollTotal.toFixed(2)} m total</span>
                        </label>
                        <div className="space-y-1.5">
                            {line.rolls.map((r, i) => (
                                <RollRow
                                    key={r._k}
                                    roll={r}
                                    onChange={nr => setRoll(i, nr)}
                                    onRemove={() => removeRoll(i)}
                                    removable={line.rolls.length > 1}
                                />
                            ))}
                        </div>
                        <button type="button" onClick={addRoll}
                            className="mt-1.5 text-[10px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1 transition">
                            <Plus size={10} /> Add roll
                        </button>
                    </div>
                </div>
            )}

            {line.type === 'trim' && (
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Trim Item *</label>
                        <select value={line.trim_item_id} onChange={e => set('trim_item_id', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                            <option value="">Select item…</option>
                            {trimItems.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                            Variant * {variantsLoading && <Loader2 size={9} className="inline animate-spin ml-1" />}
                        </label>
                        <select value={line.trim_item_variant_id} onChange={e => set('trim_item_variant_id', e.target.value)}
                            disabled={!line.trim_item_id || variantsLoading}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 disabled:bg-slate-100">
                            <option value="">Select variant…</option>
                            {(line._variants || variantsByTrim[line.trim_item_id] || []).map(v => (
                                <option key={v.id} value={v.id}>{v.name || v.variant_name || `Variant #${v.id}`}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Qty *</label>
                        <input type="number" min="0.01" step="1" placeholder="0" value={line.qty} onChange={e => set('qty', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Unit Price (optional)</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={line.unit_price} onChange={e => set('unit_price', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                    </div>
                </div>
            )}

            {line.type === 'spare' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Spare Part *</label>
                        <select value={line.spare_part_id} onChange={e => set('spare_part_id', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                            <option value="">Select part…</option>
                            {spareParts.map(s => <option key={s.id} value={s.id}>{s.name}{s.part_number ? ` (${s.part_number})` : ''}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Qty *</label>
                        <input type="number" min="0.01" step="1" placeholder="0" value={line.spare_qty} onChange={e => set('spare_qty', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Unit Price (optional)</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={line.unit_price} onChange={e => set('unit_price', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                    </div>
                </div>
            )}

            {line.type === 'other' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Description *</label>
                        <input type="text" placeholder="What was received…" value={line.description} onChange={e => set('description', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400" />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Qty *</label>
                        <input type="number" min="0.01" step="0.01" placeholder="0" value={line.other_qty} onChange={e => set('other_qty', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">UoM</label>
                        <input type="text" placeholder="pcs, kg, m…" value={line.uom} onChange={e => set('uom', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400" />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Unit Price (optional)</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={line.unit_price} onChange={e => set('unit_price', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                    </div>
                </div>
            )}

            {/* Unit price for fabric (shared row below rolls) */}
            {line.type === 'fabric' && (
                <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Unit Price / m (optional)</label>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={line.unit_price} onChange={e => set('unit_price', e.target.value)}
                        className="w-32 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums" />
                </div>
            )}
        </div>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function StandaloneInwardModal({ onClose, onCreated }) {
    // Header fields
    const [grnNumber,    setGrnNumber]    = useState('');
    const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
    const [condition,    setCondition]    = useState('GOOD');
    const [notes,        setNotes]        = useState('');
    const [scanFile,     setScanFile]     = useState(null);
    const [supplierId,   setSupplierId]   = useState('');

    // PO picker
    const [poSearch,     setPoSearch]     = useState('');
    const [poList,       setPoList]       = useState([]);
    const [poListLoading, setPoListLoading] = useState(false);
    const [selectedPo,   setSelectedPo]   = useState(null);
    const [poLoading,    setPoLoading]    = useState(false);
    const [showPoList,   setShowPoList]   = useState(false);

    // PO flow (when a PO is selected)
    const [poStep,  setPoStep]  = useState(null);  // null | 'create' | 'review'
    const [poCtx,   setPoCtx]   = useState(null);  // { po, items, inwards, snapshot, payload }

    // Free-form lines
    const [lines, setLines] = useState([emptyLine('trim')]);

    // Lookup data
    const [suppliers,    setSuppliers]    = useState([]);
    const [fabricTypes,  setFabricTypes]  = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [trimItems,    setTrimItems]    = useState([]);
    const [spareParts,   setSpareParts]   = useState([]);

    // Submit state
    const [saving,  setSaving]  = useState(false);
    const [err,     setErr]     = useState(null);
    const [success, setSuccess] = useState(false);

    // Load lookup data on mount
    useEffect(() => {
        storeManagerApi.getSuppliers()
            .then(r => setSuppliers(r.data?.data || r.data || []))
            .catch(() => {});
        storeManagerApi.getFabricTypes()
            .then(r => setFabricTypes(r.data?.data || r.data || []))
            .catch(() => {});
        storeManagerApi.getFabricColors()
            .then(r => setFabricColors(r.data?.data || r.data || []))
            .catch(() => {});
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data || r.data || []))
            .catch(() => {});
        sparesApi.getAllSpares()
            .then(data => setSpareParts(Array.isArray(data) ? data : (data?.data || [])))
            .catch(() => {});
    }, []);

    // Load PO list when search dropdown opens
    useEffect(() => {
        if (!showPoList || poList.length > 0) return;
        setPoListLoading(true);
        purchaseDeptApi.getOrders()
            .then(r => setPoList(r.data?.data ?? r.data ?? []))
            .catch(() => {})
            .finally(() => setPoListLoading(false));
    }, [showPoList, poList.length]);

    const filteredPos = useMemo(() => {
        const q = poSearch.toLowerCase();
        const active = poList.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
        if (!q) return active.slice(0, 8);
        return active.filter(o =>
            (o.po_code || '').toLowerCase().includes(q) ||
            (o.supplier_name || '').toLowerCase().includes(q) ||
            String(o.id).includes(q)
        ).slice(0, 8);
    }, [poList, poSearch]);

    const handleLoadPo = async () => {
        if (!selectedPo) return;
        setPoLoading(true); setErr(null);
        try {
            const [poRes, iwRes] = await Promise.all([
                purchaseDeptApi.getOrderById(selectedPo.id),
                purchaseDeptApi.getInwards(selectedPo.id).catch(() => ({ data: [] })),
            ]);
            const po     = poRes.data?.data ?? poRes.data;
            const inwards = iwRes.data?.data ?? iwRes.data ?? [];
            if (!po) throw new Error('Could not load PO.');
            setPoCtx({ po, items: po.items || [], inwards, snapshot: null, payload: null });
            setPoStep('create');
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to load PO.');
        } finally {
            setPoLoading(false);
        }
    };

    const handleSubmit = async () => {
        setErr(null);
        if (lines.length === 0) { setErr('Add at least one item.'); return; }
        const hasFabric = lines.some(l => l.type === 'fabric');
        if (hasFabric && !supplierId) { setErr('Supplier is required when receiving fabric.'); return; }

        const items = [];
        for (const l of lines) {
            if (l.type === 'fabric') {
                const rolls = mapRolls(l.rolls);
                if (!l.fabric_type_id) { setErr('Each fabric line needs a fabric type.'); return; }
                if (!rolls.length)     { setErr('Each fabric line needs at least one roll with meters > 0.'); return; }
                items.push({
                    item_type:       'fabric',
                    fabric_type_id:  parseInt(l.fabric_type_id),
                    fabric_color_id: l.fabric_color_id ? parseInt(l.fabric_color_id) : null,
                    qty_received:    rolls.reduce((s, r) => s + r.meter, 0),
                    rolls,
                    unit_price:      l.unit_price ? parseFloat(l.unit_price) : null,
                });
            } else if (l.type === 'trim') {
                if (!l.trim_item_variant_id) { setErr('Each trim line needs a variant.'); return; }
                const qty = parseFloat(l.qty);
                if (!qty || qty <= 0) { setErr('Each trim line needs a quantity > 0.'); return; }
                items.push({
                    item_type:            'trim',
                    trim_item_variant_id: parseInt(l.trim_item_variant_id),
                    qty_received:         qty,
                    unit_price:           l.unit_price ? parseFloat(l.unit_price) : null,
                });
            } else if (l.type === 'spare') {
                if (!l.spare_part_id) { setErr('Each spare line needs a spare part.'); return; }
                const qty = parseFloat(l.spare_qty);
                if (!qty || qty <= 0) { setErr('Each spare line needs a quantity > 0.'); return; }
                items.push({
                    item_type:     'spare',
                    spare_part_id: parseInt(l.spare_part_id),
                    qty_received:  qty,
                    unit_price:    l.unit_price ? parseFloat(l.unit_price) : null,
                });
            } else {
                if (!l.description?.trim()) { setErr('Each "other" line needs a description.'); return; }
                const qty = parseFloat(l.other_qty);
                if (!qty || qty <= 0) { setErr('Each "other" line needs a quantity > 0.'); return; }
                items.push({
                    item_type:    'other',
                    description:  l.description.trim(),
                    qty_received: qty,
                    uom:          l.uom || 'pcs',
                    unit_price:   l.unit_price ? parseFloat(l.unit_price) : null,
                });
            }
        }

        const data = {
            grn_number:    grnNumber || null,
            received_date: receivedDate,
            condition,
            notes:         notes || null,
            supplier_id:   supplierId ? parseInt(supplierId) : null,
            items,
        };

        setSaving(true);
        try {
            await purchaseDeptApi.createStandaloneInward(data, scanFile || null);
            setSuccess(true);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to create inward.');
        } finally {
            setSaving(false);
        }
    };

    const updateLine = (idx, updated) =>
        setLines(prev => prev.map((l, i) => i === idx ? updated : l));
    const removeLine = (idx) =>
        setLines(prev => prev.filter((_, i) => i !== idx));
    const addLine = (type) =>
        setLines(prev => [...prev, emptyLine(type)]);

    // ── PO mode — hand off to existing modals ─────────────────────────────────

    if (poStep === 'create' && poCtx) {
        return (
            <InwardCreateModal
                poId={poCtx.po.id}
                poCode={poCtx.po.po_code}
                poItems={poCtx.items}
                supplierId={poCtx.po.supplier_id}
                supplierName={poCtx.po.supplier_name}
                allInwards={poCtx.inwards}
                initialSnapshot={poCtx.snapshot}
                onClose={onClose}
                onReview={({ payload, snapshot }) => {
                    setPoCtx(prev => ({ ...prev, payload, snapshot }));
                    setPoStep('review');
                }}
            />
        );
    }

    if (poStep === 'review' && poCtx?.payload) {
        return (
            <InwardReviewModal
                poId={poCtx.po.id}
                poCode={poCtx.po.po_code}
                payload={poCtx.payload}
                poItems={poCtx.items}
                supplierId={poCtx.po.supplier_id}
                supplierName={poCtx.po.supplier_name}
                onClose={onClose}
                onBack={() => setPoStep('create')}
                onConfirmed={() => { onCreated?.(); onClose(); }}
            />
        );
    }

    // ── Success screen ────────────────────────────────────────────────────────

    if (success) {
        return (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 border border-amber-200 mx-auto">
                        <CheckCircle2 size={28} className="text-amber-500" />
                    </div>
                    <h2 className="font-extrabold text-slate-800 text-lg">Inward Recorded</h2>
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        Pending purchase-manager approval — stock will be applied once approved.
                    </p>
                    <button
                        onClick={() => { onCreated?.(); onClose(); }}
                        className="w-full text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-4 py-2.5 rounded-xl transition"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    // ── Free-form modal ───────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={!saving ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div>
                        <h3 className="font-black text-slate-800 text-base">Record Inward</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Standalone goods receipt — no PO required</p>
                    </div>
                    {!saving && (
                        <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={13} /> {err}
                        </div>
                    )}

                    {/* Header fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">GRN Number (optional)</label>
                            <input type="text" placeholder="Auto-generated if blank" value={grnNumber} onChange={e => setGrnNumber(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Received Date *</label>
                            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Supplier {lines.some(l => l.type === 'fabric') && <span className="text-red-500">*</span>}
                            </label>
                            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400">
                                <option value="">No supplier</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Condition</label>
                            <select value={condition} onChange={e => setCondition(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400">
                                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                            <textarea rows={2} placeholder="Any notes for the purchase manager…" value={notes} onChange={e => setNotes(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 resize-none" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Scan / Challan (optional)</label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-slate-300 hover:border-orange-400 rounded-xl px-3 py-2 transition">
                                <Upload size={14} className="text-slate-400" />
                                {scanFile ? (
                                    <span className="text-slate-700 font-medium truncate max-w-xs">{scanFile.name}</span>
                                ) : (
                                    <span className="text-slate-400">Click to upload JPG / PNG / PDF</span>
                                )}
                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setScanFile(e.target.files[0] || null)} />
                                {scanFile && (
                                    <button type="button" onClick={e => { e.preventDefault(); setScanFile(null); }}
                                        className="ml-auto text-slate-400 hover:text-red-500">
                                        <X size={13} />
                                    </button>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Optional PO picker */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowPoList(o => !o)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-left"
                        >
                            <div>
                                <p className="text-xs font-bold text-slate-700">
                                    {selectedPo ? `Linked to ${selectedPo.po_code || `PO #${selectedPo.id}`}` : 'Link to a Purchase Order (optional)'}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {selectedPo ? 'Click to switch to PO-linked receiving flow' : 'If receiving against a specific PO, pick it here'}
                                </p>
                            </div>
                            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showPoList ? 'rotate-180' : ''}`} />
                        </button>

                        {showPoList && (
                            <div className="px-4 pb-4 pt-2 space-y-2">
                                <input
                                    type="text"
                                    placeholder="Search PO code or supplier…"
                                    value={poSearch}
                                    onChange={e => setPoSearch(e.target.value)}
                                    className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                                {poListLoading ? (
                                    <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
                                ) : (
                                    <div className="space-y-1 max-h-44 overflow-y-auto">
                                        {filteredPos.map(po => (
                                            <button
                                                key={po.id}
                                                type="button"
                                                onClick={() => { setSelectedPo(po); setPoSearch(''); }}
                                                className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg border transition text-xs ${
                                                    selectedPo?.id === po.id
                                                        ? 'bg-orange-50 border-orange-300 text-orange-700'
                                                        : 'bg-white border-slate-200 hover:border-orange-200'
                                                }`}
                                            >
                                                <span className="font-bold">{po.po_code || `PO #${po.id}`}</span>
                                                <span className="text-slate-400">{po.supplier_name}</span>
                                            </button>
                                        ))}
                                        {filteredPos.length === 0 && !poListLoading && (
                                            <p className="text-xs text-slate-400 text-center py-3">No open POs found</p>
                                        )}
                                    </div>
                                )}
                                {selectedPo && (
                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-xs text-slate-500">
                                            Selected: <span className="font-bold">{selectedPo.po_code || `PO #${selectedPo.id}`}</span>
                                        </span>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => { setSelectedPo(null); }}
                                                className="text-xs text-slate-400 hover:text-slate-600 transition">Clear</button>
                                            <button
                                                type="button"
                                                onClick={handleLoadPo}
                                                disabled={poLoading}
                                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition"
                                            >
                                                {poLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                                                Switch to PO flow →
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Line items */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-600">Line Items <span className="text-red-500">*</span></p>
                            <p className="text-[10px] text-slate-400">{lines.length} line{lines.length !== 1 ? 's' : ''}</p>
                        </div>

                        {lines.map((line, idx) => (
                            <LineCard
                                key={line._k}
                                line={line}
                                index={idx}
                                fabricTypes={fabricTypes}
                                fabricColors={fabricColors}
                                trimItems={trimItems}
                                variantsByTrim={{}}
                                spareParts={spareParts}
                                onChange={updated => updateLine(idx, updated)}
                                onRemove={() => removeLine(idx)}
                            />
                        ))}

                        {/* Add line buttons */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {TYPES.map(({ key, label, icon: Icon }) => (
                                <button key={key} type="button" onClick={() => addLine(key)}
                                    className="flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-300 px-2.5 py-1.5 rounded-lg transition">
                                    <Plus size={10} /><Icon size={10} /> {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                    <button onClick={onClose} disabled={saving}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 transition disabled:opacity-50">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={saving || lines.length === 0}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-5 py-2 rounded-xl transition">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        {saving ? 'Submitting…' : `Submit Inward (${lines.length} line${lines.length !== 1 ? 's' : ''})`}
                    </button>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, AlertTriangle, Package, Scissors, Tag, Trash2, Upload, FileText, Edit3, Plus,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { trimsApi } from '../../api/trimsApi';
import api, { IMAGE_BASE_URL } from '../../utils/api';

const TYPE_ICON = { fabric: Package, trim: Scissors, other: Tag };

const reqTotal = (r) =>
    parseFloat(r.meters_required ?? r.quantity_required ?? 0);

const reqUnit = (r) => r.unit_of_measure || (r.type === 'fabric' ? 'm' : 'pcs');

const reqLabel = (r) => {
    if (r.type === 'fabric') {
        const parts = [r.fabric_type_name, r.fabric_color_name].filter(Boolean);
        return parts.length ? parts.join(' · ') : 'Fabric requirement';
    }
    if (r.type === 'trim') return r.trim_item_name || 'Trim requirement';
    return 'Requirement';
};

export default function InwardModal({
    poId,
    poItems = [],              // PO items grouped (po.items[]); each item carries .requirements[]
    allInwards = [],           // all inwards for this PO (so we can compute pending)
    inward = null,             // existing inward (edit/view), null = create
    initialMode = 'view',      // 'view' | 'edit' | 'create'
    onClose,
    onSaved,
    onDeleted,
}) {
    const isCreate = !inward;
    const [mode, setMode] = useState(isCreate ? 'create' : initialMode);
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    // Form state
    const [grnNumber,    setGrnNumber]    = useState(inward?.grn_number || '');
    const [receivedDate, setReceivedDate] = useState(
        inward?.received_date || new Date().toISOString().split('T')[0]
    );
    const [condition,    setCondition]    = useState(inward?.condition || 'GOOD');
    const [notes,        setNotes]        = useState(inward?.notes || '');
    const [scanFile,     setScanFile]     = useState(null);

    // Flatten the requirement set across PO items for pending-qty + item-state calcs
    const allRequirements = useMemo(
        () => (poItems || []).flatMap(i => i.requirements || []),
        [poItems]
    );

    // Pending qty per requirement (excludes this inward's own items if editing)
    const pendingByReq = useMemo(() => {
        const otherReceived = {};
        allInwards.forEach(iw => {
            if (inward && iw.id === inward.id) return;
            (iw.items || []).forEach(it => {
                otherReceived[it.purchase_requirement_id] =
                    (otherReceived[it.purchase_requirement_id] || 0) + parseFloat(it.qty_received || 0);
            });
        });
        const map = {};
        allRequirements.forEach(r => {
            map[r.id] = Math.max(0, reqTotal(r) - (otherReceived[r.id] || 0));
        });
        return map;
    }, [allRequirements, allInwards, inward]);

    // Pending qty per free-form PO item (items with no requirements)
    const pendingByPoItem = useMemo(() => {
        const otherReceived = {};
        allInwards.forEach(iw => {
            if (inward && iw.id === inward.id) return;
            (iw.items || []).forEach(it => {
                if (it.purchase_order_item_id != null) {
                    otherReceived[it.purchase_order_item_id] =
                        (otherReceived[it.purchase_order_item_id] || 0) + parseFloat(it.qty_received || 0);
                }
            });
        });
        const map = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;  // only free-form items
            const total = parseFloat(p.quantity ?? 0);
            map[p.id] = Math.max(0, total - (otherReceived[p.id] || 0));
        });
        return map;
    }, [poItems, allInwards, inward]);

    // Items state — { [requirement_id]: qty }
    const [items, setItems] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_requirement_id != null) {
                    m[it.purchase_requirement_id] = parseFloat(it.qty_received || 0);
                }
            });
            return m;
        }
        const m = {};
        allRequirements.forEach(r => {
            const totalAlready = (allInwards || []).reduce((s, iw) =>
                s + (iw.items || [])
                    .filter(it => it.purchase_requirement_id === r.id)
                    .reduce((s2, it) => s2 + parseFloat(it.qty_received || 0), 0), 0);
            const pending = Math.max(0, reqTotal(r) - totalAlready);
            if (pending > 0) m[r.id] = pending;
        });
        return m;
    });

    // Free-form items state — { [purchase_order_item_id]: qty }
    const [freeFormItems, setFreeFormItems] = useState(() => {
        if (inward) {
            const m = {};
            (inward.items || []).forEach(it => {
                if (it.purchase_order_item_id != null && it.purchase_requirement_id == null) {
                    m[it.purchase_order_item_id] = parseFloat(it.qty_received || 0);
                }
            });
            return m;
        }
        const m = {};
        (poItems || []).forEach(p => {
            if ((p.requirements || []).length > 0) return;
            const total = parseFloat(p.quantity ?? 0);
            const totalAlready = (allInwards || []).reduce((s, iw) =>
                s + (iw.items || [])
                    .filter(it => it.purchase_order_item_id === p.id)
                    .reduce((s2, it) => s2 + parseFloat(it.qty_received || 0), 0), 0);
            const pending = Math.max(0, total - totalAlready);
            if (pending > 0) m[p.id] = pending;
        });
        return m;
    });

    // Truly free-form custom items (no requirement, no PO item link)
    const [customItems, setCustomItems] = useState(() => {
        if (!inward) return [];
        return (inward.items || [])
            .filter(it => it.is_free_form === true && it.purchase_order_item_id == null)
            .map(it => ({
                _key:                  String(it.id),
                _existingId:           it.id,
                item_type:             it.item_type || 'trim',
                trim_item_id:          '',  // resolved later when lookups load
                trim_item_variant_id:  it.trim_item_variant_id ?? '',
                fabric_type_id:        it.fabric_type_id ?? '',
                fabric_color_id:       it.fabric_color_id ?? '',
                qty_received:          it.qty_received != null ? String(it.qty_received) : '',
                unit_price:            it.unit_price != null ? String(it.unit_price) : '',
                description:           it.description || '',
            }));
    });

    // Lookups (loaded once)
    const [trimItems,      setTrimItems]      = useState([]);
    const [fabricTypes,    setFabricTypes]    = useState([]);
    const [fabricColors,   setFabricColors]   = useState([]);
    const [variantsByTrim, setVariantsByTrim] = useState({});

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

    const ensureVariants = async (trimItemId) => {
        if (!trimItemId || variantsByTrim[trimItemId]) return;
        try {
            const r = await trimsApi.getVariants(trimItemId);
            setVariantsByTrim(prev => ({ ...prev, [trimItemId]: r.data?.data ?? r.data ?? [] }));
        } catch {
            setVariantsByTrim(prev => ({ ...prev, [trimItemId]: [] }));
        }
    };

    useEffect(() => { setErr(null); }, [mode]);

    const editable = mode === 'create' || mode === 'edit';

    const setItemQty = (reqId, val) => {
        setItems(prev => {
            const next = { ...prev };
            if (val === '' || val == null) delete next[reqId];
            else next[reqId] = val;
            return next;
        });
    };

    const setFreeFormQty = (poItemId, val) => {
        setFreeFormItems(prev => {
            const next = { ...prev };
            if (val === '' || val == null) delete next[poItemId];
            else next[poItemId] = val;
            return next;
        });
    };

    const addCustomItem = (item_type = 'trim') => {
        setCustomItems(prev => [...prev, {
            _key:                  Math.random().toString(36).slice(2),
            item_type,
            trim_item_id:          '',
            trim_item_variant_id:  '',
            fabric_type_id:        '',
            fabric_color_id:       '',
            qty_received:          '',
            unit_price:            '',
            description:           '',
        }]);
    };
    const removeCustomItem = (key) =>
        setCustomItems(prev => prev.filter(c => c._key !== key));
    const setCustomField = (key, field, value) => {
        setCustomItems(prev => prev.map(c => {
            if (c._key !== key) return c;
            const next = { ...c, [field]: value };
            if (field === 'item_type') {
                next.fabric_type_id = ''; next.fabric_color_id = '';
                next.trim_item_id = ''; next.trim_item_variant_id = '';
            }
            if (field === 'trim_item_id') {
                next.trim_item_variant_id = '';
                if (value) ensureVariants(value);
            }
            return next;
        }));
    };

    const handleSave = async () => {
        setErr(null);
        if (!receivedDate) { setErr('Received date is required.'); return; }
        const reqEntries = Object.entries(items)
            .filter(([, v]) => v !== '' && v != null && parseFloat(v) > 0)
            .map(([reqId, v]) => ({ requirement_id: parseInt(reqId, 10), qty_received: parseFloat(v) }));
        const freeEntries = Object.entries(freeFormItems)
            .filter(([, v]) => v !== '' && v != null && parseFloat(v) > 0)
            .map(([poItemId, v]) => ({ purchase_order_item_id: parseInt(poItemId, 10), qty_received: parseFloat(v) }));
        const customEntries = [];
        for (const [i, c] of customItems.entries()) {
            const q = parseFloat(c.qty_received);
            if (!q || q <= 0) continue;
            const entry = {
                item_type:    c.item_type,
                qty_received: q,
                unit_price:   c.unit_price === '' || c.unit_price == null ? null : parseFloat(c.unit_price),
                description:  c.description || null,
            };
            if (c.item_type === 'trim') {
                if (!c.trim_item_variant_id) {
                    setErr(`Free-form trim item #${i + 1}: pick a variant.`);
                    return;
                }
                entry.trim_item_variant_id = parseInt(c.trim_item_variant_id, 10);
            } else {
                if (!c.fabric_type_id) {
                    setErr(`Free-form fabric item #${i + 1}: pick a fabric type.`);
                    return;
                }
                entry.fabric_type_id  = parseInt(c.fabric_type_id, 10);
                entry.fabric_color_id = c.fabric_color_id ? parseInt(c.fabric_color_id, 10) : null;
            }
            customEntries.push(entry);
        }
        const itemsArr = [...reqEntries, ...freeEntries, ...customEntries];
        if (itemsArr.length === 0) { setErr('Add at least one item with a positive quantity.'); return; }

        setBusy(true);
        try {
            const payload = {
                grn_number: grnNumber || undefined,
                received_date: receivedDate,
                condition: condition || undefined,
                notes: notes || undefined,
                items: itemsArr,
            };
            const res = mode === 'create'
                ? await purchaseDeptApi.createInward(poId, payload, scanFile)
                : await purchaseDeptApi.updateInward(inward.id, payload, scanFile);
            onSaved?.(res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!inward) return;
        if (!window.confirm(`Delete inward ${inward.grn_number || `#${inward.id}`}? This will reverse trim stock additions.`)) return;
        setBusy(true); setErr(null);
        try {
            await purchaseDeptApi.deleteInward(inward.id);
            onDeleted?.(inward.id);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Delete failed.');
        } finally {
            setBusy(false);
        }
    };

    const scanUrl = (() => {
        const url = inward?.scan_url;
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    })();

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <FileText size={16} className="text-emerald-500" />
                            {mode === 'create' ? 'New Inward (GRN)' : `Inward · ${inward.grn_number || `#${inward.id}`}`}
                        </h2>
                        {!isCreate && inward.created_by_name && (
                            <p className="text-xs text-slate-500 mt-0.5">Recorded by {inward.created_by_name}</p>
                        )}
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
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRN Number</label>
                            <input
                                type="text"
                                value={grnNumber}
                                onChange={e => setGrnNumber(e.target.value)}
                                disabled={!editable}
                                placeholder="GRN-2026-…"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Received Date *</label>
                            <input
                                type="date"
                                value={receivedDate}
                                onChange={e => setReceivedDate(e.target.value)}
                                disabled={!editable}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Condition</label>
                            <select
                                value={condition}
                                onChange={e => setCondition(e.target.value)}
                                disabled={!editable}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400 bg-white"
                            >
                                <option value="GOOD">Good</option>
                                <option value="DAMAGED">Damaged</option>
                                <option value="PARTIAL">Partial</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan (jpg, ≤5MB)</label>
                            <div className="flex items-center gap-2 mt-1">
                                {editable && (
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-300 px-2.5 py-1 rounded-lg transition cursor-pointer bg-white">
                                        <Upload size={12} />
                                        {scanFile ? scanFile.name.slice(0, 18) : (scanUrl ? 'Replace' : 'Upload')}
                                        <input type="file" accept="image/jpeg" className="hidden" onChange={e => setScanFile(e.target.files?.[0] || null)} />
                                    </label>
                                )}
                                {scanUrl && (
                                    <a href={scanUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-700 underline">
                                        View existing
                                    </a>
                                )}
                                {!editable && !scanUrl && <span className="text-xs text-slate-400 italic">No scan</span>}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                disabled={!editable}
                                rows={2}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-emerald-400 resize-none"
                            />
                        </div>
                    </div>

                    {/* Items grouped by PO line item */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Items {mode === 'create' ? '· prefilled with pending qty from PO' : ''}
                        </p>
                        {(poItems || []).length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No items on this PO.</p>
                        ) : (
                        <div className="space-y-3">
                            {(poItems || []).filter(g => (g.requirements || []).length > 0).map(group => {
                                const Icon = TYPE_ICON[group.item_type] || Tag;
                                const groupLabel = group.item_type === 'fabric'
                                    ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}${group.fabric_color_number ? ` (${group.fabric_color_number})` : ''}`
                                    : `${group.trim_item_name || 'Trim'}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_color_number ? ` (${group.variant_color_number})` : ''}`;
                                const groupQty  = parseFloat(group.quantity ?? 0);
                                const groupUom  = group.uom || (group.item_type === 'fabric' ? 'm' : 'pcs');
                                return (
                                    <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                            <Icon size={13} className="text-slate-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{groupLabel}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {groupQty.toLocaleString()} {groupUom} on PO
                                                    {' · '}{(group.requirements || []).length} requirement{(group.requirements || []).length === 1 ? '' : 's'}
                                                    {group.substitute_count > 0 && (
                                                        <span className="text-amber-700 font-bold"> · 🔄 {group.substitute_count} sub{group.substitute_count === 1 ? '' : 's'}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-2 space-y-1.5">
                                            {(group.requirements || []).map(r => {
                                                const total = reqTotal(r);
                                                const unit  = reqUnit(r);
                                                const pending = pendingByReq[r.id] ?? 0;
                                                const cur = items[r.id];
                                                const inThis = cur === undefined || cur === '' ? 0 : parseFloat(cur);
                                                const over = inThis > pending + 0.001;
                                                return (
                                                    <div key={r.id} className={`flex items-center gap-3 rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                                {reqLabel(r)}
                                                                {r.product_name ? <span className="text-slate-400 font-normal"> · {r.product_name}</span> : null}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500">
                                                                Total {total.toLocaleString()} {unit}
                                                                {' · '}<span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {unit}</span>
                                                                {r.unit_price != null && <span> · @ {parseFloat(r.unit_price).toFixed(2)}</span>}
                                                                {r.is_substitute === true && <span className="text-amber-700 font-bold"> · 🔄 sub</span>}
                                                            </p>
                                                        </div>
                                                        <div className="shrink-0">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                value={cur ?? ''}
                                                                onChange={e => setItemQty(r.id, e.target.value)}
                                                                disabled={!editable}
                                                                placeholder="0"
                                                                className={`w-28 text-xs text-right border rounded-lg px-2 py-1.5 disabled:bg-white disabled:text-slate-700 focus:outline-none ${over ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-emerald-400'}`}
                                                            />
                                                            <p className="text-[9px] text-slate-400 text-right mt-0.5">{unit}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Truly free-form items (no PO link at all) */}
                            {(customItems.length > 0 || editable) && (
                                <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50/40">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Free-form additions {customItems.length > 0 && `· ${customItems.length}`}
                                        </p>
                                        {editable && (
                                            <div className="flex gap-1.5">
                                                <button onClick={() => addCustomItem('fabric')}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:bg-violet-50 border border-violet-200 px-2 py-1 rounded-md transition">
                                                    <Plus size={11} /> Fabric
                                                </button>
                                                <button onClick={() => addCustomItem('trim')}
                                                    className="flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:bg-amber-50 border border-amber-200 px-2 py-1 rounded-md transition">
                                                    <Plus size={11} /> Trim
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {customItems.length === 0 ? (
                                        <p className="text-[10px] text-slate-400 italic">Add a row to record items not on this PO (extras, samples, replacements).</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {customItems.map((c, idx) => {
                                                const isFabric = c.item_type === 'fabric';
                                                const variants = variantsByTrim[c.trim_item_id] || [];
                                                return (
                                                    <div key={c._key} className={`rounded-lg p-2 border ${isFabric ? 'bg-violet-50/40 border-violet-200' : 'bg-amber-50/40 border-amber-200'}`}>
                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                                                                {isFabric ? <Package size={11} className="text-violet-600" /> : <Scissors size={11} className="text-amber-600" />}
                                                                <select
                                                                    value={c.item_type}
                                                                    onChange={e => setCustomField(c._key, 'item_type', e.target.value)}
                                                                    disabled={!editable}
                                                                    className="text-[11px] font-bold border border-slate-200 rounded px-1.5 py-0.5 bg-white"
                                                                >
                                                                    <option value="fabric">Fabric</option>
                                                                    <option value="trim">Trim</option>
                                                                </select>
                                                                <span className="text-slate-400 text-[10px] font-normal">#{idx + 1}</span>
                                                            </div>
                                                            {editable && (
                                                                <button onClick={() => removeCustomItem(c._key)}
                                                                    className="text-slate-300 hover:text-red-500 transition">
                                                                    <Trash2 size={11} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {isFabric ? (
                                                            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                                                <select value={c.fabric_type_id}
                                                                    onChange={e => setCustomField(c._key, 'fabric_type_id', e.target.value)}
                                                                    disabled={!editable}
                                                                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
                                                                    <option value="">— Type —</option>
                                                                    {fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name || t.fabric_type_name || `Type #${t.id}`}</option>)}
                                                                </select>
                                                                <select value={c.fabric_color_id}
                                                                    onChange={e => setCustomField(c._key, 'fabric_color_id', e.target.value)}
                                                                    disabled={!editable}
                                                                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
                                                                    <option value="">— Color —</option>
                                                                    {fabricColors.map(co => <option key={co.id} value={co.id}>{co.color_name || `Color #${co.id}`}{co.color_number ? ` (${co.color_number})` : ''}</option>)}
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                                                <select value={c.trim_item_id}
                                                                    onChange={e => setCustomField(c._key, 'trim_item_id', e.target.value)}
                                                                    disabled={!editable}
                                                                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white">
                                                                    <option value="">— Trim —</option>
                                                                    {trimItems.map(t => <option key={t.id} value={t.id}>{t.name || t.item_name || `Trim #${t.id}`}{t.item_code ? ` · ${t.item_code}` : ''}</option>)}
                                                                </select>
                                                                <select value={c.trim_item_variant_id}
                                                                    onChange={e => setCustomField(c._key, 'trim_item_variant_id', e.target.value)}
                                                                    disabled={!editable || !c.trim_item_id}
                                                                    className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                                                                    <option value="">{c.trim_item_id ? '— Variant —' : '— Pick trim first —'}</option>
                                                                    {variants.map(v => <option key={v.id} value={v.id}>{v.color_name || v.name || `Variant #${v.id}`}{v.color_number ? ` (${v.color_number})` : ''}</option>)}
                                                                </select>
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-3 gap-1.5">
                                                            <input type="number" min="0" step="any" placeholder="Qty *"
                                                                value={c.qty_received}
                                                                onChange={e => setCustomField(c._key, 'qty_received', e.target.value)}
                                                                disabled={!editable}
                                                                className="text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                            <input type="number" min="0" step="any" placeholder="Unit price"
                                                                value={c.unit_price}
                                                                onChange={e => setCustomField(c._key, 'unit_price', e.target.value)}
                                                                disabled={!editable}
                                                                className="text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums" />
                                                            <input type="text" placeholder="Description"
                                                                value={c.description}
                                                                onChange={e => setCustomField(c._key, 'description', e.target.value)}
                                                                disabled={!editable}
                                                                className="text-[11px] border border-slate-200 rounded px-1.5 py-1" />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Free-form PO items (no linked requirements) */}
                            {(poItems || []).filter(g => (g.requirements || []).length === 0).map(group => {
                                const Icon = TYPE_ICON[group.item_type] || Tag;
                                const groupLabel = group.item_type === 'fabric'
                                    ? `${group.fabric_type_name || 'Fabric'}${group.fabric_color_name ? ` · ${group.fabric_color_name}` : ''}${group.fabric_color_number ? ` (${group.fabric_color_number})` : ''}`
                                    : `${group.trim_item_name || 'Trim'}${group.variant_color_name ? ` · ${group.variant_color_name}` : ''}${group.variant_color_number ? ` (${group.variant_color_number})` : ''}`;
                                const groupQty = parseFloat(group.quantity ?? 0);
                                const groupUom = group.uom || (group.item_type === 'fabric' ? 'm' : 'pcs');
                                const pending  = pendingByPoItem[group.id] ?? 0;
                                const cur      = freeFormItems[group.id];
                                const inThis   = cur === undefined || cur === '' ? 0 : parseFloat(cur);
                                const over     = inThis > pending + 0.001;
                                return (
                                    <div key={`free-${group.id}`} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                                            <Icon size={13} className="text-slate-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{groupLabel}</p>
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                                        Free-form
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500">
                                                    {groupQty.toLocaleString()} {groupUom} on PO
                                                    {' · '}<span className="font-bold text-emerald-600">Pending {pending.toLocaleString()} {groupUom}</span>
                                                    {' · item #'}{group.id}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="p-2">
                                            <div className={`flex items-center gap-3 rounded-lg p-2 border ${over ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-slate-500 italic">No requirement to receive against — qty applied directly to this line item.</p>
                                                </div>
                                                <div className="shrink-0">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={cur ?? ''}
                                                        onChange={e => setFreeFormQty(group.id, e.target.value)}
                                                        disabled={!editable}
                                                        placeholder="0"
                                                        className={`w-28 text-xs text-right border rounded-lg px-2 py-1.5 disabled:bg-white disabled:text-slate-700 focus:outline-none ${over ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-emerald-400'}`}
                                                    />
                                                    <p className="text-[9px] text-slate-400 text-right mt-0.5">{groupUom}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                    <div>
                        {mode === 'view' && !isCreate && inward.invoice_id == null && (
                            <button
                                onClick={handleDelete}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        )}
                        {mode === 'view' && !isCreate && inward.invoice_id != null && (
                            <p className="text-[10px] text-slate-400 italic">Linked to an invoice — unlink first to delete.</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {mode === 'view' && (
                            <button
                                onClick={() => setMode('edit')}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-emerald-600 border border-slate-200 hover:border-emerald-300 px-3 py-1.5 rounded-lg transition"
                            >
                                <Edit3 size={12} /> Edit
                            </button>
                        )}
                        {editable && (
                            <>
                                <button
                                    onClick={onClose}
                                    disabled={busy}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={busy}
                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                                >
                                    {busy && <Loader2 size={12} className="animate-spin" />}
                                    {mode === 'create' ? 'Create Inward' : 'Save Changes'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

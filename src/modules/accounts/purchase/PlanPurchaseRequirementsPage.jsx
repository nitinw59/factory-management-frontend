import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShoppingBag, Package, Scissors, Loader2, AlertCircle,
    ChevronDown, ChevronUp, X, RefreshCw, Plus,
    ClipboardList, CheckCircle2, Trash2, RotateCcw
} from 'lucide-react';
import { accountingApi } from '../../../api/accountingApi';
import { storeManagerApi } from '../../../api/storeManagerApi';
import SupplierCodePill from '../../purchase_department/SupplierCodePill';

// ─── SHARED ───────────────────────────────────────────────────────────────────

const Spinner = () => (
    <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
    </div>
);

const StatusBadge = ({ status }) => {
    const map = {
        PENDING:      'bg-yellow-50  text-yellow-700  border-yellow-200',
        PO_PROCESSED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${map[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {status?.replace(/_/g, ' ') ?? 'N/A'}
        </span>
    );
};

// ─── CREATE PO MODAL ─────────────────────────────────────────────────────────

const CreatePOModal = ({ so, fabricReqs, trimReqs, onClose, onSuccess }) => {
    const [suppliers,        setSuppliers]        = useState([]);
    const [supplierId,       setSupplierId]       = useState('');
    const [deliveryDate,     setDeliveryDate]     = useState('');

    // per-row state — keyed by req id
    const [fabricData,       setFabricData]       = useState(() =>
        Object.fromEntries(fabricReqs.map(r => [r.id, { qty: String(r.total_meters_required), price: '', dropped: false }]))
    );
    const [trimData,         setTrimData]         = useState(() =>
        Object.fromEntries(trimReqs.map(r => [r.id, { qty: String(r.total_quantity_required), variant_id: '', price: '', dropped: false }]))
    );

    const [variantMap, setVariantMap] = useState({});
    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState(null);

    useEffect(() => {
        storeManagerApi.getSuppliers()
            .then(r => setSuppliers(r.data?.data || r.data || []));

        const uniqueItemIds = [...new Set(trimReqs.map(r => r.trim_item_id).filter(Boolean))];
        Promise.all(
            uniqueItemIds.map(id =>
                storeManagerApi.getVariantsByTrimItem(id)
                    .then(r => ({ id, variants: r.data?.data || r.data || [] }))
                    .catch(() => ({ id, variants: [] }))
            )
        ).then(results => {
            const map = {};
            results.forEach(({ id, variants }) => { map[id] = variants; });
            setVariantMap(map);
        });
    }, [trimReqs]);

    const setFabricField = (id, field, value) =>
        setFabricData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

    const setTrimField = (id, field, value) =>
        setTrimData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

    const activeFabric = fabricReqs.filter(r => !fabricData[r.id]?.dropped);
    const activeTrim   = trimReqs.filter(r   => !trimData[r.id]?.dropped);

    const canSubmit =
        supplierId &&
        deliveryDate &&
        (activeFabric.length + activeTrim.length) > 0 &&
        activeFabric.every(r => {
            const d = fabricData[r.id];
            return d && parseFloat(d.qty) > 0 && d.price !== '';
        }) &&
        activeTrim.every(r => {
            const d = trimData[r.id];
            return d && parseFloat(d.qty) > 0 && d.variant_id && d.price !== '';
        });

    const handleSubmit = async () => {
        setSaving(true);
        setError(null);
        try {
            const body = {
                sales_order_id:         so.sales_order_id,
                supplier_id:            parseInt(supplierId),
                expected_delivery_date: deliveryDate,
                fabric_reqs: activeFabric.map(r => ({
                    plan_fabric_purchase_req_id: parseInt(r.id),
                    quantity:                    parseFloat(fabricData[r.id].qty),
                    unit_price:                  parseFloat(fabricData[r.id].price),
                })),
                trim_reqs: activeTrim.map(r => ({
                    plan_trim_purchase_req_id: parseInt(r.id),
                    trim_item_variant_id:      parseInt(trimData[r.id].variant_id),
                    quantity:                  parseFloat(trimData[r.id].qty),
                    unit_price:               parseFloat(trimData[r.id].price),
                })),
            };
            await accountingApi.createPOFromRequirements(body);
            onSuccess();
        } catch (e) {
            setError(e?.response?.data?.error || e.message || 'Failed to create PO');
        } finally {
            setSaving(false);
        }
    };

    const droppedFabricCount = fabricReqs.length - activeFabric.length;
    const droppedTrimCount   = trimReqs.length   - activeTrim.length;

    const supplierName = suppliers.find(s => String(s.id) === String(supplierId))?.name || '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div>
                        <h3 className="font-black text-lg text-slate-800">Create Purchase Order</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {so.sales_order_number} · {so.customer_name}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    {/* PO Meta */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                                Supplier <span className="text-red-400">*</span>
                            </label>
                            <select
                                value={supplierId}
                                onChange={e => setSupplierId(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                            >
                                <option value="">Select supplier…</option>
                                {suppliers.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                                Expected Delivery <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="date"
                                value={deliveryDate}
                                onChange={e => setDeliveryDate(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                            />
                        </div>
                    </div>

                    {/* Fabric Requirements */}
                    {fabricReqs.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Package size={12} />
                                    Fabric ({activeFabric.length} of {fabricReqs.length} included)
                                </p>
                                {droppedFabricCount > 0 && (
                                    <span className="text-[10px] text-slate-400 italic">{droppedFabricCount} dropped</span>
                                )}
                            </div>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-200">
                                    <div className="col-span-3">Fabric / Color</div>
                                    <div className="col-span-2 text-center">Required</div>
                                    <div className="col-span-3 text-center">Order Qty (m)</div>
                                    <div className="col-span-3 text-right">Unit Price (₹)</div>
                                    <div className="col-span-1" />
                                </div>
                                {fabricReqs.map(r => {
                                    const d       = fabricData[r.id];
                                    const dropped = d?.dropped;
                                    return (
                                        <div
                                            key={r.id}
                                            className={`grid grid-cols-12 gap-1 px-3 py-2.5 border-b border-slate-100 last:border-b-0 items-center transition-colors ${dropped ? 'bg-slate-50 opacity-50' : 'hover:bg-slate-50/50'}`}
                                        >
                                            <div className="col-span-3">
                                                <p className={`text-sm font-semibold ${dropped ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                    {r.fabric_type_name}
                                                </p>
                                                <p className="text-[10px] text-slate-400">{r.fabric_color_name} · {r.fabric_color_number}</p>
                                            </div>
                                            <div className="col-span-2 text-center text-xs text-slate-400 font-mono">{r.total_meters_required} m</div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    disabled={dropped}
                                                    value={d?.qty ?? ''}
                                                    onChange={e => setFabricField(r.id, 'qty', e.target.value)}
                                                    className="w-full text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    disabled={dropped}
                                                    value={d?.price ?? ''}
                                                    onChange={e => setFabricField(r.id, 'price', e.target.value)}
                                                    className="w-full text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center">
                                                {dropped ? (
                                                    <button
                                                        onClick={() => setFabricField(r.id, 'dropped', false)}
                                                        title="Restore"
                                                        className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                    >
                                                        <RotateCcw size={13} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setFabricField(r.id, 'dropped', true)}
                                                        title="Drop from this PO"
                                                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Trim Requirements */}
                    {trimReqs.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Scissors size={12} />
                                    Trim ({activeTrim.length} of {trimReqs.length} included)
                                </p>
                                {droppedTrimCount > 0 && (
                                    <span className="text-[10px] text-slate-400 italic">{droppedTrimCount} dropped</span>
                                )}
                            </div>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-200">
                                    <div className="col-span-3">Item / Color</div>
                                    <div className="col-span-2 text-center">Required</div>
                                    <div className="col-span-2 text-center">Order Qty</div>
                                    <div className="col-span-2">Variant</div>
                                    <div className="col-span-2 text-right">Unit Price (₹)</div>
                                    <div className="col-span-1" />
                                </div>
                                {trimReqs.map(r => {
                                    const variants = variantMap[r.trim_item_id] || [];
                                    const d        = trimData[r.id];
                                    const dropped  = d?.dropped;
                                    return (
                                        <div
                                            key={r.id}
                                            className={`px-3 py-2.5 border-b border-slate-100 last:border-b-0 transition-colors ${dropped ? 'bg-slate-50 opacity-50' : 'hover:bg-slate-50/50'}`}
                                        >
                                        <div className="grid grid-cols-12 gap-1 items-center">
                                            <div className="col-span-3">
                                                <p className={`text-sm font-semibold ${dropped ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                    {r.trim_item_name}
                                                </p>
                                                <p className="text-[10px] text-slate-400">{r.fabric_color_name} · {r.fabric_color_number}</p>
                                            </div>
                                            <div className="col-span-2 text-center text-xs text-slate-400 font-mono">{r.total_quantity_required}</div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="1"
                                                    disabled={dropped}
                                                    value={d?.qty ?? ''}
                                                    onChange={e => setTrimField(r.id, 'qty', e.target.value)}
                                                    className="w-full text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <select
                                                    disabled={dropped}
                                                    value={d?.variant_id ?? ''}
                                                    onChange={e => setTrimField(r.id, 'variant_id', e.target.value)}
                                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                >
                                                    <option value="">Select…</option>
                                                    {variants.map(v => (
                                                        <option key={v.id} value={v.id}>
                                                            {v.name || v.variant_name || `Variant #${v.id}`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    disabled={dropped}
                                                    value={d?.price ?? ''}
                                                    onChange={e => setTrimField(r.id, 'price', e.target.value)}
                                                    className="w-full text-right border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center">
                                                {dropped ? (
                                                    <button
                                                        onClick={() => setTrimField(r.id, 'dropped', false)}
                                                        title="Restore"
                                                        className="p-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                    >
                                                        <RotateCcw size={13} />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setTrimField(r.id, 'dropped', true)}
                                                        title="Drop from this PO"
                                                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {!dropped && supplierId && d?.variant_id && (
                                            <div className="mt-1.5 pl-1">
                                                <SupplierCodePill
                                                    supplierId={supplierId}
                                                    supplierName={supplierName}
                                                    variantId={d.variant_id}
                                                />
                                            </div>
                                        )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <div className="flex items-center gap-3">
                        {(droppedFabricCount + droppedTrimCount) > 0 && (
                            <span className="text-xs text-amber-600 font-semibold">
                                {droppedFabricCount + droppedTrimCount} item{droppedFabricCount + droppedTrimCount !== 1 ? 's' : ''} excluded — remaining will stay pending
                            </span>
                        )}
                        <button
                            onClick={handleSubmit}
                            disabled={saving || !canSubmit}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                        >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            {saving ? 'Creating…' : `Create PO (${activeFabric.length + activeTrim.length} items)`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── SO GROUP CARD ────────────────────────────────────────────────────────────

const SOGroupCard = ({ so, fabricReqs, trimReqs, onCreatePO, isPending }) => {
    const [open, setOpen] = useState(true);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-5 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left border-b border-slate-100"
            >
                <ShoppingBag size={14} className="text-indigo-500 shrink-0" />

                <div className="flex-1 min-w-0">
                    <span className="font-bold text-slate-800 text-sm">{so.sales_order_number}</span>
                    <p className="text-[10px] text-slate-500">{so.customer_name}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {fabricReqs.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                            <Package size={9} /> {fabricReqs.length} fabric
                        </span>
                    )}
                    {trimReqs.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                            <Scissors size={9} /> {trimReqs.length} trim
                        </span>
                    )}
                    {isPending && (
                        <button
                            onClick={e => { e.stopPropagation(); onCreatePO(so, fabricReqs, trimReqs); }}
                            className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Plus size={11} /> Create PO
                        </button>
                    )}
                    {open
                        ? <ChevronUp   size={13} className="text-slate-400" />
                        : <ChevronDown size={13} className="text-slate-400" />
                    }
                </div>
            </button>

            {open && (
                <div className="divide-y divide-slate-100">

                    {/* Fabric section */}
                    {fabricReqs.length > 0 && (
                        <div className="p-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Package size={10} /> Fabric
                            </p>
                            <div className="border border-slate-100 rounded-xl overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-[9px] font-bold uppercase text-slate-400 border-b border-slate-100">
                                    <div className="col-span-3">Fabric Type</div>
                                    <div className="col-span-3">Color</div>
                                    <div className="col-span-2">Color No.</div>
                                    <div className="col-span-2 text-center">Meters</div>
                                    <div className="col-span-2 text-center">Status</div>
                                </div>
                                {fabricReqs.map(r => (
                                    <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-100 last:border-b-0 items-center hover:bg-slate-50">
                                        <div className="col-span-3 text-sm font-semibold text-slate-700">{r.fabric_type_name}</div>
                                        <div className="col-span-3 text-sm text-slate-600">{r.fabric_color_name}</div>
                                        <div className="col-span-2 text-sm font-mono text-slate-400">{r.fabric_color_number}</div>
                                        <div className="col-span-2 text-center text-sm font-bold text-slate-600">{r.total_meters_required}</div>
                                        <div className="col-span-2 flex justify-center"><StatusBadge status={r.status} /></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Trim section */}
                    {trimReqs.length > 0 && (
                        <div className="p-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Scissors size={10} /> Trim
                            </p>
                            <div className="border border-slate-100 rounded-xl overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-[9px] font-bold uppercase text-slate-400 border-b border-slate-100">
                                    <div className="col-span-3">Item</div>
                                    <div className="col-span-2">Item Code</div>
                                    <div className="col-span-2">Color</div>
                                    <div className="col-span-1">No.</div>
                                    <div className="col-span-2 text-center">Qty</div>
                                    <div className="col-span-2 text-center">Status</div>
                                </div>
                                {trimReqs.map(r => (
                                    <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-slate-100 last:border-b-0 items-center hover:bg-slate-50">
                                        <div className="col-span-3 text-sm font-semibold text-slate-700">{r.trim_item_name}</div>
                                        <div className="col-span-2 text-xs font-mono text-slate-400">{r.trim_item_code || '—'}</div>
                                        <div className="col-span-2 text-sm text-slate-600">{r.fabric_color_name}</div>
                                        <div className="col-span-1 text-xs font-mono text-slate-400">{r.fabric_color_number}</div>
                                        <div className="col-span-2 text-center text-sm font-bold text-slate-600">{r.total_quantity_required}</div>
                                        <div className="col-span-2 flex justify-center"><StatusBadge status={r.status} /></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function PlanPurchaseRequirementsPage() {
    const [fabricReqs, setFabricReqs] = useState([]);
    const [trimReqs,   setTrimReqs]   = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [tab,        setTab]        = useState('pending');  // 'pending' | 'processed'
    const [modal,      setModal]      = useState(null);       // { so, fabricReqs, trimReqs }

    const fetchData = useCallback(async (activeTab) => {
        setLoading(true);
        setError(null);
        try {
            const params = activeTab === 'processed' ? { status: 'PO_PROCESSED' } : {};
            const [fRes, tRes] = await Promise.all([
                accountingApi.getPlanFabricRequirements(params),
                accountingApi.getPlanTrimRequirements(params),
            ]);
            setFabricReqs(fRes.data?.data || fRes.data || []);
            setTrimReqs(tRes.data?.data   || tRes.data   || []);
        } catch {
            setError('Failed to load requirements.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(tab); }, [fetchData, tab]);

    // Group by sales_order_id — use flat fields from API
    const soGroups = useMemo(() => {
        const map = new Map();
        const add = (req, type) => {
            const key = req.sales_order_id;
            if (!map.has(key)) {
                map.set(key, {
                    so: {
                        sales_order_id:     req.sales_order_id,
                        sales_order_number: req.sales_order_number,
                        customer_name:      req.customer_name,
                    },
                    fabric: [],
                    trim: [],
                });
            }
            map.get(key)[type].push(req);
        };
        fabricReqs.forEach(r => add(r, 'fabric'));
        trimReqs.forEach(r   => add(r, 'trim'));
        return [...map.values()];
    }, [fabricReqs, trimReqs]);

    const handlePOSuccess = () => {
        setModal(null);
        fetchData(tab);
    };

    return (
        <div className="max-w-5xl mx-auto">

            {/* Page header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                        <ClipboardList size={24} className="text-indigo-500" />
                        Plan Purchase Requirements
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Review merchandiser requests and raise purchase orders to suppliers
                    </p>
                </div>
                <button
                    onClick={() => fetchData(tab)}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-6">
                {[
                    { value: 'pending',   label: 'Pending',   icon: ClipboardList },
                    { value: 'processed', label: 'Processed', icon: CheckCircle2  },
                ].map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => setTab(value)}
                        className={`flex items-center gap-1.5 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${
                            tab === value
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {/* Body */}
            {loading ? <Spinner /> : error ? (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                    <AlertCircle size={16} /> {error}
                </div>
            ) : soGroups.length === 0 ? (
                <div className="flex flex-col items-center py-20 gap-3 text-slate-400">
                    <Package size={40} />
                    <p className="font-bold text-lg">
                        {tab === 'pending' ? 'No pending requirements.' : 'No processed requirements.'}
                    </p>
                </div>
            ) : (
                soGroups.map(({ so, fabric, trim }, i) => (
                    <SOGroupCard
                        key={so.sales_order_id || i}
                        so={so}
                        fabricReqs={fabric}
                        trimReqs={trim}
                        onCreatePO={(soArg, fReqs, tReqs) => setModal({ so: soArg, fabricReqs: fReqs, trimReqs: tReqs })}
                        isPending={tab === 'pending'}
                    />
                ))
            )}

            {/* Create PO modal */}
            {modal && (
                <CreatePOModal
                    so={modal.so}
                    fabricReqs={modal.fabricReqs}
                    trimReqs={modal.trimReqs}
                    onClose={() => setModal(null)}
                    onSuccess={handlePOSuccess}
                />
            )}
        </div>
    );
}

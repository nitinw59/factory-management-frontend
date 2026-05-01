import { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Link2, ChevronDown, ChevronRight,
    Package, AlertTriangle, CheckCircle2, RefreshCw,
    Calculator, ShoppingBag, ShoppingCart, X, Layers, Eye, Bookmark, Download, Printer,
} from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { bomApi } from '../../api/bomApi';
import { stdSize } from '../../utils/sizeUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const Spinner = ({ h = 64 }) => (
    <div className={`flex justify-center items-center`} style={{ minHeight: h * 4 }}>
        <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
    </div>
);

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const ORDER_STATUS_CFG = {
    DRAFT:          { cls: 'bg-slate-100 text-slate-500'   },
    CONFIRMED:      { cls: 'bg-blue-100 text-blue-700'     },
    IN_PRODUCTION:  { cls: 'bg-violet-100 text-violet-700' },
    COMPLETED:      { cls: 'bg-emerald-100 text-emerald-700'},
    CANCELLED:      { cls: 'bg-red-100 text-red-500'       },
};

// ─── BOM PREVIEW MODAL ────────────────────────────────────────────────────────

const BomPreviewModal = ({ bomId, onClose }) => {
    const [bom,     setBom]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [err,     setErr]     = useState(null);

    useEffect(() => {
        bomApi.getById(bomId)
            .then(res => setBom(res.data?.data ?? res.data))
            .then(() => console.log('BOM detail:', bom))
            .catch(e  => setErr(e?.response?.data?.error || e.message || 'Failed to load BOM'))
            .finally(() => setLoading(false));
           
    }, [bomId]);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]"
                onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">BOM Preview</p>
                        <h2 className="font-extrabold text-slate-800 text-base">
                            {loading ? 'Loading…' : bom?.bom_name || '—'}
                        </h2>
                        {bom && <p className="text-xs text-slate-400 mt-0.5">{bom.product?.name}</p>}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {loading && <Spinner />}
                    {err && <p className="text-sm text-red-500">{err}</p>}
                    {bom && (
                        <>
                            {/* Ratio Groups */}
                            {(bom.ratio_groups || []).length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Ratio Groups</p>
                                    <div className="space-y-2">
                                        {bom.ratio_groups.map((rg, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                                                    <span className="font-bold text-slate-700 text-xs">{rg.ratio_group_name || `Group ${i + 1}`}</span>
                                                    <div className="flex items-center gap-2">
                                                        {rg.total_pieces_in_marker > 0 && (
                                                            <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded font-bold">
                                                                {rg.total_pieces_in_marker} pcs
                                                            </span>
                                                        )}
                                                        {rg.marker_length_inches && (
                                                            <span className="text-[9px] text-slate-400">{rg.marker_length_inches}"</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 p-2.5">
                                                    {(rg.items || []).filter(it => it.size).map((it, j) => (
                                                        <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                                            {it.size}: {it.number_of_pieces} pcs
                                                        </span>
                                                    ))}
                                                </div>
                                                {(rg.fabric_consumptions || []).length > 0 && (
                                                    <div className="border-t border-slate-100 px-2.5 py-2 flex flex-wrap gap-1.5">
                                                        {rg.fabric_consumptions.map((fc, j) => (
                                                            <span key={j} className="bg-sky-50 text-sky-700 border border-sky-100 rounded px-2 py-0.5 text-[10px] font-bold">
                                                                {fc.fabric_type_name || `Fabric #${fc.fabric_type_id}`}: {fc.consumption_inches}"
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Materials */}
                            {(bom.material_consumptions || []).length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Materials & Trims</p>
                                    <div className="space-y-1.5">
                                        {bom.material_consumptions.map((mc, i) => (
                                            <div key={i} className="border border-slate-200 rounded-xl px-3 py-2">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-semibold text-slate-700 text-xs">{mc.trim_item_name || `Trim #${mc.trim_item_id}`}</span>
                                                        {mc.item_code && <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1 rounded">{mc.item_code}</span>}
                                                        {mc.unit_of_measure && (
                                                            <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">{mc.unit_of_measure}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold shrink-0">{mc.calculation_type}</span>
                                                </div>
                                                {mc.placement_description && (
                                                    <p className="text-[9px] text-slate-400 mb-1">📍 {mc.placement_description}</p>
                                                )}
                                                {mc.calculation_type === 'FIXED' ? (
                                                    <p className="text-[10px] text-slate-600 font-bold">
                                                        {mc.fixed_quantity} <span className="font-normal text-slate-400">{mc.unit_of_measure || 'unit'} per garment</span>
                                                    </p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {(mc.size_consumptions || []).map((sc, j) => (
                                                            <span key={j} className="bg-violet-50 text-violet-700 border border-violet-100 rounded px-1.5 py-0.5 text-[9px] font-bold">
                                                                {sc.size || '—'}: {sc.quantity}{mc.unit_of_measure ? ` ${mc.unit_of_measure}` : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── ORDER CARD (left sidebar) ─────────────────────────────────────────────────

const OrderCard = ({ order, isSelected, onClick }) => {
    const { cls } = ORDER_STATUS_CFG[order.status] || { cls: 'bg-gray-100 text-gray-500' };
    const linked    = order.linked_bom_count ?? 0;
    const total     = order.product_count    ?? 0;
    const allLinked = linked === total && total > 0;
    const customerName = order.customer_name || order.buyer_name || '—';

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50
                ${isSelected ? 'bg-violet-50 border-l-[3px] border-l-violet-500' : 'border-l-[3px] border-l-transparent'}`}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">
                    {order.order_number}
                    {order.buyer_po_number && (
                        <span className="font-normal text-slate-400 ml-1 text-[10px]">· PO {order.buyer_po_number}</span>
                    )}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ml-1 ${cls}`}>
                    {order.status}
                </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1.5 truncate">{customerName}</p>
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold ${allLinked ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {linked}/{total} BOMs linked
                </span>
                {order.delivery_date && (
                    <span className="text-[10px] text-slate-400">
                        {new Date(order.delivery_date).toLocaleDateString()}
                    </span>
                )}
            </div>
        </button>
    );
};

// ─── REQUIREMENT STATUS PILL ──────────────────────────────────────────────────

const REQ_STATUS = {
    PENDING:            { cls: 'bg-amber-50 text-amber-700 border-amber-200',        label: 'Pending'   },
    PARTIALLY_RESERVED: { cls: 'bg-blue-50 text-blue-700 border-blue-200',           label: 'Partial'   },
    RESERVED:           { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',  label: 'Reserved'  },
    PURCHASE_RAISED:    { cls: 'bg-violet-50 text-violet-700 border-violet-200',     label: 'PO Raised' },
};
const ReqStatusPill = ({ status }) => {
    const cfg = REQ_STATUS[status] || { cls: 'bg-slate-50 text-slate-500 border-slate-200', label: status || '—' };
    return (
        <span className={`text-[8px] font-bold uppercase tracking-wider border px-1.5 py-0.5 rounded-full ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

// ─── RESERVATION & PURCHASE MODAL ─────────────────────────────────────────────

const ReservationModal = ({ reqType, requirement, onClose, onUpdate }) => {
    const isFabric = reqType === 'fabric';

    // Trim: per-variant quantity inputs
    const [inputs,        setInputs]        = useState({});
    // Fabric: whole-roll checkbox selection
    const [checkedRolls,  setCheckedRolls]  = useState(new Set());
    const [rollSearch,    setRollSearch]    = useState('');
    const [rollMinMeter,  setRollMinMeter]  = useState('');

    const [purchaseAmt,   setPurchaseAmt]   = useState('');
    const [purchaseNotes, setPurchaseNotes] = useState('');
    const [busy,          setBusy]          = useState(null);
    const [error,         setError]         = useState(null);

    const unit      = isFabric ? 'm' : (requirement.unit_of_measure || 'pcs');
    const name      = isFabric ? requirement.fabric_type_name : requirement.trim_item_name;
    const required  = parseFloat(isFabric ? requirement.meters_required  : requirement.quantity_required)  || 0;
    const reserved  = parseFloat(isFabric ? requirement.meters_reserved  : requirement.quantity_reserved)  || 0;
    const remaining = Math.max(0, required - reserved);
    const pct       = Math.min(100, (reserved / (required || 1)) * 100);

    const reservations = requirement.reservations         || [];
    const purchaseReqs = requirement.purchase_requirements || [];

    // Set of roll IDs already reserved (to hide them from the available list)
    const alreadyReservedRollIds = new Set(reservations.map(r => String(r.fabric_roll_id)));

    const stockItems = isFabric
        ? (requirement.stock_suggestion?.available_rolls || []).map(r => ({
            ...r,
            id:     r.roll_id,
            _label: `Roll #${r.roll_id}`,
            _stock: parseFloat(r.meter) || 0,
            _color: r.color_number || '—',
          }))
        : [
            ...(requirement.stock_suggestion?.exact_variant
                ? [{
                    ...requirement.stock_suggestion.exact_variant,
                    _isExact: true,
                    _label:  `${requirement.stock_suggestion.exact_variant.color_name || 'Exact'}${requirement.stock_suggestion.exact_variant.color_number ? ` · ${requirement.stock_suggestion.exact_variant.color_number}` : ''} (Exact)`,
                    _stock:  parseFloat(requirement.stock_suggestion.exact_variant.in_stock) || 0,
                  }]
                : []),
            ...(requirement.stock_suggestion?.substitutes || []).map(s => ({
                ...s,
                id:      s.substitute_variant_id,
                _isExact: false,
                _label:  `${s.color_name || s.item_name}${s.color_number ? ` · ${s.color_number}` : ''} (Sub)`,
                _stock:  parseFloat(s.in_stock) || 0,
            })),
          ];

    // Fabric: filter out already-reserved rolls, apply search + min-meter
    const filteredRolls = !isFabric ? [] : stockItems.filter(roll => {
        if (alreadyReservedRollIds.has(String(roll.id))) return false;
        const searchOk = !rollSearch ||
            String(roll.id).includes(rollSearch) ||
            String(roll._stock).includes(rollSearch) ||
            (roll._color || '').toLowerCase().includes(rollSearch.toLowerCase());
        const minOk = !rollMinMeter || roll._stock >= parseFloat(rollMinMeter);
        return searchOk && minOk;
    });

    // Fabric: running totals from checked selection
    const checkedMeters  = [...checkedRolls].reduce((s, id) => s + (stockItems.find(r => String(r.id) === String(id))?._stock || 0), 0);
    const totalProjected = reserved + checkedMeters;
    const quotaMet       = totalProjected >= required;

    const toggleRoll = (rollId) => setCheckedRolls(prev => {
        const next = new Set(prev);
        next.has(rollId) ? next.delete(rollId) : next.add(rollId);
        return next;
    });

    // Trim only: auto-fill inputs and purchase amount on open
    useEffect(() => {
        if (isFabric) {
            if (remaining > 0) setPurchaseAmt(remaining.toFixed(2));
            return;
        }
        const init = {};
        stockItems.forEach(item => {
            if (item._stock > 0) {
                const fill = parseFloat(Math.min(item._stock, remaining).toFixed(2));
                if (fill > 0) init[item.id] = String(fill);
            }
        });
        setInputs(init);
        if (remaining > 0) setPurchaseAmt(remaining.toFixed(2));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const run = async (key, fn) => {
        setBusy(key); setError(null);
        try   { await fn(); onUpdate(); }
        catch (e) { setError(e?.response?.data?.error || 'Action failed'); }
        finally   { setBusy(null); }
    };

    // Fabric: reserve all checked rolls at their full meter amount
    const handleReserveFabricRolls = () => run('res_fabric', async () => {
        if (checkedRolls.size === 0) throw new Error('Select at least one roll');
        for (const rollId of checkedRolls) {
            const roll = stockItems.find(r => String(r.id) === String(rollId));
            await planningApi.reserveFabric(requirement.id, {
                fabric_roll_id:  rollId,
                meters_reserved: roll._stock,
            });
        }
        setCheckedRolls(new Set());
    });

    // Trim: reserve a specific variant by quantity
    const handleReserve = (stockId) => run(`res_${stockId}`, async () => {
        const amt = parseFloat(inputs[stockId]);
        if (!amt || amt <= 0) throw new Error('Enter a valid amount');
        await planningApi.reserveTrim(requirement.id, { trim_item_variant_id: stockId, quantity_reserved: amt });
        setInputs(p => ({ ...p, [stockId]: '' }));
    });

    const handleDeleteReservation = (resId) => run(`del_${resId}`,
        () => isFabric ? planningApi.deleteFabricReservation(resId) : planningApi.deleteTrimReservation(resId)
    );

    const handlePurchase = () => run('purchase', async () => {
        const amt = parseFloat(purchaseAmt);
        if (!amt || amt <= 0) throw new Error('Enter a valid amount');
        if (isFabric)
            await planningApi.createFabricPurchase(requirement.id, { meters_required: amt, notes: purchaseNotes || undefined });
        else
            await planningApi.createTrimPurchase(requirement.id, { quantity_required: amt, notes: purchaseNotes || undefined });
        setPurchaseAmt(''); setPurchaseNotes('');
    });

    const handleDeletePurchase = (purchaseId) => run(`delpurch_${purchaseId}`,
        () => isFabric ? planningApi.deleteFabricPurchase(purchaseId) : planningApi.deleteTrimPurchase(purchaseId)
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                            {isFabric ? 'Fabric' : 'Trim'} · Reservation & Purchase
                        </p>
                        <h2 className="font-extrabold text-slate-800 text-base leading-tight">{name}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {requirement.color_name}{requirement.color_number ? ` · ${requirement.color_number}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
                    )}

                    {/* Progress bar */}
                    <div>
                        <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                            <span>Reserved: <b>{reserved.toFixed(2)} {unit}</b></span>
                            <span>Required: <b>{required.toFixed(2)} {unit}</b></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                            <div
                                className={`h-2.5 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-violet-500' : 'bg-slate-300'}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                            <ReqStatusPill status={requirement.status} />
                            {remaining > 0 && (
                                <span className="text-[10px] text-red-500 font-bold">−{remaining.toFixed(2)} {unit} unmet</span>
                            )}
                        </div>
                    </div>

                    {/* Current reservations */}
                    {reservations.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Reservations</p>
                            <div className="space-y-1.5">
                                {reservations.map(res => (
                                    <div key={res.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs">
                                        <div>
                                            <p className="font-bold text-slate-700">
                                                {isFabric ? `Roll #${res.fabric_roll_id}` : `Variant #${res.trim_item_variant_id}`}
                                            </p>
                                            <p className="text-emerald-700 font-bold">
                                                {(isFabric ? res.meters_reserved : res.quantity_reserved)?.toFixed?.(2) ?? '—'} {unit}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteReservation(res.id)}
                                            disabled={busy === `del_${res.id}`}
                                            className="text-red-400 hover:text-red-600 p-1 rounded disabled:opacity-40"
                                        >
                                            {busy === `del_${res.id}` ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Available stock → reserve */}
                    {isFabric ? (
                        /* ── FABRIC: whole-roll checkbox selection ── */
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Rolls</p>
                                <span className="text-[10px] text-slate-400">{filteredRolls.length} roll{filteredRolls.length !== 1 ? 's' : ''}</span>
                            </div>

                            {/* Search + min-meter filter */}
                            <div className="flex gap-2 mb-2">
                                <input
                                    type="text"
                                    value={rollSearch}
                                    onChange={e => setRollSearch(e.target.value)}
                                    placeholder="Search roll ID or color…"
                                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400"
                                />
                                <input
                                    type="number"
                                    value={rollMinMeter}
                                    onChange={e => setRollMinMeter(e.target.value)}
                                    placeholder="Min m"
                                    className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400"
                                />
                            </div>

                            {/* Running total banner */}
                            {checkedRolls.size > 0 && (
                                <div className={`flex items-center justify-between text-[10px] font-bold rounded-lg px-3 py-2 mb-2 border ${
                                    quotaMet
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-violet-50 text-violet-700 border-violet-200'
                                }`}>
                                    <span>{checkedRolls.size} roll{checkedRolls.size !== 1 ? 's' : ''} · {checkedMeters.toFixed(2)} m selected</span>
                                    <span>{totalProjected.toFixed(2)} / {required.toFixed(2)} m {quotaMet ? '✓ Covered' : ''}</span>
                                </div>
                            )}

                            {/* Roll list */}
                            {filteredRolls.length === 0 ? (
                                <div className="text-center py-4 text-[11px] text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                                    {stockItems.length === 0 ? 'No rolls available in stock' : 'No rolls match filter'}
                                </div>
                            ) : (
                                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                                    {filteredRolls.map(roll => {
                                        const isChecked   = checkedRolls.has(roll.id);
                                        const wouldExceed = !isChecked && quotaMet;
                                        return (
                                            <label
                                                key={roll.id}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                                                    isChecked
                                                        ? 'bg-violet-50 border-violet-300'
                                                        : wouldExceed
                                                            ? 'bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed'
                                                            : 'bg-white border-slate-200 hover:border-violet-200 hover:bg-violet-50/20'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    disabled={wouldExceed}
                                                    onChange={() => !wouldExceed && toggleRoll(roll.id)}
                                                    className="accent-violet-600 shrink-0 w-4 h-4"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-700">{roll._label}</p>
                                                    <p className="text-[10px] text-slate-500">Color: {roll._color}</p>
                                                </div>
                                                <span className={`text-sm font-bold shrink-0 ${isChecked ? 'text-violet-600' : 'text-slate-600'}`}>
                                                    {roll._stock} m
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Reserve button */}
                            {checkedRolls.size > 0 && (
                                <button
                                    onClick={handleReserveFabricRolls}
                                    disabled={busy === 'res_fabric'}
                                    className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-4 py-2.5 rounded-lg transition-colors"
                                >
                                    {busy === 'res_fabric' ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={12} />}
                                    Reserve {checkedRolls.size} Roll{checkedRolls.size !== 1 ? 's' : ''} ({checkedMeters.toFixed(2)} m)
                                </button>
                            )}
                        </div>
                    ) : stockItems.length > 0 ? (
                        /* ── TRIM: per-variant quantity input ── */
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Available Stock</p>
                            <div className="space-y-2">
                                {stockItems.map(item => (
                                    <div key={item.id} className={`border rounded-xl p-3 ${item._isExact ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-slate-50'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <p className="text-xs font-bold text-slate-700">
                                                    {item._label}
                                                    {item._isExact && (
                                                        <span className="ml-1.5 text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded border border-violet-200">Exact</span>
                                                    )}
                                                </p>
                                                <p className="text-[10px] text-slate-500">{item._stock} {unit} available</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number" min="0" max={item._stock} step="0.01"
                                                value={inputs[item.id] || ''}
                                                onChange={e => setInputs(p => ({ ...p, [item.id]: e.target.value }))}
                                                placeholder={`Amount (${unit})`}
                                                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400"
                                            />
                                            <button
                                                onClick={() => handleReserve(item.id)}
                                                disabled={!inputs[item.id] || busy === `res_${item.id}`}
                                                className="flex items-center gap-1 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                                            >
                                                {busy === `res_${item.id}` ? <Loader2 size={10} className="animate-spin" /> : <Bookmark size={10} />}
                                                Reserve
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 text-[11px] text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                            No stock available to reserve
                        </div>
                    )}

                    {/* Purchase order */}
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Purchase Order</p>

                        {purchaseReqs.length > 0 && (
                            <div className="space-y-1.5 mb-3">
                                {purchaseReqs.map(pr => (
                                    <div key={pr.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                                        <div>
                                            <p className="font-bold text-slate-700">PO #{pr.id}</p>
                                            <p className="text-amber-700 font-bold">
                                                {(isFabric ? pr.meters_required : pr.quantity_required)} {unit}
                                            </p>
                                            {pr.notes && <p className="text-slate-400 italic mt-0.5">{pr.notes}</p>}
                                        </div>
                                        <button
                                            onClick={() => handleDeletePurchase(pr.id)}
                                            disabled={busy === `delpurch_${pr.id}`}
                                            className="text-red-400 hover:text-red-600 p-1 rounded disabled:opacity-40"
                                        >
                                            {busy === `delpurch_${pr.id}` ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="number" min="0" step="0.01"
                                    value={purchaseAmt}
                                    onChange={e => setPurchaseAmt(e.target.value)}
                                    placeholder={`Amount needed (${unit})`}
                                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400"
                                />
                            </div>
                            <input
                                type="text"
                                value={purchaseNotes}
                                onChange={e => setPurchaseNotes(e.target.value)}
                                placeholder="Notes (optional)"
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400"
                            />
                            <button
                                onClick={handlePurchase}
                                disabled={!purchaseAmt || busy === 'purchase'}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 px-4 py-2 rounded-lg transition-colors"
                            >
                                {busy === 'purchase' ? <Loader2 size={12} className="animate-spin" /> : <ShoppingCart size={12} />}
                                Raise Purchase Order
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── RESERVATION SUMMARY MODAL ───────────────────────────────────────────────

const ReservationSummaryModal = ({ sopReqs, sop, orderInfo, onClose }) => {
    // ── Fabric: one row per reservation ──────────────────────────────────────
    const fabricRows = (sopReqs.fabric_requirements || []).flatMap(fr =>
        (fr.reservations || []).map(res => ({
            fabricType:  fr.fabric_type_name  || '—',
            colorName:   fr.color_name        || '—',
            colorNum:    fr.color_number      || '—',
            rollId:      res.fabric_roll_id,
            rollColor:   res.color_name       || res.roll_color || '—',
            rollMeter:   res.roll_meter != null ? parseFloat(res.roll_meter).toFixed(2) : '—',
            mRequired:   parseFloat(fr.meters_required  || 0).toFixed(2),
            mReserved:   res.meters_reserved != null ? parseFloat(res.meters_reserved).toFixed(2) : '—',
            status:      fr.status || '—',
        }))
    );

    // ── Trim: one row per reservation ────────────────────────────────────────
    const trimRows = (sopReqs.trim_requirements || []).flatMap(tr =>
        (tr.reservations || []).map(res => ({
            item:        tr.trim_item_name    || '—',
            itemCode:    tr.item_code         || '—',
            colorName:   tr.color_name        || 'All',
            colorNum:    tr.color_number      || '—',
            variantId:   res.trim_item_variant_id,
            variantName: res.variant_name     || res.color_name || '—',
            variantColor:res.color_number     || '—',
            qRequired:   parseFloat(tr.quantity_required || 0).toFixed(2),
            qReserved:   res.quantity_reserved != null ? parseFloat(res.quantity_reserved).toFixed(2) : '—',
            unit:        tr.unit_of_measure   || 'pcs',
            status:      tr.status            || '—',
        }))
    );

    const totalCount = fabricRows.length + trimRows.length;

    // ── CSV: two sections ─────────────────────────────────────────────────────
    const handleDownloadCSV = () => {
        const lines = [];
        if (fabricRows.length > 0) {
            lines.push(['--- FABRIC RESERVATIONS ---']);
            lines.push(['Fabric Type', 'Color', 'Color #', 'Roll #', 'Roll Color', 'Roll Meter (m)', 'Required (m)', 'Reserved (m)', 'Status']);
            fabricRows.forEach(r => lines.push([r.fabricType, r.colorName, r.colorNum, `Roll #${r.rollId}`, r.rollColor, r.rollMeter, r.mRequired, r.mReserved, r.status]));
            lines.push([]);
        }
        if (trimRows.length > 0) {
            lines.push(['--- TRIM RESERVATIONS ---']);
            lines.push(['Item', 'Item Code', 'Color', 'Color #', 'Variant #', 'Variant Name', 'Variant Color #', 'Required', 'Reserved', 'Unit', 'Status']);
            trimRows.forEach(r => lines.push([r.item, r.itemCode, r.colorName, r.colorNum, `#${r.variantId}`, r.variantName, r.variantColor, r.qRequired, r.qReserved, r.unit, r.status]));
        }
        const csv = lines.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'reservations.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    // ── PDF: header + two tables ──────────────────────────────────────────────
    const handleDownloadPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        let y = 14;

        // Sales order header
        if (orderInfo) {
            doc.setFontSize(13); doc.setFont(undefined, 'bold');
            doc.text(`Sales Order: #${orderInfo.order_number || '—'}`, 14, y); y += 7;
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
            doc.text([
                `Customer: ${orderInfo.customer_name || orderInfo.buyer_name || '—'}`,
                `Status: ${orderInfo.status || '—'}`,
                `Delivery: ${orderInfo.delivery_date ? new Date(orderInfo.delivery_date).toLocaleDateString() : '—'}`,
                orderInfo.buyer_po_number ? `PO: ${orderInfo.buyer_po_number}` : '',
            ].filter(Boolean).join('   |   '), 14, y); y += 6;
        }

        // Product / SOP header
        if (sop) {
            doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
            doc.text(`Product: ${sop.product_name || '—'}`, 14, y); y += 6;
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
            const sopMeta = [
                sop.bom_name   ? `BOM: ${sop.bom_name}`           : '',
                sop.fabric_type_name ? `Fabric: ${sop.fabric_type_name}` : '',
            ].filter(Boolean).join('   |   ');
            if (sopMeta) { doc.text(sopMeta, 14, y); y += 6; }
            const colorSummary = (sop.colors || []).map(c =>
                `${c.color_name || c.color_number || '?'}: ${(c.quantity || c.total_quantity || 0).toLocaleString()} pcs`
            ).join('   ');
            if (colorSummary) { doc.text(`Colors: ${colorSummary}`, 14, y); y += 6; }
        }

        // Finalized plan items
        const planItems = sopReqs.production_plan_items || [];
        if (planItems.length > 0) {
            const totalPcs = planItems.reduce((s, p) => s + (p.finalized_quantity || 0), 0);
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
            const planText = planItems.map(p =>
                `${p.color_name || p.color_number}: ${(p.finalized_quantity || 0).toLocaleString()} pcs (${p.marker_runs} runs)`
            ).join('   |   ');
            doc.text(`Finalized: ${planText}   →   Total: ${totalPcs.toLocaleString()} pcs`, 14, y); y += 8;
        }

        doc.setTextColor(0);

        // Fabric table
        if (fabricRows.length > 0) {
            doc.setFontSize(10); doc.setFont(undefined, 'bold');
            doc.text('Fabric Reservations', 14, y); y += 3;
            autoTable(doc, {
                startY: y,
                head: [['Fabric Type', 'Color', 'Color #', 'Roll #', 'Roll Color', 'Roll Total (m)', 'Required (m)', 'Reserved (m)', 'Status']],
                body: fabricRows.map(r => [r.fabricType, r.colorName, r.colorNum, `Roll #${r.rollId}`, r.rollColor, r.rollMeter, r.mRequired, r.mReserved, r.status]),
                styles:     { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [238, 242, 255] },
            });
            y = doc.lastAutoTable.finalY + 8;
        }

        // Trim table
        if (trimRows.length > 0) {
            doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
            doc.text('Trim Reservations', 14, y); y += 3;
            autoTable(doc, {
                startY: y,
                head: [['Item', 'Item Code', 'Color', 'Color #', 'Variant #', 'Variant Name', 'Variant Color #', 'Required', 'Reserved', 'Unit', 'Status']],
                body: trimRows.map(r => [r.item, r.itemCode, r.colorName, r.colorNum, `#${r.variantId}`, r.variantName, r.variantColor, r.qRequired, r.qReserved, r.unit, r.status]),
                styles:     { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [255, 251, 235] },
            });
        }

        doc.save('reservations.pdf');
    };

    const SectionTable = ({ headers, rows, cols }) => (
        <table className="w-full text-xs border-collapse">
            <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                    {headers.map(h => (
                        <th key={h} className="text-left py-2 px-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        {cols(r)}
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Summary</p>
                        <h2 className="font-extrabold text-slate-800 text-base">Reserved Stock</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{totalCount} reservation{totalCount !== 1 ? 's' : ''}{sop ? ` · ${sop.product_name}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadCSV}
                            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                            <Download size={12} /> CSV
                        </button>
                        <button onClick={handleDownloadPDF}
                            className="flex items-center gap-1.5 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
                            <Printer size={12} /> PDF
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 ml-1"><X size={18} /></button>
                    </div>
                </div>

                {/* Order + product info strip */}
                {(orderInfo || sop) && (
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
                        {orderInfo?.order_number && <span><b>Order:</b> #{orderInfo.order_number}</span>}
                        {(orderInfo?.customer_name || orderInfo?.buyer_name) && <span><b>Customer:</b> {orderInfo.customer_name || orderInfo.buyer_name}</span>}
                        {orderInfo?.delivery_date && <span><b>Delivery:</b> {new Date(orderInfo.delivery_date).toLocaleDateString()}</span>}
                        {sop?.product_name && <span><b>Product:</b> {sop.product_name}</span>}
                        {sop?.bom_name     && <span><b>BOM:</b> {sop.bom_name}</span>}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {totalCount === 0 && (
                        <p className="text-sm text-slate-400 text-center py-10 italic">No reservations yet.</p>
                    )}

                    {/* Fabric section */}
                    {fabricRows.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                                Fabric Reservations ({fabricRows.length})
                            </p>
                            <div className="overflow-x-auto">
                                <SectionTable
                                    headers={['Fabric Type', 'Color', 'Color #', 'Roll #', 'Roll Color', 'Roll Total (m)', 'Required (m)', 'Reserved (m)', 'Status']}
                                    rows={fabricRows}
                                    cols={r => <>
                                        <td className="py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">{r.fabricType}</td>
                                        <td className="py-2 px-2 text-slate-600">{r.colorName}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.colorNum}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500 whitespace-nowrap">Roll #{r.rollId}</td>
                                        <td className="py-2 px-2 text-slate-500">{r.rollColor}</td>
                                        <td className="py-2 px-2 text-slate-500">{r.rollMeter}</td>
                                        <td className="py-2 px-2 text-slate-500">{r.mRequired}</td>
                                        <td className="py-2 px-2 font-bold text-emerald-700">{r.mReserved}</td>
                                        <td className="py-2 px-2 whitespace-nowrap"><ReqStatusPill status={r.status} /></td>
                                    </>}
                                />
                            </div>
                        </div>
                    )}

                    {/* Trim section */}
                    {trimRows.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                Trim Reservations ({trimRows.length})
                            </p>
                            <div className="overflow-x-auto">
                                <SectionTable
                                    headers={['Item', 'Item Code', 'Color', 'Color #', 'Variant #', 'Variant Name', 'Variant Color #', 'Required', 'Reserved', 'Unit', 'Status']}
                                    rows={trimRows}
                                    cols={r => <>
                                        <td className="py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">{r.item}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.itemCode}</td>
                                        <td className="py-2 px-2 text-slate-600">{r.colorName}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.colorNum}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">#{r.variantId}</td>
                                        <td className="py-2 px-2 text-slate-600">{r.variantName}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.variantColor}</td>
                                        <td className="py-2 px-2 text-slate-500">{r.qRequired}</td>
                                        <td className="py-2 px-2 font-bold text-emerald-700">{r.qReserved}</td>
                                        <td className="py-2 px-2 text-slate-400">{r.unit}</td>
                                        <td className="py-2 px-2 whitespace-nowrap"><ReqStatusPill status={r.status} /></td>
                                    </>}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── PURCHASE ORDER SUMMARY MODAL ─────────────────────────────────────────────

const PurchaseSummaryModal = ({ sopReqs, sop, orderInfo, onClose }) => {
    const fabricRows = (sopReqs.fabric_requirements || []).flatMap(fr =>
        (fr.purchase_requirements || []).map(pr => ({
            fabricType: fr.fabric_type_name || '—',
            colorName:  fr.color_name       || '—',
            colorNum:   fr.color_number     || '—',
            mRequired:  parseFloat(fr.meters_required || 0).toFixed(2),
            mReserved:  parseFloat(fr.meters_reserved || 0).toFixed(2),
            qty:        pr.meters_required  != null ? parseFloat(pr.meters_required).toFixed(2)  : '—',
            notes:      pr.notes || '—',
            poId:       pr.id,
            status:     fr.status || '—',
        }))
    );
    const trimRows = (sopReqs.trim_requirements || []).flatMap(tr =>
        (tr.purchase_requirements || []).map(pr => ({
            item:      tr.trim_item_name    || '—',
            itemCode:  tr.item_code         || '—',
            colorName: tr.color_name        || 'All',
            colorNum:  tr.color_number      || '—',
            qRequired: parseFloat(tr.quantity_required || 0).toFixed(2),
            qReserved: parseFloat(tr.quantity_reserved || 0).toFixed(2),
            qty:       pr.quantity_required != null ? parseFloat(pr.quantity_required).toFixed(2) : '—',
            unit:      tr.unit_of_measure   || 'pcs',
            notes:     pr.notes || '—',
            poId:      pr.id,
            status:    tr.status || '—',
        }))
    );

    const totalCount = fabricRows.length + trimRows.length;

    const handleDownloadCSV = () => {
        const lines = [];
        if (fabricRows.length > 0) {
            lines.push(['--- FABRIC PURCHASE ORDERS ---']);
            lines.push(['Fabric Type', 'Color', 'Color #', 'Total Required (m)', 'Already Reserved (m)', 'PO Qty (m)', 'Notes', 'PO #', 'Status']);
            fabricRows.forEach(r => lines.push([r.fabricType, r.colorName, r.colorNum, r.mRequired, r.mReserved, r.qty, r.notes, `#${r.poId}`, r.status]));
            lines.push([]);
        }
        if (trimRows.length > 0) {
            lines.push(['--- TRIM PURCHASE ORDERS ---']);
            lines.push(['Item', 'Item Code', 'Color', 'Color #', 'Total Required', 'Already Reserved', 'PO Qty', 'Unit', 'Notes', 'PO #', 'Status']);
            trimRows.forEach(r => lines.push([r.item, r.itemCode, r.colorName, r.colorNum, r.qRequired, r.qReserved, r.qty, r.unit, r.notes, `#${r.poId}`, r.status]));
        }
        const csv = lines.map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'purchase_orders.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        let y = 14;

        if (orderInfo) {
            doc.setFontSize(13); doc.setFont(undefined, 'bold');
            doc.text(`Sales Order: #${orderInfo.order_number || '—'}`, 14, y); y += 7;
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
            doc.text([
                `Customer: ${orderInfo.customer_name || orderInfo.buyer_name || '—'}`,
                `Status: ${orderInfo.status || '—'}`,
                `Delivery: ${orderInfo.delivery_date ? new Date(orderInfo.delivery_date).toLocaleDateString() : '—'}`,
                orderInfo.buyer_po_number ? `PO: ${orderInfo.buyer_po_number}` : '',
            ].filter(Boolean).join('   |   '), 14, y); y += 6;
        }

        if (sop) {
            doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
            doc.text(`Product: ${sop.product_name || '—'}`, 14, y); y += 6;
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
            const sopMeta = [
                sop.bom_name        ? `BOM: ${sop.bom_name}`              : '',
                sop.fabric_type_name ? `Fabric: ${sop.fabric_type_name}` : '',
            ].filter(Boolean).join('   |   ');
            if (sopMeta) { doc.text(sopMeta, 14, y); y += 6; }
            const colorSummary = (sop.colors || []).map(c =>
                `${c.color_name || c.color_number || '?'}: ${(c.quantity || c.total_quantity || 0).toLocaleString()} pcs`
            ).join('   ');
            if (colorSummary) { doc.text(`Colors: ${colorSummary}`, 14, y); y += 6; }
        }

        const planItems = sopReqs.production_plan_items || [];
        if (planItems.length > 0) {
            const totalPcs = planItems.reduce((s, p) => s + (p.finalized_quantity || 0), 0);
            doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
            doc.text(`Finalized: ${planItems.map(p => `${p.color_name || p.color_number}: ${(p.finalized_quantity || 0).toLocaleString()} pcs`).join('   |   ')}   →   Total: ${totalPcs.toLocaleString()} pcs`, 14, y);
            y += 8;
        }

        doc.setTextColor(0);

        if (fabricRows.length > 0) {
            doc.setFontSize(10); doc.setFont(undefined, 'bold');
            doc.text('Fabric Purchase Orders', 14, y); y += 3;
            autoTable(doc, {
                startY: y,
                head: [['Fabric Type', 'Color', 'Color #', 'Total Req (m)', 'Reserved (m)', 'PO Qty (m)', 'Notes', 'PO #', 'Status']],
                body: fabricRows.map(r => [r.fabricType, r.colorName, r.colorNum, r.mRequired, r.mReserved, r.qty, r.notes, `#${r.poId}`, r.status]),
                styles:     { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [238, 242, 255] },
            });
            y = doc.lastAutoTable.finalY + 8;
        }

        if (trimRows.length > 0) {
            doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(0);
            doc.text('Trim Purchase Orders', 14, y); y += 3;
            autoTable(doc, {
                startY: y,
                head: [['Item', 'Item Code', 'Color', 'Color #', 'Total Req', 'Reserved', 'PO Qty', 'Unit', 'Notes', 'PO #', 'Status']],
                body: trimRows.map(r => [r.item, r.itemCode, r.colorName, r.colorNum, r.qRequired, r.qReserved, r.qty, r.unit, r.notes, `#${r.poId}`, r.status]),
                styles:     { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [255, 251, 235] },
            });
        }

        doc.save('purchase_orders.pdf');
    };

    const SectionTable = ({ headers, rows, cols }) => (
        <table className="w-full text-xs border-collapse">
            <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                    {headers.map(h => (
                        <th key={h} className="text-left py-2 px-2 font-bold text-slate-500 text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        {cols(r)}
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Summary</p>
                        <h2 className="font-extrabold text-slate-800 text-base">Purchase Orders</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{totalCount} PO line{totalCount !== 1 ? 's' : ''}{sop ? ` · ${sop.product_name}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadCSV}
                            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                            <Download size={12} /> CSV
                        </button>
                        <button onClick={handleDownloadPDF}
                            className="flex items-center gap-1.5 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
                            <Printer size={12} /> PDF
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 ml-1"><X size={18} /></button>
                    </div>
                </div>

                {(orderInfo || sop) && (
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
                        {orderInfo?.order_number && <span><b>Order:</b> #{orderInfo.order_number}</span>}
                        {(orderInfo?.customer_name || orderInfo?.buyer_name) && <span><b>Customer:</b> {orderInfo.customer_name || orderInfo.buyer_name}</span>}
                        {orderInfo?.delivery_date && <span><b>Delivery:</b> {new Date(orderInfo.delivery_date).toLocaleDateString()}</span>}
                        {sop?.product_name && <span><b>Product:</b> {sop.product_name}</span>}
                        {sop?.bom_name     && <span><b>BOM:</b> {sop.bom_name}</span>}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {totalCount === 0 && (
                        <p className="text-sm text-slate-400 text-center py-10 italic">No purchase orders raised yet.</p>
                    )}

                    {fabricRows.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                                Fabric POs ({fabricRows.length})
                            </p>
                            <div className="overflow-x-auto">
                                <SectionTable
                                    headers={['Fabric Type', 'Color', 'Color #', 'Total Req (m)', 'Reserved (m)', 'PO Qty (m)', 'Notes', 'PO #', 'Status']}
                                    rows={fabricRows}
                                    cols={r => <>
                                        <td className="py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">{r.fabricType}</td>
                                        <td className="py-2 px-2 text-slate-600">{r.colorName}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.colorNum}</td>
                                        <td className="py-2 px-2 text-slate-500">{r.mRequired}</td>
                                        <td className="py-2 px-2 text-emerald-600 font-medium">{r.mReserved}</td>
                                        <td className="py-2 px-2 font-bold text-amber-700">{r.qty}</td>
                                        <td className="py-2 px-2 text-slate-400 italic">{r.notes}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-400">#{r.poId}</td>
                                        <td className="py-2 px-2 whitespace-nowrap"><ReqStatusPill status={r.status} /></td>
                                    </>}
                                />
                            </div>
                        </div>
                    )}

                    {trimRows.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                Trim POs ({trimRows.length})
                            </p>
                            <div className="overflow-x-auto">
                                <SectionTable
                                    headers={['Item', 'Item Code', 'Color', 'Color #', 'Total Req', 'Reserved', 'PO Qty', 'Unit', 'Notes', 'PO #', 'Status']}
                                    rows={trimRows}
                                    cols={r => <>
                                        <td className="py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">{r.item}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.itemCode}</td>
                                        <td className="py-2 px-2 text-slate-600">{r.colorName}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-500">{r.colorNum}</td>
                                        <td className="py-2 px-2 text-slate-500">{r.qRequired}</td>
                                        <td className="py-2 px-2 text-emerald-600 font-medium">{r.qReserved}</td>
                                        <td className="py-2 px-2 font-bold text-amber-700">{r.qty}</td>
                                        <td className="py-2 px-2 text-slate-400">{r.unit}</td>
                                        <td className="py-2 px-2 text-slate-400 italic">{r.notes}</td>
                                        <td className="py-2 px-2 font-mono text-[10px] text-slate-400">#{r.poId}</td>
                                        <td className="py-2 px-2 whitespace-nowrap"><ReqStatusPill status={r.status} /></td>
                                    </>}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── SOP CARD (product → BOM link) ────────────────────────────────────────────

// gcd helper for ratio simplification
const _gcd = (a, b) => (b === 0 ? a : _gcd(b, a % b));

const SopCard = ({ sop, bomOptions, onLink, onUnlink, onPreview, isLinking, onCalculate, calcKey = 0, orderInfo }) => {
    const [showPicker,     setShowPicker]     = useState(false);
    const [pickedBomId,    setPickedBomId]    = useState('');
    const [selectedRgIdxs, setSelectedRgIdxs] = useState(new Set());
    const [confirmUnlink,  setConfirmUnlink]  = useState(false);
    // Full BOM detail (with items + number_of_pieces) fetched on pick
    const [pickedBomDetail,   setPickedBomDetail]   = useState(null);
    const [loadingBomDetail,  setLoadingBomDetail]  = useState(false);
    // Per-SOP requirements (auto-fetched, refreshed after each calculate or reservation)
    const [sopReqs,         setSopReqs]         = useState(null);
    const [loadingReqs,     setLoadingReqs]     = useState(false);
    const [reqsRefreshKey,  setReqsRefreshKey]  = useState(0);
    const [showReqs,        setShowReqs]        = useState(false);
    const [reservingReq,    setReservingReq]    = useState(null); // { id, reqType }
    const [showResvSummary, setShowResvSummary] = useState(false);
    const [showPoSummary,   setShowPoSummary]   = useState(false);

    useEffect(() => {
        if (!sop.bom_id) return;
        setLoadingReqs(true);
        planningApi.getRequirements(sop.id)
        .then(r => {
            console.log("Received data:", r); // Logs the full response object
            // console.log("Extracted data:", r.data?.data ?? r.data); // Use this to see exactly what is being set
            setSopReqs(r.data?.data ?? r.data);
        })
        .catch(() => setSopReqs(null))
        .finally(() => setLoadingReqs(false));
    }, [sop.bom_id, sop.id, calcKey, reqsRefreshKey]);

    // Derive the currently-open requirement from fresh sopReqs (so modal reflects updates)
    const activeReq = reservingReq
        ? (reservingReq.reqType === 'fabric'
            ? (sopReqs?.fabric_requirements || []).find(r => String(r.id) === String(reservingReq.id))
            : (sopReqs?.trim_requirements   || []).find(r => String(r.id) === String(reservingReq.id)))
        : null;

    const linkedBomDetail = bomOptions.find(b => b.id === sop.bom_id);
    const totalQty        = (sop.colors || []).reduce((s, c) => s + (c.quantity || c.total_quantity || 0), 0);
    const sizeEntries     = Object.entries(sop.size_breakdown || {}).filter(([, v]) => parseInt(v) > 0);

    // Order: simplified ratio per size
    const requiredSizesSet = new Set(sizeEntries.map(([s]) => stdSize(s)));
    const requiredSizes    = Array.from(requiredSizesSet).sort();
    const rawQtys          = sizeEntries.map(([, v]) => parseInt(v) || 1);
    const commonGcd        = rawQtys.length > 0 ? rawQtys.reduce(_gcd) : 1;
    const sizeRatioMap     = Object.fromEntries(
        sizeEntries.map(([s, v]) => [stdSize(s), Math.round(parseInt(v) / commonGcd)])
    );

    // Union — use detailed items (number_of_pieces) when available; fall back to flat sizes list
    const detailGroups = pickedBomDetail?.ratio_groups || null;
    const unionSizesSet = new Set();
    const unionRawMap   = {};
    if (detailGroups) {
        detailGroups.forEach((rg, idx) => {
            if (!selectedRgIdxs.has(idx)) return;
            (rg.items || []).forEach(it => {
                const s = stdSize(it.size || '');
                if (!s) return;
                unionSizesSet.add(s);
                unionRawMap[s] = (unionRawMap[s] || 0) + (parseInt(it.number_of_pieces) || 1);
            });
        });
    } else {
        // Detail not yet loaded — use flat sizes from list (no piece counts)
        const listBom = bomOptions.find(b => String(b.id) === pickedBomId);
        (listBom?.ratio_groups || []).forEach((rg, idx) => {
            if (!selectedRgIdxs.has(idx)) return;
            (rg.sizes || []).forEach(s => {
                const norm = stdSize(s);
                if (norm) unionSizesSet.add(norm);
            });
        });
    }

    const unionSizes    = Array.from(unionSizesSet).sort();
    const unionRawQtys  = Object.values(unionRawMap);
    const unionGcd      = unionRawQtys.length > 0 ? unionRawQtys.reduce(_gcd) : 1;
    const unionRatioMap = Object.fromEntries(
        Object.entries(unionRawMap).map(([s, v]) => [s, Math.round(v / unionGcd)])
    );

    const hasDetailData   = detailGroups !== null;
    const missingSizes    = requiredSizes.filter(s => !unionSizesSet.has(s));
    const extraSizes      = unionSizes.filter(s => !requiredSizesSet.has(s));
    const sizesOnlyMatch  = missingSizes.length === 0 && extraSizes.length === 0 && unionSizes.length > 0;
    const ratioMismatches = (hasDetailData && sizesOnlyMatch)
        ? requiredSizes.filter(s => (sizeRatioMap[s] ?? 0) !== (unionRatioMap[s] ?? 0))
        : [];
    const isMatch = sizesOnlyMatch && ratioMismatches.length === 0 && selectedRgIdxs.size > 0 && hasDetailData;

    const pickBom = async (bomId) => {
        setPickedBomId(bomId);
        setPickedBomDetail(null);
        const listBom = bomOptions.find(b => String(b.id) === bomId);
        // Pre-select all groups from list data while detail loads
        setSelectedRgIdxs(new Set((listBom?.ratio_groups || []).map((_, i) => i)));
        setLoadingBomDetail(true);
        try {
            const res    = await bomApi.getById(parseInt(bomId));
            const detail = res.data?.data ?? res.data;
            setPickedBomDetail(detail);
            setSelectedRgIdxs(new Set((detail?.ratio_groups || []).map((_, i) => i)));
        } catch {
            // keep list data as fallback
        } finally {
            setLoadingBomDetail(false);
        }
    };

    const toggleRg = (idx) => setSelectedRgIdxs(prev => {
        const next = new Set(prev);
        next.has(idx) ? next.delete(idx) : next.add(idx);
        return next;
    });

    const confirmLink = () => {
        if (!pickedBomId || !isMatch) return;
        const selectedRgIds = (detailGroups || [])
            .filter((_, i) => selectedRgIdxs.has(i))
            .map(rg => rg.ratio_group_id || rg.id)
            .filter(Boolean);
        onLink(sop.id, parseInt(pickedBomId, 10), selectedRgIds);
        setShowPicker(false);
        setPickedBomId('');
        setSelectedRgIdxs(new Set());
        setPickedBomDetail(null);
    };

    const doUnlink = () => {
        setConfirmUnlink(false);
        onUnlink(sop.id);
    };

    return (
        <div className={`border rounded-xl overflow-hidden transition-colors ${sop.bom_id ? 'border-emerald-200' : 'border-slate-200'}`}>

            <div className={`flex items-center justify-between gap-3 px-4 py-3 ${sop.bom_id ? 'bg-emerald-50/50' : 'bg-slate-50'}`}>
                <div>
                    <p className="font-bold text-slate-800 text-sm">{sop.product_name}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-0.5">
                        {sop.fabric_type_name && (
                            <span className="text-[10px] text-slate-500">{sop.fabric_type_name}</span>
                        )}
                        <span className="text-[10px] text-slate-400">
                            {sop.colors?.length || 0} color{(sop.colors?.length || 0) !== 1 ? 's' : ''} · {totalQty.toLocaleString()} pcs
                        </span>
                    </div>
                    {sizeEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {sizeEntries.map(([size, qty]) => (
                                <span key={size} className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-bold" title={`Mapped to: ${stdSize(size)}`}>
                                    {size}×{qty}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {sop.bom_id ? (
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={9} /> BOM Linked
                    </span>
                ) : (
                    <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0">
                        <AlertTriangle size={9} /> No BOM
                    </span>
                )}
            </div>

            {(sop.colors || []).length > 0 && (
                <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {sop.colors.map(c => (
                        <span key={c.fabric_color_id}
                            className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">
                            {c.color_number || c.color_name}
                            {c.color_number && c.color_name && (
                                <span className="font-normal text-indigo-400 ml-1">#{c.color_name}</span>
                            )}
                            {' '}· {(c.quantity || c.total_quantity || 0).toLocaleString()} pcs
                        </span>
                    ))}
                </div>
            )}

            <div className="px-4 py-3 border-t border-slate-100">
                {sop.bom_id ? (
                    <>
                        <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                            <div className="flex items-start gap-2 min-w-0">
                                <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-bold text-emerald-900 text-sm">{sop.bom_name}</p>
                                        <button
                                            onClick={() => onPreview(sop.bom_id)}
                                            className="text-emerald-500 hover:text-emerald-700 transition-colors"
                                            title="Preview BOM"
                                        >
                                            <Eye size={13} />
                                        </button>
                                    </div>
                                    {(linkedBomDetail?.ratio_groups || []).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {linkedBomDetail.ratio_groups.map((rg, i) => (
                                                <span key={i}
                                                    className="text-[9px] bg-white text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                                    {rg.ratio_group_name}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isLinking ? (
                                <Loader2 size={14} className="animate-spin text-slate-400 shrink-0 mt-0.5" />
                            ) : !confirmUnlink ? (
                                <button
                                    onClick={() => setConfirmUnlink(true)}
                                    className="text-[10px] text-slate-400 hover:text-red-600 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors shrink-0"
                                >
                                    <X size={11} /> Unlink
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-slate-600 font-medium">Remove?</span>
                                    <button onClick={doUnlink}
                                        className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">
                                        Yes
                                    </button>
                                    <button onClick={() => setConfirmUnlink(false)}
                                        className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors">
                                        No
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            {loadingReqs && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Loader2 size={10} className="animate-spin" /> Loading requirements…
                                </span>
                            )}
                            <button
                                onClick={() => onCalculate(sop.id)}
                                className="ml-auto flex items-center gap-1.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                <Calculator size={12} />
                                {sopReqs ? 'Recalculate' : 'Calculate Requirements'}
                            </button>
                        </div>
                    </>
                ) : (
                    !showPicker ? (
                        <button
                            onClick={() => setShowPicker(true)}
                            disabled={isLinking}
                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 border-dashed px-3 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                        >
                            {isLinking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                            Link a BOM
                        </button>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-xs font-bold text-slate-700">Select an approved BOM to validate sizes:</p>
                                <button onClick={() => { setShowPicker(false); setPickedBomId(''); }}
                                    className="text-slate-400 hover:text-slate-600 p-0.5">
                                    <X size={14} />
                                </button>
                            </div>

                            {bomOptions.length === 0 ? (
                                <div className="text-center py-5 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    No approved BOMs available for this product
                                </div>
                            ) : (
                                <>
                                    {/* ── Order required sizes with ratio ── */}
                                    <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Order Requires</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {sizeEntries.length === 0
                                                ? <span className="text-[10px] text-slate-400 italic">No size breakdown available</span>
                                                : sizeEntries.map(([rawSize, qty]) => {
                                                    const s = stdSize(rawSize);
                                                    const ratio = sizeRatioMap[s] ?? 1;
                                                    return (
                                                        <span key={s} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 shadow-sm">
                                                            <span className="text-slate-500">{s}</span>
                                                            <span className="text-slate-300">·</span>
                                                            <span className="text-violet-600">×{ratio}</span>
                                                            <span className="text-[9px] font-normal text-slate-400">({parseInt(qty).toLocaleString()} pcs)</span>
                                                        </span>
                                                    );
                                                })
                                            }
                                        </div>
                                    </div>

                                    {/* ── BOM list ── */}
                                    <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
                                        {bomOptions.map(bom => {
                                            const isSelected = pickedBomId === String(bom.id);
                                            return (
                                                <div key={bom.id} className={`rounded-xl border transition-all ${
                                                    isSelected ? 'border-violet-400 bg-violet-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/20'
                                                }`}>
                                                    <label className="flex items-start gap-3 p-3 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name={`bom-pick-${sop.id}`}
                                                            value={bom.id}
                                                            checked={isSelected}
                                                            onChange={() => pickBom(String(bom.id))}
                                                            className="mt-0.5 accent-violet-600 shrink-0"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-1">
                                                                <p className="font-bold text-slate-800 text-sm truncate">{bom.bom_name}</p>
                                                                <button
                                                                    onClick={e => { e.preventDefault(); e.stopPropagation(); onPreview(bom.id); }}
                                                                    className="shrink-0 text-slate-400 hover:text-violet-600 transition-colors p-0.5"
                                                                    title="Preview BOM"
                                                                >
                                                                    <Eye size={13} />
                                                                </button>
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                                {(bom.ratio_groups || []).length} ratio group{(bom.ratio_groups || []).length !== 1 ? 's' : ''}
                                                            </p>
                                                        </div>
                                                    </label>

                                                    {isSelected && (
                                                        <div className="border-t border-violet-100 bg-white p-3 mx-1 mb-1 rounded-b-lg space-y-3">

                                                            {/* Ratio group checkboxes */}
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                                                    Select Ratio Groups to Include in Union
                                                                </p>
                                                                {loadingBomDetail ? (
                                                                    <div className="flex items-center gap-2 py-3 text-[11px] text-slate-400">
                                                                        <Loader2 size={12} className="animate-spin" /> Loading ratio group details…
                                                                    </div>
                                                                ) : (
                                                                <div className="space-y-1.5">
                                                                    {(detailGroups || bom.ratio_groups || []).map((rg, rgIdx) => {
                                                                        const checked  = selectedRgIdxs.has(rgIdx);
                                                                        // items with number_of_pieces only exist in detailed response
                                                                        const rgItems  = rg.items || [];
                                                                        const rgSizes  = rgItems.length > 0
                                                                            ? rgItems.map(it => stdSize(it.size || '')).filter(Boolean)
                                                                            : (rg.sizes || []).map(s => stdSize(s)).filter(Boolean);
                                                                        const rgPieces = Object.fromEntries(
                                                                            rgItems.map(it => [stdSize(it.size || ''), parseInt(it.number_of_pieces) || 1])
                                                                        );
                                                                        return (
                                                                            <label key={rgIdx}
                                                                                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                                                                                    checked
                                                                                        ? 'bg-violet-50 border-violet-200'
                                                                                        : 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-80'
                                                                                }`}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={checked}
                                                                                    onChange={() => toggleRg(rgIdx)}
                                                                                    className="mt-0.5 accent-violet-600 shrink-0"
                                                                                />
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-xs font-bold text-slate-700">
                                                                                        {rg.ratio_group_name || `Group ${rgIdx + 1}`}
                                                                                        {rg.marker_length_inches && (
                                                                                            <span className="ml-1.5 text-[9px] font-normal text-slate-400">{rg.marker_length_inches}" marker</span>
                                                                                        )}
                                                                                    </p>
                                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                                        {rgSizes.length === 0
                                                                                            ? <span className="text-[9px] text-slate-400 italic">No sizes</span>
                                                                                            : rgSizes.map(s => (
                                                                                                <span key={s} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                                                                                    checked
                                                                                                        ? 'bg-violet-100 text-violet-700 border-violet-200'
                                                                                                        : 'bg-white text-slate-500 border-slate-200'
                                                                                                }`}>
                                                                                                    {s}{rgPieces[s] ? `×${rgPieces[s]}` : ''}
                                                                                                </span>
                                                                                            ))
                                                                                        }
                                                                                    </div>
                                                                                </div>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                                )}
                                                            </div>

                                                            {/* Union comparison table */}
                                                            <div className="border-t border-slate-100 pt-3">
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                                    Size Ratio Comparison
                                                                </p>
                                                                {selectedRgIdxs.size === 0 ? (
                                                                    <p className="text-[10px] text-slate-400 italic">Select at least one group above</p>
                                                                ) : (
                                                                    <table className="w-full text-[10px] border-collapse">
                                                                        <thead>
                                                                            <tr className="border-b border-slate-200">
                                                                                <th className="text-left py-1 pr-2 font-bold text-slate-400 uppercase">Size</th>
                                                                                <th className="text-center py-1 px-2 font-bold text-slate-400 uppercase">Order Ratio</th>
                                                                                <th className="text-center py-1 px-2 font-bold text-slate-400 uppercase">BOM Union</th>
                                                                                <th className="text-center py-1 pl-2 font-bold text-slate-400 uppercase">Match</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {/* Ordered sizes */}
                                                                            {requiredSizes.map(s => {
                                                                                const orderR = sizeRatioMap[s] ?? 0;
                                                                                const unionR = unionRatioMap[s] ?? null;
                                                                                const present = unionSizesSet.has(s);
                                                                                const ratioOk = present && orderR === unionR;
                                                                                return (
                                                                                    <tr key={s} className="border-b border-slate-50">
                                                                                        <td className="py-1.5 pr-2 font-bold text-slate-700">{s}</td>
                                                                                        <td className="py-1.5 px-2 text-center">
                                                                                            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded font-bold">
                                                                                                ×{orderR}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="py-1.5 px-2 text-center">
                                                                                            {present ? (
                                                                                                <span className={`px-1.5 py-0.5 rounded font-bold border ${
                                                                                                    ratioOk
                                                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                                                        : 'bg-red-50 text-red-600 border-red-200'
                                                                                                }`}>
                                                                                                    ×{unionR}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="text-red-400 italic">missing</span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="py-1.5 pl-2 text-center">
                                                                                            {ratioOk
                                                                                                ? <CheckCircle2 size={12} className="text-emerald-500 mx-auto" />
                                                                                                : <AlertTriangle size={12} className="text-red-500 mx-auto" />
                                                                                            }
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                            {/* Extra sizes not in order */}
                                                                            {extraSizes.map(s => (
                                                                                <tr key={s} className="border-b border-slate-50 opacity-70">
                                                                                    <td className="py-1.5 pr-2 font-bold text-amber-600">{s}</td>
                                                                                    <td className="py-1.5 px-2 text-center">
                                                                                        <span className="text-slate-400 italic text-[9px]">not ordered</span>
                                                                                    </td>
                                                                                    <td className="py-1.5 px-2 text-center">
                                                                                        <span className="bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                                                                                            ×{unionRatioMap[s] ?? '?'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="py-1.5 pl-2 text-center">
                                                                                        <AlertTriangle size={12} className="text-amber-400 mx-auto" />
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>

                                                            {/* Match verdict */}
                                                            {selectedRgIdxs.size > 0 && (
                                                                <div className="space-y-1.5">
                                                                    {isMatch && (
                                                                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                                                                            <CheckCircle2 size={13} className="shrink-0" />
                                                                            <span><b>Perfect match —</b> sizes and ratios align exactly.</span>
                                                                        </div>
                                                                    )}
                                                                    {missingSizes.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span><b>Missing sizes:</b> {missingSizes.join(', ')} — order cannot be fully fulfilled</span>
                                                                        </div>
                                                                    )}
                                                                    {ratioMismatches.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 text-[11px] text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span><b>Ratio mismatch:</b> {ratioMismatches.join(', ')} — pieces per marker don't match ordered ratio</span>
                                                                        </div>
                                                                    )}
                                                                    {extraSizes.length > 0 && (
                                                                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                                                            <AlertTriangle size={12} className="shrink-0" />
                                                                            <span><b>Extra sizes:</b> {extraSizes.join(', ')} — will be cut but not ordered</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex items-center justify-between mt-4">
                                        <p className="text-[10px] text-slate-400">
                                            Sizes are standardized before comparison.
                                        </p>
                                        <button
                                            onClick={confirmLink}
                                            disabled={!pickedBomId || !isMatch}
                                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-xl transition-colors"
                                        >
                                            <Link2 size={14} /> Confirm Link
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                )}
            </div>

            {/* ── Requirements section (collapsible) ── */}
            {sopReqs && (() => {
                const fabricReqs = sopReqs.fabric_requirements || [];
                const trimReqs   = sopReqs.trim_requirements   || [];
                const hasShortfall = fabricReqs.some(fr =>
                    Math.max(0, (fr.meters_required || 0) - (fr.stock_suggestion?.total_meters_available ?? 0)) > 0
                ) || trimReqs.some(tr => !tr.is_fulfilled);
                return (
                    <div className="border-t border-slate-100">
                        {/* Collapse toggle + summary action buttons */}
                        <div className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                            <button
                                onClick={() => setShowReqs(v => !v)}
                                className="flex-1 flex items-center gap-2 flex-wrap text-left min-w-0"
                            >
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calculated Requirements</p>
                                {fabricReqs.length > 0 && (
                                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full">
                                        {fabricReqs.length} fabric
                                    </span>
                                )}
                                {trimReqs.length > 0 && (
                                    <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                                        {trimReqs.length} trim
                                    </span>
                                )}
                                {hasShortfall && (
                                    <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded-full">
                                        shortfalls
                                    </span>
                                )}
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0 ml-2">
                                <button
                                    onClick={() => setShowResvSummary(true)}
                                    title="View reservations summary"
                                    className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors"
                                >
                                    <Download size={12} />
                                </button>
                                <button
                                    onClick={() => setShowPoSummary(true)}
                                    title="View purchase order summary"
                                    className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg transition-colors"
                                >
                                    <Printer size={12} />
                                </button>
                                <button onClick={() => setShowReqs(v => !v)} className="p-1.5">
                                    <ChevronDown size={13} className={`text-slate-400 transition-transform ${showReqs ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                        </div>

                        {showReqs && (
                            <div className="px-4 pb-4 space-y-4">

                                {/* Finalized quantities per color */}
                                {(sopReqs.production_plan_items || []).length > 0 && (() => {
                                    const items    = sopReqs.production_plan_items;
                                    const totalPcs = items.reduce((s, i) => s + (i.finalized_quantity || 0), 0);
                                    return (
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Finalized Quantities</p>
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                {items.map(c => (
                                                    <span key={c.fabric_color_id} className="flex items-center gap-1 text-xs bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg">
                                                        <span className="font-bold text-indigo-700">{c.color_name || c.color_number}</span>
                                                        <span className="text-slate-300">·</span>
                                                        <span className="font-bold text-slate-700">{(c.finalized_quantity || 0).toLocaleString()} pcs</span>
                                                        <span className="text-slate-400">/{c.marker_runs} runs</span>
                                                    </span>
                                                ))}
                                                <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg text-slate-600">
                                                    ∑ {totalPcs.toLocaleString()} pcs
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Fabric requirements */}
                                {fabricReqs.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-600 mb-2">Fabric</p>
                                        <div className="space-y-1.5">
                                            {fabricReqs.map(fr => {
                                                const available = fr.stock_suggestion?.total_meters_available ?? 0;
                                                const shortfall = Math.max(0, (fr.meters_required || 0) - available);
                                                const bd        = fr.calculation_breakdown;
                                                return (
                                                    <div key={fr.id} className={`px-3 py-2.5 rounded-lg border text-xs ${shortfall > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <p className="font-bold text-slate-700">{fr.fabric_type_name}</p>
                                                                    <ReqStatusPill status={fr.status} />
                                                                </div>
                                                                <p className="text-slate-500 mt-0.5">{fr.color_name}{fr.color_number ? ` · ${fr.color_number}` : ''}</p>
                                                                <p className="text-slate-500 mt-0.5">
                                                                    {(fr.meters_required || 0).toFixed(2)} m req
                                                                    {shortfall > 0
                                                                        ? <span className="font-bold text-red-600"> · −{shortfall.toFixed(2)} m short</span>
                                                                        : <span className="text-emerald-600"> · {available.toFixed(2)} m avail</span>
                                                                    }
                                                                </p>
                                                                {bd && (
                                                                    <div className="mt-1.5 space-y-0.5">
                                                                        {(bd.ratio_group_contributions || []).map((rg, i) => (
                                                                            <p key={i} className="text-[10px] text-slate-500 font-mono truncate" title={rg.formula}>
                                                                                {rg.ratio_group_name}: {rg.meters.toFixed(2)} m
                                                                                <span className="text-slate-300 ml-1">({rg.formula})</span>
                                                                            </p>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => setReservingReq({ id: fr.id, reqType: 'fabric' })}
                                                                className="shrink-0 text-[10px] font-bold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                Manage
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Trim requirements */}
                                {trimReqs.length > 0 && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-600 mb-2">Trim & Materials</p>
                                        <div className="space-y-1.5">
                                            {[...trimReqs].sort((a, b) => {
                                                const S = { PENDING: 0, PARTIALLY_RESERVED: 1, RESERVED: 2, PURCHASE_RAISED: 3 };
                                                return (S[a.status] ?? 99) - (S[b.status] ?? 99);
                                            }).map(tr => {
                                                const exact      = tr.stock_suggestion?.exact_variant;
                                                const subs       = tr.stock_suggestion?.substitutes || [];
                                                const exactStock = parseFloat(exact?.in_stock) || 0;
                                                const hasStock   = exactStock > 0 || subs.some(s => (parseFloat(s.in_stock) || 0) > 0);
                                                const bd         = tr.calculation_breakdown;
                                                return (
                                                    <div key={tr.id} className={`px-3 py-2.5 rounded-lg border text-xs ${tr.is_fulfilled ? 'bg-emerald-50 border-emerald-200' : hasStock ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <p className="font-bold text-slate-700">{tr.trim_item_name}</p>
                                                                    {tr.item_code && <span className="text-slate-400 font-mono">{tr.item_code}</span>}
                                                                    <ReqStatusPill status={tr.status} />
                                                                    {tr.is_color_agnostic && <span className="text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1 py-0.5 rounded">agnostic</span>}
                                                                </div>
                                                                <p className="text-slate-500 mt-0.5">
                                                                    {tr.color_name ? `${tr.color_name}${tr.color_number ? ` · ${tr.color_number}` : ''}` : 'All colors'}
                                                                    {tr.unit_of_measure ? ` · ${tr.unit_of_measure}` : ''}
                                                                </p>
                                                                <p className="text-slate-500 mt-0.5">
                                                                    {(tr.quantity_required || 0).toLocaleString()} req
                                                                    {tr.quantity_reserved > 0 && (
                                                                        <span className="text-emerald-600"> · {(tr.quantity_reserved || 0).toLocaleString()} reserved</span>
                                                                    )}
                                                                </p>
                                                                {bd && (
                                                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate" title={bd.formula}>{bd.formula}</p>
                                                                )}
                                                                {/* Stock chips */}
                                                                <div className="flex gap-1 mt-1.5 flex-wrap">
                                                                    {exact ? (
                                                                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${exactStock > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                                            {exact.match_type === 'agnostic' ? 'Stock' : 'Exact'}: {exactStock.toLocaleString()}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-1.5 py-0.5 rounded border text-[8px] font-bold bg-red-50 text-red-600 border-red-200">No exact</span>
                                                                    )}
                                                                    {subs.map(s => (
                                                                        <span key={s.substitute_variant_id} className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${parseFloat(s.in_stock) > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                                            Sub {s.color_name}{s.color_number ? ` · ${s.color_number}` : ''}: {parseFloat(s.in_stock).toLocaleString()}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => setReservingReq({ id: tr.id, reqType: 'trim' })}
                                                                className="shrink-0 text-[10px] font-bold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                Manage
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {fabricReqs.length === 0 && trimReqs.length === 0 && (
                                    <p className="text-[10px] text-slate-400 italic">No requirements calculated yet.</p>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Reservation & Purchase modal */}
            {reservingReq && activeReq && (
                <ReservationModal
                    reqType={reservingReq.reqType}
                    requirement={activeReq}
                    onClose={() => setReservingReq(null)}
                    onUpdate={() => setReqsRefreshKey(k => k + 1)}
                />
            )}
            {showResvSummary && sopReqs && (
                <ReservationSummaryModal sopReqs={sopReqs} sop={sop} orderInfo={orderInfo} onClose={() => setShowResvSummary(false)} />
            )}
            {showPoSummary && sopReqs && (
                <PurchaseSummaryModal sopReqs={sopReqs} sop={sop} orderInfo={orderInfo} onClose={() => setShowPoSummary(false)} />
            )}
        </div>
    );
};

// ─── FABRIC REQUIREMENTS SECTION (Available / Short split) ──────────────────────

const FabricRow = ({ r }) => (
    <div className={`flex items-center justify-between border rounded-xl px-4 py-3 ${r.meters_shortfall > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}>
        <div>
            <p className="font-semibold text-slate-800 text-sm">{r.fabric_type_name}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{r.color_name} · {r.roll_count ?? 0} rolls</p>
        </div>
        <div className="flex items-center gap-5 text-right">
            <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">Required</p>
                <p className="font-bold text-slate-700 text-sm">{fmt(r.meters_required)} m</p>
            </div>
            <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">In Stock</p>
                <p className={`font-bold text-sm ${r.meters_shortfall > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(r.meters_in_stock)} m</p>
            </div>
            {r.meters_shortfall > 0 && (
                <div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider">Short</p>
                    <p className="font-bold text-red-600 text-sm">-{fmt(r.meters_shortfall)} m</p>
                </div>
            )}
        </div>
    </div>
);

const FabricRequirementsSection = ({ rows }) => {
    if (!rows?.length) return <p className="text-sm text-slate-400 italic">No fabric requirements.</p>;
    const short     = rows.filter(r => r.meters_shortfall > 0);
    const available = rows.filter(r => !(r.meters_shortfall > 0));
    return (
        <div className="space-y-5">
            {short.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-2.5">
                        <AlertTriangle size={13} className="text-red-500" />
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Short — {short.length} type{short.length !== 1 ? 's' : ''}</p>
                        <span className="text-[10px] text-slate-400">No substitute — purchase order required</span>
                    </div>
                    <div className="space-y-2">{short.map((r, i) => <FabricRow key={i} r={r} />)}</div>
                </div>
            )}
            {available.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-2.5">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Available — {available.length} type{available.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="space-y-2">{available.map((r, i) => <FabricRow key={i} r={r} />)}</div>
                </div>
            )}
        </div>
    );
};

// ─── TRIM REQUIREMENTS SECTION (Available / Short split + substitute modal) ──────

const TrimDetailExpanded = ({ trim }) => {
    const matchCls = { exact: 'bg-emerald-50 text-emerald-700 border-emerald-200', missing: 'bg-red-50 text-red-600 border-red-200' };
    if (trim.is_color_agnostic) {
        return (
            <div className="flex flex-wrap items-center gap-6 text-sm">
                {[
                    { label: 'Required', val: fmt(trim.total_quantity_required), cls: 'text-slate-700' },
                    { label: 'In Stock',  val: fmt(trim.in_stock), cls: (trim.shortfall || 0) > 0 ? 'text-red-600' : 'text-emerald-600' },
                    ...(trim.shortfall > 0 ? [{ label: 'Shortfall', val: `-${fmt(trim.shortfall)}`, cls: 'text-red-600' }] : []),
                ].map(({ label, val, cls }) => (
                    <div key={label}>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className={`font-bold ${cls}`}>{val}</p>
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className="space-y-2">
            {(trim.color_requirements || []).map((cr, i) => (
                <div key={i} className={`flex flex-wrap items-center gap-5 text-sm p-3 rounded-lg ${cr.shortfall > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <div className="w-28 shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase mb-0.5">Color</p>
                        <p className="font-semibold text-slate-700 text-xs">{cr.color_name}</p>
                    </div>
                    <div className="w-20 shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase mb-0.5">Required</p>
                        <p className="font-bold text-slate-700">{fmt(cr.quantity_required)}</p>
                    </div>
                    <div className="w-20 shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase mb-0.5">In Stock</p>
                        <p className={`font-bold ${cr.shortfall > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(cr.in_stock)}</p>
                    </div>
                    <div className="shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase mb-0.5">Match</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${matchCls[cr.match_type] || 'bg-amber-50 text-amber-600 border-amber-200'}`}>{cr.match_type}</span>
                    </div>
                    {cr.shortfall > 0 && (
                        <div className="shrink-0">
                            <p className="text-[10px] text-slate-400 uppercase mb-0.5">Shortfall</p>
                            <p className="font-bold text-red-600">-{fmt(cr.shortfall)}</p>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const trimIsShort    = t => t.is_color_agnostic ? (t.shortfall || 0) > 0 : (t.color_requirements || []).some(cr => cr.shortfall > 0);
const trimHasSubs    = t => t.is_color_agnostic ? (t.substitutes || []).length > 0 : (t.color_requirements || []).some(cr => (cr.substitutes || []).length > 0);

const TrimRequirementsSection = ({ rows, onSelectSubstitute }) => {
    const [expanded, setExpanded] = useState(new Set());
    if (!rows?.length) return <p className="text-sm text-slate-400 italic">No trim requirements.</p>;

    const toggle = id => setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    const short     = rows.filter(trimIsShort);
    const available = rows.filter(t => !trimIsShort(t));

    const TrimRow = ({ trim }) => {
        const isOpen     = expanded.has(trim.trim_item_id);
        const isShort    = trimIsShort(trim);
        const hasSubs    = trimHasSubs(trim);
        return (
            <div className={`border rounded-xl overflow-hidden ${isShort ? 'border-red-200' : 'border-slate-200'}`}>
                <button onClick={() => toggle(trim.trim_item_id)}
                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-slate-100 transition-colors text-left ${isShort ? 'bg-red-50/50' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{trim.trim_item_name}</span>
                        {trim.item_code && <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{trim.item_code}</span>}
                        {trim.is_color_agnostic
                            ? <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-bold uppercase">Agnostic</span>
                            : <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-bold uppercase">Color Matched</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {isShort && hasSubs && (
                            <button onClick={e => { e.stopPropagation(); onSelectSubstitute(trim); }}
                                className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1">
                                <RefreshCw size={9} /> Substitute
                            </button>
                        )}
                        {trim.is_color_agnostic && <span className="text-xs text-slate-500">{fmt(trim.total_quantity_required)} total</span>}
                        {isOpen ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                    </div>
                </button>
                {isOpen && <div className="px-4 py-3 border-t border-slate-100"><TrimDetailExpanded trim={trim} /></div>}
            </div>
        );
    };

    return (
        <div className="space-y-5">
            {short.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-2.5">
                        <AlertTriangle size={13} className="text-red-500" />
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Short — {short.length} item{short.length !== 1 ? 's' : ''}</p>
                        {short.some(trimHasSubs) && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded font-bold">Substitutes available</span>}
                    </div>
                    <div className="space-y-2">{short.map(t => <TrimRow key={t.trim_item_id} trim={t} />)}</div>
                </div>
            )}
            {available.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-2.5">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Available — {available.length} item{available.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="space-y-2">{available.map(t => <TrimRow key={t.trim_item_id} trim={t} />)}</div>
                </div>
            )}
        </div>
    );
};

// ─── QUANTITY SUGGESTION MODAL ───────────────────────────────────────────────

const QuantitySuggestionModal = ({ linkedSops, onClose, onDone }) => {
    const [suggestions, setSuggestions] = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [choices,     setChoices]     = useState({});  // key: `${sopId}_${colorId}` → 'lower'|'upper'|'exact'
    const [submitting,  setSubmitting]  = useState(false);

    useEffect(() => {
        Promise.all(
            linkedSops.map(sop =>
                planningApi.getSuggestions(sop.id)
                    .then(r => {
                        const raw = r.data?.data ?? r.data;
                        return {
                            sopId:    sop.id,
                            sopName:  sop.product_name,
                            ratioSum: raw?.ratio_sum ?? null,
                            colors:   raw?.suggestions || [],
                        };
                    })
            )
        ).then(results => {
            setSuggestions(results);
            const init = {};
            results.forEach(({ sopId, colors }) => {
                colors.forEach(c => {
                    init[`${sopId}_${c.fabric_color_id}`] = c.exact ? 'exact' : 'lower';
                });
            });
            setChoices(init);
        }).catch(e => setError(e?.response?.data?.error || 'Failed to load suggestions'))
          .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pick = (sopId, colorId, opt) =>
        setChoices(p => ({ ...p, [`${sopId}_${colorId}`]: opt }));

    const handleConfirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await Promise.all(
                suggestions.map(async ({ sopId, colors }) => {
                    const quantities = colors.map(c => {
                        const opt    = choices[`${sopId}_${c.fabric_color_id}`] || 'lower';
                        const chosen = c[opt] ?? c.lower ?? c.upper;
                        return {
                            fabric_color_id:    c.fabric_color_id,
                            selected_option:    opt,
                            finalized_quantity: chosen?.total_pieces ?? c.ordered_quantity,
                            marker_runs:        chosen?.runs ?? 1,
                        };
                    });
                    await planningApi.finalizeQuantities(sopId, { quantities });
                    await planningApi.calculateRequirements(sopId);
                })
            );
            onDone();
        } catch (e) {
            setError(e?.response?.data?.error || 'Calculation failed');
            setSubmitting(false);
        }
    };

    const totalSelections  = suggestions?.reduce((s, g) => s + g.colors.length, 0) ?? 0;
    const madeSelections   = Object.keys(choices).length;
    const allChosen        = madeSelections >= totalSelections && totalSelections > 0;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!submitting ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Step 1 of 2 — Confirm Quantities</p>
                        <h2 className="font-extrabold text-slate-800 text-base">Choose Nearest Marker Run</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Select lower or upper run for each color, then confirm to calculate requirements.</p>
                    </div>
                    {!submitting && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5"><X size={18} /></button>}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {loading && <Spinner />}
                    {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

                    {suggestions?.map(({ sopId, sopName, ratioSum, colors }) => (
                        <div key={sopId} className="border border-slate-200 rounded-xl overflow-hidden">
                            {/* SOP header */}
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                                <p className="font-bold text-slate-800 text-sm">{sopName}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {colors.length} color{colors.length !== 1 ? 's' : ''}
                                    {ratioSum != null && <> · ratio sum: {ratioSum} pcs/cycle</>}
                                </p>
                            </div>

                            {/* Per-color lower / upper / exact choice */}
                            <div className="p-4 space-y-3">
                                {colors.map(c => {
                                    const key    = `${sopId}_${c.fabric_color_id}`;
                                    const chosen = choices[key] || 'lower';
                                    return (
                                        <div key={c.fabric_color_id} className="rounded-xl border border-slate-200 overflow-hidden">
                                            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
                                                <span className="font-bold text-slate-800 text-sm">{c.color_name}</span>
                                                {c.color_number && (
                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{c.color_number}</span>
                                                )}
                                                <span className="ml-auto text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-medium">
                                                    Ordered: {(c.ordered_quantity || 0).toLocaleString()} pcs
                                                </span>
                                            </div>
                                            <div className="p-3">
                                                {c.exact ? (
                                                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                                        <div>
                                                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Exact match</p>
                                                            <p className="text-xl font-extrabold text-slate-800 leading-none">
                                                                {(c.lower?.total_pieces ?? c.upper?.total_pieces ?? c.ordered_quantity).toLocaleString()}
                                                            </p>
                                                            {c.lower?.runs != null && (
                                                                <p className="text-[10px] text-slate-500 mt-0.5">{c.lower.runs} run{c.lower.runs !== 1 ? 's' : ''}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {['lower', 'upper'].map(opt => {
                                                            const d       = c[opt];
                                                            if (!d) return null;
                                                            const active  = chosen === opt;
                                                            const diff    = (d.total_pieces || 0) - (c.ordered_quantity || 0);
                                                            const isUnder = diff < 0;
                                                            return (
                                                                <button key={opt} onClick={() => pick(sopId, c.fabric_color_id, opt)}
                                                                    className={`relative flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                                                                        active
                                                                            ? isUnder ? 'border-blue-400 bg-blue-50' : 'border-violet-400 bg-violet-50'
                                                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                                                    }`}>
                                                                    {active && (
                                                                        <CheckCircle2 size={13} className={`absolute top-2 right-2 ${isUnder ? 'text-blue-500' : 'text-violet-500'}`} />
                                                                    )}
                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isUnder ? 'text-blue-500' : 'text-violet-500'}`}>
                                                                        {isUnder ? '▼ Under-run' : '▲ Over-run'}
                                                                    </span>
                                                                    <span className="text-xl font-extrabold text-slate-800 leading-none">
                                                                        {(d.total_pieces || 0).toLocaleString()}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500 mt-0.5">
                                                                        {d.runs} run{d.runs !== 1 ? 's' : ''}
                                                                    </span>
                                                                    <span className={`text-[10px] font-bold mt-1 ${isUnder ? 'text-blue-600' : 'text-violet-600'}`}>
                                                                        {isUnder ? `${Math.abs(diff).toLocaleString()} fewer` : `${diff.toLocaleString()} extra`} vs order
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                {!loading && suggestions && (
                    <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            {madeSelections}/{totalSelections} color{totalSelections !== 1 ? 's' : ''} configured
                        </p>
                        <div className="flex items-center gap-3">
                            <button onClick={onClose} disabled={submitting}
                                className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                                Cancel
                            </button>
                            <button onClick={handleConfirm} disabled={submitting || !allChosen}
                                className="flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
                                Confirm & Calculate
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── TRIM SUBSTITUTE MODAL ────────────────────────────────────────────────────

const TrimSubstituteModal = ({ trim, onClose, onReserved }) => {
    const [selectedSubId, setSelectedSubId] = useState(null);
    const [submitting,    setSubmitting]    = useState(false);
    const [error,         setError]         = useState(null);

    const reqId = trim.id || trim.requirement_id;

    const substitutes = trim.is_color_agnostic
        ? (trim.substitutes || []).map(s => ({ ...s, _forColor: null }))
        : (trim.color_requirements || []).flatMap(cr =>
            cr.shortfall > 0
                ? (cr.substitutes || []).map(s => ({ ...s, _forColor: cr.color_name }))
                : []
          );

    const handleReserve = async () => {
        if (!selectedSubId) return;
        setSubmitting(true);
        setError(null);
        try {
            await planningApi.reserveTrim(reqId, { substitute_variant_id: selectedSubId, match_type: 'substitute' });
            onReserved();
        } catch (e) {
            setError(e?.response?.data?.error || 'Reservation failed');
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Select Substitute</p>
                        <h2 className="font-extrabold text-slate-800 text-base">{trim.trim_item_name}</h2>
                        <p className="text-xs text-red-500 mt-0.5">Short — choose a substitute to reserve</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                    {substitutes.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-10">No substitutes available.</p>
                    ) : substitutes.map(s => {
                        const subId   = s.substitute_variant_id || s.trim_variant_id;
                        const active  = selectedSubId === subId;
                        return (
                            <button key={subId} onClick={() => setSelectedSubId(subId)}
                                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                    active ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}>
                                <input type="radio" readOnly checked={active} className="mt-0.5 accent-emerald-600 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-bold text-slate-800 text-sm">{s.item_name}</p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                            s.in_stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                                        }`}>
                                            {s.in_stock > 0 ? `${s.in_stock} in stock` : 'Out of stock'}
                                        </span>
                                    </div>
                                    {s._forColor && <p className="text-[10px] text-slate-400 mt-0.5">For color: {s._forColor}</p>}
                                    {s.color_name && <p className="text-[10px] text-slate-400">Variant: {s.color_name}</p>}
                                    {s.item_code  && <p className="text-[10px] font-mono text-slate-400">{s.item_code}</p>}
                                </div>
                            </button>
                        );
                    })}
                    {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                </div>

                {substitutes.length > 0 && (
                    <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-3">
                        <button onClick={onClose}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleReserve} disabled={!selectedSubId || submitting}
                            className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                            {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            Reserve Substitute
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── STAT CARD ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, ok }) => (
    <div className={`rounded-xl p-4 border ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
        <p className={`text-2xl font-extrabold ${ok ? 'text-emerald-700' : 'text-red-600'}`}>{value}</p>
    </div>
);

// ─── SECTION WRAPPER ───────────────────────────────────────────────────────────

const Section = ({ icon: Icon, iconCls, title, badge, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <Icon size={16} className={iconCls} />
                <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
            </div>
            {badge}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const ProductionPlanningPage = () => {
    const [formData,        setFormData]        = useState(null);
    const [loadingForm,     setLoadingForm]     = useState(true);
    const [formErr,         setFormErr]         = useState(null);

    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [orderDetail,     setOrderDetail]     = useState(null);
    const [loadingOrder,    setLoadingOrder]    = useState(false);

    const [requirements,    setRequirements]    = useState(null);

    const [linking,           setLinking]           = useState({});
    const [searchQ,           setSearchQ]           = useState('');
    const [previewBomId,      setPreviewBomId]      = useState(null);
    const [calcSopId,         setCalcSopId]         = useState(null);
    const [calcKeys,          setCalcKeys]          = useState({});
    const [substituteTrim,    setSubstituteTrim]    = useState(null);

    // Load sales orders + approved BOMs on mount
    useEffect(() => {
        planningApi.getFormData()
            .then(res => setFormData(res.data?.data ?? res.data))
            .catch(e  => setFormErr(e?.response?.data?.error || 'Failed to load planning data'))
            .finally(() => setLoadingForm(false));
    }, []);

    const refreshOrder = useCallback(async (orderId) => {
        const [detailRes, fdRes] = await Promise.all([
            planningApi.getOrderDetail(orderId),
            planningApi.getFormData(),
        ]);
        console.log('Order detail refreshed', detailRes.data, fdRes.data);
        setOrderDetail(detailRes.data?.data ?? detailRes.data);
        setFormData(fdRes.data?.data ?? fdRes.data);
    }, []);

    const selectOrder = useCallback((orderId) => {
        if (orderId === selectedOrderId) return;
        setSelectedOrderId(orderId);
        setRequirements(null);
        setOrderDetail(null);
        setLoadingOrder(true);
        planningApi.getOrderDetail(orderId)
            .then(res => setOrderDetail(res.data?.data ?? res.data))
            .catch(e  => console.error('Order detail fetch failed', e))
            .finally(() => setLoadingOrder(false));
    }, [selectedOrderId]);

    const handleLink = useCallback(async (sopId, bomId, ratioGroupIds) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.linkBom(sopId, {
                bom_id: bomId,
                ratio_group_ids: ratioGroupIds,
            });
            await refreshOrder(selectedOrderId);
            setRequirements(null);
        } catch (e) {
            console.error('Link BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const handleUnlink = useCallback(async (sopId) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.unlinkBom(sopId);
            await refreshOrder(selectedOrderId);
            setRequirements(null);
        } catch (e) {
            console.error('Unlink BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const handleSubstituteReserved = useCallback(async () => {
        setSubstituteTrim(null);
        try {
            const res = await planningApi.getRequirements(selectedOrderId);
            console.log('Requirements refreshed after substitution', res.data);
            setRequirements(res.data?.data ?? res.data);
        } catch (e) {
            console.error('Failed to refresh requirements', e);
        }
    }, [selectedOrderId]);

    const orders         = formData?.sales_orders    || [];
    const bomsByProduct  = formData?.boms_by_product || {};
    const sops           = orderDetail?.products     || [];
    const unlinkedCount  = sops.filter(s => !s.bom_linked && !s.bom_id).length;

    const filteredOrders = orders.filter(o =>
        !searchQ ||
        o.order_number?.toLowerCase().includes(searchQ.toLowerCase()) ||
        (o.customer_name || o.buyer_name || '').toLowerCase().includes(searchQ.toLowerCase())
    );

    const fabricShortfalls = (requirements?.fabric_requirements || []).filter(r => r.meters_shortfall > 0).length;
    const trimShortfalls   = (requirements?.trim_requirements  || []).filter(t =>
        t.is_color_agnostic ? (t.shortfall || 0) > 0 : (t.color_requirements || []).some(cr => cr.shortfall > 0)
    ).length;

    return (
        <>
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── LEFT: Order sidebar ── */}
            <div className="w-72 min-w-[18rem] bg-white border-r border-slate-200 flex flex-col overflow-hidden">
                <div className="px-4 py-4 border-b border-slate-100 shrink-0">
                    <h2 className="font-extrabold text-slate-800 text-sm mb-3">Sales Orders</h2>
                    <input
                        type="search"
                        placeholder="Search order or buyer…"
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loadingForm && <Spinner h={32} />}
                    {formErr && <p className="text-xs text-red-500 px-4 py-3">{formErr}</p>}
                    {!loadingForm && filteredOrders.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-10">No orders found</p>
                    )}
                    {filteredOrders.map(order => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            isSelected={selectedOrderId === order.id}
                            onClick={() => selectOrder(order.id)}
                        />
                    ))}
                </div>
            </div>

            {/* ── RIGHT: Detail panel ── */}
            <div className="flex-1 overflow-y-auto">
                {!selectedOrderId && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                        <ShoppingBag size={52} className="opacity-20" />
                        <p className="text-sm font-medium">Select a sales order to start planning</p>
                    </div>
                )}

                {selectedOrderId && (
                    <div className="p-6 space-y-5">
                        {loadingOrder && <Spinner />}

                        {!loadingOrder && orderDetail && (
                            <>
                                {/* ── Order header ── */}
                                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                                    <div className="flex items-start justify-between gap-3 mb-4">
                                        <div>
                                            <div className="flex items-baseline gap-2">
                                                <h2 className="font-extrabold text-slate-800 text-xl">Order #{orderDetail.order_number}</h2>
                                                {orderDetail.buyer_po_number && (
                                                    <span className="text-sm text-slate-400">PO {orderDetail.buyer_po_number}</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-500 mt-0.5">
                                                {orderDetail.customer_name || orderDetail.buyer_name || '—'}
                                            </p>
                                        </div>
                                        {unlinkedCount > 0 ? (
                                            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                                                <AlertTriangle size={13} /> {unlinkedCount} product{unlinkedCount > 1 ? 's' : ''} without BOM
                                            </span>
                                        ) : (
                                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                                                <CheckCircle2 size={13} /> All BOMs linked
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Delivery Date', val: orderDetail.delivery_date ? new Date(orderDetail.delivery_date).toLocaleDateString() : '—' },
                                            { label: 'Status',        val: orderDetail.status || '—' },
                                            { label: 'Products',      val: sops.length },
                                            { label: 'Order Value',   val: orderDetail.total_amount ? `₹${Number(orderDetail.total_amount).toLocaleString()}` : '—' },
                                        ].map(({ label, val }) => (
                                            <div key={label} className="bg-slate-50 rounded-xl p-3">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                                                <p className="font-semibold text-slate-700 text-sm">{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── BOM Linking ── */}
                                <Section
                                    icon={Link2}
                                    iconCls="text-violet-500"
                                    title="Product–BOM Links"
                                    badge={
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1">
                                                {Array.from({ length: sops.length }).map((_, i) => (
                                                    <span key={i}
                                                        className={`inline-block w-2 h-2 rounded-full transition-colors ${
                                                            i < (sops.length - unlinkedCount) ? 'bg-emerald-500' : 'bg-slate-300'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                            <span className={`text-xs font-bold ${unlinkedCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {sops.length - unlinkedCount}/{sops.length} linked
                                            </span>
                                        </div>
                                    }
                                >
                                    <div className="space-y-3">
                                        {sops.map(sop => (
                                            <SopCard
                                                key={sop.id}
                                                sop={sop}
                                                bomOptions={bomsByProduct[String(sop.product_id)] || bomsByProduct[sop.product_id] || []}
                                                onLink={handleLink}
                                                onUnlink={handleUnlink}
                                                onPreview={setPreviewBomId}
                                                onCalculate={setCalcSopId}
                                                calcKey={calcKeys[sop.id] || 0}
                                                isLinking={!!linking[sop.id]}
                                                orderInfo={orderDetail}
                                            />
                                        ))}
                                    </div>
                                </Section>

                                {/* ── Requirements ── */}
                                {requirements && (
                                    <>
                                        {(requirements.unlinked_products || []).length > 0 && (
                                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                                                <AlertTriangle size={15} className="shrink-0" />
                                                Products excluded (no BOM): {requirements.unlinked_products.map(p => p.product_name).join(', ')}
                                            </div>
                                        )}

                                        {/* Summary */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <StatCard label="Fabric types" value={requirements.fabric_requirements?.length || 0} ok={true} />
                                            <StatCard label="Fabric shortfalls" value={fabricShortfalls} ok={fabricShortfalls === 0} />
                                            <StatCard label="Trim shortfalls"   value={trimShortfalls}   ok={trimShortfalls === 0} />
                                        </div>

                                        {/* Fabric requirements */}
                                        <Section icon={Layers} iconCls="text-indigo-500" title="Fabric Requirements">
                                            <FabricRequirementsSection rows={requirements.fabric_requirements} />
                                        </Section>

                                        {/* Trim requirements */}
                                        <Section icon={Package} iconCls="text-emerald-500" title="Trim & Material Requirements">
                                            <TrimRequirementsSection
                                                rows={requirements.trim_requirements}
                                                onSelectSubstitute={setSubstituteTrim}
                                            />
                                        </Section>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>

        {previewBomId && (
            <BomPreviewModal bomId={previewBomId} onClose={() => setPreviewBomId(null)} />
        )}
        {calcSopId != null && (
            <QuantitySuggestionModal
                linkedSops={sops.filter(s => s.id === calcSopId)}
                onClose={() => setCalcSopId(null)}
                onDone={() => {
                    setCalcKeys(k => ({ ...k, [calcSopId]: (k[calcSopId] || 0) + 1 }));
                    setCalcSopId(null);
                }}
            />
        )}
        {substituteTrim && (
            <TrimSubstituteModal
                trim={substituteTrim}
                onClose={() => setSubstituteTrim(null)}
                onReserved={handleSubstituteReserved}
            />
        )}
        </>
    );
};

export default ProductionPlanningPage;
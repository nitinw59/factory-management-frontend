// ─── REQUIREMENT CELL DRILLDOWN MODAL ───────────────────────────────────────
// Opens when a grid cell (FabricRequirementsGrid / TrimRequirementsGrid) is
// clicked. One component for both fabric and trim — they share ~80% of their
// chrome (breakdown panel, reservations list, raise-PR footer) and only differ
// in the reserve sub-form, which ReserveFulfillModal already branches on via
// `item.type`. This is also where all per-line actions live now (reserve,
// release a reservation, raise a purchase requirement, recalculate just this
// line) — nothing here depends on a T&A timeline item existing.

import { useState } from 'react';
import { AlertCircle, Loader2, RotateCw, ShoppingCart, Trash2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { getFabricCellStatus, getTrimCellStatus, CELL_COLOR_CLS, CELL_COLOR_DOT } from './requirementCellStatus';
import { deriveTrimReservations } from './trimReservationUtils';
import ReserveFulfillModal from './ReserveFulfillModal';

// Builds the `item` shape ReserveFulfillModal/reservation-list rendering expects,
// for a single fabric requirement.
const buildFabricReserveItem = (req) => {
    const meters_required  = Number(req.meters_required || 0);
    const meters_reserved  = Number(req.meters_reserved || 0);
    const meters_available = req.stock_suggestion?.total_meters_available || 0;
    return {
        req_id: req.id,
        type: 'fabric',
        title: `${req.fabric_type_name}${req.color_name ? ' – ' + req.color_name : ''}${req.color_number ? ` · ${req.color_number}` : ''}`,
        subtitle: `${meters_required.toFixed(1)} m required${meters_reserved > 0 ? ` · Reserved ${meters_reserved.toFixed(1)} m` : ''}`,
        meters_required,
        meters_reserved,
        meters_available,
        available_rolls: req.stock_suggestion?.available_rolls || [],
        inStock: meters_available >= meters_required,
    };
};

// Same derivation the old ProductionTrackingModal used to figure out which
// variant was actually reserved and whether it's a substitute, plus a deduped
// substitutes list — the backend doesn't always send is_substitute directly.
// Exported for reuse by trimRequirementsExcelExport.js.
export const buildTrimReserveItem = (req) => {
    const quantity_required = Number(req.quantity_required || 0);
    const quantity_reserved = Number(req.quantity_reserved || 0);
    const unit = req.unit_of_measure || 'pcs';
    const exactVariantId = req.stock_suggestion?.exact_variant?.id ?? null;

    const derivedReservations = deriveTrimReservations(req);

    const reqColorNum = String(req.color_number ?? '').trim();
    const byId = new Map();
    (req.stock_suggestion?.substitutes || []).forEach(s => {
        const id = s.substitute_variant_id ?? s.id;
        if (id == null) return;
        const subColorNum = String(s.color_number ?? '').trim();
        if (reqColorNum && subColorNum && reqColorNum === subColorNum) return;
        const prev = byId.get(id);
        if (!prev || Number(s.in_stock ?? 0) > Number(prev.in_stock ?? 0)) byId.set(id, s);
    });
    const substitutes = [...byId.values()].sort((a, b) => Number(b.in_stock ?? 0) - Number(a.in_stock ?? 0));

    return {
        req_id: req.id,
        type: 'trim',
        title: `${req.trim_item_name}${req.color_name ? ' – ' + req.color_name : ''}${req.color_number ? ` · ${req.color_number}` : ''}${req.target_variant_size ? ` · Sz ${req.target_variant_size}` : ''}`,
        subtitle: `${quantity_required.toLocaleString()} ${unit} required${quantity_reserved > 0 ? ` · Reserved ${quantity_reserved.toLocaleString()} ${unit}` : ''}`,
        unit,
        quantity_required,
        quantity_reserved,
        inStock: !!req.is_fulfilled,
        exact_variant_id: exactVariantId,
        exact_variant_stock: req.stock_suggestion?.exact_variant?.in_stock ?? null,
        substitutes,
        reservations: derivedReservations,
    };
};

const CalculationBreakdown = ({ type, breakdown, unit }) => {
    if (!breakdown) {
        return <p className="text-sm text-slate-400 italic text-center py-6">No calculation breakdown available.</p>;
    }
    if (type === 'fabric') {
        return (
            <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-600 mb-2">
                    Finalized quantity: <span className="font-bold text-slate-800">{Number(breakdown.finalized_quantity || 0).toLocaleString()}</span> pcs
                </div>
                {(breakdown.fabric_consumption_contributions || []).length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-4">No fabric consumption row matched this fabric type on the BOM.</p>
                ) : (
                    <div className="space-y-2">
                        {breakdown.fabric_consumption_contributions.map((fc, i) => (
                            <div key={i} className="border border-slate-200 rounded-xl p-3">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="text-slate-500">Consumption / piece</span>
                                    <span className="font-bold text-slate-800">{fc.consumption_inches}"</span>
                                </div>
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="text-slate-500">Wastage</span>
                                    <span className="font-bold text-slate-800">{fc.wastage_percentage}%</span>
                                </div>
                                <div className="flex items-center justify-between text-xs mb-2">
                                    <span className="text-slate-500">Meters (this line)</span>
                                    <span className="font-bold text-emerald-700">{Number(fc.meters).toLocaleString(undefined, { maximumFractionDigits: 4 })} m</span>
                                </div>
                                <p className="font-mono text-[10px] text-slate-400 bg-slate-50 rounded-lg px-2 py-1.5">{fc.formula}</p>
                            </div>
                        ))}
                    </div>
                )}
            </>
        );
    }
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold">{breakdown.calculation_type}</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold">{breakdown.scope === 'agnostic' ? 'All colors' : 'Per color'}</span>
                {breakdown.target_variant_size && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold">Variant size: {breakdown.target_variant_size}</span>
                )}
            </div>
            {breakdown.calculation_type === 'FIXED' ? (
                <div className="border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">{breakdown.scope === 'agnostic' ? 'Total garments' : 'Finalized quantity'}</span>
                        <span className="font-bold text-slate-800">{Number(breakdown.total_garments ?? breakdown.finalized_quantity ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">Per garment</span>
                        <span className="font-bold text-slate-800">{breakdown.fixed_quantity_per_garment}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">Wastage</span>
                        <span className="font-bold text-slate-800">{breakdown.wastage_percentage}%</span>
                    </div>
                </div>
            ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-400 uppercase text-[10px]">
                            <tr>
                                <th className="text-left px-2 py-1.5">Size</th>
                                <th className="text-right px-2 py-1.5">Ordered</th>
                                <th className="text-right px-2 py-1.5">Per Piece</th>
                                <th className="text-right px-2 py-1.5">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(breakdown.size_details || []).map((sd, i) => (
                                <tr key={i}>
                                    <td className="px-2 py-1.5 font-bold text-slate-700">{sd.size}</td>
                                    <td className="px-2 py-1.5 text-right text-slate-600">{sd.ordered_qty}</td>
                                    <td className="px-2 py-1.5 text-right text-slate-600">{sd.quantity_per_piece}</td>
                                    <td className="px-2 py-1.5 text-right font-bold text-slate-800">{sd.subtotal}</td>
                                </tr>
                            ))}
                            {(breakdown.size_details || []).length === 0 && (
                                <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-400 italic">No size consumption rows defined.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="font-mono text-[10px] text-slate-400 bg-slate-50 rounded-lg px-2 py-1.5">{breakdown.formula}</p>
            <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Total required</span>
                <span className="font-bold text-emerald-700">{Number(breakdown.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} {unit}</span>
            </div>
        </div>
    );
};

const RequirementCellDrilldownModal = ({ type, requirement, sop, onClose, onDone }) => {
    const [showReserve,   setShowReserve]   = useState(false);
    const [releasingId,   setReleasingId]   = useState(null);
    const [recalcing,     setRecalcing]     = useState(false);
    const [raising,       setRaising]       = useState(false);
    const [showRaiseForm, setShowRaiseForm] = useState(false);
    const [err,           setErr]           = useState(null);

    const [raiseUrgency,   setRaiseUrgency]   = useState('normal');
    const [raiseNotes,     setRaiseNotes]     = useState('');
    const [raiseVariantId, setRaiseVariantId] = useState('');

    const isFabric = type === 'fabric';
    const unit = isFabric ? 'm' : (requirement.unit_of_measure || 'pcs');
    const status = isFabric ? getFabricCellStatus(requirement) : getTrimCellStatus(requirement);
    const reserveItem = isFabric ? buildFabricReserveItem(requirement) : buildTrimReserveItem(requirement);
    const reservations = isFabric ? (requirement.reservations || []) : reserveItem.reservations;
    const required = isFabric ? Number(requirement.meters_required || 0) : Number(requirement.quantity_required || 0);
    const reserved = isFabric ? Number(requirement.meters_reserved || 0) : Number(requirement.quantity_reserved || 0);
    const shortfall = Math.max(0, required - reserved);

    const rowLabel = isFabric
        ? `${requirement.fabric_type_name}${requirement.color_name ? ' – ' + requirement.color_name : (requirement.is_color_agnostic ? ' – All colors' : '')}`
        : `${requirement.trim_item_name}${requirement.color_name ? ' – ' + requirement.color_name : (requirement.is_color_agnostic ? ' – All colors' : '')}${requirement.target_variant_size ? ` · Sz ${requirement.target_variant_size}` : ''}`;

    const handleRelease = async (rs) => {
        const amount = Number(rs.meters_reserved ?? rs.quantity_reserved ?? 0);
        if (!window.confirm(`Release this reservation of ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}? The reserved stock will be freed.`)) return;
        setReleasingId(rs.id);
        setErr(null);
        try {
            if (isFabric) await planningApi.deleteFabricReservation(rs.id);
            else          await planningApi.deleteTrimReservation(rs.id);
            onDone();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to release reservation.');
        } finally {
            setReleasingId(null);
        }
    };

    const handleRecalculateLine = async () => {
        setRecalcing(true);
        setErr(null);
        try {
            if (isFabric) await planningApi.recalculateFabric(sop.id, requirement.fabric_type_id);
            else          await planningApi.recalculateTrim(sop.id, requirement.trim_item_id);
            onDone();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Recalculation failed.');
        } finally {
            setRecalcing(false);
        }
    };

    const handleRaisePR = async () => {
        setRaising(true);
        setErr(null);
        try {
            const base = { sales_order_product_id: sop.id, urgency: raiseUrgency, notes: raiseNotes || null };
            if (isFabric) {
                await purchaseDeptApi.raiseRequirement({
                    ...base,
                    type: 'fabric',
                    meters_required: shortfall || required,
                    fabric_type_id: requirement.fabric_type_id,
                    fabric_color_id: requirement.fabric_color_id,
                    plan_fabric_requirement_id: requirement.id,
                });
            } else {
                if (!raiseVariantId) throw new Error('Pick a variant to procure (exact match or substitute).');
                await purchaseDeptApi.raiseRequirement({
                    ...base,
                    type: 'trim',
                    quantity_required: shortfall || required,
                    unit_of_measure: requirement.unit_of_measure,
                    trim_item_id: requirement.trim_item_id,
                    trim_item_variant_id: raiseVariantId,
                    plan_trim_requirement_id: requirement.id,
                });
            }
            setShowRaiseForm(false);
            onDone();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || e.message || 'Failed to raise requirement.');
        } finally {
            setRaising(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${CELL_COLOR_DOT[status.color]}`} />
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CELL_COLOR_CLS[status.color]}`}>{status.label}</span>
                            {status.isFulfilled && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">Fulfilled</span>
                            )}
                        </div>
                        <h2 className="text-base font-black text-slate-800 mt-1 truncate">{rowLabel}</h2>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            {reserved.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {required.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit} reserved
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
                    {err && (
                        <p className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <AlertCircle size={13} className="shrink-0" /> {err}
                        </p>
                    )}

                    {/* Calculation breakdown */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">How this was calculated</p>
                        <CalculationBreakdown type={type} breakdown={requirement.calculation_breakdown} unit={unit} />
                    </div>

                    {/* Reservations */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Reservations · {reservations.length}
                        </p>
                        {reservations.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">No reservations recorded yet.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                                {reservations.map(rs => {
                                    const amount = Number(rs.meters_reserved ?? rs.quantity_reserved ?? 0);
                                    const rollTotal = Number(rs.roll_total_meters ?? rs.roll_total ?? 0);
                                    const rollStatus = rs.roll_status || rs.status;
                                    const rollId = rs.fabric_roll_id ?? rs.trim_item_variant_id ?? rs.roll_id;
                                    return (
                                        <div key={rs.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                                            {rollId != null && (
                                                <span className="font-mono font-bold text-emerald-700 shrink-0">
                                                    {isFabric ? `R-${rollId}` : `V-${rollId}`}
                                                </span>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 tabular-nums">
                                                    {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
                                                    {rollTotal > 0 && (
                                                        <span className="font-normal text-slate-400 ml-1">
                                                            of {rollTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}
                                                        </span>
                                                    )}
                                                </p>
                                                {!isFabric && rs.is_substitute && (
                                                    <p className="text-[9px] font-bold text-purple-600">SUBSTITUTE{rs.color_name ? ` · ${rs.color_name}` : ''}</p>
                                                )}
                                            </div>
                                            {rollStatus && (
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                    rollStatus === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {String(rollStatus).replace(/_/g, ' ')}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handleRelease(rs)}
                                                disabled={releasingId != null}
                                                title="Release this reservation — frees the reserved stock"
                                                className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-2 py-1 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {releasingId === rs.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                                Release
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Raise PR */}
                    {shortfall > 0 && (
                        <div>
                            <button
                                onClick={() => setShowRaiseForm(v => !v)}
                                className="w-full flex items-center justify-between text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2"
                            >
                                <span>Raise Purchase Requirement</span>
                                <span className="text-amber-500">{showRaiseForm ? 'Hide' : `Shortfall: ${shortfall.toLocaleString()} ${unit}`}</span>
                            </button>
                            {showRaiseForm && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
                                    {!isFabric && (
                                        <div>
                                            <label className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block mb-1">Variant to procure</label>
                                            <select
                                                value={raiseVariantId}
                                                onChange={e => setRaiseVariantId(e.target.value)}
                                                className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-amber-300"
                                            >
                                                <option value="">Select variant…</option>
                                                {reserveItem.exact_variant_id != null && (
                                                    <option value={reserveItem.exact_variant_id}>Exact match</option>
                                                )}
                                                {reserveItem.substitutes.map(s => (
                                                    <option key={s.substitute_variant_id} value={s.substitute_variant_id}>
                                                        {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''} (substitute)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block mb-1">Urgency</label>
                                            <select
                                                value={raiseUrgency}
                                                onChange={e => setRaiseUrgency(e.target.value)}
                                                className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-amber-300"
                                            >
                                                <option value="urgent">Urgent</option>
                                                <option value="normal">Normal</option>
                                                <option value="low">Low</option>
                                            </select>
                                        </div>
                                        <div className="flex items-end">
                                            <p className="text-[10px] text-amber-700">Qty: <span className="font-bold">{shortfall.toLocaleString()} {unit}</span></p>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block mb-1">Notes</label>
                                        <textarea
                                            value={raiseNotes}
                                            onChange={e => setRaiseNotes(e.target.value)}
                                            rows={2}
                                            placeholder="Optional notes…"
                                            className="w-full text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                                        />
                                    </div>
                                    <button
                                        onClick={handleRaisePR}
                                        disabled={raising || (!isFabric && !raiseVariantId)}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-3 py-2 rounded-lg transition-colors"
                                    >
                                        {raising ? <Loader2 size={12} className="animate-spin" /> : <ShoppingCart size={12} />}
                                        Raise Requirement
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-100 shrink-0">
                    <button
                        onClick={handleRecalculateLine}
                        disabled={recalcing}
                        title="Recalculate just this line — leaves the rest of the SOP's requirements untouched"
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 px-3 py-2 rounded-lg transition-colors"
                    >
                        {recalcing ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                        Recalculate line
                    </button>
                    <button
                        onClick={() => setShowReserve(true)}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors"
                    >
                        Reserve
                    </button>
                </div>
            </div>

            {showReserve && (
                <ReserveFulfillModal
                    item={reserveItem}
                    onClose={() => setShowReserve(false)}
                    onDone={() => { setShowReserve(false); onDone(); }}
                />
            )}
        </div>
    );
};

export default RequirementCellDrilldownModal;

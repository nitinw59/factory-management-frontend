// ─── RECALCULATION DEBUG BRIEF (for BE) ───────────────────────────────────────
// Emits a structured console report of the recalculation lifecycle so the backend
// team can see, at each phase, exactly what existing data the preview returned and
// how already-reserved quantities net against the (about-to-be-recomputed) gross
// requirements.
//
// Netting rule mirrored from the reservation UI (see reserve modals):
//     net_to_procure = max(0, required - already_reserved)
//
// BE contract this brief documents:
//   1. Recompute GROSS requirements from the finalized marker quantities.
//   2. Do NOT delete existing reservations — carry them over (match by requirement,
//      or by substitute link). Reserved stock stays reserved across a recalc.
//   3. NET procurement = gross_required − already_reserved (floored at 0). ONLY the
//      NET drives new purchase requests / purchase orders. Anything already reserved
//      is EXCLUDED from the new recalculation's procurement output.
// The recalculation-preview endpoint returns reservations as { fabric: [...], trim: [...] },
// whereas the per-requirement endpoints return a flat array. Normalize to a flat array so
// both the debug brief and the confirm modal can consume it uniformly.

import { Loader2, RotateCw, X } from 'lucide-react';

export const flattenReservations = (res) => {
    if (Array.isArray(res)) return res;
    if (res && typeof res === 'object') {
        return [
            ...(Array.isArray(res.fabric) ? res.fabric : []),
            ...(Array.isArray(res.trim)   ? res.trim   : []),
        ];
    }
    return [];
};

export const logRecalcBrief = (phase, sop, preview) => {
  // A debug logger must NEVER be able to break the actual recalc flow. Any bad
  // shape from the backend (e.g. reservations returned as an object, not an array)
  // is swallowed here instead of bubbling up into the caller's catch.
  try {
    if (typeof console === 'undefined') return;
    const p            = preview || {};
    const asArray      = (v) => (Array.isArray(v) ? v : []);
    const fabReqs      = asArray(p.fabric_requirements);
    const trimReqs     = asArray(p.trim_requirements);
    const reservations = flattenReservations(p.reservations);

    console.group(`%c[RECALC · ${phase}] SOP #${sop?.id} — ${sop?.product_name || ''}`,
        'color:#7c3aed;font-weight:bold');
    console.log('sop_id:', sop?.id, '| bom_id:', sop?.bom_id,
        '| has_existing_data:', p.has_existing_data, '| summary:', p.summary || {});

    // Fabric: gross required vs already-reserved → net to procure (reserved EXCLUDED)
    const fabRows = fabReqs.map(r => {
        const required = Number(r.meters_required ?? r.meters ?? 0);
        const reserved = Number(r.meters_reserved ?? 0);
        return {
            requirement_id:     r.id,
            fabric:             `${r.fabric_type_name || r.type || 'Fabric'}${(r.color_name || r.color) ? ' · ' + (r.color_name || r.color) : ''}${r.color_number ? ' · ' + r.color_number : ''}`,
            required_m:         +required.toFixed(2),
            already_reserved_m: +reserved.toFixed(2),
            net_to_procure_m:   +Math.max(0, required - reserved).toFixed(2),
        };
    });
    console.log('%cFabric — already-reserved EXCLUDED from net_to_procure:', 'color:#0369a1;font-weight:bold');
    console.table(fabRows);

    // Trim: gross required vs already-reserved → net to procure (reserved EXCLUDED)
    const trimRows = trimReqs.map(r => {
        const required = Number(r.quantity_required ?? r.quantity ?? 0);
        const reserved = Number(r.quantity_reserved ?? 0);
        return {
            requirement_id:       r.id,
            trim:                 `${r.trim_item_name || r.item || 'Trim'}${(r.color_name || r.color) ? ' · ' + (r.color_name || r.color) : ''}${r.variant_size ? ' · Sz ' + r.variant_size : ''}`,
            unit:                 r.unit_of_measure ?? r.unit ?? 'pcs',
            required_qty:         required,
            already_reserved_qty: reserved,
            net_to_procure_qty:   Math.max(0, required - reserved),
        };
    });
    console.log('%cTrim — already-reserved EXCLUDED from net_to_procure:', 'color:#0369a1;font-weight:bold');
    console.table(trimRows);

    // Raw reservations the BE must PRESERVE (never re-procured)
    console.log('%cReservations to PRESERVE (excluded from new procurement):', 'color:#059669;font-weight:bold');
    console.table(reservations.map(r => {
        const isFabric = (r.type || '').toLowerCase() === 'fabric' || r.meters_reserved != null || r.meters != null;
        return {
            reservation_id: r.id,
            requirement_id: r.fabric_requirement_id ?? r.trim_requirement_id ?? r.requirement_id ?? null,
            kind:           isFabric ? 'fabric' : 'trim',
            is_substitute:  !!r.is_substitute,
            reserved:       isFabric
                ? +Number(r.meters_reserved ?? r.reserved ?? r.meters ?? 0).toFixed(2)
                : Number(r.quantity_reserved ?? r.reserved ?? r.quantity ?? 0),
            source:         r.color_name ? `${r.color_name}${r.color_number ? ' (' + r.color_number + ')' : ''}` : undefined,
        };
    }));

    const totReservedFab = fabRows.reduce((s, r) => s + r.already_reserved_m, 0);
    const totNetFab      = fabRows.reduce((s, r) => s + r.net_to_procure_m, 0);
    const totReservedTrim = trimRows.reduce((s, r) => s + r.already_reserved_qty, 0);
    const totNetTrim      = trimRows.reduce((s, r) => s + r.net_to_procure_qty, 0);
    console.log('%cBE CONTRACT — reserved stock is EXCLUDED from recalculated procurement:',
        'color:#b91c1c;font-weight:bold',
        '\n • Recompute GROSS from finalized marker quantities.',
        '\n • Carry existing reservations over (never delete on recalc).',
        '\n • NET = gross_required − already_reserved (floor 0); only NET drives new PR/PO.',
        `\n • Fabric totals → reserved ${totReservedFab.toFixed(2)} m | net-to-procure ${totNetFab.toFixed(2)} m`,
        `\n • Trim totals   → reserved ${totReservedTrim.toLocaleString()} | net-to-procure ${totNetTrim.toLocaleString()}`);
    console.groupEnd();
  } catch (logErr) {
    // Debug-only failure — do not let it abort the recalc flow.
    console.warn('[RECALC] logRecalcBrief failed (non-fatal):', logErr);
  }
};

const RecalculateConfirmModal = ({ preview, sopName, onClose, onConfirm, busy, err }) => {
    const fabReqs      = preview?.fabric_requirements || [];
    const trimReqs     = preview?.trim_requirements   || [];
    const reservations = flattenReservations(preview?.reservations);
    const purchReqs    = preview?.purchase_requests   || [];
    const purchOrders  = preview?.purchase_orders     || [];
    const summary      = preview?.summary             || {};

    const fabricCount      = summary.fabric_count           ?? fabReqs.length;
    const trimCount        = summary.trim_count             ?? trimReqs.length;
    const reservationCount = summary.reservation_count      ?? reservations.length;
    const prCount          = summary.purchase_request_count ?? purchReqs.length;
    const poCount          = summary.purchase_order_count   ?? purchOrders.length;
    const totalMeters      = summary.total_meters
        ?? fabReqs.reduce((s, r) => s + Number(r.meters_required ?? r.meters ?? 0), 0);
    const totalQty         = summary.total_quantity
        ?? trimReqs.reduce((s, r) => s + Number(r.quantity_required ?? r.quantity ?? 0), 0);

    const fabLabel  = (r) => `${r.fabric_type_name || r.type || 'Fabric'}${(r.color_name || r.color) ? ' · ' + (r.color_name || r.color) : ''}${r.color_number ? ` · ${r.color_number}` : ''}`;
    const trimLabel = (r) => `${r.trim_item_name  || r.item || 'Trim'}${(r.color_name || r.color) ? ' · ' + (r.color_name || r.color) : ''}${r.color_number ? ` · ${r.color_number}` : ''}${r.variant_size ? ` · Sz ${r.variant_size}` : ''}`;
    const poStatusCls = (s) =>
        s === 'received'   ? 'bg-emerald-100 text-emerald-700' :
        s === 'in-transit' ? 'bg-blue-100 text-blue-700' :
        s === 'delayed'    ? 'bg-red-100 text-red-700' :
                             'bg-amber-100 text-amber-700';

    const Tile = ({ label, value, sub }) => (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className="text-base font-extrabold text-slate-800 leading-none mt-1">{value}</p>
            {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );

    const SectionBlock = ({ title, count, children }) => (
        <div>
            <div className="flex items-center justify-between mb-1 px-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                <span className="text-[10px] font-bold text-slate-300">{count}</span>
            </div>
            <ul className="rounded-lg border border-slate-100 divide-y divide-slate-100">{children}</ul>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!busy ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">
                            Destructive — recalculation will delete the items below
                        </p>
                        <h2 className="font-extrabold text-slate-800 text-base">Recalculate Requirements?</h2>
                        {sopName && <p className="text-xs text-slate-500 mt-0.5">{sopName}</p>}
                    </div>
                    {!busy && (
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5">
                            <X size={18} />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                        <Tile label="Fabric reqs"  value={fabricCount}      sub={`${Number(totalMeters).toFixed(1)} m`} />
                        <Tile label="Trim reqs"    value={trimCount}        sub={`${Number(totalQty).toLocaleString()} pcs`} />
                        <Tile label="Reservations" value={reservationCount} />
                        <Tile label="PR / PO"      value={`${prCount} / ${poCount}`} />
                    </div>

                    {fabReqs.length > 0 && (
                        <SectionBlock title="Fabric Requirements" count={fabReqs.length}>
                            {fabReqs.map((r, i) => (
                                <li key={r.id ?? `f-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3">
                                    <span className="truncate">{fabLabel(r)}</span>
                                    <span className="font-bold text-slate-700 shrink-0 ml-2">
                                        {Number(r.meters_required ?? r.meters ?? 0).toFixed(1)} m
                                    </span>
                                </li>
                            ))}
                        </SectionBlock>
                    )}

                    {trimReqs.length > 0 && (
                        <SectionBlock title="Trim Requirements" count={trimReqs.length}>
                            {trimReqs.map((r, i) => (
                                <li key={r.id ?? `t-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3">
                                    <span className="truncate">{trimLabel(r)}</span>
                                    <span className="font-bold text-slate-700 shrink-0 ml-2">
                                        {Number(r.quantity_required ?? r.quantity ?? 0).toLocaleString()} {r.unit_of_measure ?? r.unit ?? 'pcs'}
                                    </span>
                                </li>
                            ))}
                        </SectionBlock>
                    )}

                    {reservations.length > 0 && (
                        <SectionBlock title="Reservations" count={reservations.length}>
                            {reservations.map((r, i) => {
                                const isFabric = (r.type || '').toLowerCase() === 'fabric'
                                              || r.meters_reserved != null
                                              || r.meters != null;
                                const label = isFabric ? fabLabel(r) : trimLabel(r);
                                const amount = isFabric
                                    ? `${Number(r.meters_reserved ?? r.reserved ?? r.meters ?? 0).toFixed(1)} m reserved`
                                    : `${Number(r.quantity_reserved ?? r.reserved ?? r.quantity ?? 0).toLocaleString()} ${r.unit_of_measure ?? r.unit ?? 'pcs'} reserved`;
                                return (
                                    <li key={r.id ?? `rs-${i}`} className={`flex items-center justify-between text-xs py-1.5 px-3 gap-2 ${r.is_substitute ? 'bg-purple-50/50' : 'bg-emerald-50/40'}`}>
                                        <span className="truncate flex-1 min-w-0">
                                            {r.is_substitute && (
                                                <span className="inline-flex items-center mr-1.5 text-[9px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-full">
                                                    SUB
                                                </span>
                                            )}
                                            {label}
                                            {r.is_substitute && (r.color_name || r.color_number) && (
                                                <span className="ml-1 text-purple-600 font-semibold">
                                                    · {r.color_name}{r.color_number ? ` (${r.color_number})` : ''}
                                                </span>
                                            )}
                                        </span>
                                        <span className="font-bold text-emerald-700 shrink-0">{amount}</span>
                                    </li>
                                );
                            })}
                        </SectionBlock>
                    )}

                    {purchReqs.length > 0 && (
                        <SectionBlock title="Purchase Requests (not on PO)" count={purchReqs.length}>
                            {purchReqs.map((r, i) => {
                                const isFabric = (r.type || '').toLowerCase() === 'fabric';
                                const label = isFabric ? fabLabel(r) : trimLabel(r);
                                return (
                                    <li key={r.id ?? `pr-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3">
                                        <span className="truncate">{label}</span>
                                        <span className="font-bold text-amber-700 shrink-0 ml-2">
                                            {Number(r.quantity ?? r.meters ?? 0).toLocaleString()} {r.unit ?? (isFabric ? 'm' : 'pcs')}
                                        </span>
                                    </li>
                                );
                            })}
                        </SectionBlock>
                    )}

                    {purchOrders.length > 0 && (
                        <SectionBlock title="Purchase Orders" count={purchOrders.length}>
                            {purchOrders.map((r, i) => {
                                const isFabric = (r.type || '').toLowerCase() === 'fabric';
                                const label = isFabric ? fabLabel(r) : trimLabel(r);
                                const status = r.po_status ?? r.status ?? 'pending';
                                return (
                                    <li key={r.id ?? `po-${i}`} className="flex items-center justify-between text-xs py-1.5 px-3 gap-2">
                                        <span className="truncate flex-1 min-w-0">
                                            <span className="font-semibold">{r.po_code || (r.purchase_order_id ? `PO #${r.purchase_order_id}` : 'PO')}</span>
                                            {r.supplier_name ? ` · ${r.supplier_name}` : ''}
                                            <span className="text-slate-400"> · {label}</span>
                                            {(r.quantity != null || r.meters != null) && (
                                                <span className="text-slate-500"> · {Number(r.quantity ?? r.meters ?? 0).toLocaleString()} {r.unit ?? (isFabric ? 'm' : 'pcs')}</span>
                                            )}
                                        </span>
                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${poStatusCls(status)}`}>
                                            {status}
                                        </span>
                                    </li>
                                );
                            })}
                        </SectionBlock>
                    )}

                    {fabReqs.length === 0 && trimReqs.length === 0 && reservations.length === 0 && purchReqs.length === 0 && purchOrders.length === 0 && (
                        <p className="text-center text-sm text-slate-400 italic py-6">No existing data — recalculation will compute from scratch.</p>
                    )}

                    {err && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{err}</p>}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button onClick={onClose} disabled={busy}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={busy}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}
                        Confirm Recalculate
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecalculateConfirmModal;

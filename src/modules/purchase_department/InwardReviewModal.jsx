import { useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { labelFromGroup } from './inwardShared';

/**
 * InwardReviewModal — shows the prepared items, lets the user confirm or go back.
 *
 * Props
 *   poId           — PO id we'll POST/PATCH against
 *   inward         — existing inward (edit) or null (create)
 *   payload        — { items, grnNumber, receivedDate, condition, notes, scanFile }
 *   poItems        — joined PO items (for label lookup)
 *   trimItems, fabricTypes, fabricColors, variantsByTrim — lookups for custom rows
 *   onBack(payload) — user wants to edit; parent should re-open the form preserving state
 *   onConfirmed(savedInward) — server returned success
 *   onClose()      — close everything
 */
export default function InwardReviewModal({
    poId,
    inward = null,
    payload,
    poItems = [],
    trimItems = [],
    fabricTypes = [],
    fabricColors = [],
    variantsByTrim = {},
    onBack,
    onConfirmed,
    onClose,
}) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    const isCreate = !inward;

    const reqIdToPoGroup = useMemo(() => {
        const m = new Map();
        (poItems || []).forEach(g => (g.requirements || []).forEach(r => m.set(r.id, g)));
        return m;
    }, [poItems]);

    const summary = useMemo(() => {
        const variantPool = Object.values(variantsByTrim).flat();
        return (payload?.items || []).map((it, idx) => {
            // If the Create modal already stamped a label, prefer it — no lookup needed.
            if (it._label) {
                return {
                    key:     `r-${idx}`,
                    name:    it._label.name || 'Item',
                    details: it._label.details || '',
                    qty:     it.qty_received,
                    unit:    it._label.unit || 'pcs',
                    rolls:   it.rolls || null,
                };
            }
            if (it.requirement_id != null) {
                const g = reqIdToPoGroup.get(it.requirement_id);
                const isFabric = g?.item_type === 'fabric';
                const { name, details } = labelFromGroup(g);
                return {
                    key:     `r-${idx}`,
                    name:    name || `Requirement #${it.requirement_id}`,
                    details,
                    qty:     it.qty_received,
                    unit:    isFabric ? 'm' : (g?.uom || 'pcs'),
                    rolls:   it.rolls || null,
                };
            }
            if (it.purchase_order_item_id != null) {
                const wantPo = String(it.purchase_order_item_id);
                const p = (poItems || []).find(x => String(x.id) === wantPo);
                const isFabric = p?.item_type === 'fabric';
                const { name, details } = labelFromGroup(p);
                return {
                    key:     `po-${idx}`,
                    name:    name || `PO item #${it.purchase_order_item_id}`,
                    details,
                    qty:     it.qty_received,
                    unit:    isFabric ? 'm' : (p?.uom || 'pcs'),
                    rolls:   it.rolls || null,
                };
            }
            const isFabric = it.item_type === 'fabric';
            let name = '';
            let details = '';
            if (isFabric) {
                const t = fabricTypes.find(x => String(x.id) === String(it.fabric_type_id));
                const c = fabricColors.find(x => String(x.id) === String(it.fabric_color_id));
                name = t?.name || t?.fabric_type_name || 'Fabric';
                const parts = [];
                if (c?.color_number) parts.push(c.color_number);
                if (c?.color_name)   parts.push(c.color_name);
                details = parts.join(' · ');
            } else {
                const v = variantPool.find(x => String(x.id) === String(it.trim_item_variant_id));
                const trimParent = v ? trimItems.find(t => String(t.id) === String(v.trim_item_id)) : null;
                name = trimParent?.name || trimParent?.item_name || 'Trim';
                if (v) {
                    const parts = [];
                    if (v.color_number)  parts.push(v.color_number);
                    if (v.color_name)    parts.push(v.color_name);
                    if (v.variant_size)  parts.push(`Sz ${v.variant_size}`);
                    details = parts.join(' · ');
                } else {
                    details = `Variant #${it.trim_item_variant_id}`;
                }
            }
            return {
                key:     `c-${idx}`,
                name,
                details,
                qty:     it.qty_received,
                unit:    isFabric ? 'm' : 'pcs',
                rolls:   it.rolls || null,
            };
        });
    }, [payload, reqIdToPoGroup, poItems, fabricTypes, fabricColors, variantsByTrim, trimItems]);

    const handleConfirm = async () => {
        if (!payload?.items) return;
        setBusy(true); setErr(null);
        try {
            // Strip the client-side `_label` decoration before posting — the
            // backend should never see it.
            // eslint-disable-next-line no-unused-vars
            const sanitizedItems = payload.items.map(({ _label, ...rest }) => rest);
            const body = {
                grn_number:    payload.grnNumber || undefined,
                received_date: payload.receivedDate,
                condition:     payload.condition || undefined,
                notes:         payload.notes || undefined,
                items:         sanitizedItems,
            };
            const res = isCreate
                ? await purchaseDeptApi.createInward(poId, body, payload.scanFile)
                : await purchaseDeptApi.updateInward(inward.id, body, payload.scanFile);
            onConfirmed?.(res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-500" />
                            Review before saving
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {summary.length} line{summary.length !== 1 ? 's' : ''} will be {isCreate ? 'recorded' : 'updated'} on GRN {payload?.grnNumber || '(auto)'} dated {payload?.receivedDate}.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        {summary.map(row => (
                            <div key={row.key} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800">{row.name}</p>
                                    {row.details && (
                                        <p className="text-[11px] text-slate-600 mt-0.5">{row.details}</p>
                                    )}
                                    {row.rolls && row.rolls.length > 0 && (
                                        <ul className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                                            {row.rolls.map((r, i) => (
                                                <li key={i} className="font-mono">
                                                    {r.bale_no || '—'} · {Number(r.meter).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.uom || 'm'}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                        {Number(row.qty).toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                    </p>
                                    {row.rolls && row.rolls.length > 0 && (
                                        <p className="text-[9px] text-slate-400">{row.rolls.length} roll{row.rolls.length !== 1 ? 's' : ''}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {payload?.notes && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{payload.notes}</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                    <button
                        onClick={() => onBack?.(payload)}
                        disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                    >
                        <ArrowLeft size={12} /> Back to edit
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={busy}
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                    >
                        {busy && <Loader2 size={12} className="animate-spin" />}
                        {isCreate ? 'Confirm & Save' : 'Confirm changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

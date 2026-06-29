import { useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, Trash2, FileText, ExternalLink } from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { IMAGE_BASE_URL } from '../../utils/api';
import { labelFromGroup } from './inwardShared';
import SupplierCodePill from './SupplierCodePill';

/**
 * InwardDisplayModal — read-only view of an existing inward (GRN).
 *
 * Props
 *   inward       — the saved inward object (must include .items[])
 *   poItems      — joined PO items, used to resolve labels for linked rows
 *   onClose()    — close modal
 *   onDeleted(id)— invoked after a successful delete (if the user clicks Delete)
 */
export default function InwardDisplayModal({
    inward,
    poItems = [],
    supplierId,
    supplierName,
    poCode,
    poId,
    onClose,
    onDeleted,
}) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

    const reqIdToPoGroup = useMemo(() => {
        const m = new Map();
        (poItems || []).forEach(g => (g.requirements || []).forEach(r => m.set(r.id, g)));
        return m;
    }, [poItems]);

    // Resolve every saved item to a presentable row.
    const rows = useMemo(() => {
        const all = (inward?.items || []).map((it, idx) => {
            if (it.purchase_requirement_id != null) {
                const g = reqIdToPoGroup.get(it.purchase_requirement_id);
                const isFabric = g?.item_type === 'fabric';
                const { name, details } = labelFromGroup(g);
                return {
                    key:      `r-${idx}`,
                    name:     name || `Requirement #${it.purchase_requirement_id}`,
                    details,
                    qty:      parseFloat(it.qty_received || 0),
                    unit:     isFabric ? 'm' : (g?.uom || it.uom || 'pcs'),
                    rolls:    it.rolls || null,
                    isTrim:   !isFabric,
                    variantId: g?.trim_item_variant_id ?? null,
                };
            }
            if (it.purchase_order_item_id != null) {
                const p = (poItems || []).find(x => x.id === it.purchase_order_item_id);
                const isFabric = p?.item_type === 'fabric';
                const { name, details } = labelFromGroup(p);
                return {
                    key:      `po-${idx}`,
                    name:     name || `PO item #${it.purchase_order_item_id}`,
                    details,
                    qty:      parseFloat(it.qty_received || 0),
                    unit:     isFabric ? 'm' : (p?.uom || it.uom || 'pcs'),
                    rolls:    it.rolls || null,
                    isTrim:   !isFabric,
                    variantId: p?.trim_item_variant_id ?? null,
                };
            }
            // Custom (no PO/req link) — stored joined names should already be on the item.
            const isFabric = (it.item_type || 'trim') === 'fabric';
            const name = isFabric
                ? (it.fabric_type_name || 'Fabric')
                : (it.trim_item_name || 'Trim');
            const parts = [];
            if (isFabric) {
                if (it.fabric_color_number) parts.push(it.fabric_color_number);
                if (it.fabric_color_name)   parts.push(it.fabric_color_name);
            } else {
                if (it.variant_color_number) parts.push(it.variant_color_number);
                if (it.variant_color_name)   parts.push(it.variant_color_name);
                if (it.variant_size)         parts.push(`Sz ${it.variant_size}`);
            }
            return {
                key:      `c-${idx}`,
                name,
                details:  parts.join(' · ') || (it.description || ''),
                qty:      parseFloat(it.qty_received || 0),
                unit:     isFabric ? 'm' : (it.uom || 'pcs'),
                rolls:    it.rolls || null,
                isTrim:   !isFabric,
                variantId: it.trim_item_variant_id ?? null,
            };
        });
        return all;
    }, [inward, reqIdToPoGroup, poItems]);

    const totalQtyAll = rows.reduce((s, r) => s + (r.qty || 0), 0);

    const scanUrl = useMemo(() => {
        const url = inward?.scan_url;
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    }, [inward]);

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

    if (!inward) return null;

    const canDelete = inward.invoice_id == null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <FileText size={16} className="text-emerald-500" />
                            Inward · {inward.grn_number || `#${inward.id}`}
                        </h2>
                        {(poCode || poId) && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                PO · {poCode || `#${poId}`}
                            </p>
                        )}
                        <p className="text-xs text-slate-500 mt-0.5">
                            {inward.received_date ? new Date(inward.received_date).toLocaleDateString('en', { dateStyle: 'medium' }) : '—'}
                            {inward.created_by_name ? ` · Recorded by ${inward.created_by_name}` : ''}
                            {inward.condition ? ` · ${inward.condition}` : ''}
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

                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Items received</p>
                            <p className="text-xs text-slate-700">{rows.length} line{rows.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                {totalQtyAll.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-slate-400">aggregate qty</p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        {rows.map(row => (
                            <div key={row.key} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800">{row.name}</p>
                                    {row.details && (
                                        <p className="text-[11px] text-slate-600 mt-0.5">{row.details}</p>
                                    )}
                                    {row.isTrim && row.variantId && (
                                        <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={row.variantId} className="mt-0.5" />
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
                                        {row.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                    </p>
                                    {row.rolls && row.rolls.length > 0 && (
                                        <p className="text-[9px] text-slate-400">{row.rolls.length} roll{row.rolls.length !== 1 ? 's' : ''}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {inward.notes && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{inward.notes}</p>
                        </div>
                    )}

                    {scanUrl && (
                        <a href={scanUrl} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 underline">
                            <ExternalLink size={12} /> View scan
                        </a>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                    <div>
                        {canDelete ? (
                            <button
                                onClick={handleDelete}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                            >
                                {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                Delete inward
                            </button>
                        ) : (
                            <p className="text-[10px] text-slate-400 italic">Linked to an invoice — unlink first to delete.</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

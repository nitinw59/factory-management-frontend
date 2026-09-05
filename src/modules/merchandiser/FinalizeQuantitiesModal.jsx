// ─── FINALIZE QUANTITIES MODAL ────────────────────────────────────────────────
// Quantities are imported straight from the Sales Order per color, per size,
// and manually confirmed/adjusted — no marker or marker_runs involved. A
// color's finalized_quantity sent to the backend is the sum of its (possibly
// edited) per-size quantities. Fabric/trim requirements are computed purely
// from that total against the BOM's own consumption rules (see
// recalcPlanForSop on the backend), which only ever needed the total.
//
// Exports orderedTotalFor/colorTotalFor/PerSizeQuantityEditor — also used by
// LinkAndAllocateModal's Step 2 (same per-size confirmation UI at link time).

import { useState } from 'react';
import { Calculator, Loader2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { stdSize } from '../../utils/sizeUtils';
import { dedupeColorsById } from './merchandiserShared';

export const orderedTotalFor = (sizes) => (sizes || []).reduce((s, sz) => s + (Number(sz.quantity) || 0), 0);

export const sizeKeyOf = (sz) => String(sz.size_id ?? sz.size_name ?? sz.size ?? '');

// overrides: { [sizeKey]: string } — per-size quantity edits for one color.
// Falls back to that size's own ordered quantity when not overridden.
export const sizeQtyFor = (sz, overrides) => {
    const override = overrides?.[sizeKeyOf(sz)];
    return override !== undefined && override !== '' ? Number(override) : (Number(sz.quantity) || 0);
};
export const colorTotalFor = (sizes, overrides) =>
    (sizes || []).reduce((s, sz) => s + sizeQtyFor(sz, overrides), 0);

// Editable per-size quantity grid for one color — pre-filled from the order,
// each size individually adjustable (instead of one lump total).
export const PerSizeQuantityEditor = ({ sizes, overrides, onChange }) => (
    <div className="flex flex-wrap gap-2">
        {(sizes || []).filter(sz => Number(sz.quantity) > 0 || overrides?.[sizeKeyOf(sz)] !== undefined).map(sz => {
            const key   = sizeKeyOf(sz);
            const sName = stdSize(sz.size_name || sz.size || key);
            const value = overrides?.[key] ?? String(Number(sz.quantity) || 0);
            return (
                <div key={key} className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 min-w-[60px]">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">{sName}</span>
                    <input type="number" min="0" value={value}
                        onChange={e => onChange(key, e.target.value)}
                        className="w-14 mt-0.5 border border-slate-200 rounded px-1 py-0.5 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                    />
                </div>
            );
        })}
        {(sizes || []).length === 0 && (
            <p className="text-xs text-slate-400 italic">No size breakdown available for this color.</p>
        )}
    </div>
);

const FinalizeQuantitiesModal = ({ sop, onClose, onDone }) => {
    const [qtyOverrides, setQtyOverrides] = useState({}); // { [colorId]: { [sizeKey]: string } }
    const [error,        setError]        = useState(null);
    const [submitting,   setSubmitting]   = useState(false);

    const setSizeQty = (colorId, sizeKey, value) => {
        setQtyOverrides(prev => ({ ...prev, [colorId]: { ...(prev[colorId] || {}), [sizeKey]: value } }));
    };

    const handleConfirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const quantities = (sop.colors || []).map(c => ({
                fabric_color_id:    Number(c.fabric_color_id),
                finalized_quantity: colorTotalFor(c.sizes, qtyOverrides[String(c.fabric_color_id)]),
            }));
            const invalid = quantities.find(q => !q.fabric_color_id || !q.finalized_quantity);
            if (invalid) {
                setError('Cannot finalize: a color has no valid quantity or fabric color.');
                setSubmitting(false);
                return;
            }
            await planningApi.finalizeQuantities(sop.id, { quantities });
            await planningApi.calculateRequirements(sop.id);
            onDone();
        } catch (e) {
            setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to save quantities');
            setSubmitting(false);
        }
    };

    const hasBom = !!sop.bom_id;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!submitting ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Finalize Quantities</p>
                        <h2 className="font-extrabold text-slate-800 text-base">{sop.product_name}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Quantities are imported from the Sales Order — adjust and confirm.</p>
                    </div>
                    {!submitting && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5"><X size={18} /></button>}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
                    )}
                    {!hasBom && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            No BOM linked. Link a BOM to this product line first.
                        </p>
                    )}

                    {dedupeColorsById(sop.colors).map(c => {
                        const colorId = String(c.fabric_color_id);
                        const sizes   = c.sizes || [];
                        const ordered = orderedTotalFor(sizes);
                        const total   = colorTotalFor(sizes, qtyOverrides[colorId]);

                        return (
                            <div key={colorId} className="border border-slate-200 rounded-xl overflow-hidden">
                                {/* Color header */}
                                <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
                                    <span className="font-bold text-slate-800 text-sm">{c.color_name}</span>
                                    {c.color_number && (
                                        <span className="text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{c.color_number}</span>
                                    )}
                                    <span className="ml-auto text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded font-medium">
                                        {ordered.toLocaleString()} pcs ordered
                                    </span>
                                </div>

                                <div className="p-4 space-y-3">
                                    {/* Per-size quantity — pre-filled from the order, each size editable */}
                                    <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Finalized Quantity per Size</label>
                                        <PerSizeQuantityEditor
                                            sizes={sizes}
                                            overrides={qtyOverrides[colorId]}
                                            onChange={(sizeKey, val) => setSizeQty(colorId, sizeKey, val)}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 text-right">
                                        Total: <span className="font-bold text-slate-800">{total.toLocaleString()}</span> pcs
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                    <button onClick={onClose} disabled={submitting}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={submitting || !hasBom || (sop.colors || []).length === 0}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
                        Confirm & Calculate
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinalizeQuantitiesModal;

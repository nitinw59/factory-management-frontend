// ─── LINK + ALLOCATE MODAL ────────────────────────────────────────────────────
// Two-step flow: Step 1 = select BOM (+ secondary fabric if the BOM needs it),
// Step 2 = confirm quantities per color (imported from the Sales Order, no
// marker involved). On confirm: links the BOM, finalizes quantities, calculates
// requirements. Wired directly from SopHeaderToolbar's "Link/Change BOM" button.

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye, Link2, Loader2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { bomApi } from '../../api/bomApi';
import { stdSize } from '../../utils/sizeUtils';
import { logBomBrief } from './BomPreviewModal';
import { colorTotalFor, PerSizeQuantityEditor } from './FinalizeQuantitiesModal';
import { dedupeColorsById } from './merchandiserShared';

const LinkAndAllocateModal = ({ sop, bomOptions, fabricTypes, onClose, onDone, onLink, onPreview }) => {
    const [step,            setStep]            = useState(1);
    const [pickedBomId,     setPickedBomId]     = useState('');
    const [pickedBomDetail, setPickedBomDetail] = useState(null);
    const [loadingDetail,   setLoadingDetail]   = useState(false);
    // Only used when the picked BOM has a generic SECONDARY fabric line (e.g. a lining/
    // contrast fabric that isn't pinned to a specific type on the BOM itself) — the
    // concrete fabric for that role is chosen here, per order, instead.
    const [pickedSecondaryFabricTypeId, setPickedSecondaryFabricTypeId] = useState(
        sop.secondary_fabric_type_id ? String(sop.secondary_fabric_type_id) : ''
    );
    const [qtyOverrides, setQtyOverrides] = useState({}); // { [colorId]: { [sizeKey]: string } }
    const [submitting,   setSubmitting]   = useState(false);
    const [error,        setError]        = useState(null);

    const setSizeQty = (colorId, sizeKey, value) => {
        setQtyOverrides(prev => ({ ...prev, [colorId]: { ...(prev[colorId] || {}), [sizeKey]: value } }));
    };

    // Aggregate order sizes across all colors
    const combinedSizeMap = useMemo(() => {
        const map = {};
        (sop.colors || []).forEach(c => {
            (c.sizes || []).forEach(sz => {
                const key = sz.size_name ?? String(sz.size_id);
                if (key) map[key] = (map[key] || 0) + (Number(sz.quantity) || 0);
            });
        });
        return map;
    }, [sop.colors]);

    const sizeEntries = useMemo(() =>
        Object.keys(combinedSizeMap).length > 0
            ? Object.entries(combinedSizeMap).filter(([, v]) => parseInt(v) > 0)
            : Object.entries(sop.size_breakdown || {}).filter(([, v]) => parseInt(v) > 0),
        [combinedSizeMap, sop.size_breakdown]);

    // Use detailed ratio groups when loaded, fall back to list-level data — shown
    // as informational context on the BOM picker (actual cutting-layout reference),
    // not something the merchandiser selects here.
    const ratioGroups = pickedBomDetail?.ratio_groups
        || bomOptions.find(b => String(b.id) === pickedBomId)?.ratio_groups
        || [];

    // True once the fully-detailed BOM (with its BOM-level fabric_consumptions) has
    // loaded and at least one line is a generic SECONDARY fabric — requires the picker below.
    const needsSecondaryFabric = !!pickedBomDetail?.fabric_consumptions?.some(
        fc => fc.fabric_role === 'SECONDARY'
    );

    const pickBom = async (bomId) => {
        setPickedBomId(bomId);
        setPickedBomDetail(null);
        setLoadingDetail(true);
        try {
            const res    = await bomApi.getById(parseInt(bomId));
            const detail = res.data?.data ?? res.data;
            logBomBrief('LINK-PICK', detail);
            setPickedBomDetail(detail);
        } catch { }
        finally { setLoadingDetail(false); }
    };

    const handleConfirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const quantities = (sop.colors || []).map(c => ({
                fabric_color_id:    Number(c.fabric_color_id),
                finalized_quantity: colorTotalFor(c.sizes, qtyOverrides[String(c.fabric_color_id)]),
            }));
            // Validate before onLink so we never leave the BOM linked but quantities un-finalized.
            const invalid = quantities.find(q => !q.fabric_color_id || !q.finalized_quantity);
            if (invalid) {
                setError('Cannot finalize: a color has no valid quantity or fabric color.');
                setSubmitting(false);
                return;
            }
            // Log the BOM being committed so its consumption shape is captured right
            // next to the calculate result (the two must be read together).
            logBomBrief('LINK-CONFIRM', pickedBomDetail);

            await onLink(sop.id, parseInt(pickedBomId),
                pickedSecondaryFabricTypeId ? parseInt(pickedSecondaryFabricTypeId) : null);

            await planningApi.finalizeQuantities(sop.id, { quantities });

            const calcRes = await planningApi.calculateRequirements(sop.id);
            const calcData = calcRes?.data?.data ?? calcRes?.data;
            const fabCount  = (calcData?.fabric_requirements || []).length;
            if (fabCount === 0) {
                console.warn('%c⚠ calculate-requirements produced ZERO fabric rows for SOP ' + sop.id +
                    ' — check the BOM brief above: it likely has no fabric_consumptions.', 'color:#b91c1c;font-weight:bold');
            }
            onDone();
        } catch (e) {
            setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to link and allocate');
            setSubmitting(false);
        }
    };

    const stepTitle = step === 1 ? 'Step 1 of 2 — Select BOM' : 'Step 2 of 2 — Confirm Quantities';

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!submitting ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{stepTitle}</p>
                        <h2 className="font-extrabold text-slate-800 text-base">{sop.product_name}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {step === 1 ? 'Pick an approved BOM for this product line.' : 'Quantities are imported from the Sales Order — adjust and confirm.'}
                        </p>
                    </div>
                    {!submitting && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 mt-0.5"><X size={18} /></button>}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

                    {/* ── STEP 1: Select BOM ── */}
                    {step === 1 && (<>
                        {/* Order sizes */}
                        {sizeEntries.length > 0 && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Order Requires</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {sizeEntries.map(([rawSize, qty]) => {
                                        const s = stdSize(rawSize);
                                        return (
                                            <span key={s} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 shadow-sm">
                                                <span className="text-slate-500">{s}</span>
                                                <span className="text-slate-300">:</span>
                                                <span>{parseInt(qty).toLocaleString()} pcs</span>
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* BOM list */}
                        {bomOptions.length === 0 ? (
                            <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                No approved BOMs available for this product
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {bomOptions.map(bom => {
                                    const isSelected = pickedBomId === String(bom.id);
                                    const rgs        = isSelected ? ratioGroups : (bom.ratio_groups || []);
                                    return (
                                        <div key={bom.id} className={`rounded-xl border transition-all ${
                                            isSelected ? 'border-violet-400 bg-violet-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/20'
                                        }`}>
                                            <label className="flex items-start gap-3 p-3 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name={`bom-link-${sop.id}`}
                                                    value={bom.id}
                                                    checked={isSelected}
                                                    onChange={() => pickBom(String(bom.id))}
                                                    className="mt-1 accent-violet-600 shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-800 text-sm truncate">{bom.bom_name}</p>
                                                        <button
                                                            onClick={e => { e.preventDefault(); e.stopPropagation(); onPreview(bom.id); }}
                                                            className="shrink-0 text-slate-400 hover:text-violet-600 transition-colors p-0.5"
                                                            title="Preview BOM"
                                                        >
                                                            <Eye size={13} />
                                                        </button>
                                                    </div>
                                                    {isSelected && loadingDetail ? (
                                                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                                                            <Loader2 size={10} className="animate-spin" /> Loading ratio groups…
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {rgs.map((rg, i) => {
                                                                const items = (rg.items || [])
                                                                    .map(it => `${stdSize(it.size || '')}×${it.number_of_pieces || 1}`)
                                                                    .filter(Boolean);
                                                                return (
                                                                    <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                                                        isSelected
                                                                            ? 'bg-violet-50 text-violet-700 border-violet-200'
                                                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                                                    }`}>
                                                                        {rg.ratio_group_name || `Group ${i + 1}`}
                                                                        {items.length > 0 && (
                                                                            <span className="font-normal text-[8px] ml-1 opacity-70">{items.join(' ')}</span>
                                                                        )}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Secondary fabric — only when the picked BOM has a generic SECONDARY line */}
                        {needsSecondaryFabric && (
                            <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
                                <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider mb-1.5">
                                    Secondary Fabric — required
                                </p>
                                <p className="text-[11px] text-violet-600 mb-2">
                                    This BOM has a generic secondary fabric line (e.g. lining/contrast). Pick the actual fabric this order uses for it.
                                </p>
                                <select
                                    value={pickedSecondaryFabricTypeId}
                                    onChange={e => setPickedSecondaryFabricTypeId(e.target.value)}
                                    className="w-full border border-violet-300 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                                >
                                    <option value="">— Select secondary fabric —</option>
                                    {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                                </select>
                            </div>
                        )}
                    </>)}

                    {/* ── STEP 2: Confirm quantities per color, per size ── */}
                    {step === 2 && dedupeColorsById(sop.colors).map(c => {
                        const colorId = String(c.fabric_color_id);
                        const sizes   = c.sizes || [];
                        const ordered = (sizes || []).reduce((s, sz) => s + (Number(sz.quantity) || 0), 0);
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
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                    {step === 1 ? (
                        <>
                            <button onClick={onClose} disabled={submitting}
                                className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                                Cancel
                            </button>
                            <button
                                onClick={() => setStep(2)}
                                disabled={!pickedBomId || loadingDetail || (needsSecondaryFabric && !pickedSecondaryFabricTypeId)}
                                className="flex items-center gap-1.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl transition-colors"
                            >
                                {loadingDetail ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                                Next: Confirm Quantities
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => { setStep(1); setError(null); }} disabled={submitting}
                                className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                                <ChevronLeft size={14} /> Back
                            </button>
                            <button onClick={handleConfirm} disabled={submitting || (sop.colors || []).length === 0}
                                className="flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl transition-colors shadow-sm">
                                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                Link & Calculate
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LinkAndAllocateModal;

// ─── BOM PREVIEW MODAL ────────────────────────────────────────────────────────
// Read-only BOM viewer — ratio groups, BOM-level fabric consumptions, and
// materials/trims grouped by the product's own workflow stage. Also exports
// summarizeBom/logBomBrief, reused by LinkAndAllocateModal at link time.

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { bomApi } from '../../api/bomApi';
import { Spinner } from './merchandiserShared';

// Fabric requirements are generated from finalized_quantity × fabric_consumptions
// (BOM-level, one average per fabric/role — no marker involved). If a linked BOM
// has NO fabric_consumptions, calculate-requirements yields zero fabric rows —
// which is exactly the "fabric_requirements: []" symptom. This summary makes
// that visible at link time.
export const summarizeBom = (bom) => {
    const fabricConsumptions = (bom?.fabric_consumptions || []).map(fc => ({
        fabric_type_id:     fc.fabric_type_id,
        fabric_type_name:   fc.fabric_type_name,
        fabric_role:        fc.fabric_role,
        consumption_inches: fc.consumption_inches,
    }));
    return {
        bom_id:                     bom?.id,
        bom_name:                   bom?.bom_name,
        ratio_group_count:          (bom?.ratio_groups || []).length,
        fabric_consumption_count:   fabricConsumptions.length,
        material_consumption_count: (bom?.material_consumptions || []).length,
        fabricConsumptions,
    };
};

export const logBomBrief = (phase, bom) => {
    try {
        const s = summarizeBom(bom);
        console.group(`%c[BOM · ${phase}] #${s.bom_id} — ${s.bom_name || ''}`, 'color:#0369a1;font-weight:bold');
        console.log('ratio_groups:', s.ratio_group_count,
            '| fabric_consumptions:', s.fabric_consumption_count,
            '| material_consumptions (trims):', s.material_consumption_count);
        if (s.fabric_consumption_count === 0) {
            console.warn('%c⚠ This BOM has NO fabric_consumptions — calculate-requirements will produce ZERO fabric rows.',
                'color:#b91c1c;font-weight:bold');
        } else {
            console.log('%cFabric consumptions found:', 'color:#059669;font-weight:bold');
            console.table(s.fabricConsumptions);
        }
        console.log('raw BOM:', bom);
        console.groupEnd();
    } catch (e) {
        console.warn('[BOM] logBomBrief failed (non-fatal):', e);
    }
};

// Groups a BOM's material_consumptions by the product's own workflow stage
// (bom.product_stages, from bomController.getBomFullDetail), ordered by
// sequence_no, with an "Unassigned" bucket (legacy/no-stage rows) surfaced
// first when present. Mirrors the grouping used in the BOM editor, dashboard,
// approval, and batch-drilldown views.
const materialsByStage = (bom) => {
    const stages = bom?.product_stages || [];
    const groups = stages.map(s => ({
        key: `stage-${s.production_line_type_id}`,
        label: s.stage_name,
        materials: (bom?.material_consumptions || []).filter(mc => String(mc.production_line_type_id || '') === String(s.production_line_type_id)),
    })).filter(g => g.materials.length > 0);
    const unassigned = (bom?.material_consumptions || []).filter(mc => !mc.production_line_type_id);
    if (unassigned.length > 0) groups.unshift({ key: 'unassigned', label: 'Unassigned', materials: unassigned });
    return groups;
};

const BomPreviewModal = ({ bomId, onClose }) => {
    const [bom,     setBom]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [err,     setErr]     = useState(null);

    useEffect(() => {
        bomApi.getById(bomId)
            .then(res => {
                const detail = res.data?.data ?? res.data;
                logBomBrief('PREVIEW', detail);
                setBom(detail);
            })
            .catch(e  => setErr(e?.response?.data?.error || e?.response?.data?.message || e.message || 'Failed to load BOM'))
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
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Fabric Consumptions — BOM-level, not per marker/ratio group */}
                            {(bom.fabric_consumptions || []).length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fabric Consumptions</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {bom.fabric_consumptions.map((fc, j) => (
                                            <span key={j} className="bg-sky-50 text-sky-700 border border-sky-100 rounded px-2 py-0.5 text-[10px] font-bold" title={fc.comments || undefined}>
                                                {fc.fabric_role ? `${fc.fabric_role} (generic)` : (fc.fabric_type_name || `Fabric #${fc.fabric_type_id}`)}: {fc.consumption_inches}" / pc
                                                {fc.comments && <span className="font-normal text-sky-500"> — {fc.comments}</span>}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Materials — grouped by the product's own workflow stage */}
                            {(bom.material_consumptions || []).length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Materials & Trims</p>
                                    <div className="space-y-3">
                                        {materialsByStage(bom).map(group => (
                                            <div key={group.key}>
                                                <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${group.key === 'unassigned' ? 'text-amber-600' : 'text-violet-500'}`}>
                                                    {group.label} <span className="font-normal normal-case text-slate-400">· {group.materials.length}</span>
                                                </p>
                                                <div className="space-y-1.5">
                                                    {group.materials.map((mc, i) => (
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
                                                            {mc.comments && (
                                                                <p className="text-[9px] text-slate-400 mb-1 italic">💬 {mc.comments}</p>
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

export default BomPreviewModal;

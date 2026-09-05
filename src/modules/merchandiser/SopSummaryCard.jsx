// ─── SOP SUMMARY CARD (product → BOM link, list view) ───────────────────────
// One row per product line in the SOP list: BOM link status, readiness toggle,
// color/size chips, and an "Open Workspace" action that swaps the page's right
// panel into MerchandiserSopWorkspace (replacing the old inline
// ProductionTrackingModal). Clickable into the workspace even before a BOM is
// linked — the workspace itself prompts to link one.

import { useState, useEffect } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronRight, Eye, Link2, Loader2,
    ShieldCheck, ShieldOff, X,
} from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { stdSize } from '../../utils/sizeUtils';
import { dedupeColorsById } from './merchandiserShared';
import LinkAndAllocateModal from './LinkAndAllocateModal';

const READINESS_CFG = {
    in_planning:          { label: 'In Planning',  cls: 'bg-amber-50  text-amber-600  border-amber-200',   icon: null },
    ready_for_production: { label: 'Ready',        cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle2 },
    force_ready:          { label: 'Force Ready',  cls: 'bg-violet-50 text-violet-700 border-violet-200',  icon: ShieldCheck },
};

const SopSummaryCard = ({ sop, salesOrder, bomOptions, fabricTypes, onLink, onUnlink, onPreview, isLinking, onReadinessChange, onOpenWorkspace }) => {
    const [showLinkModal,    setShowLinkModal]    = useState(false);
    const [expandedColorId,  setExpandedColorId]  = useState(null);
    const [confirmUnlink,    setConfirmUnlink]    = useState(false);
    const [readinessLoading, setReadinessLoading] = useState(false);
    const [sopReqs,          setSopReqs]          = useState(null);
    const [loadingReqs,      setLoadingReqs]      = useState(false);

    useEffect(() => {
        if (!sop.bom_id) return;
        setLoadingReqs(true);
        planningApi.getRequirements(sop.id)
            .then(r => setSopReqs(r.data?.data ?? r.data))
            .catch(() => setSopReqs(null))
            .finally(() => setLoadingReqs(false));
    }, [sop.bom_id, sop.id]);

    const linkedBomDetail = bomOptions.find(b => b.id === sop.bom_id);
    const totalQty = (sop.colors || []).reduce((s, c) => s + (c.quantity || c.total_quantity || 0), 0);

    const combinedSizeMap = {};
    (sop.colors || []).forEach(c => {
        (c.sizes || []).forEach(sz => {
            const key = sz.size_name ?? String(sz.size_id);
            if (key) combinedSizeMap[key] = (combinedSizeMap[key] || 0) + (Number(sz.quantity) || 0);
        });
    });
    const sizeEntries = Object.keys(combinedSizeMap).length > 0
        ? Object.entries(combinedSizeMap).filter(([, v]) => parseInt(v) > 0)
        : Object.entries(sop.size_breakdown || {}).filter(([, v]) => parseInt(v) > 0);

    const doUnlink = () => { setConfirmUnlink(false); onUnlink(sop.id); };

    const handleReadinessToggle = async () => {
        const isForced = sop.production_readiness === 'force_ready';
        const newReadiness = isForced ? 'in_planning' : 'force_ready';
        setReadinessLoading(true);
        try {
            await planningApi.updateProductionReadiness(sop.id, newReadiness);
            onReadinessChange && onReadinessChange(sop.id);
        } catch (e) {
            console.error('Readiness update failed', e);
        } finally {
            setReadinessLoading(false);
        }
    };

    const readinessCfg = READINESS_CFG[sop.production_readiness] || READINESS_CFG.in_planning;
    const ReadinessIcon = readinessCfg.icon;
    const isForceReady  = sop.production_readiness === 'force_ready';

    const fabReqs  = sopReqs?.fabric_requirements || [];
    const trimReqs = sopReqs?.trim_requirements   || [];
    const fabShort = fabReqs.filter(fr =>
        Math.max(0, (fr.meters_required || 0) - (fr.stock_suggestion?.total_meters_available ?? 0)) > 0
    ).length;
    const trimUnf = trimReqs.filter(tr => !tr.is_fulfilled).length;
    const totalReqs = fabReqs.length + trimReqs.length;

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

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {sop.bom_id ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                            <CheckCircle2 size={9} /> BOM Linked
                        </span>
                    ) : (
                        <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                            <AlertTriangle size={9} /> No BOM
                        </span>
                    )}
                    <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border flex items-center gap-1 ${readinessCfg.cls}`}>
                            {ReadinessIcon && <ReadinessIcon size={9} />}
                            {readinessCfg.label}
                        </span>
                        <button
                            onClick={handleReadinessToggle}
                            disabled={readinessLoading}
                            title={isForceReady ? 'Revert to auto readiness' : 'Force mark as ready'}
                            className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
                                isForceReady
                                    ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200'
                                    : 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100'
                            }`}
                        >
                            {readinessLoading
                                ? <Loader2 size={9} className="animate-spin" />
                                : isForceReady
                                    ? <><ShieldOff size={9} /> Revert</>
                                    : <><ShieldCheck size={9} /> Force Ready</>
                            }
                        </button>
                    </div>
                </div>
            </div>

            {(sop.colors || []).length > 0 && (() => {
                const planByColor = {};
                (sop.production_plan_items || []).forEach(p => { planByColor[String(p.fabric_color_id)] = p; });
                const expandedColor = expandedColorId ? sop.colors.find(c => String(c.fabric_color_id) === expandedColorId) : null;
                const expandedPlan = expandedColorId ? planByColor[expandedColorId] : null;
                return (
                    <div className="px-4 py-2.5 border-t border-slate-100">
                        <div className="flex flex-wrap gap-1.5">
                            {dedupeColorsById(sop.colors).map(c => {
                                const colorId   = String(c.fabric_color_id);
                                const ordered   = Number(c.quantity ?? c.total_quantity ?? 0);
                                const plan      = planByColor[colorId];
                                const finalized = plan?.finalized_quantity;
                                const isExpanded = expandedColorId === colorId;
                                return (
                                    <button key={colorId}
                                        onClick={() => setExpandedColorId(isExpanded ? null : colorId)}
                                        className={`text-[10px] border px-2 py-0.5 rounded-md font-bold text-left transition-colors ${
                                            isExpanded
                                                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                                : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                        }`}>
                                        {c.color_number || c.color_name}
                                        {c.color_number && c.color_name && (
                                            <span className="font-normal text-indigo-400 ml-1">#{c.color_name}</span>
                                        )}
                                        {' '}· {ordered.toLocaleString()} ordered
                                        {finalized != null && (
                                            <span className="ml-1 text-emerald-700">
                                                · {Number(finalized).toLocaleString()} final
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {expandedColor && (
                            <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    {expandedColor.color_number || expandedColor.color_name} — Size Breakdown
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(expandedColor.sizes || []).map(sz => (
                                        <div key={sz.size_id ?? sz.size_name}
                                            className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
                                            <span className="text-[10px] font-bold text-slate-700">{sz.size_name || sz.size_id}</span>
                                            <span className="text-slate-300 text-[9px]">·</span>
                                            <span className="text-[10px] font-bold text-indigo-600">{Number(sz.quantity).toLocaleString()}</span>
                                            <span className="text-[9px] text-slate-400">ordered</span>
                                        </div>
                                    ))}
                                    {(expandedColor.sizes || []).length === 0 && (
                                        <span className="text-[10px] text-slate-400 italic">No size breakdown available</span>
                                    )}
                                </div>
                                {expandedPlan?.finalized_quantity != null && (
                                    <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2 text-[10px]">
                                        <span className="text-slate-500">
                                            Ordered total: <span className="font-bold text-slate-700">
                                                {Number(expandedColor.quantity ?? expandedColor.total_quantity ?? 0).toLocaleString()}
                                            </span>
                                        </span>
                                        <span className="text-slate-300">·</span>
                                        <span className="text-slate-500">
                                            Finalized: <span className="font-bold text-emerald-700">
                                                {Number(expandedPlan.finalized_quantity).toLocaleString()}
                                            </span>
                                        </span>
                                        {Number(expandedPlan.finalized_quantity) > Number(expandedColor.quantity ?? expandedColor.total_quantity ?? 0) && (
                                            <span className="ml-auto text-amber-600 font-bold">
                                                +{(Number(expandedPlan.finalized_quantity) - Number(expandedColor.quantity ?? expandedColor.total_quantity ?? 0)).toLocaleString()} over
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

            <div className="px-4 py-3 border-t border-slate-100">
                {sop.bom_id ? (
                    <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <div className="flex items-start gap-2 min-w-0">
                            <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="font-bold text-emerald-900 text-sm">{sop.bom_name}</p>
                                    <button onClick={() => onPreview(sop.bom_id)} className="text-emerald-500 hover:text-emerald-700 transition-colors" title="Preview BOM">
                                        <Eye size={13} />
                                    </button>
                                </div>
                                {(linkedBomDetail?.ratio_groups || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {linkedBomDetail.ratio_groups.map((rg, i) => (
                                            <span key={i} className="text-[9px] bg-white text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
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
                            <button onClick={() => setConfirmUnlink(true)} className="text-[10px] text-slate-400 hover:text-red-600 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors shrink-0">
                                <X size={11} /> Unlink
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-slate-600 font-medium">Remove?</span>
                                <button onClick={doUnlink} className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">Yes</button>
                                <button onClick={() => setConfirmUnlink(false)} className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors">No</button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => setShowLinkModal(true)}
                        disabled={isLinking}
                        className="w-full flex items-center justify-center gap-2 text-sm font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 border-dashed px-3 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                    >
                        {isLinking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        Link a BOM
                    </button>
                )}
            </div>

            {/* Open workspace */}
            <div
                onClick={() => onOpenWorkspace(sop.id)}
                className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Requirements Workspace</p>
                    {sop.bom_id && totalReqs > 0 && (
                        <span className="text-[10px] font-bold bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded-full">
                            {fabReqs.length} fabric · {trimReqs.length} trim
                        </span>
                    )}
                    {(fabShort > 0 || trimUnf > 0) && (
                        <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                            {fabShort + trimUnf} shortfall{fabShort + trimUnf !== 1 ? 's' : ''}
                        </span>
                    )}
                    {sop.bom_id && totalReqs === 0 && !loadingReqs && (
                        <span className="text-[10px] text-slate-400 italic">Calculate requirements to see the grid</span>
                    )}
                    {loadingReqs && <span className="text-[10px] text-slate-400">Loading…</span>}
                </div>
                <ChevronRight size={13} className="text-slate-400 shrink-0 ml-2" />
            </div>

            {showLinkModal && (
                <LinkAndAllocateModal
                    sop={sop}
                    bomOptions={bomOptions}
                    fabricTypes={fabricTypes}
                    onClose={() => setShowLinkModal(false)}
                    onLink={onLink}
                    onPreview={onPreview}
                    onDone={() => { setShowLinkModal(false); setLoadingReqs(true); onReadinessChange && onReadinessChange(sop.id); }}
                />
            )}
        </div>
    );
};

export default SopSummaryCard;

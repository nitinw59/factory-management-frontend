// ─── MERCHANDISER SOP WORKSPACE ─────────────────────────────────────────────
// Full-page workspace for one product line (SOP): header toolbar (link BOM,
// download BOM, calculate/recalculate, export PDF/Excel) + a Fabric/Trim tab
// switcher, each showing its requirements grid. Replaces the old
// "click SopCard → open ProductionTrackingModal" pattern — this renders in
// the main page's right panel instead of a modal.

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { Spinner } from './merchandiserShared';
import SopHeaderToolbar from './SopHeaderToolbar';
import FabricRequirementsGrid from './FabricRequirementsGrid';
import TrimRequirementsGrid from './TrimRequirementsGrid';
import RequirementCellDrilldownModal from './RequirementCellDrilldownModal';
import TrimFunnelModal from './TrimFunnelModal';

const READINESS_CFG = {
    in_planning:          { label: 'In Planning',  cls: 'bg-amber-50  text-amber-600  border-amber-200',   icon: null },
    ready_for_production: { label: 'Ready',        cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle2 },
    force_ready:          { label: 'Force Ready',  cls: 'bg-violet-50 text-violet-700 border-violet-200',  icon: ShieldCheck },
};

const MerchandiserSopWorkspace = ({ sop, salesOrder, bomOptions, fabricTypes, onLinkBom, onPreviewBom, onSopChanged, onBack }) => {
    const [sopReqs,     setSopReqs]     = useState(null);
    const [loadingReqs, setLoadingReqs] = useState(false);
    const [activeTab,   setActiveTab]   = useState('fabric');
    const [drilldown,   setDrilldown]   = useState(null); // { type, requirement } | null
    const [funnelGroup, setFunnelGroup] = useState(null);
    const [readinessLoading, setReadinessLoading] = useState(false);

    const fetchReqs = useCallback(() => {
        if (!sop.bom_id) { setSopReqs(null); return; }
        setLoadingReqs(true);
        planningApi.getRequirements(sop.id)
            .then(r => setSopReqs(r.data?.data ?? r.data))
            .catch(() => setSopReqs(null))
            .finally(() => setLoadingReqs(false));
    }, [sop.id, sop.bom_id]);

    useEffect(() => { fetchReqs(); }, [fetchReqs]);

    // After any mutating action (reserve/release/recalc/raise PR/link/calculate):
    // refetch requirements, re-sync the parent's copy of the SOP (bom_id,
    // production_readiness may have changed), and — if the drilldown is open —
    // swap in the freshly-fetched version of the same requirement so the modal
    // updates live instead of going stale or closing.
    const refresh = useCallback(async () => {
        onSopChanged && onSopChanged();
        if (!sop.bom_id) { setSopReqs(null); return; }
        setLoadingReqs(true);
        try {
            const r = await planningApi.getRequirements(sop.id);
            const fresh = r.data?.data ?? r.data;
            setSopReqs(fresh);
            setDrilldown(prev => {
                if (!prev) return null;
                const list = prev.type === 'fabric' ? fresh.fabric_requirements : fresh.trim_requirements;
                const match = (list || []).find(req => req.id === prev.requirement.id);
                return match ? { type: prev.type, requirement: match } : null;
            });
        } catch {
            setSopReqs(null);
        } finally {
            setLoadingReqs(false);
        }
    }, [sop.id, sop.bom_id, onSopChanged]);

    const handleReadinessToggle = async () => {
        const isForced = sop.production_readiness === 'force_ready';
        const newReadiness = isForced ? 'in_planning' : 'force_ready';
        setReadinessLoading(true);
        try {
            await planningApi.updateProductionReadiness(sop.id, newReadiness);
            onSopChanged && onSopChanged();
        } catch (e) {
            console.error('Readiness update failed', e);
        } finally {
            setReadinessLoading(false);
        }
    };

    const fabricRequirements = sopReqs?.fabric_requirements || [];
    const trimRequirements   = sopReqs?.trim_requirements   || [];
    const readinessCfg = READINESS_CFG[sop.production_readiness] || READINESS_CFG.in_planning;
    const ReadinessIcon = readinessCfg.icon;
    const isForceReady  = sop.production_readiness === 'force_ready';

    return (
        <div className="h-full flex flex-col">
            {/* Identity strip */}
            <div className="shrink-0 px-6 pt-3 pb-2.5 border-b border-slate-100 bg-white space-y-2">
                {/* Identity row — back link, product/BOM identity, order context, readiness — all in one line */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={onBack} title="Back to product list" className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700 shrink-0">
                        <ArrowLeft size={13} />
                    </button>
                    <h2 className="font-extrabold text-slate-800 text-base shrink-0">{sop.product_name}</h2>
                    {sop.bom_id ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0">
                            <CheckCircle2 size={9} /> {sop.bom_name || 'BOM Linked'}
                        </span>
                    ) : (
                        <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0">
                            <AlertTriangle size={9} /> No BOM
                        </span>
                    )}
                    <span className="text-xs text-slate-400 truncate">
                        {salesOrder?.order_number && `Order #${salesOrder.order_number}`}
                        {salesOrder?.customer_name ? ` · ${salesOrder.customer_name}` : ''}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
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

                {/* Toolbar row — shares the same bar as the identity row above */}
                <SopHeaderToolbar
                    sop={sop}
                    sopReqs={sopReqs}
                    bomOptions={bomOptions}
                    fabricTypes={fabricTypes}
                    salesOrder={salesOrder}
                    onLinkBom={onLinkBom}
                    onPreviewBom={onPreviewBom}
                    onRefresh={refresh}
                />
            </div>

            {/* Tabs */}
            <div className="shrink-0 px-6 pt-2">
                <div className="flex items-center gap-1 border-b border-slate-200">
                    {[
                        { key: 'fabric', label: 'Fabric', count: fabricRequirements.length },
                        { key: 'trim',   label: 'Trim',   count: trimRequirements.length },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                                activeTab === tab.key ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {tab.label}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-400'}`}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto px-6 py-4">
                {!sop.bom_id ? (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-sm text-slate-500 font-semibold mb-1">No BOM linked yet</p>
                        <p className="text-xs text-slate-400">Link a BOM above to calculate fabric and trim requirements for this product.</p>
                    </div>
                ) : loadingReqs && !sopReqs ? (
                    <Spinner />
                ) : !sopReqs ? (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-sm text-slate-500 font-semibold mb-1">Requirements not calculated yet</p>
                        <p className="text-xs text-slate-400">Use "Calculate Requirements" above to generate the fabric/trim grid.</p>
                    </div>
                ) : (
                    <>
                        {loadingReqs && (
                            <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
                                <RotateCw size={11} className="animate-spin" /> Refreshing…
                            </p>
                        )}
                        {activeTab === 'fabric' ? (
                            <FabricRequirementsGrid
                                sop={sop}
                                fabricRequirements={fabricRequirements}
                                onCellClick={(requirement) => setDrilldown({ type: 'fabric', requirement })}
                            />
                        ) : (
                            <TrimRequirementsGrid
                                sop={sop}
                                trimRequirements={trimRequirements}
                                onCellClick={(requirement) => setDrilldown({ type: 'trim', requirement })}
                                onBulkFillGroup={setFunnelGroup}
                            />
                        )}
                    </>
                )}
            </div>

            {drilldown && (
                <RequirementCellDrilldownModal
                    type={drilldown.type}
                    requirement={drilldown.requirement}
                    sop={sop}
                    onClose={() => setDrilldown(null)}
                    onDone={refresh}
                />
            )}

            {funnelGroup && (
                <TrimFunnelModal
                    group={funnelGroup}
                    sop={sop}
                    onClose={() => setFunnelGroup(null)}
                    onDone={refresh}
                />
            )}
        </div>
    );
};

export default MerchandiserSopWorkspace;

// ─── MERCHANDISER SOP WORKSPACE ─────────────────────────────────────────────
// Full-screen, single-tab requirements grid for one product line (SOP) —
// mounted by WorkspaceDrawer for the trail's "Fabric" or "Trim" node
// (`scope` picks which one; there's no tab switcher any more, each node
// opens its own focused view). BOM linking and calculate/recalculate now
// live in their own overlays (BomStageModal, RequirementsStageModal) and
// production-readiness in ReadinessStageModal — this workspace is scoped to
// just the grid + drilldown/reserve flow for its one requirement type.

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, RotateCw } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { Spinner } from './merchandiserShared';
import SopHeaderToolbar from './SopHeaderToolbar';
import FabricRequirementsGrid from './FabricRequirementsGrid';
import TrimRequirementsGrid from './TrimRequirementsGrid';
import RequirementCellDrilldownModal from './RequirementCellDrilldownModal';
import TrimFunnelModal from './TrimFunnelModal';

const MerchandiserSopWorkspace = ({ sop, salesOrder, scope, onSopChanged, onBack }) => {
    const [sopReqs,     setSopReqs]     = useState(null);
    const [loadingReqs, setLoadingReqs] = useState(false);
    const [drilldown,   setDrilldown]   = useState(null); // { type, requirement } | null
    const [funnelGroup, setFunnelGroup] = useState(null);

    const fetchReqs = useCallback(() => {
        if (!sop.bom_id) { setSopReqs(null); return; }
        setLoadingReqs(true);
        planningApi.getRequirements(sop.id)
            .then(r => setSopReqs(r.data?.data ?? r.data))
            .catch(() => setSopReqs(null))
            .finally(() => setLoadingReqs(false));
    }, [sop.id, sop.bom_id]);

    useEffect(() => { fetchReqs(); }, [fetchReqs]);

    // After any mutating action (reserve/release/recalc/raise PR): refetch
    // requirements, re-sync the parent's copy of the SOP, and — if the
    // drilldown is open — swap in the freshly-fetched version of the same
    // requirement so the modal updates live instead of going stale or closing.
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

    const fabricRequirements = sopReqs?.fabric_requirements || [];
    const trimRequirements   = sopReqs?.trim_requirements   || [];

    return (
        <div className="h-full flex flex-col">
            {/* Identity strip */}
            <div className="shrink-0 px-6 pt-3 pb-2.5 border-b border-slate-100 bg-white space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={onBack} title="Close" className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-700 shrink-0">
                        <ArrowLeft size={13} />
                    </button>
                    <h2 className="font-extrabold text-slate-800 text-base shrink-0">{sop.product_name}</h2>
                    <span className="text-[9px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                        {scope === 'trim' ? 'Trim Reservation' : 'Fabric Reservation'}
                    </span>
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
                </div>

                <SopHeaderToolbar sop={sop} sopReqs={sopReqs} salesOrder={salesOrder} scope={scope} />
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto px-6 py-4">
                {!sop.bom_id ? (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-sm text-slate-500 font-semibold mb-1">No BOM linked yet</p>
                        <p className="text-xs text-slate-400">Link a BOM from the BOM node to calculate {scope === 'trim' ? 'trim' : 'fabric'} requirements for this product.</p>
                    </div>
                ) : loadingReqs && !sopReqs ? (
                    <Spinner />
                ) : !sopReqs ? (
                    <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                        <p className="text-sm text-slate-500 font-semibold mb-1">Requirements not calculated yet</p>
                        <p className="text-xs text-slate-400">Use the Requirements node to generate the {scope === 'trim' ? 'trim' : 'fabric'} grid.</p>
                    </div>
                ) : (
                    <>
                        {loadingReqs && (
                            <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
                                <RotateCw size={11} className="animate-spin" /> Refreshing…
                            </p>
                        )}
                        {scope === 'trim' ? (
                            <TrimRequirementsGrid
                                sop={sop}
                                trimRequirements={trimRequirements}
                                onCellClick={(requirement) => setDrilldown({ type: 'trim', requirement })}
                                onBulkFillGroup={setFunnelGroup}
                            />
                        ) : (
                            <FabricRequirementsGrid
                                sop={sop}
                                fabricRequirements={fabricRequirements}
                                onCellClick={(requirement) => setDrilldown({ type: 'fabric', requirement })}
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

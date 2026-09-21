// ─── SOP TRAIL ROW ───────────────────────────────────────────────────────────
// One product line (SOP) within an expanded order: identity summary + its
// 6-node lifecycle trail. Fetches its own requirements independently so the
// trail's Fabric/Trim rings reflect live reservation coverage without the
// parent order having to fan out N calls itself.

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { dedupeColorsById } from './merchandiserShared';
import { getSopStages } from './sopStageStatus';
import SopStageTrail from './SopStageTrail';

const SopTrailRow = ({ sop, onOpenStage }) => {
    const [sopReqs, setSopReqs] = useState(null);

    useEffect(() => {
        if (!sop.bom_id) { setSopReqs(null); return; }
        let cancelled = false;
        planningApi.getRequirements(sop.id)
            .then(r => { if (!cancelled) setSopReqs(r.data?.data ?? r.data); })
            .catch(() => { if (!cancelled) setSopReqs(null); });
        return () => { cancelled = true; };
    }, [sop.bom_id, sop.id]);

    const totalQty = (sop.colors || []).reduce((s, c) => s + (c.quantity || c.total_quantity || 0), 0);
    const colorCount = dedupeColorsById(sop.colors || []).length;
    const stages = getSopStages(sop, sopReqs);

    return (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 px-4 py-3.5 border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
            <div className="lg:w-56 shrink-0">
                <p className="font-bold text-slate-800 text-sm truncate">{sop.product_name}</p>
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-0.5">
                    {sop.fabric_type_name && <span className="text-[10px] text-slate-500">{sop.fabric_type_name}</span>}
                    <span className="text-[10px] text-slate-400">
                        {colorCount} color{colorCount !== 1 ? 's' : ''} · {totalQty.toLocaleString()} pcs
                    </span>
                </div>
                {sop.bom_id ? (
                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold uppercase">
                        <CheckCircle2 size={9} /> {sop.bom_name || 'BOM Linked'}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold uppercase">
                        <AlertTriangle size={9} /> No BOM
                    </span>
                )}
            </div>

            <div className="flex-1 min-w-0 overflow-x-auto py-1">
                <SopStageTrail stages={stages} onNodeClick={(stageKey) => onOpenStage(sop, stageKey)} />
            </div>
        </div>
    );
};

export default SopTrailRow;

// ─── SHARED PRIMITIVES ──────────────────────────────────────────────────────
// Tiny, generic pieces used across several files in this module (BomPreviewModal,
// MerchandiserPlanningPage, MerchandiserSopWorkspace, the requirement grids/drilldown,
// and the PDF/Excel exporters). Kept here as a small, explicit exception to this
// codebase's usual "declare it locally per file" convention — the alternative
// (retyping the same 5-line spinner and number formatter in 6+ files) isn't worth it.

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { bomApi } from '../../api/bomApi';
import { adminApi } from '../../api/adminApi';
import { swatchHex } from '../admin/TrimClustersPage';

export const Spinner = ({ h = 64 }) => (
    <div className={`flex justify-center items-center`} style={{ minHeight: h * 4 }}>
        <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
    </div>
);

export const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

// Upstream sales_order_product_colors can carry more than one row for the
// same fabric_color_id (a known data-quality gap — see the "Defensive dedup"
// note on the backend's finalize-quantities handler). Rendering sop.colors
// as-is anywhere it's keyed by fabric_color_id (grid columns, color chips,
// per-color quantity editors) then hands React two elements with the same
// key, which it reports as a "two children with the same key" warning and
// can silently drop/duplicate one of them. First occurrence wins.
export const dedupeColorsById = (colors = []) => {
    const seen = new Set();
    const out = [];
    colors.forEach(c => {
        const id = String(c.fabric_color_id);
        if (seen.has(id)) return;
        seen.add(id);
        out.push(c);
    });
    return out;
};

// Loads a BOM's generic SECONDARY fabric line status — whether it exists at all
// (needsSecondaryFabric: this order MUST supply a secondary_fabric_type_id or that
// line's requirement is silently dropped by recalcPlanForSop) and, if that line has
// one or more Color Cluster rules attached (see BomFormPage.jsx's picker — a line
// can carry several, e.g. "dark colors -> black" AND "light colors -> white" at
// once), the hydrated clusters for previewing which of the order's colors resolve
// to which target color — the same split productionPlanningController.js's
// resolveEffectiveColorId applies live at requirement-calculation time, shown here
// before the fact.
//
// Every caller that recalculates requirements for an already-linked SOP (not just
// the initial Link BOM step — see LinkAndAllocateModal.jsx) needs needsSecondaryFabric
// to gate its own picker: a BOM can gain a generic SECONDARY line after a SOP was
// already linked to it, and re-finalizing/recalculating never used to re-ask for
// secondary_fabric_type_id — see FinalizeQuantitiesModal.jsx.
export const useSecondaryFabricInfo = (bomId) => {
    const [state, setState] = useState({ needsSecondaryFabric: false, clusters: [], loading: false });
    useEffect(() => {
        let cancelled = false;
        setState({ needsSecondaryFabric: false, clusters: [], loading: !!bomId });
        if (!bomId) return undefined;
        bomApi.getById(bomId)
            .then(res => {
                const bom = res.data?.data ?? res.data;
                const line = (bom.fabric_consumptions || []).find(fc => fc.fabric_role === 'SECONDARY');
                if (!line) return { needsSecondaryFabric: false, clusters: [] };
                const clusterIds = (line.color_clusters || []).map(c => c.id);
                if (clusterIds.length === 0) return { needsSecondaryFabric: true, clusters: [] };
                return Promise.all(clusterIds.map(id =>
                    adminApi.trimClusters.get(id).then(r => r.data?.data ?? r.data ?? null).catch(() => null)
                )).then(clusters => ({ needsSecondaryFabric: true, clusters: clusters.filter(Boolean) }));
            })
            .then(result => { if (!cancelled) setState({ ...result, loading: false }); })
            .catch(() => { if (!cancelled) setState({ needsSecondaryFabric: false, clusters: [], loading: false }); });
        return () => { cancelled = true; };
    }, [bomId]);
    return state;
};

const ColorChip = ({ c }) => (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white border border-slate-200 rounded-full px-2 py-0.5">
        <span className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
            style={{ background: swatchHex({ color_name: c.color_name, color_number: c.color_number }) }} />
        {c.color_name}
    </span>
);

// Given the hydrated cluster rules attached to a BOM's SECONDARY line (each
// { name, target_fabric_color_id, target_color_name, target_color_number,
// members: [{fabric_color_id, color_name, color_number}] }) and this
// Sales-Order-Product's own colors, shows which colors redirect to which
// rule's target color, plus a final bucket for colors matched by none —
// the same split productionPlanningController.js's resolveEffectiveColorId
// applies live at requirement-calculation time, made visible before the fact.
export const ClusterMatchPreview = ({ clusters, sopColors }) => {
    if (!clusters || clusters.length === 0) return null;
    const colors = dedupeColorsById(sopColors || []);
    const matchedByAnyId = new Set();

    return (
        <div className="space-y-2">
            {clusters.map(cluster => {
                const memberIds = new Set((cluster.members || []).map(m => String(m.fabric_color_id)));
                const matched = colors.filter(c => memberIds.has(String(c.fabric_color_id)));
                matched.forEach(c => matchedByAnyId.add(String(c.fabric_color_id)));
                const targetSwatch = swatchHex({ color_name: cluster.target_color_name, color_number: cluster.target_color_number });
                return (
                    <div key={cluster.id} className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2">
                        <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ background: targetSwatch }} />
                            Color Cluster Rule — {cluster.name} → {cluster.target_color_name}
                            {cluster.target_color_number ? ` (${cluster.target_color_number})` : ''}
                        </p>
                        <div>
                            <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1">
                                Redirects to {cluster.target_color_name} ({matched.length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {matched.length > 0
                                    ? matched.map(c => <ColorChip key={c.fabric_color_id} c={c} />)
                                    : <span className="text-[10px] text-slate-400 italic">None of this order's colors match this rule.</span>}
                            </div>
                        </div>
                    </div>
                );
            })}
            {(() => {
                const unmatched = colors.filter(c => !matchedByAnyId.has(String(c.fabric_color_id)));
                return unmatched.length > 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Keeps own color — no rule matched ({unmatched.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {unmatched.map(c => <ColorChip key={c.fabric_color_id} c={c} />)}
                        </div>
                    </div>
                ) : null;
            })()}
        </div>
    );
};

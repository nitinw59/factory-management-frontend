// ─── SHARED PRIMITIVES ──────────────────────────────────────────────────────
// Tiny, generic pieces used across several files in this module (BomPreviewModal,
// MerchandiserPlanningPage, MerchandiserSopWorkspace, the requirement grids/drilldown,
// and the PDF/Excel exporters). Kept here as a small, explicit exception to this
// codebase's usual "declare it locally per file" convention — the alternative
// (retyping the same 5-line spinner and number formatter in 6+ files) isn't worth it.

import { Loader2 } from 'lucide-react';

export const Spinner = ({ h = 64 }) => (
    <div className={`flex justify-center items-center`} style={{ minHeight: h * 4 }}>
        <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
    </div>
);

export const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

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

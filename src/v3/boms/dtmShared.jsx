// DTM (dyed to match) chip, shared by BOM lines and trim items. A DTM item is approved once made
// (decided 13 Oct 2026 — no separate shade approval).
export function DtmChip({ title }) {
    return <span title={title} className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap bg-indigo-50 text-indigo-700 border-indigo-200">DTM</span>;
}

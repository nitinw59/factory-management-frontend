export const BOM_STATUS = {
    DRAFT:            { label: 'Draft',            cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    PENDING_APPROVAL: { label: 'Pending approval', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    APPROVED:         { label: 'Approved',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    REJECTED:         { label: 'Rejected',         cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    ARCHIVED:         { label: 'Archived',         cls: 'bg-slate-50 text-slate-400 border-slate-200' },
};

export default function BomStatusBadge({ status }) {
    const s = BOM_STATUS[status] || BOM_STATUS.DRAFT;
    return <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>;
}

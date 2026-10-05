export const SO_STATUS = {
    DRAFT:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    SUBMITTED: { label: 'Submitted', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    APPROVED:  { label: 'Approved',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    REJECTED:  { label: 'Rejected',  cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};

export default function SalesOrderStatusBadge({ status }) {
    const s = SO_STATUS[status] || SO_STATUS.DRAFT;
    return <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${s.cls}`}>{s.label}</span>;
}

// 'YYYY-MM-DD' (as the API sends dates) → '15 Dec 2026'. No time-zone shift.
export const fmtDate = (d) => {
    if (!d) return '—';
    const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Today as 'YYYY-MM-DD' in the browser's own time zone (toISOString() is UTC,
// which is still yesterday in India until 05:30).
export const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

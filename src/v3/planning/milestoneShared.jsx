// Milestone status labels / colours shared by the calendar and the order panel.
export const MS_STATUS = {
    DONE:      { label: 'Done',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-300', dot: 'bg-emerald-500' },
    DONE_LATE: { label: 'Done late', cls: 'bg-amber-50 text-amber-800 border-amber-300',       dot: 'bg-amber-500' },
    LATE:      { label: 'Late',      cls: 'bg-rose-50 text-rose-700 border-rose-300',          dot: 'bg-rose-500' },
    DUE:       { label: 'Due ≤ 7 days', cls: 'bg-sky-50 text-sky-800 border-sky-300',         dot: 'bg-sky-500' },
    UPCOMING:  { label: 'Upcoming',  cls: 'bg-slate-50 text-slate-600 border-slate-200',       dot: 'bg-slate-400' },
    NO_DATE:   { label: 'No date',   cls: 'bg-slate-50 text-slate-400 border-slate-200',       dot: 'bg-slate-300' },
    NA:        { label: 'N/A',       cls: 'bg-white text-slate-300 border-slate-100',          dot: 'bg-slate-200' },
};

export function MsChip({ m, short = false }) {
    const s = MS_STATUS[m.status] || MS_STATUS.UPCOMING;
    return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${s.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{short ? '' : s.label}{m.days_late > 0 && !short ? ` ${m.days_late}d` : ''}</span>;
}

export const shortDate = (iso) => {
    if (!iso) return '—';
    const [y, mo, d] = iso.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

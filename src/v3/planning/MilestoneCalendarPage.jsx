// Order milestone calendar (T&A): every approved order's milestones —
// overdue and next 14 days, a month calendar, and an orders × milestones grid.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { MS_STATUS, MsChip, shortDate } from './milestoneShared';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// The date a milestone sits on in the calendar: actual if done, else planned.
const onDate = (m) => m.actual || m.planned;

function exportExcel(data) {
    const rows = data.orders.map(o => ({
        'Order no.': o.order_no, Customer: o.customer_name, Styles: o.styles || '', 'Ship date': o.ship_date || '',
        ...Object.fromEntries(o.milestones.flatMap(m => [[`${m.name} planned`, m.planned || ''], [`${m.name} actual`, m.actual || ''], [`${m.name} status`, MS_STATUS[m.status]?.label || m.status]])),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Milestones');
    XLSX.writeFile(wb, `Milestones-${todayLocal()}.xlsx`);
}

export default function MilestoneCalendarPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('agenda');
    const [month, setMonth] = useState(() => todayLocal().slice(0, 7));

    useEffect(() => { planningApi.milestones().then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load milestones.'))); }, []);

    const flat = useMemo(() => (data ? data.orders.flatMap(o => o.milestones.filter(m => m.status !== 'NA').map(m => ({ ...m, order: o }))) : []), [data]);
    if (!data) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const today = data.today;
    const overdue = flat.filter(m => m.status === 'LATE').sort((a, b) => (a.planned || '').localeCompare(b.planned || ''));
    const soon = flat.filter(m => !m.actual && m.planned && m.planned >= today && m.planned <= addDays(today, 14)).sort((a, b) => a.planned.localeCompare(b.planned));

    // Month grid (weeks start Monday).
    const [y, mo] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, mo - 1, 1));
    const startOffset = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const cells = Array.from({ length: Math.ceil((startOffset + daysInMonth) / 7) * 7 }, (_, i) => {
        const day = i - startOffset + 1;
        return day >= 1 && day <= daysInMonth ? `${month}-${String(day).padStart(2, '0')}` : null;
    });
    const byDate = new Map();
    for (const m of flat) { const d = onDate(m); if (d && d.startsWith(month)) byDate.set(d, [...(byDate.get(d) || []), m]); }
    const shiftMonth = (n) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };

    const item = (m) => (
        <Link key={`${m.order.order_id}:${m.code}`} to={`/v3/planning/orders/${m.order.order_id}`} className="flex flex-wrap items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50">
            <span className="text-xs text-slate-500 w-14">{shortDate(m.planned)}</span>
            <MsChip m={m} />
            <span className="font-semibold text-slate-800">{m.name}</span>
            <span className="text-indigo-700">{m.order.order_no}</span>
            <span className="text-xs text-slate-500">{m.order.customer_name} · ships {shortDate(m.order.ship_date)}</span>
        </Link>
    );

    return (
        <div>
            <PageHeader title="Order milestones" subtitle="Planned vs actual for every approved order. Materials milestones are recorded by the system; cutting, sewing, finishing and shipping are entered on the order until those 3.0 portals exist."
                actions={<SecondaryButton onClick={() => exportExcel(data)} disabled={!data.orders.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[['Late', overdue.length, 'LATE'], ['Due in 14 days', soon.length, 'DUE'], ['Orders', data.orders.length, 'UPCOMING'], ['Done late', flat.filter(m => m.status === 'DONE_LATE').length, 'DONE_LATE']].map(([label, n, st]) => (
                    <div key={label} className={`border rounded-xl p-3 ${MS_STATUS[st].cls}`}><p className="text-xs font-bold">{label}</p><p className="text-2xl font-black">{n}</p></div>
                ))}
            </div>
            <div className="flex gap-1 border-b border-slate-200 mb-4">
                {[['agenda', 'Overdue & next 14 days'], ['calendar', 'Calendar'], ['grid', 'All orders']].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                ))}
            </div>

            {tab === 'agenda' && (
                <div className="grid lg:grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-black uppercase tracking-wider text-rose-700 mb-1">Late ({overdue.length})</p>
                        {overdue.length ? overdue.map(item) : <p className="text-sm text-slate-400 p-2">Nothing late.</p>}</div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-black uppercase tracking-wider text-sky-700 mb-1">Next 14 days ({soon.length})</p>
                        {soon.length ? soon.map(item) : <p className="text-sm text-slate-400 p-2">Nothing due.</p>}</div>
                </div>
            )}

            {tab === 'calendar' && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 overflow-x-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <button type="button" className="p-1 rounded hover:bg-slate-100" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
                        <p className="font-black text-slate-800 w-40 text-center">{first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
                        <button type="button" className="p-1 rounded hover:bg-slate-100" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={16} /></button>
                        <button type="button" className="text-xs font-semibold text-indigo-700 ml-2" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
                    </div>
                    <div className="grid grid-cols-7 min-w-[760px] border-l border-t border-slate-200">
                        {WEEKDAYS.map(d => <div key={d} className="text-[11px] font-bold text-slate-500 px-2 py-1 border-r border-b border-slate-200 bg-slate-50">{d}</div>)}
                        {cells.map((d, i) => (
                            <div key={i} className={`min-h-[96px] border-r border-b border-slate-200 p-1 ${d === today ? 'bg-indigo-50/60' : ''}`}>
                                {d && <p className={`text-[11px] font-bold ${d === today ? 'text-indigo-700' : 'text-slate-400'}`}>{Number(d.slice(8))}</p>}
                                {d && (byDate.get(d) || []).slice(0, 4).map(m => (
                                    <Link key={`${m.order.order_id}:${m.code}`} to={`/v3/planning/orders/${m.order.order_id}`} title={`${m.order.order_no} · ${m.name} · ${MS_STATUS[m.status].label}`}
                                        className={`block truncate text-[10px] font-semibold px-1 py-0.5 mt-0.5 rounded border ${MS_STATUS[m.status].cls}`}>{m.order.order_no.split('/').pop()} {m.name}</Link>
                                ))}
                                {d && (byDate.get(d) || []).length > 4 && <p className="text-[10px] text-slate-500 px-1">+{byDate.get(d).length - 4} more</p>}
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">Each milestone sits on its actual date when done, otherwise on its planned date.</p>
                </div>
            )}

            {tab === 'grid' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="text-sm min-w-full">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                            <tr><th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Ships</th>{data.templates.map(t => <th key={t.code} className="px-2 py-2 text-left min-w-[100px]">{t.name}</th>)}</tr>
                        </thead>
                        <tbody>
                            {data.orders.length === 0 && <tr><td colSpan={2 + data.templates.length} className="px-4 py-8 text-center text-slate-400">No approved orders.</td></tr>}
                            {data.orders.map(o => (
                                <tr key={o.order_id} className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-2"><Link to={`/v3/planning/orders/${o.order_id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{o.order_no}</Link><span className="block text-xs text-slate-500">{o.customer_name}</span></td>
                                    <td className="px-3 py-2 whitespace-nowrap">{shortDate(o.ship_date)}</td>
                                    {data.templates.map(t => {
                                        const m = o.milestones.find(x => x.code === t.code);
                                        return (
                                            <td key={t.code} className="px-2 py-2 text-xs">
                                                {m && m.status !== 'NA' ? <><MsChip m={m} /><span className="block text-slate-600 mt-0.5">{m.actual ? shortDate(m.actual) : shortDate(m.planned)}</span></> : <span className="text-slate-300">—</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

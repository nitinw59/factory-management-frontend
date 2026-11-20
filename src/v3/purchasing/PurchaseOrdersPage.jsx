// Purchase orders as a working list (20 Nov 2026, owner: "how can we improve this page it is dump of all pos list" → "build all
// phases"). Tabs with counts and value — Open (default: to issue, late, awaiting delivery, partly received), each of those, To bill,
// Stale, Closed, All. Each row: kinds, the sales orders it serves, value, received (by value, so metres and pieces are never added),
// due and days late, value still to bill, status and the next step. Filters (supplier, kind, how it was made), sort, group by
// supplier with subtotals, a totals row, Excel of what is shown. The status / sent back / source / since links from My work
// still work. "New purchase order" works from approved requisition lines.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Plus, FileSpreadsheet, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading, useRowLink } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { PO_STATUS, inr } from './poShared';

const GROUP_KEY = 'v3.poListGroup';
const OPEN = ['ISSUED', 'PARTLY_RECEIVED'];
const KIND = { FABRIC: { label: 'Fabric', cls: 'bg-sky-50 text-sky-800 border-sky-200' }, TRIM: { label: 'Trims', cls: 'bg-violet-50 text-violet-800 border-violet-200' }, STORE: { label: 'Store', cls: 'bg-stone-50 text-stone-700 border-stone-300' } };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const lakh = (n) => (Math.abs(n) >= 100000 ? `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L` : `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
const readGroup = () => { try { return localStorage.getItem(GROUP_KEY) === '1'; } catch { return false; } };

// What the list knows about a row: due date, lateness, value still to come, the tab it belongs to, the next step.
function enrich(r, today) {
    const due = r.delivery_date || r.first_delivery || null;
    const open = OPEN.includes(r.status);
    const late = open && due && due < today ? daysBetween(due, today) : 0;
    const toCome = open ? Math.max(0, Math.round((r.total - r.received_value) * 100) / 100) : 0;
    const pct = r.total > 0 ? Math.min(100, Math.round((r.received_value / r.total) * 100)) : 0;
    const tab = ['DRAFT', 'PENDING_APPROVAL'].includes(r.status) ? 'issue' : late ? 'late' : r.status === 'ISSUED' ? 'awaiting' : r.status === 'PARTLY_RECEIVED' ? 'partly' : 'closed';
    return { ...r, due, late, toCome, pct, tab, next: computeNext(r, today) };
}
const TONE = { rose: 'text-rose-700', indigo: 'text-indigo-700', amber: 'text-amber-800', slate: 'text-slate-500' };
const TABS = [
    ['open', 'Open', r => r.tab !== 'closed'],
    ['issue', 'To issue', r => r.tab === 'issue'],
    ['late', 'Late', r => r.tab === 'late'],
    ['awaiting', 'Awaiting delivery', r => r.status === 'ISSUED'],   // late or not: Late is a view across these two
    ['partly', 'Partly received', r => r.status === 'PARTLY_RECEIVED'],
    ['bill', 'To bill', r => r.to_bill_value > 0.5 && r.status !== 'CANCELLED'],
    ['stale', 'Stale', r => r.stale],
    ['closed', 'Closed', r => r.tab === 'closed'],
    ['all', 'All', () => true],
];
const SORTS = { new: 'Newest first', due: 'Due date', late: 'Most days late', value: 'Highest value', to_come: 'Most still to come', to_bill: 'Most to bill' };
const sorter = {
    new: null,
    due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
    late: (a, b) => b.late - a.late,
    value: (a, b) => b.total - a.total,
    to_come: (a, b) => b.toCome - a.toCome,
    to_bill: (a, b) => b.to_bill_value - a.to_bill_value,
};
const sums = (list) => ({ n: list.length, total: list.reduce((s, r) => s + r.total, 0), received: list.reduce((s, r) => s + r.received_value, 0), toCome: list.reduce((s, r) => s + r.toCome, 0), toBill: list.reduce((s, r) => s + (r.status === 'CANCELLED' ? 0 : r.to_bill_value), 0), late: list.filter(r => r.late).length });

export default function PurchaseOrdersPage() {
    const rowLink = useRowLink();   // the whole row opens the record
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const sentBack = params.get('sent_back') === '1';   // My work: "Purchase orders sent back"
    const source = params.get('source') || '';           // DIRECT: the store's direct purchases (25 Oct 2026)
    const since = params.get('since') || '';             // "week" from My work
    const tab = params.get('tab') || (status || sentBack || since ? 'all' : 'open');
    const supplier = params.get('supplier') || '';
    const kind = params.get('kind') || '';
    const sort = params.get('sort') || 'new';
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [group, setGroup] = useState(readGroup);
    const [shut, setShut] = useState({});   // supplier groups folded
    const [canManage, setCanManage] = useState(false);
    const [error, setError] = useState('');
    const today = todayLocal();
    const setParam = (k, v) => { const n = Object.fromEntries(params); if (v) n[k] = v; else delete n[k]; setParams(n); };

    useEffect(() => {
        const t = setTimeout(() => purchasingApi.orders({ status: status || undefined, sent_back: sentBack ? 1 : undefined, source: source || undefined, since: since || undefined, q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load purchase orders.'))), 250);
        return () => clearTimeout(t);
    }, [status, sentBack, source, since, search]);
    useEffect(() => { purchasingApi.permissions().then(res => setCanManage(res.data.manage)).catch(() => {}); }, []);

    const all = useMemo(() => (rows || []).map(r => enrich(r, today)), [rows, today]);
    const suppliers = useMemo(() => [...new Map(all.map(r => [r.supplier_id, r.supplier_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
    const filtered = all.filter(r => (!supplier || r.supplier_id === supplier) && (!kind || (r.kinds || []).includes(kind)));
    const counts = Object.fromEntries(TABS.map(([k, , f]) => { const l = filtered.filter(f); return [k, { n: l.length, total: l.reduce((s, r) => s + r.total, 0), toCome: l.reduce((s, r) => s + r.toCome, 0), toBill: l.reduce((s, r) => s + r.to_bill_value, 0) }]; }));
    const pick = (TABS.find(([k]) => k === tab) || TABS[0])[2];
    const shown = filtered.filter(pick);
    if (sorter[sort]) shown.sort(sorter[sort]);
    const groups = useMemo(() => {
        if (!group) return null;
        const m = new Map();
        for (const r of shown) { if (!m.has(r.supplier_id)) m.set(r.supplier_id, { id: r.supplier_id, name: r.supplier_name, rows: [] }); m.get(r.supplier_id).rows.push(r); }
        return [...m.values()].map(g => ({ ...g, sum: sums(g.rows) })).sort((a, b) => b.sum.toCome - a.sum.toCome || b.sum.total - a.sum.total);
    }, [group, shown]);
    const tot = sums(shown);
    const flipGroup = () => setGroup(g => { try { localStorage.setItem(GROUP_KEY, g ? '0' : '1'); } catch { /* per-device convenience only */ } return !g; });

    const excel = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shown.map(r => ({
            PO: r.po_no, Date: r.po_date, Supplier: r.supplier_name, Shop: r.shop_name || '', Kinds: (r.kinds || []).map(k => KIND[k]?.label || k).join(', '), 'Made by': r.source === 'DIRECT' ? 'Direct purchase' : 'Purchasing',
            'Sales orders': (r.orders || []).map(o => o.order_no).join(', '), Lines: r.line_count, 'Ordered incl. GST (Rs)': r.total, 'Received incl. GST (Rs)': r.received_value, 'Received %': r.pct,
            'Still to come (Rs)': r.toCome, Due: r.due || '', 'Days late': r.late || '', 'Last receipt': r.last_receipt || '', 'Billed before GST (Rs)': r.billed_value, 'To bill before GST (Rs)': r.status === 'CANCELLED' ? 0 : r.to_bill_value,
            Status: PO_STATUS[r.status]?.label || r.status, 'Next step': r.next ? `${r.next.t}${r.next.also ? ` · ${r.next.also}` : ''}` : '', Stale: r.stale ? 'yes' : '',
        }))), 'Purchase orders');
        XLSX.writeFile(wb, `purchase-orders-${tab}-${today}.xlsx`);
    };

    const row = (r) => {
        const n = r.next;
        return (
            <tr key={r.id} {...rowLink(`/v3/purchasing/orders/${r.id}`)} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 focus-visible:bg-indigo-50 focus:outline-none ${r.stale ? 'bg-rose-50/40' : ''}`}>
                <td className="px-3 py-2 min-w-[250px]"><Link to={`/v3/purchasing/orders/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.po_no}</Link>
                    {r.source === 'DIRECT' && <span className="ml-1.5 align-middle text-[10px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300" title={`Bought on a bill by ${r.created_by_name || 'the store'}${r.supplier_reference ? ` · ${r.supplier_reference}` : ''}`}>DIRECT</span>}
                    <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">{fmtDate(r.po_date)}{r.revision_no ? ` · rev ${r.revision_no}` : ''} · {r.line_count} line{r.line_count === 1 ? '' : 's'}
                        {(r.kinds || []).map(k => <span key={k} className={`text-[10px] font-bold px-1.5 rounded border ${KIND[k]?.cls || ''}`}>{KIND[k]?.label || k}</span>)}
                        {r.unrequisitioned && <span className="text-[10px] font-bold px-1.5 rounded border bg-amber-50 text-amber-800 border-amber-200" title="Has quantity with no requisition (advance buy, MOQ, store stock…): the reason is on the PO">no req.</span>}</span></td>
                <td className="px-3 py-2 text-slate-700">{group ? null : r.supplier_name}{r.shop_name && <span className="block text-xs text-slate-500">{r.shop_name}</span>}</td>
                <td className="px-3 py-2 text-xs">{(r.orders || []).length ? <span className="flex flex-wrap gap-x-1.5">{r.orders.slice(0, 3).map(o => <Link key={o.id} to={`/v3/sales-orders/${o.id}`} onClick={e => e.stopPropagation()} className="text-indigo-700 hover:underline whitespace-nowrap">{o.order_no.replace(/^SO3\/\d{4}-\d{2}\//, 'SO ')}</Link>)}{r.orders.length > 3 && <span className="text-slate-500" title={r.orders.slice(3).map(o => o.order_no).join(', ')}>+{r.orders.length - 3}</span>}</span> : <span className="text-slate-400">{r.source === 'DIRECT' ? 'store' : '—'}</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{inr(r.total)}</td>
                <td className="px-3 py-2 min-w-[130px]" title={r.last_receipt ? `Last goods in ${fmtDate(r.last_receipt)}` : undefined}>{r.status === 'CANCELLED' || ['DRAFT', 'PENDING_APPROVAL'].includes(r.status) ? <span className="text-slate-400 text-xs">—</span> : <>
                    <span className="flex items-center gap-2"><span className="flex-1 h-1.5 rounded bg-slate-200 overflow-hidden"><span className={`block h-full ${r.pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${r.pct}%` }} /></span><span className="text-xs tabular-nums font-semibold w-9 text-right">{r.pct}%</span></span>
                    {r.toCome > 0.5 && <span className="block text-[11px] text-slate-500 tabular-nums">₹{inr(r.toCome)} to come</span>}
</>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.due ? fmtDate(r.due) : '—'}
                    {r.late > 0 && <span className="block text-[11px] font-bold text-rose-700">{r.late} day{r.late === 1 ? '' : 's'} late</span>}
                    {!r.late && OPEN.includes(r.status) && r.due && <span className="block text-[11px] text-slate-500">{daysBetween(today, r.due) === 0 ? 'due today' : `in ${daysBetween(today, r.due)} days`}</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.status !== 'CANCELLED' && r.to_bill_value > 0.5 ? <span className="font-semibold text-amber-800">{inr(r.to_bill_value)}</span> : <span className="text-slate-400">—</span>}
                    {r.billed_value > 0.5 && <span className="block text-[11px] text-slate-500">billed {inr(r.billed_value)}</span>}</td>
                <td className="px-3 py-2"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PO_STATUS[r.status].cls}`}>{PO_STATUS[r.status].label}</span>
                    {r.sent_back && <span className="ml-1 text-[11px] font-bold text-rose-700">sent back</span>}
                    {n && <span className={`block mt-1 text-[11px] font-semibold ${TONE[n.tone]}`}>→ {n.t}{n.also ? <span className="font-normal text-amber-800"> · {n.also}</span> : null}</span>}
</td>
            </tr>
        );
    };
    const totalCells = (s) => <>
        <td className="px-3 py-2 text-right tabular-nums">{inr(s.total)}</td>
        <td className="px-3 py-2 text-xs tabular-nums">{s.total > 0 ? `${Math.min(100, Math.round((s.received / s.total) * 100))}% received` : ''}{s.toCome > 0.5 && <span className="block">₹{inr(s.toCome)} to come</span>}</td>
        <td className="px-3 py-2 text-xs">{s.late ? <span className="text-rose-700">{s.late} late</span> : ''}</td>
        <td className="px-3 py-2 text-right tabular-nums">{s.toBill > 0.5 ? inr(s.toBill) : '—'}</td>
        <td />
    </>;

    return (
        <div>
            {/* Compact (20 Nov 2026, owner: "complete page is almost occupied by header, text, excel button, group buttons, filter"):
                title, search, filters and actions on one row; tabs on one thin row; the table scrolls with its headings fixed. */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-lg font-black text-slate-900 mr-1">Purchase orders</h1>
                <span className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="PO, supplier, shop" aria-label="Search purchase orders" className="pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded-lg w-44 focus:outline-none focus:border-indigo-500" /></span>
                <select className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" value={supplier} onChange={e => setParam('supplier', e.target.value)} aria-label="Supplier">
                    <option value="">All suppliers</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" value={kind} onChange={e => setParam('kind', e.target.value)} aria-label="Kind">
                    <option value="">All kinds</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" value={source} aria-label="How the PO was made"
                    onChange={e => { const n = Object.fromEntries(params); delete n.since; if (e.target.value) n.source = e.target.value; else delete n.source; setParams(n); }}>
                    <option value="">Purchasing + direct</option><option value="STANDARD">Made by purchasing</option><option value="DIRECT">Direct purchases</option>
                </select>
                <select className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" value={sort} onChange={e => setParam('sort', e.target.value === 'new' ? '' : e.target.value)} aria-label="Sort">
                    {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none"><input type="checkbox" checked={group} onChange={flipGroup} /> By supplier</label>
                <span className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={excel} disabled={!shown.length} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50" title="Excel of what is shown"><FileSpreadsheet size={13} /> Excel</button>
                    {canManage && <Link to="/v3/purchasing/orders/new" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"><Plus size={13} /> New PO</Link>}
                </span>
            </div>
            <ErrorBox text={error} />
            {(since === 'week' || status || sentBack) && <p className="mb-3 text-sm bg-indigo-50 text-indigo-800 rounded-lg px-3 py-2">
                {since === 'week' ? `Made this week${source === 'DIRECT' ? ' — the store\'s direct purchases (spares / general items bought on a bill)' : ''}.` : sentBack ? 'Sent back: approval refused.' : `Status: ${PO_STATUS[status.split(',')[0]]?.label || status}.`}{' '}
                <button type="button" className="underline font-semibold" onClick={() => { const n = Object.fromEntries(params); delete n.since; delete n.status; delete n.sent_back; delete n.tab; setParams(n); }}>Show all</button></p>}
            {!rows ? <Loading /> : <>
                <div className="flex flex-wrap gap-1 mb-2" role="tablist" aria-label="Purchase orders by stage">
                    {TABS.filter(([k]) => k !== 'stale' || counts.stale.n > 0).map(([k, label]) => {
                        const c = counts[k]; const on = tab === k;
                        const money = k === 'bill' ? c.toBill : ['late', 'awaiting', 'partly', 'stale'].includes(k) ? c.toCome : c.total;
                        return (
                            <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setParam('tab', k === 'open' && !status && !sentBack && !since ? '' : k)}
                                title={c.n ? `${lakh(money)}${k === 'bill' ? ' to bill (before GST)' : ['late', 'awaiting', 'partly', 'stale'].includes(k) ? ' still to come' : ' ordered'}` : undefined}
                                className={`px-2.5 py-1 rounded-full border text-xs whitespace-nowrap ${on ? 'bg-indigo-600 border-indigo-600 text-white' : k === 'late' || k === 'stale' ? 'bg-white border-rose-200 text-rose-800 hover:bg-rose-50' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                <span className="font-bold">{label}</span> <span className="tabular-nums">{c.n}</span>{c.n ? <span className={`tabular-nums ${on ? 'text-indigo-100' : 'text-slate-500'}`}> · {lakh(money)}</span> : null}
                            </button>
                        );
                    })}
                </div>
                {tab === 'stale' && <p className="mb-2 text-xs bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2">Issued more than 30 days ago and nothing received. For each: chase the supplier, cancel it, or, if the goods already came in another way (2.0 or a direct purchase), find that receipt before cancelling.</p>}
                <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[calc(100vh-11.5rem)]">
                    <table className="w-full text-sm min-w-[1120px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                            <tr><th className="px-3 py-2">PO</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">For orders</th><th className="px-3 py-2 text-right">Ordered ₹ <span className="normal-case font-normal">(with GST)</span></th><th className="px-3 py-2">Received</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right" title="Received, accepted and not yet on a live supplier invoice, at the rate frozen at receipt">To bill ₹ <span className="normal-case font-normal">(before GST)</span></th><th className="px-3 py-2">Status · next step</th></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No purchase orders here{search || supplier || kind ? ' that match' : ''}.</td></tr>}
                            {groups ? groups.flatMap(g => [
                                <tr key={`g${g.id}`} className="border-t-2 border-slate-200 bg-slate-50 cursor-pointer" onClick={() => setShut(s => ({ ...s, [g.id]: !s[g.id] }))}>
                                    <td className="px-3 py-2 font-bold text-slate-800" colSpan={3}><span className="inline-flex items-center gap-1">{shut[g.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{g.name}</span> <span className="font-normal text-xs text-slate-500">· {g.sum.n} PO{g.sum.n === 1 ? '' : 's'}</span></td>
                                    {totalCells(g.sum)}
                                </tr>,
                                ...(shut[g.id] ? [] : g.rows.map(row)),
                            ]) : shown.map(row)}
                            {shown.length > 0 && (
                                <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-slate-700">
                                    <td className="px-3 py-2" colSpan={3}>Total · {tot.n} PO{tot.n === 1 ? '' : 's'}{groups ? ` · ${groups.length} supplier${groups.length === 1 ? '' : 's'}` : ''}</td>
                                    {totalCells(tot)}
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </>}
        </div>
    );
}

// The next step: what someone has to do about this PO now.
function computeNext(r, today) {
    const due = r.delivery_date || r.first_delivery || null;
    const late = OPEN.includes(r.status) && due && due < today;
    let next = null;
    if (r.status === 'DRAFT') next = r.sent_back ? { t: 'Correct and resubmit', tone: 'rose' } : { t: 'Issue to the supplier', tone: 'indigo' };
    else if (r.status === 'PENDING_APPROVAL') next = { t: 'Factory admin to approve', tone: 'indigo' };
    else if (r.grn_waiting) next = { t: `Approve goods receipt${r.grn_waiting > 1 ? `s (${r.grn_waiting})` : ''}`, tone: 'indigo' };
    else if (r.stale) next = { t: 'Nothing came in 30+ days: chase or cancel', tone: 'rose' };
    else if (late) next = { t: 'Chase the supplier', tone: 'rose' };
    else if (r.status === 'PARTLY_RECEIVED') next = { t: 'Receive the rest, or short-close', tone: 'amber' };
    else if (r.status === 'ISSUED') next = { t: 'Waiting for delivery', tone: 'slate' };
    const bill = r.to_bill_value > 0.5 && r.status !== 'CANCELLED' && !['DRAFT', 'PENDING_APPROVAL'].includes(r.status);
    if (!next && bill) return { t: 'Accounts to bill', tone: 'amber' };
    if (next && bill) return { ...next, also: 'accounts to bill' };
    return next;
}

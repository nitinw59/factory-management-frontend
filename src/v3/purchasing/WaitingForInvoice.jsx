// GRNs waiting for a supplier invoice (20 Nov 2026, owner: "currently only way to add invoice for GRN is when user add invoice and
// select supplier … do we have any page which show grn which are pending for invoice" → "build"). The "Waiting for invoice" tab of
// Supplier invoices: every approved GRN with goods not yet on a live invoice, grouped by supplier (most money waiting first) —
// received date, challan, PO, kinds, lines still to bill (part already billed), value to bill with GST at the rates frozen at
// receipt, age (amber after 7 days, red after 30), a draft already started. "Enter invoice" on a GRN or a supplier opens the invoice
// form with the supplier chosen and those GRN lines ticked. Filters (supplier, age, kind, search), totals, Excel.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Receipt, FileSpreadsheet, Search } from 'lucide-react';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';

const KIND = { FABRIC: { label: 'Fabric', cls: 'bg-sky-50 text-sky-800 border-sky-200' }, TRIM: { label: 'Trims', cls: 'bg-violet-50 text-violet-800 border-violet-200' }, STORE: { label: 'Store', cls: 'bg-stone-50 text-stone-700 border-stone-300' } };
const AGES = { '': 'Any age', fresh: 'Up to 7 days', week: '8–30 days', old: 'Over 30 days' };
const inAge = (d, a) => !a || (a === 'fresh' ? d <= 7 : a === 'week' ? d > 7 && d <= 30 : d > 30);
const ageCls = (d) => (d > 30 ? 'text-rose-700 font-bold' : d > 7 ? 'text-amber-800 font-semibold' : 'text-slate-600');
const sel = 'px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white';
const td = 'px-3 py-2';
const DRAFT_KEY = 'v3.invoiceDraft';

export default function WaitingForInvoice({ rows, canEnter }) {
    const navigate = useNavigate();
    const [supplier, setSupplier] = useState('');
    const [age, setAge] = useState('');
    const [kind, setKind] = useState('');
    const [q, setQ] = useState('');
    const suppliers = useMemo(() => [...new Map(rows.map(r => [r.supplier_id, r.supplier_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
    const s = q.trim().toLowerCase();
    const shown = rows.filter(r => (!supplier || r.supplier_id === supplier) && inAge(r.age_days, age) && (!kind || r.kinds.includes(kind))
        && (!s || [r.grn_no, r.challan_no, r.po_no, r.supplier_name].some(x => String(x || '').toLowerCase().includes(s))));
    const groups = useMemo(() => {
        const m = new Map();
        for (const r of shown) { if (!m.has(r.supplier_id)) m.set(r.supplier_id, { id: r.supplier_id, name: r.supplier_name, gstin: r.supplier_gstin, rows: [] }); m.get(r.supplier_id).rows.push(r); }
        return [...m.values()].map(g => ({ ...g, value: g.rows.reduce((t, r) => t + r.value, 0), oldest: Math.max(...g.rows.map(r => r.age_days)) })).sort((a, b) => b.value - a.value);
    }, [shown]);
    const total = shown.reduce((t, r) => t + r.value, 0);
    const taxable = shown.reduce((t, r) => t + r.taxable, 0);

    // The invoice form, the supplier chosen and these GRN lines ticked. An unfinished invoice kept on this device is replaced.
    const enter = (supplierId, list) => {
        let kept = null;
        try { kept = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { kept = null; }
        if (kept && (kept.supplierId || kept.form?.invoice_no) && !window.confirm('There is an unfinished invoice on this device. Starting this one replaces it. Continue?')) return;
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* per-device convenience only */ }
        navigate(`/v3/purchasing/invoices/new?supplier=${supplierId}&lines=${list.flatMap(r => r.grn_line_ids).join(',')}`);
    };
    const excel = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shown.map(r => ({
            Supplier: r.supplier_name, GSTIN: r.supplier_gstin || '', GRN: r.grn_no, Received: r.received_date, 'Age (days)': r.age_days, Challan: r.challan_no || '', PO: r.po_no,
            Kinds: r.kinds.map(k => KIND[k]?.label || k).join(', '), 'Lines to bill': r.lines_waiting, 'Lines on GRN': r.lines, 'Part already billed': r.partly_billed ? 'yes' : '',
            'To bill before GST (Rs)': r.taxable, 'To bill with GST (Rs)': r.value, 'Draft invoice': r.drafts.map(d => d.invoice_no).join(', '),
        }))), 'Waiting for invoice');
        XLSX.writeFile(wb, `grns-waiting-for-invoice-${todayLocal()}.xlsx`);
    };

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="GRN, challan, PO, supplier" aria-label="Search GRNs" className="pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded-lg w-48 focus:outline-none focus:border-indigo-500" /></span>
                <select className={sel} value={supplier} onChange={e => setSupplier(e.target.value)} aria-label="Supplier"><option value="">All suppliers</option>{suppliers.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
                <select className={sel} value={age} onChange={e => setAge(e.target.value)} aria-label="Age">{Object.entries(AGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select className={sel} value={kind} onChange={e => setKind(e.target.value)} aria-label="Kind"><option value="">All kinds</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                <span className="text-xs text-slate-600">{shown.length} GRN{shown.length === 1 ? '' : 's'} · {groups.length} supplier{groups.length === 1 ? '' : 's'} · <b>₹{inr(total)}</b> with GST{shown.some(r => r.age_days > 30) ? <span className="text-rose-700 font-semibold"> · {shown.filter(r => r.age_days > 30).length} over 30 days</span> : null}</span>
                <button type="button" onClick={excel} disabled={!shown.length} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileSpreadsheet size={13} /> Excel</button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[calc(100vh-12rem)]">
                <table className="w-full text-sm min-w-[1020px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                        <tr><th className={td}>GRN</th><th className={td}>Challan</th><th className={td}>PO</th><th className={td}>Lines to bill</th><th className={`${td} text-right`}>To bill ₹ <span className="normal-case font-normal">(with GST)</span></th><th className={`${td} text-right`}>Age</th><th className={td}>Draft invoice</th><th className={td} /></tr>
                    </thead>
                    <tbody>
                        {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">{rows.length ? 'No GRN matches.' : 'Every GRN received is on a supplier invoice.'}</td></tr>}
                        {groups.flatMap(g => [
                            <tr key={`s${g.id}`} className="border-t-2 border-slate-200 bg-slate-50">
                                <td className={`${td} font-bold text-slate-800`} colSpan={4}>{g.name} <span className="font-normal text-xs text-slate-500">{g.gstin ? `· ${g.gstin} ` : ''}· {g.rows.length} GRN{g.rows.length === 1 ? '' : 's'}</span></td>
                                <td className={`${td} text-right tabular-nums font-bold`}>{inr(g.value)}</td>
                                <td className={`${td} text-right text-xs ${ageCls(g.oldest)}`}>oldest {g.oldest} d</td>
                                <td />
                                <td className={`${td} text-right`}>{canEnter && g.rows.length > 1 && <button type="button" onClick={() => enter(g.id, g.rows)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:underline whitespace-nowrap" title="One invoice for all these GRNs; untick what it does not bill"><Receipt size={13} /> Invoice for all {g.rows.length}</button>}</td>
                            </tr>,
                            ...g.rows.map(r => (
                                <tr key={r.grn_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                    <td className={td}><Link to={`/v3/purchasing/grns/${r.grn_id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.grn_no}</Link>
                                        <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">received {fmtDate(r.received_date)}{r.kinds.map(k => <span key={k} className={`text-[10px] font-bold px-1.5 rounded border ${KIND[k]?.cls || ''}`}>{KIND[k]?.label || k}</span>)}</span></td>
                                    <td className={`${td} text-xs`}>{r.challan_no || '—'}</td>
                                    <td className={`${td} text-xs`}><Link to={`/v3/purchasing/orders/${r.po_id}`} className="text-indigo-700 hover:underline whitespace-nowrap">{r.po_no}</Link></td>
                                    <td className={`${td} text-xs`}>{r.lines_waiting} of {r.lines}{r.partly_billed && <span className="ml-1.5 text-[10px] font-bold px-1.5 rounded border bg-amber-50 text-amber-800 border-amber-200">part billed</span>}</td>
                                    <td className={`${td} text-right tabular-nums font-semibold`}>{inr(r.value)}<span className="block text-[11px] font-normal text-slate-500">{inr(r.taxable)} before GST</span></td>
                                    <td className={`${td} text-right whitespace-nowrap ${ageCls(r.age_days)}`}>{r.age_days} day{r.age_days === 1 ? '' : 's'}</td>
                                    <td className={`${td} text-xs`}>{r.drafts.length ? r.drafts.map(d => <Link key={d.id} to={`/v3/purchasing/invoices/${d.id}/edit`} className="block text-indigo-700 hover:underline">{d.invoice_no} (carry on)</Link>) : <span className="text-slate-400">—</span>}</td>
                                    <td className={`${td} text-right`}>{canEnter && <button type="button" onClick={() => enter(r.supplier_id, [r])} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg whitespace-nowrap"><Receipt size={13} /> Enter invoice</button>}</td>
                                </tr>
                            )),
                        ])}
                        {shown.length > 0 && (
                            <tr className="border-t-2 border-slate-300 bg-slate-100 font-black text-slate-700">
                                <td className={td} colSpan={3}>Total · {shown.length} GRN{shown.length === 1 ? '' : 's'} · {groups.length} supplier{groups.length === 1 ? '' : 's'}</td>
                                <td className={`${td} text-xs`}>{shown.reduce((t, r) => t + r.lines_waiting, 0)} lines</td>
                                <td className={`${td} text-right tabular-nums`}>{inr(total)}<span className="block text-[11px] font-semibold text-slate-500">{inr(taxable)} before GST</span></td>
                                <td className={`${td} text-right text-xs`}>{shown.length ? `oldest ${Math.max(...shown.map(r => r.age_days))} d` : ''}</td>
                                <td colSpan={2} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

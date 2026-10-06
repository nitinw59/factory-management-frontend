// Purchasing reports: open & overdue PO lines, goods-received register,
// price history per item, supplier performance (on time, rejection, returns,
// invoice match). Filters per tab; Excel of what is shown.
import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';

const TABS = { open: 'Open & overdue', grn: 'Goods received', prices: 'Price history', suppliers: 'Supplier performance' };
const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const pctTxt = (v) => (v == null ? '—' : `${v}%`);
const KIND = { FABRIC: 'Fabric', TRIM: 'Trim', STORE: 'Store' };
const th = 'px-3 py-2.5';
const td = 'px-3 py-2';

export default function PurchasingReportsPage() {
    const [params, setParams] = useSearchParams();
    const tab = TABS[params.get('tab')] ? params.get('tab') : 'open';
    const [rows, setRows] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [supplierId, setSupplierId] = useState('');
    const [overdue, setOverdue] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [q, setQ] = useState('');
    const [kind, setKind] = useState('');
    const [open, setOpen] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { purchasingApi.suppliers().then(res => setSuppliers(res.data)).catch(() => {}); }, []);
    useEffect(() => {
        setRows(null); setError('');
        const req = {
            open: () => purchasingApi.report('open-pos', { supplier_id: supplierId || undefined, overdue: overdue ? 'true' : undefined }),
            grn: () => purchasingApi.report('grn-register', { supplier_id: supplierId || undefined, from: from || undefined, to: to || undefined }),
            prices: () => purchasingApi.report('price-history', { q: q.trim() || undefined, kind: kind || undefined }),
            suppliers: () => purchasingApi.report('suppliers', { from: from || undefined, to: to || undefined }),
        }[tab];
        const t = setTimeout(() => req().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load the report.'))), 250);
        return () => clearTimeout(t);
    }, [tab, supplierId, overdue, from, to, q, kind]);

    const excel = () => {
        const data = {
            open: () => rows.map(r => ({ PO: r.po_no, Supplier: r.supplier_name, Line: r.line_no, Kind: KIND[r.kind], Item: r.label, Ordered: r.ordered, Received: r.received, Open: r.open_qty, Unit: r.purchase_uom, 'Rate (Rs)': r.rate, 'Open value (Rs)': r.open_value, Due: r.due_date || '', 'Days overdue': r.days_overdue })),
            grn: () => rows.map(r => ({ Date: r.received_date, GRN: r.grn_no, Status: r.status, Challan: r.challan_no, Supplier: r.supplier_name, PO: r.po_no, Item: r.label, Accepted: r.accepted, Rejected: r.rejected, Unit: r.purchase_uom, 'Rate (Rs)': r.rate, 'Value (Rs)': r.value, Due: r.due_date || '', Late: r.late ? 'Yes' : '', Returned: r.returned, Billed: r.billed, Unbilled: r.unbilled })),
            prices: () => rows.flatMap(it => it.history.map(h => ({ Kind: KIND[it.kind], Item: it.label, Date: h.po_date, PO: h.po_no, Supplier: h.supplier_name, Qty: h.qty, Unit: it.purchase_uom, 'Rate (Rs)': h.rate, [`Rs per ${it.uom}`]: h.rate_per_usage }))),
            suppliers: () => rows.map(r => ({ Supplier: r.supplier_name, POs: r.pos, 'Open POs': r.open_pos, 'Ordered (Rs)': r.ordered_value, GRNs: r.grns, 'Accepted (Rs)': r.accepted_value, 'Rejected (Rs)': r.rejected_value, 'Rejection %': r.rejection_pct ?? '', 'On time %': r.on_time_pct ?? '', 'Avg days late': r.avg_days_late, 'Return notes': r.return_notes, 'Returned from stock (Rs)': r.returned_stock_value, Invoices: r.invoices, 'Invoiced (Rs)': r.invoiced_value, Matched: r.invoices_matched, 'With warning': r.invoices_warning, Overridden: r.invoices_overridden })),
        }[tab]();
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), TABS[tab].slice(0, 30));
        XLSX.writeFile(wb, `purchasing-${tab}-${todayLocal()}.xlsx`);
    };
    const supplierSel = <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={supplierId} onChange={e => setSupplierId(e.target.value)} aria-label="Supplier"><option value="">All suppliers</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
    const dates = <>
        <label className="text-sm text-slate-600 flex items-center gap-1">From <input type="date" className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-sm text-slate-600 flex items-center gap-1">To <input type="date" className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg" value={to} onChange={e => setTo(e.target.value)} /></label>
    </>;

    return (
        <div>
            <PageHeader title="Purchasing reports" subtitle="Open and overdue deliveries, goods received, prices paid and how each supplier performs." actions={<SecondaryButton onClick={excel} disabled={!rows?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>} />
            <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-200">
                {Object.entries(TABS).map(([k, v]) => <button key={k} type="button" onClick={() => setParams({ tab: k })} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{v}</button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {tab === 'open' && <>{supplierSel}<label className="text-sm flex items-center gap-1.5"><input type="checkbox" checked={overdue} onChange={e => setOverdue(e.target.checked)} /> Overdue only</label></>}
                {tab === 'grn' && <>{supplierSel}{dates}</>}
                {tab === 'prices' && <><SearchInput value={q} onChange={setQ} placeholder="Item: brand, code, mill, article…" /><select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Kind"><option value="">All kinds</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}
                {tab === 'suppliers' && <>{dates}<span className="text-xs text-slate-500">Ordered by PO date, received by GRN date, invoices by invoice date.</span></>}
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    {tab === 'open' && (
                        <table className="w-full text-sm min-w-[980px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className={th}>PO</th><th className={th}>Supplier</th><th className={th}>Item</th><th className={`${th} text-right`}>Ordered</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Open</th><th className={`${th} text-right`}>Open value ₹</th><th className={th}>Due</th></tr></thead>
                            <tbody>
                                {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nothing open.</td></tr>}
                                {rows.map(r => (
                                    <tr key={r.po_line_id} className="border-t border-slate-100">
                                        <td className={td}><Link to={`/v3/purchasing/orders/${r.po_id}`} className="font-semibold text-indigo-700 hover:underline">{r.po_no}</Link> <span className="text-xs text-slate-500">line {r.line_no}</span></td>
                                        <td className={td}>{r.supplier_name}</td><td className={td}>{r.label}</td>
                                        <td className={`${td} text-right tabular-nums`}>{fmt(r.ordered)}</td><td className={`${td} text-right tabular-nums`}>{fmt(r.received)}</td>
                                        <td className={`${td} text-right tabular-nums font-bold`}>{fmt(r.open_qty)} <span className="text-xs font-normal text-slate-500">{r.purchase_uom}</span></td>
                                        <td className={`${td} text-right tabular-nums`}>{inr(r.open_value)}</td>
                                        <td className={`${td} whitespace-nowrap ${r.overdue ? 'text-rose-700 font-bold' : ''}`}>{fmtDate(r.due_date)}{r.overdue && <span className="block text-[11px]">{r.days_overdue} day(s) late</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {rows.length > 0 && <tfoot className="border-t-2 border-slate-200 font-bold"><tr><td colSpan={6} className={td}>Open value</td><td className={`${td} text-right tabular-nums`}>{inr(rows.reduce((s, r) => s + r.open_value, 0))}</td><td /></tr></tfoot>}
                        </table>
                    )}
                    {tab === 'grn' && (
                        <table className="w-full text-sm min-w-[1100px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className={th}>Date</th><th className={th}>GRN</th><th className={th}>Supplier / PO</th><th className={th}>Item</th><th className={`${th} text-right`}>Accepted</th><th className={`${th} text-right`}>Rejected</th><th className={`${th} text-right`}>Value ₹</th><th className={`${th} text-right`}>Returned</th><th className={`${th} text-right`}>Unbilled</th></tr></thead>
                            <tbody>
                                {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No goods received in this period.</td></tr>}
                                {rows.map(r => (
                                    <tr key={r.grn_line_id} className="border-t border-slate-100">
                                        <td className={`${td} whitespace-nowrap`}>{fmtDate(r.received_date)}{r.late && <span className="block text-[11px] text-rose-700 font-semibold">late (due {fmtDate(r.due_date)})</span>}</td>
                                        <td className={td}><Link to={`/v3/purchasing/grns/${r.grn_id}`} className="font-semibold text-indigo-700 hover:underline">{r.grn_no}</Link>{r.status === 'PENDING_APPROVAL' && <span className="block text-[11px] text-amber-700">waiting for approval</span>}</td>
                                        <td className={`${td} text-xs`}>{r.supplier_name}<span className="block text-slate-500">{r.po_no} · challan {r.challan_no}</span></td>
                                        <td className={td}>{r.label}</td>
                                        <td className={`${td} text-right tabular-nums`}>{fmt(r.accepted)} <span className="text-xs text-slate-500">{r.purchase_uom}</span></td>
                                        <td className={`${td} text-right tabular-nums ${r.rejected ? 'text-rose-700' : ''}`}>{r.rejected ? fmt(r.rejected) : '—'}</td>
                                        <td className={`${td} text-right tabular-nums`}>{inr(r.value)}</td>
                                        <td className={`${td} text-right tabular-nums`}>{r.returned ? fmt(r.returned) : '—'}</td>
                                        <td className={`${td} text-right tabular-nums`}>{r.unbilled ? fmt(r.unbilled) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {tab === 'prices' && (
                        <table className="w-full text-sm min-w-[900px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className={th}>Item</th><th className={`${th} text-right`}>Orders</th><th className={`${th} text-right`}>Last ₹</th><th className={`${th} text-right`}>Lowest ₹</th><th className={`${th} text-right`}>Highest ₹</th><th className={`${th} text-right`}>Average ₹</th><th className={`${th} text-right`}>Change</th><th className={th}>Last bought</th></tr></thead>
                            <tbody>
                                {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No priced purchase order lines.</td></tr>}
                                {rows.map(it => (
                                    <Fragment key={it.key}>
                                        <tr className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === it.key ? null : it.key)}>
                                            <td className={td}><span className="font-semibold">{it.label}</span> <span className="text-xs text-slate-500">{KIND[it.kind]} · per {it.purchase_uom}</span></td>
                                            <td className={`${td} text-right tabular-nums`}>{it.orders}</td>
                                            <td className={`${td} text-right tabular-nums font-bold`}>{inr(it.last_rate)}</td>
                                            <td className={`${td} text-right tabular-nums`}>{inr(it.min_rate)}</td>
                                            <td className={`${td} text-right tabular-nums`}>{inr(it.max_rate)}</td>
                                            <td className={`${td} text-right tabular-nums`}>{it.avg_rate != null ? inr(it.avg_rate) : '—'}</td>
                                            <td className={`${td} text-right tabular-nums ${it.change_pct > 0 ? 'text-rose-700' : it.change_pct < 0 ? 'text-emerald-700' : ''}`}>{it.change_pct ? `${it.change_pct > 0 ? '+' : ''}${it.change_pct}%` : '—'}</td>
                                            <td className={`${td} text-xs`}>{fmtDate(it.last_date)} · {it.last_supplier}</td>
                                        </tr>
                                        {open === it.key && it.history.map(h => (
                                            <tr key={`${it.key}-${h.po_id}`} className="bg-slate-50 text-xs">
                                                <td className={`${td} pl-8`}><Link to={`/v3/purchasing/orders/${h.po_id}`} className="text-indigo-700 hover:underline">{h.po_no}</Link> · {fmtDate(h.po_date)} · {h.supplier_name}</td>
                                                <td className={`${td} text-right`}>{fmt(h.qty)}</td><td className={`${td} text-right`}>{inr(h.rate)}</td>
                                                <td colSpan={5} className={`${td} text-slate-500`}>= ₹{h.rate_per_usage} per {it.uom}</td>
                                            </tr>
                                        ))}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {tab === 'suppliers' && (
                        <table className="w-full text-sm min-w-[1100px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className={th}>Supplier</th><th className={`${th} text-right`}>POs (open)</th><th className={`${th} text-right`}>Ordered ₹</th><th className={`${th} text-right`}>Accepted ₹</th><th className={`${th} text-right`}>On time</th><th className={`${th} text-right`}>Rejection</th><th className={`${th} text-right`}>Returned ₹</th><th className={`${th} text-right`}>Invoices</th><th className={th}>Match</th></tr></thead>
                            <tbody>
                                {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No purchasing activity in this period.</td></tr>}
                                {rows.map(r => (
                                    <tr key={r.supplier_id} className="border-t border-slate-100">
                                        <td className={`${td} font-semibold`}>{r.supplier_name}</td>
                                        <td className={`${td} text-right tabular-nums`}>{r.pos} ({r.open_pos})</td>
                                        <td className={`${td} text-right tabular-nums`}>{inr(r.ordered_value)}</td>
                                        <td className={`${td} text-right tabular-nums`}>{inr(r.accepted_value)}</td>
                                        <td className={`${td} text-right tabular-nums ${r.on_time_pct != null && r.on_time_pct < 80 ? 'text-rose-700 font-bold' : ''}`}>{pctTxt(r.on_time_pct)}{r.avg_days_late > 0 && <span className="block text-[11px] font-normal text-slate-500">late by {r.avg_days_late} d avg</span>}</td>
                                        <td className={`${td} text-right tabular-nums ${r.rejection_pct > 5 ? 'text-rose-700 font-bold' : ''}`}>{pctTxt(r.rejection_pct)}</td>
                                        <td className={`${td} text-right tabular-nums`}>{r.returned_stock_value ? inr(r.returned_stock_value) : '—'}{r.return_notes > 0 && <span className="block text-[11px] text-slate-500">{r.return_notes} note(s)</span>}</td>
                                        <td className={`${td} text-right tabular-nums`}>{r.invoices}{r.invoices > 0 && <span className="block text-[11px] text-slate-500">₹{inr(r.invoiced_value)}</span>}</td>
                                        <td className={`${td} text-xs`}>{r.invoices ? `${r.invoices_matched} matched${r.invoices_warning ? ` · ${r.invoices_warning} warning` : ''}${r.invoices_overridden ? ` · ${r.invoices_overridden} overridden` : ''}` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}

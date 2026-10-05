// Material readiness: every approved order, red first. Ready = every item
// allocated from stock in hand; only ready orders (or ones a factory admin
// has overridden) can be cut in 3.0.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Info } from 'lucide-react';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { READY_STATUS, RAG_CLS, RAG_DOT, ReadinessChip, daysText } from './readinessShared';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const missingText = (b) => {
    const parts = [];
    if (b.from_stock > 0) parts.push(`${fmt(b.from_stock, b.uom)} ${b.uom} in free stock — allocate`);
    if (b.to_raise > 0) parts.push(`${fmt(b.to_raise, b.uom)} ${b.uom} to raise`);
    if (b.pr_pending > 0) parts.push(`${fmt(b.pr_pending, b.uom)} requested`);
    if (b.pr_approved > 0) parts.push(`${fmt(b.pr_approved, b.uom)} on order`);
    return parts.join(', ') || `${fmt(b.required - b.allocated, b.uom)} ${b.uom} not allocated`;
};

export default function ReadinessDashboardPage() {
    const [rows, setRows] = useState(null);
    const [rag, setRag] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    useEffect(() => { planningApi.readiness().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load readiness.'))); }, []);
    const shown = useMemo(() => (rows || []).filter(r => (!rag || r.rag === rag) && (!status || r.status === status)), [rows, rag, status]);
    const count = (k, v) => (rows || []).filter(r => r[k] === v).length;

    return (
        <div>
            <PageHeader title="Material readiness" subtitle="Approved orders, red first. Ready = every fabric and trim item allocated from stock in hand. Only ready orders, or ones a factory admin releases, can be cut." />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[['RED', 'Action needed'], ['AMBER', 'Waiting for stock'], ['GREEN', 'Ready to cut']].map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setRag(rag === k ? '' : k)} className={`text-left border rounded-xl p-3 ${rag === k ? 'ring-2 ring-indigo-400' : ''} ${RAG_CLS[k]}`}>
                            <p className="text-xs font-bold flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${RAG_DOT[k]}`} />{label}</p>
                            <p className="text-2xl font-black">{count('rag', k)}</p>
                        </button>
                    ))}
                    <div className="border border-slate-200 bg-white rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><ShieldCheck size={13} /> Released by override</p>
                        <p className="text-2xl font-black text-slate-900">{rows.filter(r => r.override).length}</p>
                    </div>
                </div>
                <p className="mb-3 text-xs text-slate-600 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" />
                    Allocate stock from Material position (fabric comes from the rolls in Masters → Fabric stock). A factory admin can release an urgent, not-ready order for cutting from its requirements page.</p>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        {Object.entries(READY_STATUS).filter(([k]) => k !== 'NO_REQUIREMENTS').map(([k, v]) => <option key={k} value={k}>{v.label} ({count('status', k)})</option>)}
                    </select>
                    {(rag || status) && <button type="button" className="text-sm font-semibold text-indigo-700" onClick={() => { setRag(''); setStatus(''); }}>Clear filters</button>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[980px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Ships</th><th className="px-4 py-2.5">Materials needed by</th><th className="px-4 py-2.5">Allocated</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Waiting for</th></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No approved orders{rag || status ? ' match' : ''}.</td></tr>}
                            {shown.map(r => (
                                <tr key={r.order_id} className="border-t border-slate-100 align-top">
                                    <td className="px-4 py-2.5">
                                        <Link to={`/v3/planning/orders/${r.order_id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.order_no}</Link>
                                        <span className="block text-xs text-slate-500">{r.customer_name} · {r.total_qty.toLocaleString('en-IN')} pcs</span>
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.first_ship_date)}<span className="block text-xs text-slate-500">{daysText(r.days_to_ship)}</span></td>
                                    <td className={`px-4 py-2.5 whitespace-nowrap ${r.late ? 'text-rose-700 font-bold' : ''}`}>{r.needed_by ? <>{fmtDate(r.needed_by)}<span className="block text-xs font-normal">{daysText(r.days_to_needed_by)}</span></> : '—'}</td>
                                    <td className="px-4 py-2.5 min-w-[140px]">
                                        <p className="text-xs font-semibold text-slate-700">{r.items_allocated} / {r.items_total} items</p>
                                        <div className="h-1.5 bg-slate-100 rounded mt-1"><div className={`h-1.5 rounded ${RAG_DOT[r.rag]}`} style={{ width: `${r.pct_allocated}%` }} /></div>
                                        {r.items_on_order > r.items_allocated && <p className="text-[11px] text-slate-500 mt-0.5">{r.items_on_order} / {r.items_total} incl. on order</p>}
                                    </td>
                                    <td className="px-4 py-2.5"><ReadinessChip r={r} />
                                        {r.override && <span className="block mt-1 text-[11px] font-bold text-indigo-700 flex items-center gap-1"><ShieldCheck size={11} /> released{r.override.stale ? ' (before last revision)' : ''}</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">
                                        {r.blockers.map(b => <p key={`${b.kind}:${b.item_id}`}><span className="font-semibold">{b.label}</span>: {missingText(b)}</p>)}
                                        {r.blockers_total > r.blockers.length && <p className="text-slate-400">… and {r.blockers_total - r.blockers.length} more</p>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </>}
        </div>
    );
}

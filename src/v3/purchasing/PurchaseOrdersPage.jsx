// Purchase orders: list with status filter and search; "New purchase order"
// works from approved requisition lines.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading, useRowLink } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PO_STATUS, inr } from './poShared';

export default function PurchaseOrdersPage() {
    const rowLink = useRowLink();   // the whole row opens the record
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const sentBack = params.get('sent_back') === '1';   // My work: "Purchase orders sent back"
    const source = params.get('source') || '';           // DIRECT: the store's direct purchases (25 Oct 2026)
    const since = params.get('since') || '';             // "week" from My work
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [canManage, setCanManage] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => purchasingApi.orders({ status: status || undefined, sent_back: sentBack ? 1 : undefined, source: source || undefined, since: since || undefined, q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load purchase orders.'))), 250);
        return () => clearTimeout(t);
    }, [status, sentBack, source, since, search]);
    useEffect(() => { purchasingApi.permissions().then(res => setCanManage(res.data.manage)).catch(() => {}); }, []);

    return (
        <div>
            <PageHeader title="Purchase orders" subtitle="Built from approved requisitions, or items with no requisition (factory admin approves those before issue). Issued by the purchase manager; changes after issue need a reason."
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={sentBack ? 'SENT_BACK' : status}
                        onChange={e => setParams(e.target.value === 'SENT_BACK' ? { status: 'DRAFT', sent_back: '1' } : e.target.value ? { status: e.target.value } : {})} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        <option value="SENT_BACK">Sent back (approval refused)</option>
                        {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={source} aria-label="Filter by how the PO was made"
                        onChange={e => { const n = Object.fromEntries(params); delete n.since; if (e.target.value) n.source = e.target.value; else delete n.source; setParams(n); }}>
                        <option value="">All purchase orders</option>
                        <option value="DIRECT">Direct purchases (store, on a bill)</option>
                        <option value="STANDARD">Made by purchasing</option>
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="PO number, supplier, shop" />
                    {canManage && <Link to="/v3/purchasing/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"><Plus size={15} /> New purchase order</Link>}
                </>} />
            <ErrorBox text={error} />
            {since === 'week' && <p className="mb-3 text-sm bg-indigo-50 text-indigo-800 rounded-lg px-3 py-2">Made this week{source === 'DIRECT' ? ' — the store\'s direct purchases (spares / general items bought on a bill)' : ''}. <button type="button" className="underline font-semibold" onClick={() => { const n = Object.fromEntries(params); delete n.since; setParams(n); }}>Show all</button></p>}
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">PO</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5 text-right">Total (₹)</th><th className="px-4 py-2.5">Delivery</th><th className="px-4 py-2.5">Status</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No purchase orders{status || search ? ' match' : ' yet'}.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} {...rowLink(`/v3/purchasing/orders/${r.id}`)} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 focus-visible:bg-indigo-50 focus:outline-none">
                                    <td className="px-4 py-2.5"><Link to={`/v3/purchasing/orders/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.po_no}</Link>
                                        {r.source === 'DIRECT' && <span className="ml-1.5 align-middle text-[10px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300" title={`Bought on a bill by ${r.created_by_name || 'the store'}${r.supplier_reference ? ` · ${r.supplier_reference}` : ''}`}>DIRECT</span>}
                                        <span className="block text-xs text-slate-500">{fmtDate(r.po_date)}{r.revision_no ? ` · rev ${r.revision_no}` : ''} · {r.tax_mode === 'INTRA' ? 'CGST+SGST' : 'IGST'}</span></td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.supplier_name}{r.shop_name && <span className="block text-xs text-slate-500">{r.shop_name}</span>}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.line_count}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{inr(r.total)}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.delivery_date || r.first_delivery)}</td>
                                    <td className="px-4 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PO_STATUS[r.status].cls}`}>{PO_STATUS[r.status].label}</span>
                                        {r.sent_back && <span className="ml-1 text-[11px] font-bold text-rose-700">sent back</span>}
                                        {r.unrequisitioned && <span className="block mt-0.5 text-[11px] font-semibold text-amber-700">has quantity with no requisition</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

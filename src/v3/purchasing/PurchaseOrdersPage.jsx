// Purchase orders: list with status filter and search; "New purchase order"
// works from approved requisition lines.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PO_STATUS, inr } from './poShared';

export default function PurchaseOrdersPage() {
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [canManage, setCanManage] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => purchasingApi.orders({ status: status || undefined, q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load purchase orders.'))), 250);
        return () => clearTimeout(t);
    }, [status, search]);
    useEffect(() => { purchasingApi.permissions().then(res => setCanManage(res.data.manage)).catch(() => {}); }, []);

    return (
        <div>
            <PageHeader title="Purchase orders" subtitle="Built from approved requisitions. Issued by the purchase manager; changes after issue need a reason."
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setParams(e.target.value ? { status: e.target.value } : {})} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="PO number, supplier" />
                    {canManage && <Link to="/v3/purchasing/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"><Plus size={15} /> New purchase order</Link>}
                </>} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">PO</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5 text-right">Total (₹)</th><th className="px-4 py-2.5">Delivery</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No purchase orders{status || search ? ' match' : ' yet'}.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2.5"><Link to={`/v3/purchasing/orders/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.po_no}</Link>
                                        <span className="block text-xs text-slate-500">{fmtDate(r.po_date)}{r.revision_no ? ` · rev ${r.revision_no}` : ''} · {r.tax_mode === 'INTRA' ? 'CGST+SGST' : 'IGST'}</span></td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.supplier_name}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.line_count}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{inr(r.total)}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.delivery_date || r.first_delivery)}</td>
                                    <td className="px-4 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PO_STATUS[r.status].cls}`}>{PO_STATUS[r.status].label}</span></td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/purchasing/orders/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.po_no}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

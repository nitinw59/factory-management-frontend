// Material planning: approved sales orders with how many fabric and trim
// items they need. Open one for its requirements grid.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

export default function PlanningOrdersPage() {
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => planningApi.orders({ q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load orders.'))), 250);
        return () => clearTimeout(t);
    }, [search]);

    return (
        <div>
            <PageHeader title="Material requirements" subtitle="Approved sales orders and the exact fabric and trim items they need. Recalculated automatically when an order changes."
                actions={<SearchInput value={search} onChange={setSearch} placeholder="Order no., PO, customer, style" />} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Styles</th><th className="px-4 py-2.5 text-right">Pieces</th>
                                <th className="px-4 py-2.5">First ship</th><th className="px-4 py-2.5 text-right">Fabric items</th><th className="px-4 py-2.5 text-right">Trim items</th><th className="px-4 py-2.5 text-right">Allocated</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No approved sales orders{search ? ' match' : ' yet'}.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2.5"><Link to={`/v3/planning/orders/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.order_no}</Link>
                                        <span className="block text-xs text-slate-500">{r.revision_no ? `rev ${r.revision_no}` : 'approved'}{r.buyer_po_no ? ` · PO ${r.buyer_po_no}` : ''}</span></td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.customer_name}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.styles || '—'}</td>
                                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.total_qty.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.first_ship_date)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.fabric_items}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.trim_items}</td>
                                    <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${r.items_total && r.items_covered === r.items_total ? 'text-emerald-700' : 'text-slate-700'}`}>{r.items_covered} / {r.items_total} items</td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/planning/orders/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.order_no}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Merchandiser's queue: sales orders submitted by accounts and waiting for
// approval. Open one to check its lines and approve or reject it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from './SalesOrderStatusBadge';

export default function SalesOrderApprovalsPage() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        salesOrdersApi.orders({ status: 'SUBMITTED' }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load orders.')));
    }, []);

    return (
        <div>
            <PageHeader title="Order approvals" subtitle="Sales orders submitted by accounts and waiting for a merchandiser. Open one to approve or reject it." />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Styles</th><th className="px-4 py-2.5 text-right">Pieces</th><th className="px-4 py-2.5">First ship</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nothing waiting for approval.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2.5"><Link to={`/v3/sales-orders/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.order_no}</Link>
                                        <span className="block text-xs text-slate-500">{fmtDate(r.order_date)}{r.buyer_po_no ? ` · PO ${r.buyer_po_no}` : ''}</span></td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.customer_name}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.styles || '—'}</td>
                                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.total_qty.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.first_ship_date)}</td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/sales-orders/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.order_no}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

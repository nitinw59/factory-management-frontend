// Return notes: goods sent back to suppliers.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';

export default function ReturnNotesPage() {
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const t = setTimeout(() => purchasingApi.returnNotes({ q: search.trim() || undefined }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load return notes.'))), 250);
        return () => clearTimeout(t);
    }, [search]);
    return (
        <div>
            <PageHeader title="Return notes" subtitle="Goods sent back to suppliers. Raise one from a goods receipt (“Return to supplier”)." actions={<SearchInput value={search} onChange={setSearch} placeholder="RN, GRN, PO, supplier" />} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2.5">Return note</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">GRN / PO</th><th className="px-3 py-2.5">Reason</th><th className="px-3 py-2.5 text-right">Value ₹</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No return notes.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2.5"><Link to={`/v3/purchasing/return-notes/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.rn_no}</Link>{r.replacement_expected && <span className="block text-[11px] text-indigo-700">replacement expected</span>}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.return_date)}</td>
                                    <td className="px-3 py-2.5">{r.supplier_name}</td>
                                    <td className="px-3 py-2.5 text-xs"><Link to={`/v3/purchasing/grns/${r.grn_id}`} className="text-indigo-700 hover:underline">{r.grn_no}</Link> · <Link to={`/v3/purchasing/orders/${r.po_id}`} className="text-indigo-700 hover:underline">{r.po_no}</Link></td>
                                    <td className="px-3 py-2.5 text-slate-600">{r.reason}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Purchase requisitions: all PRs with a status filter. The purchase manager's
// approval queue is the same list filtered to Submitted (?status=SUBMITTED).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PR_STATUS } from './prShared';

export default function PurchaseRequisitionsPage() {
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => planningApi.prs({ status: status || undefined, q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load requisitions.'))), 250);
        return () => clearTimeout(t);
    }, [status, search]);

    return (
        <div>
            <PageHeader title={status === 'SUBMITTED' ? 'Requisition approvals' : 'Purchase requisitions'}
                subtitle={status === 'SUBMITTED' ? 'Requisitions waiting for the purchase manager. Open one to approve or reject it.' : 'Raised from the buy list. Approved requisitions are what purchasing orders.'}
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setParams(e.target.value ? { status: e.target.value } : {})} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        {Object.entries(PR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="PR number" />
                </>} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Requisition</th><th className="px-4 py-2.5">Raised by</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5">Needed by</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{status === 'SUBMITTED' ? 'Nothing waiting for approval.' : 'No requisitions yet. Raise them from the buy list.'}</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2.5"><Link to={`/v3/planning/purchase-requisitions/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.pr_no}</Link>
                                        <span className="block text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString('en-IN')}</span></td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.created_by_name || '—'}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.line_count}{r.fabric_lines ? <span className="block text-[11px] text-slate-500">{r.fabric_lines} fabric</span> : null}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.needed_by)}</td>
                                    <td className="px-4 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PR_STATUS[r.status].cls}`}>{PR_STATUS[r.status].label}</span></td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/planning/purchase-requisitions/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.pr_no}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

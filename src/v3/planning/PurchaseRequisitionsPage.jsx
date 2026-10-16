// Purchase requisitions: all PRs with a status filter. The purchase manager's
// approval queue is the same list filtered to Submitted (?status=SUBMITTED).
// purpose="STORE": the store's requisitions (spares, general items) only.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { planningApi } from '../api/planningApi';
import { useV3Live } from '../live';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading, useRowLink } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PR_STATUS } from './prShared';

const prLink = (r) => (r.purpose === 'STORE' ? `/v3/store/requisitions/${r.id}` : `/v3/planning/purchase-requisitions/${r.id}`);

export default function PurchaseRequisitionsPage({ purpose }) {
    const rowLink = useRowLink();   // the whole row opens the record
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const attention = params.get('attention') === 'me';   // My work → requisitions sent back to me
    const store = params.get('store') || '';   // My work (store) → that store's requisitions: TRIM = store + trim lines, FABRIC = fabric lines
    const storeLabel = store === 'FABRIC' ? 'fabric' : store === 'TRIM' ? 'trims and store items' : store ? 'trims, fabric and store items' : '';
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const [rev, setRev] = useState(0);   // bumped by the live refresh
    useEffect(() => {
        const t = setTimeout(() => planningApi.prs({ status: status || undefined, q: search.trim() || undefined, purpose, attention: attention ? 'me' : undefined, store: store || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load requisitions.'))), 250);
        return () => clearTimeout(t);
    }, [status, search, purpose, attention, store, rev]);
    useV3Live(() => setRev(r => r + 1));   // live: requisitions decided elsewhere show at once

    return (
        <div>
            <PageHeader title={attention ? 'Requisitions sent back to you' : purpose === 'STORE' ? 'Store requisitions' : status === 'SUBMITTED' ? 'Requisition approvals' : 'Purchase requisitions'}
                subtitle={attention ? 'Requisitions you raised that purchasing rejected, or where lines were rejected or closed. Open one, raise the need again (buy list / reorder list) or change and resubmit, then mark it handled.' : purpose === 'STORE' ? 'Spares and general items requested by the store (raise them from the reorder list). The purchase manager approves; approved ones are ordered on a PO.'
                    : status === 'SUBMITTED' ? 'Requisitions waiting for the purchase manager (production and store). Open one to approve or reject it.' : 'Raised from the buy list (production) and the reorder list (store). Approved requisitions are what purchasing orders.'}
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setParams({ ...(e.target.value ? { status: e.target.value } : {}), ...(store ? { store } : {}) })} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        <option value="DRAFT,REJECTED">To finish (draft + rejected)</option>
                        {Object.entries(PR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="PR number" />
                </>} />
            {store && (
                <p className="mb-3 text-sm bg-indigo-50 text-indigo-800 rounded-lg px-3 py-2">
                    Requisitions with {storeLabel}. <button type="button" className="underline font-semibold" onClick={() => setParams(status ? { status } : {})}>Show all</button>
                </p>
            )}
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Requisition</th><th className="px-4 py-2.5">Raised by</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5">Needed by</th><th className="px-4 py-2.5">Status</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{attention ? 'Nothing sent back to you.' : status === 'SUBMITTED' ? 'Nothing waiting for approval.' : purpose === 'STORE' ? 'No store requisitions yet. Raise them from the reorder list.' : 'No requisitions yet. Raise them from the buy list.'}</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} {...rowLink(prLink(r))} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 focus-visible:bg-indigo-50 focus:outline-none">
                                    <td className="px-4 py-2.5"><Link to={prLink(r)} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.pr_no}</Link>
                                        {r.purpose === 'STORE' && !purpose && <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300">Store</span>}
                                        <span className="block text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString('en-IN')}</span></td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.created_by_name || '—'}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.line_count}{r.fabric_lines ? <span className="block text-[11px] text-slate-500">{r.fabric_lines} fabric</span> : null}</td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.needed_by)}</td>
                                    <td className="px-4 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PR_STATUS[r.status].cls}`}>{PR_STATUS[r.status].label}</span>
                                        {r.sent_back_lines > 0 && <span className="block mt-1 text-[11px] font-bold text-rose-700">{r.sent_back_lines} line(s) sent back</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

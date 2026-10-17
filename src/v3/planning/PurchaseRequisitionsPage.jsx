// Purchase requisitions: all PRs with a status filter. The purchase manager's
// approval queue is the same list filtered to Submitted (?status=SUBMITTED).
// purpose="STORE": the store's requisitions (spares, general items) only.
// (17 Oct 2026) Each row is a summary — orders it is for, what is in it (kinds, top types), progress to purchase
// orders (on PO / not on PO / not needed / closed), needed-by (red when passed with lines still to order), who
// approved or why rejected; status tabs with counts incl. "To order" (approved, lines not on a PO); search by
// requisition, sales order, item or notes.
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
    const toOrder = params.get('to_order') === '1';
    const [counts, setCounts] = useState(null);
    const attention = params.get('attention') === 'me';   // My work → requisitions sent back to me
    const store = params.get('store') || '';   // My work (store) → that store's requisitions: TRIM = store + trim lines, FABRIC = fabric lines
    const storeLabel = store === 'FABRIC' ? 'fabric' : store === 'TRIM' ? 'trims and store items' : store ? 'trims, fabric and store items' : '';
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const [rev, setRev] = useState(0);   // bumped by the live refresh
    useEffect(() => {
        const t = setTimeout(() => planningApi.prs({ status: status || undefined, q: search.trim() || undefined, purpose, attention: attention ? 'me' : undefined, store: store || undefined, to_order: toOrder ? '1' : undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load requisitions.'))), 250);
        return () => clearTimeout(t);
    }, [status, search, purpose, attention, store, toOrder, rev]);
    useEffect(() => { planningApi.prCounts({ purpose }).then(res => setCounts(res.data)).catch(() => setCounts(null)); }, [purpose, rev]);
    const today = new Date().toISOString().slice(0, 10);
    const TABS = [['', 'All', 'ALL'], ['DRAFT,REJECTED', 'To finish', null], ['SUBMITTED', 'Submitted', 'SUBMITTED'], ['TO_ORDER', 'To order', 'TO_ORDER'], ['APPROVED', 'Approved', 'APPROVED'], ['REJECTED', 'Rejected', 'REJECTED'], ['CANCELLED', 'Cancelled', 'CANCELLED']];
    const tabKey = toOrder ? 'TO_ORDER' : status;
    const setTab = (k) => setParams({ ...(k === 'TO_ORDER' ? { to_order: '1' } : k ? { status: k } : {}), ...(store ? { store } : {}) });
    const countOf = (k, c) => (!counts ? null : k === 'DRAFT,REJECTED' ? (counts.DRAFT || 0) + (counts.REJECTED || 0) : counts[c] || 0);
    useV3Live(() => setRev(r => r + 1));   // live: requisitions decided elsewhere show at once

    return (
        <div>
            <PageHeader title={attention ? 'Requisitions sent back to you' : purpose === 'STORE' ? 'Store requisitions' : status === 'SUBMITTED' ? 'Requisition approvals' : 'Purchase requisitions'}
                subtitle={attention ? 'Requisitions you raised that purchasing rejected, or where lines were rejected or closed. Open one, raise the need again (buy list / reorder list) or change and resubmit, then mark it handled.' : purpose === 'STORE' ? 'Spares and general items requested by the store (raise them from the reorder list). The purchase manager approves; approved ones are ordered on a PO.'
                    : status === 'SUBMITTED' ? 'Requisitions waiting for the purchase manager (production and store). Open one to approve or reject it.' : 'Raised from the buy list (production) and the reorder list (store). Approved requisitions are what purchasing orders.'}
                actions={<SearchInput value={search} onChange={setSearch} placeholder="Requisition, sales order, item, notes" />} />
            {!attention && (
                <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-200">
                    {TABS.map(([k, label, c]) => (
                        <button key={k || 'all'} type="button" onClick={() => setTab(k)} title={k === 'TO_ORDER' ? 'Approved requisitions with lines not on a purchase order yet' : undefined}
                            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${tabKey === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                            {label}{countOf(k, c) != null && <span className={`ml-1.5 text-[11px] px-1.5 rounded-full ${tabKey === k ? 'bg-indigo-100' : 'bg-slate-100'}`}>{countOf(k, c)}</span>}
                        </button>
                    ))}
                </div>
            )}
            {store && (
                <p className="mb-3 text-sm bg-indigo-50 text-indigo-800 rounded-lg px-3 py-2">
                    Requisitions with {storeLabel}. <button type="button" className="underline font-semibold" onClick={() => setParams(status ? { status } : {})}>Show all</button>
                </p>
            )}
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[980px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Requisition</th><th className="px-4 py-2.5">For orders</th><th className="px-4 py-2.5">What is in it</th><th className="px-4 py-2.5 min-w-[210px]">Progress to PO</th><th className="px-4 py-2.5">Needed by</th><th className="px-4 py-2.5">Status</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{attention ? 'Nothing sent back to you.' : toOrder ? 'Nothing left to order.' : status === 'SUBMITTED' ? 'Nothing waiting for approval.' : purpose === 'STORE' ? 'No store requisitions yet. Raise them from the reorder list.' : search ? 'Nothing matches.' : 'No requisitions yet. Raise them from the buy list.'}</td></tr>}
                            {rows.map(r => {
                                const kinds = [r.trim_lines ? `${r.trim_lines} trim${r.trim_lines === 1 ? '' : 's'}` : null, r.fabric_lines ? `${r.fabric_lines} fabric` : null, r.store_lines ? `${r.store_lines} store item${r.store_lines === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
                                const live = !['CANCELLED', 'REJECTED'].includes(r.status);
                                const total = Math.max(r.line_count, 1);
                                const seg = (n, cls) => (n > 0 ? <span className={cls} style={{ width: `${(n / total) * 100}%` }} /> : null);
                                const late = live && r.open_needed_by && r.open_needed_by < today && r.not_on_po_lines + r.part_po_lines > 0;
                                const orders = (r.order_nos || '').split(', ').filter(Boolean);
                                return (
                                    <tr key={r.id} {...rowLink(prLink(r))} className="border-t border-slate-100 align-top cursor-pointer hover:bg-slate-50 focus-visible:bg-indigo-50 focus:outline-none">
                                        <td className="px-4 py-2.5"><Link to={prLink(r)} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.pr_no}</Link>
                                            {r.purpose === 'STORE' && !purpose && <span className="ml-1.5 text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300">Store</span>}
                                            <span className="block text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString('en-IN')} · {r.created_by_name || '—'}</span>
                                            {r.notes && <span className="block text-[11px] text-slate-500 max-w-[220px] truncate" title={r.notes}>{r.notes}</span>}</td>
                                        <td className="px-4 py-2.5 text-xs text-slate-700">{orders.length ? <>{orders.slice(0, 3).join(', ')}{orders.length > 3 && <span className="text-slate-500"> +{orders.length - 3} more</span>}</> : <span className="text-slate-400">{r.purpose === 'STORE' ? 'store stock' : '—'}</span>}</td>
                                        <td className="px-4 py-2.5 text-xs"><b className="text-slate-800">{r.line_count} line{r.line_count === 1 ? '' : 's'}</b>{kinds && <span className="text-slate-600"> · {kinds}</span>}
                                            {r.top_types && <span className="block text-[11px] text-slate-500 max-w-[260px]">{r.top_types}{r.type_count > 4 ? ` · +${r.type_count - 4} more types` : ''}</span>}</td>
                                        <td className="px-4 py-2.5 text-xs">
                                            {r.line_count > 0 && <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 mb-1" title={`${r.on_po_lines} on PO · ${r.part_po_lines} partly on PO · ${r.not_on_po_lines} not on PO · ${r.closed_lines} closed / rejected`}>
                                                {seg(r.on_po_lines, 'bg-indigo-500')}{seg(r.part_po_lines, 'bg-indigo-300')}{seg(r.not_on_po_lines, 'bg-amber-400')}{seg(r.closed_lines, 'bg-slate-300')}
                                            </div>}
                                            <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                                                {r.on_po_lines + r.part_po_lines > 0 && <span className="font-semibold text-indigo-700">{r.on_po_lines + r.part_po_lines} on PO</span>}
                                                {live && r.not_on_po_lines > 0 && <span className="font-semibold text-amber-700">{r.not_on_po_lines} not on PO</span>}
                                                {r.not_needed_lines > 0 && <span className="font-semibold text-rose-700">{r.not_needed_lines} not needed</span>}
                                                {r.closed_lines > 0 && <span className="text-slate-500">{r.closed_lines} closed / rejected</span>}
                                                {live && r.line_count > 0 && r.not_on_po_lines + r.part_po_lines === 0 && r.status === 'APPROVED' && <span className="font-semibold text-emerald-700">all ordered</span>}
                                            </span>
                                            {r.po_nos && <span className="block text-[11px] text-slate-500 truncate max-w-[240px]" title={r.po_nos}>{r.po_nos}</span>}</td>
                                        <td className={`px-4 py-2.5 whitespace-nowrap ${late ? 'font-bold text-rose-700' : ''}`}>{fmtDate(live ? (r.open_needed_by || r.needed_by) : r.needed_by)}{late && <span className="block text-[11px]">passed — still to order</span>}</td>
                                        <td className="px-4 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PR_STATUS[r.status].cls}`}>{PR_STATUS[r.status].label}</span>
                                            {r.status === 'APPROVED' && r.approved_at && <span className="block mt-1 text-[11px] text-slate-500">{new Date(r.approved_at).toLocaleDateString('en-IN')}{r.approved_by_name ? ` · ${r.approved_by_name}` : ''}</span>}
                                            {r.status === 'SUBMITTED' && r.submitted_at && <span className="block mt-1 text-[11px] text-slate-500">since {new Date(r.submitted_at).toLocaleDateString('en-IN')}</span>}
                                            {r.status === 'REJECTED' && r.rejected_reason && <span className="block mt-1 text-[11px] text-rose-700 max-w-[200px] truncate" title={r.rejected_reason}>{r.rejected_reason}</span>}
                                            {r.sent_back_lines > 0 && <span className="block mt-1 text-[11px] font-bold text-rose-700">{r.sent_back_lines} line(s) sent back</span>}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

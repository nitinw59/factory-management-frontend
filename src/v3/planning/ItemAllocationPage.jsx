// One item: its stock, every approved order that needs it (earliest ship date
// first) with allocate / release, and the allocation history.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import AllocateModal from './AllocateModal';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const ACTION = { ALLOCATE: 'Allocated', RELEASE: 'Released', AUTO_RELEASE: 'Released automatically', ISSUE: 'Issued to production', ISSUE_RETURN: 'Returned from production' };

export default function ItemAllocationPage() {
    const { kind, itemId } = useParams();
    const [data, setData] = useState(null);
    const [canPlan, setCanPlan] = useState(false);
    const [target, setTarget] = useState(null);
    const [error, setError] = useState('');

    const load = useCallback(() => planningApi.positionItem(kind, itemId).then(res => setData(res.data))
        .catch(err => setError(apiError(err, 'Failed to load.'))), [kind, itemId]);
    useEffect(() => {
        load();
        planningApi.permissions().then(res => setCanPlan(Boolean(res.data.plan || (res.data.plan_kinds || []).includes(String(kind).toUpperCase())))).catch(() => {});
    }, [load, kind]);

    if (!data) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const { item, stock } = data;
    const open = (mode, o) => setTarget({ mode, orderId: o.id, orderNo: o.order_no, kind: item.kind, itemId: item.id, label: item.label, uom: item.uom, open: o.open, allocated: o.allocated, free: stock.free });

    return (
        <div>
            <Link to="/v3/planning/position" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Material position</Link>
            <h1 className="text-2xl font-black text-slate-900">{item.label}</h1>
            <p className="text-sm text-slate-500 mb-4">{item.type_name} · {item.uom}{item.purchase_uom ? ` · bought in ${item.purchase_uom} of ${item.usage_per_purchase_uom} ${item.uom}` : ''}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[['On hand', stock.on_hand], ['Allocated', stock.allocated], ['Free', stock.free],
                    ['Still needed', data.orders.reduce((n, o) => n + o.open, 0)]].map(([label, v]) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-500">{label}</p>
                        <p className={`text-xl font-black tabular-nums ${label === 'Free' && v < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{fmt(v, item.uom)} <span className="text-xs font-normal text-slate-500">{item.uom}</span></p>
                    </div>
                ))}
            </div>
            {(data.incoming?.approved > 0 || data.incoming?.pending > 0) && (
                <p className="mb-3 text-sm text-slate-700">Incoming on requisitions: <b>{fmt(data.incoming.approved, item.uom)}</b> {item.uom} approved{data.incoming.pending > 0 ? <>, <b>{fmt(data.incoming.pending, item.uom)}</b> pending</> : ''}
                    {(data.incoming.uncommitted_approved + data.incoming.uncommitted_pending) > 0 && <span className="text-sky-700"> · {fmt(data.incoming.uncommitted_approved + data.incoming.uncommitted_pending, item.uom)} not yet committed to any order (covers the next ones)</span>}</p>
            )}
            {stock.free < 0 && <p className="mb-3 text-sm font-semibold text-rose-700">More is allocated than is on hand (stock went down after allocating). Release from the orders that can wait.</p>}

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr className="text-right"><th className="px-4 py-2.5 text-left">Order</th><th className="px-4 py-2.5 text-left">Customer</th><th className="px-4 py-2.5 text-left">Ship</th>
                            <th className="px-4 py-2.5">Required</th><th className="px-4 py-2.5">Allocated</th><th className="px-4 py-2.5">Still needed</th><th className="px-4 py-2.5">Covered by</th><th className="px-4 py-2.5 w-48" /></tr>
                    </thead>
                    <tbody>
                        {data.orders.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No approved order needs this item.</td></tr>}
                        {data.orders.map(o => (
                            <tr key={o.id} className="border-t border-slate-100 text-right tabular-nums">
                                <td className="px-4 py-2 text-left"><Link to={`/v3/planning/orders/${o.id}`} className="font-semibold text-indigo-700 hover:underline">{o.order_no}</Link></td>
                                <td className="px-4 py-2 text-left">{o.customer_name}</td>
                                <td className="px-4 py-2 text-left whitespace-nowrap">{fmtDate(o.ship_date)}</td>
                                <td className="px-4 py-2">{fmt(o.required, item.uom)}</td>
                                <td className="px-4 py-2">{fmt(o.allocated, item.uom)}{o.issued > 0 && <span className="block text-[11px] font-semibold text-indigo-700">+ {fmt(o.issued, item.uom)} issued</span>}</td>
                                <td className={`px-4 py-2 font-bold ${o.open > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{o.open > 0 ? fmt(o.open, item.uom) : 'covered'}</td>
                                <td className="px-4 py-2 text-xs text-left">
                                    {o.from_stock > 0 && <p className="text-emerald-700">{fmt(o.from_stock, item.uom)} free stock</p>}
                                    {o.pr_approved > 0 && <p>{fmt(o.pr_approved, item.uom)} on order</p>}
                                    {o.pr_pending > 0 && <p>{fmt(o.pr_pending, item.uom)} requested</p>}
                                    {o.to_raise > 0 && <p className="font-bold text-amber-700">{fmt(o.to_raise, item.uom)} to raise</p>}
                                </td>
                                <td className="px-4 py-2">
                                    {canPlan && o.status === 'APPROVED' && <span className="flex justify-end gap-2">
                                        {o.open > 0 && <SecondaryButton onClick={() => open('allocate', o)}>Allocate</SecondaryButton>}
                                        {o.allocated > 0 && <SecondaryButton onClick={() => open('release', o)}>Release</SecondaryButton>}
                                    </span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Allocation history</p>
                {data.log.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
                    <div className="divide-y divide-slate-100 text-sm">
                        {data.log.map(g => (
                            <p key={g.id} className="py-1.5"><span className="text-xs text-slate-400 mr-2">{new Date(g.created_at).toLocaleString()}</span>
                                <b>{ACTION[g.action] || g.action}</b> {fmt(g.qty, item.uom)} {item.uom} · {g.order_no} (now {fmt(g.allocated_after, item.uom)})
                                {g.reason ? <span className="text-slate-500"> — {g.reason}</span> : null}{g.user_name ? <span className="text-slate-400"> · {g.user_name}</span> : null}</p>
                        ))}
                    </div>
                )}
            </div>

            {target && <AllocateModal target={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load(); }} />}
        </div>
    );
}

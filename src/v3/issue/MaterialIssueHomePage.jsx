// Material issue to production: approved orders with stock allocated to them
// (issue from here), and the issue slips made so far.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { materialIssueApi } from '../api/materialIssueApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

export default function MaterialIssueHomePage() {
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') === 'slips' ? 'slips' : 'orders';
    const [orders, setOrders] = useState(null);
    const [slips, setSlips] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { materialIssueApi.orders().then(res => setOrders(res.data)).catch(err => setError(apiError(err, 'Failed to load orders.'))); }, []);
    useEffect(() => {
        if (tab !== 'slips') return undefined;
        const t = setTimeout(() => materialIssueApi.issues({ q: search.trim() || undefined }).then(res => setSlips(res.data)).catch(err => setError(apiError(err, 'Failed to load slips.'))), 250);
        return () => clearTimeout(t);
    }, [tab, search]);
    return (
        <div>
            <PageHeader title="Material issue" subtitle="Fabric and trims go out to production only against what planning has allocated to the order. Issues to cutting must pass the cutting gate."
                actions={tab === 'slips' ? <SearchInput value={search} onChange={setSearch} placeholder="Slip, order, receiver" /> : null} />
            <div className="flex gap-1 mb-3 border-b border-slate-200">
                {[['orders', 'Orders to issue'], ['slips', 'Issue slips']].map(([k, v]) => <button key={k} type="button" onClick={() => setParams(k === 'orders' ? {} : { tab: k })} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>{v}</button>)}
            </div>
            <ErrorBox text={error} />
            {tab === 'orders' && (!orders ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Ships</th><th className="px-3 py-2.5 text-right">Allocated items</th><th className="px-3 py-2.5 text-right">Slips</th><th /></tr></thead>
                        <tbody>
                            {orders.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No order has stock allocated yet (planning allocates it).</td></tr>}
                            {orders.map(o => (
                                <tr key={o.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2.5 font-semibold">{o.order_no}</td><td className="px-3 py-2.5">{o.customer_name}</td><td className="px-3 py-2.5">{fmtDate(o.ship_date)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{o.fabric_items ? `${o.fabric_items} fabric` : ''}{o.fabric_items && o.trim_items ? ' · ' : ''}{o.trim_items ? `${o.trim_items} trim` : ''}{!o.fabric_items && !o.trim_items ? '—' : ''}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{o.slips}</td>
                                    <td className="px-3 py-2.5 text-right"><Link to={`/v3/material-issue/orders/${o.id}`} className="text-sm font-semibold text-indigo-700 hover:underline">Issue →</Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            {tab === 'slips' && (!slips ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Slip</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Received by</th><th className="px-3 py-2.5 text-right">Items</th></tr></thead>
                        <tbody>
                            {slips.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No issue slips.</td></tr>}
                            {slips.map(s => (
                                <tr key={s.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2.5"><Link to={`/v3/material-issue/issues/${s.id}`} className="font-semibold text-indigo-700 hover:underline">{s.issue_no}</Link>
                                        {s.mixed_lots && <span className="block text-[11px] text-amber-700">mixed dye lots</span>}{s.gate_override && <span className="block text-[11px] text-rose-700">cutting gate overridden</span>}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(s.issue_date)}</td><td className="px-3 py-2.5">{s.order_no}<span className="block text-xs text-slate-500">{s.customer_name}</span></td>
                                    <td className="px-3 py-2.5">{s.stage}</td><td className="px-3 py-2.5">{s.received_by}{s.department_name ? <span className="block text-xs text-slate-500">{s.department_name}</span> : null}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{s.line_count}{s.has_returns && <span className="block text-[11px] text-slate-500">with returns</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}

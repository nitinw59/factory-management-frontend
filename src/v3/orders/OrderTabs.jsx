// One order, one place (docs/V3_ROLE_NAVIGATION_PLAN.md section 10): the bar on top of every
// order screen — order no., customer, status — with tabs to the order's other screens the user may
// open. Overview (tracker), Order (lines, PPM, documents, history), Materials, Milestones, Issue.
// /v3/orders/:id opens the first tab the user has; search and My work link there.
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { workApi } from '../api/workApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading } from '../components/ui';
import { useV3Access } from '../V3Access';
import SalesOrderStatusBadge from '../salesOrders/SalesOrderStatusBadge';

// Tabs in order; `approved` = only once the order is approved.
const TABS = [
    { key: 'overview', label: 'Overview', page: 'tracker.orders', approved: true, to: (id) => `/v3/tracker/orders/${id}` },
    { key: 'order', label: 'Order & documents', page: 'sales.orders', to: (id) => `/v3/sales-orders/${id}` },
    { key: 'materials', label: 'Materials', page: 'planning.requirements', to: (id) => `/v3/planning/orders/${id}` },
    { key: 'milestones', label: 'Milestones', page: 'planning.milestones', approved: true, to: (id) => `/v3/planning/orders/${id}?tab=MILESTONES` },
    { key: 'issue', label: 'Material issue', page: 'issue.materialIssue', approved: true, to: (id) => `/v3/material-issue/orders/${id}` },
];
const tabsFor = (me, o) => TABS.filter(t => me.menu[t.page] && (!t.approved || o.status === 'APPROVED'));

const cache = new Map();   // order summaries, so moving between tabs doesn't flash
function useOrderSummary(id) {
    const [o, setO] = useState(() => cache.get(String(id)) || null);
    const [error, setError] = useState('');
    useEffect(() => {
        workApi.orderSummary(id).then(res => { cache.set(String(id), res.data); setO(res.data); }).catch(err => setError(apiError(err, 'Failed to load the order.')));
    }, [id]);
    return [o, error];
}

export default function OrderTabs({ orderId, active }) {
    const { me } = useV3Access();
    const [o] = useOrderSummary(orderId);
    if (!o) return <div className="h-[74px] mb-4" />;
    const tabs = tabsFor(me, o);
    return (
        <div className="mb-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Order</span>
                <span className="text-lg font-black text-slate-900">{o.order_no}</span>
                <SalesOrderStatusBadge status={o.status} />
                <span className="text-sm text-slate-500">{o.customer_name}{o.buyer_po_no ? ` · buyer PO ${o.buyer_po_no}` : ''}{o.revision_no ? ` · rev ${o.revision_no}` : ''}</span>
            </div>
            {tabs.length > 1 && (
                <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto" aria-label="Order screens">
                    {tabs.map(t => (
                        <Link key={t.key} to={t.to(o.id)} aria-current={t.key === active ? 'page' : undefined}
                            className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${t.key === active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</Link>
                    ))}
                </nav>
            )}
        </div>
    );
}

// /v3/orders/:id → the first order screen this user may open.
export function OrderRedirectPage() {
    const { id } = useParams();
    const { me } = useV3Access();
    const [o, error] = useOrderSummary(id);
    if (error) return <ErrorBox text={error} />;
    if (!o) return <Loading />;
    const first = tabsFor(me, o)[0];
    return first ? <Navigate to={first.to(o.id)} replace /> : <ErrorBox text="None of this order's screens is part of your role." />;
}

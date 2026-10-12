// 3.0 home = "My work": what is waiting for the signed-in user (docs/V3_ROLE_NAVIGATION_PLAN.md
// section 10) — approvals, their own queues with counts (each opens the page, filtered), the
// approved orders where they have the next step, and their pages as quick links.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ArrowRight } from 'lucide-react';
import { PageHeader, Loading } from '../components/ui';
import { useV3Access } from '../V3Access';
import { visibleNav } from '../v3Nav';
import { workApi } from '../api/workApi';
import { trackerApi } from '../api/trackerApi';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { Dot } from '../tracker/trackerShared';

function Card({ to, count, title, hint, tone }) {
    const zero = !count;
    return (
        <Link to={to} className={`bg-white border rounded-xl p-4 flex items-center gap-4 transition ${zero ? 'border-slate-200 opacity-70 hover:opacity-100' : 'border-slate-200 hover:border-indigo-400'}`}>
            <span className={`text-3xl font-black tabular-nums w-14 text-center ${zero ? 'text-slate-300' : tone === 'bad' ? 'text-rose-600' : 'text-indigo-700'}`}>{count}</span>
            <span className="min-w-0 flex-1">
                <span className="block font-bold text-slate-800">{title}</span>
                <span className="block text-xs text-slate-500">{zero ? 'nothing waiting' : hint}</span>
            </span>
            <ArrowRight size={16} className="text-slate-300 shrink-0" />
        </Link>
    );
}

export default function V3HomePage() {
    const { me } = useV3Access();
    const [work, setWork] = useState(null);
    const [orders, setOrders] = useState(null);
    useEffect(() => {
        workApi.myWork().then(res => setWork(res.data)).catch(() => setWork({ approvals: { total: 0, kinds: [] }, cards: [] }));
        if (me.menu['tracker.orders']) trackerApi.orders({ mine: 1 }).then(res => setOrders(res.data.orders)).catch(() => setOrders([]));
    }, [me]);

    const pages = visibleNav(me.menu, me.work).filter(n => !n.section && n.key !== 'home' && n.key !== 'approvals');
    const extra = me.granted_roles.length ? ` · extra access: ${me.granted_roles.map(g => g.label).join(', ')}` : '';
    const areas = [];
    for (const c of work?.cards || []) {
        let a = areas.find(x => x.area === c.area);
        if (!a) { a = { area: c.area, cards: [] }; areas.push(a); }
        a.cards.push(c);
    }
    const nothing = work && !work.approvals.kinds.length && !work.cards.length && !me.menu['tracker.orders'];

    return (
        <div>
            <PageHeader title={`My work${me.user.name ? ` — ${me.user.name}` : ''}`} subtitle={`${me.role_label}${extra}`} />
            {!work ? <Loading /> : nothing && pages.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
                    Nothing for your role in 3.0 yet — your work continues in 2.0 (Switch version, top right). The factory admin can give you extra access if you need a 3.0 page.
                </div>
            ) : (
                <div className="space-y-6">
                    {work.approvals.kinds.length > 0 && (
                        <Link to="/v3/approvals" className={`block rounded-xl p-4 border ${work.approvals.total ? 'bg-rose-50 border-rose-200 hover:border-rose-400' : 'bg-white border-slate-200 hover:border-indigo-400'}`}>
                            <div className="flex items-center gap-3">
                                <Inbox size={22} className={work.approvals.total ? 'text-rose-600' : 'text-slate-400'} />
                                <p className="font-black text-slate-800 text-lg">{work.approvals.total ? `${work.approvals.total} waiting for your approval` : 'No approvals waiting'}</p>
                                <ArrowRight size={16} className="ml-auto text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-600 mt-1 ml-9">{work.approvals.kinds.map(k => `${k.label}s: ${k.count}`).join(' · ')}</p>
                        </Link>
                    )}

                    {areas.map(a => (
                        <section key={a.area}>
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{a.area}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{a.cards.map(c => <Card key={c.key} {...c} />)}</div>
                        </section>
                    ))}

                    {me.menu['tracker.orders'] && (
                        <section>
                            <div className="flex items-center mb-2">
                                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Orders with your next step</p>
                                <Link to="/v3/tracker?mine=1" className="ml-auto text-xs font-bold text-indigo-700 hover:underline">All in the order tracker →</Link>
                            </div>
                            {!orders ? <Loading /> : orders.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No approved order is waiting on you.</p> : (
                                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                                    {orders.slice(0, 8).map(o => (
                                        <Link key={o.order_id} to={`/v3/orders/${o.order_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-slate-50">
                                            <Dot rag={o.rag} title={`Overall: ${String(o.rag).toLowerCase()}`} />
                                            <b className="text-slate-800">{o.order_no}</b>
                                            <span className="text-xs text-slate-500">{o.customer_name} · ship {fmtDate(o.ship_date)}</span>
                                            <span className="ml-auto text-xs font-semibold text-indigo-700">{o.my_step_labels.join(' · ')}{o.my_steps > o.my_step_labels.length ? ' …' : ''}</span>
                                        </Link>
                                    ))}
                                    {orders.length > 8 && <Link to="/v3/tracker?mine=1" className="block px-4 py-2 text-xs font-bold text-indigo-700">… and {orders.length - 8} more</Link>}
                                </div>
                            )}
                        </section>
                    )}

                    {pages.length > 0 && (
                        <section>
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Your pages</p>
                            <div className="flex flex-wrap gap-2">
                                {pages.map(n => (
                                    <Link key={n.to} to={n.to} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-indigo-400 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700">
                                        <n.icon size={14} className="text-indigo-600" /> {n.label}
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

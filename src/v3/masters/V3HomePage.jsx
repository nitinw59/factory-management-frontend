// 3.0 home = "My work": what is waiting for the signed-in user (docs/V3_ROLE_NAVIGATION_PLAN.md
// section 10) — approvals, their own queues with counts (each opens the page, filtered), the
// approved orders where they have the next step, and their pages as quick links.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ArrowRight, RefreshCw } from 'lucide-react';
import { useV3Live } from '../live';
import { PageHeader, Loading } from '../components/ui';
import { useV3Access } from '../V3Access';
import { visibleNav } from '../v3Nav';
import { workApi } from '../api/workApi';
import { trackerApi } from '../api/trackerApi';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { Dot } from '../tracker/trackerShared';

function Card({ to, count, title, hint, tone, changed }) {
    const zero = !count;
    return (
        <Link to={to} className={`bg-white border rounded-xl p-4 flex items-center gap-4 transition ${changed ? 'ring-2 ring-amber-400 border-amber-300' : zero ? 'border-slate-200 opacity-70 hover:opacity-100' : 'border-slate-200 hover:border-indigo-400'}`}>
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
    const [loadedAt, setLoadedAt] = useState(null);
    const [changed, setChanged] = useState(new Set());   // cards whose number just changed (highlighted a few seconds)
    const [, tick] = useState(0);
    const prev = useRef(null);
    const load = useCallback(() => {
        workApi.myWork().then(res => {
            const next = Object.fromEntries([...res.data.cards.map(c => [c.key, c.count]), ['approvals', res.data.approvals.total]]);
            if (prev.current) {
                const diff = new Set(Object.keys(next).filter(k => prev.current[k] !== undefined && prev.current[k] !== next[k]));
                if (diff.size) { setChanged(diff); setTimeout(() => setChanged(new Set()), 5000); }
            }
            prev.current = next;
            setWork(res.data); setLoadedAt(Date.now());
        }).catch(() => setWork(w => w || { approvals: { total: 0, kinds: [] }, cards: [] }));
        if (me.menu['tracker.orders']) trackerApi.orders({ mine: 1 }).then(res => setOrders(res.data.orders)).catch(() => setOrders(o => o || []));
    }, [me]);
    useEffect(() => { load(); }, [load]);
    const live = useV3Live(load);   // live: refresh when 3.0 work changes (websocket), 5-minute backup
    useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(t); }, []);
    const ago = loadedAt ? Math.max(0, Math.round((Date.now() - loadedAt) / 1000)) : null;

    const pages = visibleNav(me.menu, me.work).filter(n => !n.section && n.key !== 'home' && n.key !== 'approvals');
    const extra = me.granted_roles.length ? ` · extra access: ${me.granted_roles.map(g => g.label).join(', ')}` : '';
    const areas = [];
    for (const c of work?.cards || []) {
        let a = areas.find(x => x.area === c.area);
        if (!a) { a = { area: c.area, cards: [] }; areas.push(a); }
        a.cards.push(c);
    }
    const nothing = work && !work.approvals.kinds.length && !work.cards.length && !me.menu['tracker.orders'];
    // The role's main area (e.g. Purchasing for the purchase manager) comes first, above the approvals.
    const mainArea = areas.find(a => a.area === work?.main_area);
    const section = (a) => (
        <section key={a.area}>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{a.area}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{a.cards.map(c => <Card key={c.key} {...c} changed={changed.has(c.key)} />)}</div>
        </section>
    );

    return (
        <div>
            <PageHeader title={`My work${me.user.name ? ` — ${me.user.name}` : ''}`} subtitle={`${me.role_label}${extra}`}
                actions={ago != null && (
                    <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} title={live ? 'Live: updates as work changes' : 'Not live: refreshes every 5 minutes'} />
                        {live ? 'Live' : 'Offline'} · updated {ago < 10 ? 'just now' : ago < 60 ? `${ago} s ago` : `${Math.round(ago / 60)} min ago`}
                        <button type="button" onClick={load} className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline"><RefreshCw size={12} /> Refresh</button>
                    </span>
                )} />
            {!work ? <Loading /> : nothing && pages.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
                    Nothing for your role in 3.0 yet — your work continues in 2.0 (Switch version, top right). The factory admin can give you extra access if you need a 3.0 page.
                </div>
            ) : (
                <div className="space-y-6">
                    {mainArea && section(mainArea)}

                    {work.approvals.kinds.length > 0 && (
                        <Link to="/v3/approvals" className={`block rounded-xl p-4 border ${changed.has('approvals') ? 'ring-2 ring-amber-400' : ''} ${work.approvals.total ? 'bg-rose-50 border-rose-200 hover:border-rose-400' : 'bg-white border-slate-200 hover:border-indigo-400'}`}>
                            <div className="flex items-center gap-3">
                                <Inbox size={22} className={work.approvals.total ? 'text-rose-600' : 'text-slate-400'} />
                                <p className="font-black text-slate-800 text-lg">{work.approvals.total ? `${work.approvals.total} waiting for your approval` : 'No approvals waiting'}</p>
                                <ArrowRight size={16} className="ml-auto text-slate-400" />
                            </div>
                            <p className="text-sm text-slate-600 mt-1 ml-9">{work.approvals.kinds.map(k => `${k.label}s: ${k.count}`).join(' · ')}</p>
                        </Link>
                    )}

                    {areas.filter(a => a !== mainArea).map(section)}

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

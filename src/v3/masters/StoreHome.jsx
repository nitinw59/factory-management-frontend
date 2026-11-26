// Store home (26 Nov 2026, owner: "access homepage of store, banner occupy most of space, suggest how can we improve
// ui ux" → "build phase A and B"). The trim store and the fabric store opened My work on two tall banners (orders needing
// material, stock to allocate) that filled the first screen; their counters (overdue deliveries, kits to prepare …) sat
// below the fold, the same orders were listed twice, and empty tiles took as much room as busy ones. Store screens run on
// PCs, so everything stays — just in the order the store works:
//   1. Needs you now: one strip of what has a count, most urgent first; everything at zero on one grey line.
//   2. Orders with your next step: one table (the banner and the "next step" list merged) — allocate / raise with a
//      button each, the other steps as links, item names in an expandable row, a totals row.
//   3. Stock waiting for allocation: newest arrivals, a totals row over the whole queue.
// "Your pages" is gone (the sidebar has them). Other roles keep V3HomePage's layout.
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, ChevronDown, PackageCheck, ClipboardList, Inbox } from 'lucide-react';
import { Loading, fmtQty } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { Dot } from '../tracker/trackerShared';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ALLOC_RAISE = new Set(['ALLOCATE', 'RAISE_PR']);
const unitsText = (byUom) => Object.entries(byUom || {}).filter(([, q]) => q > 0).map(([u, q]) => `${fmtQty(q)} ${u}`).join(' · ');

function Chip({ to, onClick, count, title, hint, bad, changed }) {
    const cls = `flex items-center gap-3 bg-white border rounded-lg px-3 py-2 text-left hover:border-indigo-400 transition ${changed ? 'ring-2 ring-amber-400 border-amber-300' : 'border-slate-200'}`;
    const body = (
        <>
            <span className={`text-2xl font-black tabular-nums min-w-[2.5rem] text-center ${bad ? 'text-rose-600' : 'text-indigo-700'}`}>{count}</span>
            <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 leading-tight">{title}</span>
            <ArrowRight size={14} className="text-slate-300 shrink-0" />
        </>
    );
    return onClick
        ? <button type="button" onClick={onClick} title={hint} className={cls}>{body}</button>
        : <Link to={to} title={hint} className={cls}>{body}</Link>;
}

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// 1. What has a count, as chips; the zero queues on one line.
function NeedsYouNow({ work, what, changed }) {
    const m = work.order_material; const a = work.allocate;
    const chips = [];
    if (m?.total) chips.push({ key: 'order_material', count: m.total, title: `Orders need ${what}`, hint: `${m.to_allocate} to allocate from stock · ${m.to_raise} to raise a requisition for`, bad: true, onClick: () => scrollTo('store-orders') });
    if (a?.total) chips.push({ key: 'allocate', count: a.total, title: 'Items in stock to allocate', hint: `Free in the store, needed by ${plural(a.orders, 'approved order')}`, bad: false, onClick: () => scrollTo('store-stock') });
    const live = work.cards.filter(c => c.count > 0);
    // Most urgent first: the queues marked bad (overdue, short, waiting on you), then the rest; backend order within each.
    for (const c of [...live.filter(c => c.tone === 'bad'), ...live.filter(c => c.tone !== 'bad')]) chips.push({ key: c.key, to: c.to, count: c.count, title: c.title, hint: c.hint, bad: c.tone === 'bad' });
    const idle = work.cards.filter(c => !c.count);
    return (
        <section className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Needs you now</p>
            {chips.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    {chips.map(({ key, ...c }) => <Chip key={key} {...c} changed={changed.has(key)} />)}
                </div>
            ) : <p className="text-sm text-slate-500 px-1">Nothing waiting on you right now.</p>}
            {idle.length > 0 && (
                <p className="text-xs text-slate-400 mt-2 px-1 leading-relaxed">
                    <span className="font-bold">Nothing waiting:</span>{' '}
                    {idle.map((c, i) => <Fragment key={c.key}>{i > 0 && ' · '}<Link to={c.to} className="hover:text-indigo-700 hover:underline">{c.title}</Link></Fragment>)}
                </p>
            )}
        </section>
    );
}

// 2. One row per order: the Order BOM actions (allocate / raise) + the other steps from the order tracker.
function OrdersTable({ m, tracker, what, changed }) {
    const [open, setOpen] = useState(() => new Set());
    const today = todayLocal();
    const onlyTrim = m.kinds.length === 1 && m.kinds[0] === 'TRIM';
    const tab = onlyTrim ? '?tab=TRIM' : '';
    const kindQ = m.kinds.length === 1 ? `&kind=${m.kinds[0]}` : '';
    const byId = new Map((tracker || []).map(o => [String(o.order_id), o]));
    const rows = (m.all || m.orders).map(o => ({ ...o, tr: byId.get(String(o.order_id)) }));
    const seen = new Set(rows.map(r => String(r.order_id)));
    // Orders where the store's next step is something else (issue, receive goods …): after the material rows.
    for (const t of tracker || []) {
        if (!seen.has(String(t.order_id))) rows.push({ order_id: t.order_id, order_no: t.order_no, customer_name: t.customer_name, ship_date: t.ship_date, needed_by: null, allocate_count: 0, raise_count: 0, allocate: [], raise: [], tr: t });
    }
    const otherSteps = (r) => (r.tr?.my_step_items || []).filter(s => !ALLOC_RAISE.has(s.code));
    // One line per kind of step (six "Receive goods on PO …" become one line + "+5 more"); the full list in the open row.
    const stepGroups = (r) => {
        const g = new Map();
        for (const st of otherSteps(r)) { if (!g.has(st.code)) g.set(st.code, []); g.get(st.code).push(st); }
        return [...g.values()];
    };
    const toggle = (id) => setOpen(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
    const tot = { alloc: rows.reduce((s, r) => s + r.allocate_count, 0), raise: rows.reduce((s, r) => s + r.raise_count, 0), other: rows.reduce((s, r) => s + otherSteps(r).length, 0) };
    const itemList = (list, tone) => (
        <ul className="space-y-0.5">
            {list.map(i => <li key={`${i.kind}:${i.item_id}`} className="flex gap-3"><span className="text-slate-700">{i.label}</span><span className={`ml-auto tabular-nums font-semibold ${tone}`}>{fmtQty(i.qty)} {i.uom}</span></li>)}
        </ul>
    );
    return (
        <section id="store-orders" className={`bg-white border rounded-xl overflow-hidden scroll-mt-4 ${changed ? 'ring-2 ring-amber-400 border-amber-300' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <ClipboardList size={18} className="text-amber-600" />
                <p className="font-black text-slate-800">Orders with your next step</p>
                <span className="text-xs text-slate-500">{plural(m.total, 'order')} need {what} from the Order BOM{m.new ? ` · ${m.new} new` : ''}</span>
                <Link to="/v3/tracker?mine=1" className="ml-auto text-xs font-bold text-indigo-700 hover:underline">Order tracker →</Link>
            </div>
            {!tracker ? <Loading /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="w-8" />
                                <th className="text-left px-3 py-2">Order</th>
                                <th className="text-left px-3 py-2 min-w-[8rem]">Buyer</th>
                                <th className="text-left px-3 py-2 whitespace-nowrap">Needed by</th>
                                <th className="text-left px-3 py-2">Ship</th>
                                <th className="text-right px-3 py-2" title="Items free in the store to reserve for the order">Allocate</th>
                                <th className="text-right px-3 py-2" title="Items nothing covers: raise a purchase requisition">Requisition</th>
                                <th className="text-left px-3 py-2 min-w-[15rem]">Other steps</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(r => {
                                const id = String(r.order_id); const isOpen = open.has(id); const late = r.needed_by && r.needed_by < today;
                                const groups = stepGroups(r);
                                const canOpen = r.allocate.length + r.raise.length > 0 || groups.some(x => x.length > 1);
                                return (
                                    <Fragment key={id}>
                                        <tr className="hover:bg-slate-50 align-top">
                                            <td className="pl-3 py-2">
                                                {canOpen && <button type="button" onClick={() => toggle(id)} title={isOpen ? 'Hide the items' : 'Show the items'} className="p-0.5 rounded text-slate-400 hover:text-indigo-700 hover:bg-indigo-50">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <span className="inline-flex items-center gap-2">
                                                    {r.tr && <Dot rag={r.tr.rag} title={`Overall: ${String(r.tr.rag).toLowerCase()}`} />}
                                                    <Link to={`/v3/planning/orders/${id}${tab}`} className="font-bold text-slate-800 hover:text-indigo-700">{r.order_no}</Link>
                                                    {r.is_new && <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-100 rounded px-1.5">New</span>}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-600">{r.customer_name}</td>
                                            <td className={`px-3 py-2 whitespace-nowrap ${late ? 'text-rose-600 font-bold' : 'text-slate-600'}`} title={late ? 'Past the date the order needs the material' : undefined}>{r.needed_by ? fmtDate(r.needed_by) : '—'}{late && <span className="block text-[10px] font-black uppercase tracking-wider">late</span>}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtDate(r.ship_date)}</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                {r.allocate_count > 0 ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="tabular-nums font-bold text-emerald-700">{r.allocate_count}</span>
                                                        <Link to={`/v3/planning/orders/${id}${tab}`} className="px-2 py-1 rounded-md bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700">Allocate</Link>
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                {r.raise_count > 0 ? (
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className="tabular-nums font-bold text-rose-700">{r.raise_count}</span>
                                                        <Link to={`/v3/planning/buy-list?order=${id}${kindQ}`} className="px-2 py-1 rounded-md bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">Raise</Link>
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {groups.length ? (
                                                    <span className="flex flex-col gap-0.5">
                                                        {groups.map((g, i) => (
                                                            <span key={i}>
                                                                {g[0].to ? <Link to={g[0].to} className="font-semibold text-indigo-700 hover:underline">{g[0].label}</Link> : <span className="text-slate-600">{g[0].label}</span>}
                                                                {g.length > 1 && <button type="button" onClick={() => toggle(id)} className="ml-1 text-slate-500 hover:text-indigo-700">+{g.length - 1} more</button>}
                                                            </span>
                                                        ))}
                                                    </span>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-slate-50/70">
                                                <td />
                                                <td colSpan={7} className="px-3 py-3">
                                                    <div className={`grid gap-6 text-xs ${otherSteps(r).length ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                                                        <div>
                                                            <p className="font-black uppercase tracking-wider text-emerald-700 mb-1">Allocate from stock · {r.allocate.length}</p>
                                                            {r.allocate.length ? itemList(r.allocate, 'text-emerald-700') : <p className="text-slate-400">Nothing</p>}
                                                        </div>
                                                        <div>
                                                            <p className="font-black uppercase tracking-wider text-rose-700 mb-1">Raise a requisition · {r.raise.length}</p>
                                                            {r.raise.length ? itemList(r.raise, 'text-rose-700') : <p className="text-slate-400">Nothing</p>}
                                                        </div>
                                                        {otherSteps(r).length > 0 && (
                                                            <div>
                                                                <p className="font-black uppercase tracking-wider text-indigo-700 mb-1">Other steps · {otherSteps(r).length}</p>
                                                                <ul className="space-y-0.5">
                                                                    {otherSteps(r).map((st, i) => <li key={i}>{st.to ? <Link to={st.to} className="text-indigo-700 hover:underline">{st.label}</Link> : <span className="text-slate-700">{st.label}</span>}</li>)}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-700">
                            <tr>
                                <td />
                                <td className="px-3 py-2" colSpan={4}>Total · {plural(rows.length, 'order')}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{plural(tot.alloc, 'item')}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-rose-700">{plural(tot.raise, 'item')}</td>
                                <td className="px-3 py-2 text-xs">{plural(tot.other, 'other step')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </section>
    );
}

// 3. Goods free in the store that an approved order needs but nobody has reserved — newest arrivals first.
function StockTable({ a, changed }) {
    const kind = a.kinds.length === 1 ? `&kind=${a.kinds[0]}` : '';
    const all = `/v3/planning/position?to_allocate=1${kind}`;
    const units = unitsText(a.by_uom);
    return (
        <section id="store-stock" className={`bg-white border rounded-xl overflow-hidden scroll-mt-4 ${changed ? 'ring-2 ring-amber-400 border-amber-300' : 'border-slate-200'}`}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <PackageCheck size={18} className="text-emerald-600" />
                <p className="font-black text-slate-800">Stock waiting for allocation</p>
                <span className="text-xs text-slate-500">free in the store, needed by {plural(a.orders, 'approved order')} — reserve it so the orders count as ready · newest arrivals first</span>
                <Link to={all} className="ml-auto text-xs font-bold text-indigo-700 hover:underline whitespace-nowrap">All {a.total} →</Link>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                        <tr>
                            <th className="text-left px-4 py-2">Item</th>
                            <th className="text-left px-3 py-2">Type</th>
                            <th className="text-right px-3 py-2">Free</th>
                            <th className="text-left px-3 py-2">For orders</th>
                            <th className="text-left px-3 py-2">Arrived</th>
                            <th className="text-left px-3 py-2">GRN</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {a.items.map(it => (
                            <tr key={`${it.kind}:${it.item_id}`} className="hover:bg-slate-50">
                                <td className="px-4 py-2"><Link to={`/v3/planning/position/${it.kind}/${it.item_id}`} className="font-semibold text-slate-800 hover:text-indigo-700">{it.label}</Link></td>
                                <td className="px-3 py-2 text-slate-500 text-xs">{it.type_name || '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700 whitespace-nowrap">{fmtQty(it.qty)} {it.uom}</td>
                                <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{it.orders.map(o => o.order_no).join(', ')}</td>
                                <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{it.last_grn ? fmtDate(it.last_grn.received_date) : '—'}</td>
                                <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{it.last_grn?.grn_no || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-700">
                        <tr>
                            <td className="px-4 py-2" colSpan={2}>Total · {plural(a.total, 'item')}{a.total > a.items.length ? ` (${a.items.length} shown)` : ''}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-700 whitespace-nowrap">{units || '—'}</td>
                            <td className="px-3 py-2 text-xs" colSpan={3}>{plural(a.orders, 'order')}{a.total > a.items.length && <Link to={all} className="ml-3 text-indigo-700 hover:underline">see all {a.total} →</Link>}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    );
}

export default function StoreHome({ work, tracker, changed }) {
    const m = work.order_material; const a = work.allocate;
    const kinds = m?.kinds || a?.kinds || [];
    const what = kinds.length === 1 ? (kinds[0] === 'TRIM' ? 'trims' : 'fabric') : 'material';
    // Orders whose only step is outside the Order BOM still belong in the table (tracker); none at all → a line.
    const anyOrders = (m?.total || 0) > 0 || (tracker || []).length > 0;
    return (
        <div className="space-y-5">
            <NeedsYouNow work={work} what={what} changed={changed} />
            {work.approvals.kinds.length > 0 && work.approvals.total > 0 && (
                <Link to="/v3/approvals" className="flex items-center gap-3 rounded-xl px-4 py-3 border bg-rose-50 border-rose-200 hover:border-rose-400">
                    <Inbox size={18} className="text-rose-600" />
                    <span className="font-black text-slate-800">{work.approvals.total} waiting for your approval</span>
                    <span className="text-sm text-slate-600">{work.approvals.kinds.filter(k => k.count).map(k => `${k.label}s: ${k.count}`).join(' · ')}</span>
                    <ArrowRight size={16} className="ml-auto text-slate-400" />
                </Link>
            )}
            {anyOrders
                ? <OrdersTable m={m || { kinds, total: 0, new: 0, orders: [], all: [] }} tracker={tracker} what={what} changed={changed.has('order_material')} />
                : <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No approved order is waiting on you.</p>}
            {a?.total > 0 && <StockTable a={a} changed={changed.has('allocate')} />}
        </div>
    );
}

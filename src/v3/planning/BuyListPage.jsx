// Buy list: what approved orders still need to buy after item-level netting —
// allocated stock, free stock, and all requisition quantities including MOQ /
// pack surplus raised for other orders (supplyPegging.js) — rounded up to
// purchase units, earliest needed-by first.
// Simplified 15 Oct 2026 ("very confusing"): one table (item · to buy · needed by · orders), Trims / Fabric
// tabs, an order picker (the quantities and the requisition follow it), one "Raise requisition" action for
// what is ticked (new or added to a draft, chosen in the dialog). The per-order breakdown lives on the item's
// position page and the order's requirements.
// 17 Oct 2026 (UX review): the list loads once and is filtered here, so ticks survive search, tabs and filters;
// raising stays on the page (banner, raised rows drop off); groups by trim type / brand with tick-all per group;
// each row shows how its need is covered (bar + "need · on PR …") and the requisitions it is already on;
// urgency chips (late · today · this week · later) and a units check; a store sees only its own kind; with an
// order picked one switch says whether quantities are that order's or every order's.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, ShoppingCart, AlertTriangle, CheckCircle2, X, ChevronDown, ChevronRight, Ruler } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { workApi } from '../api/workApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { exportBuyListExcel } from './prShared';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
// Same rounding as the server (purchaseUnitsFor): usage → whole purchase units.
const purchaseUnits = (qty, factor) => (qty <= 0 ? 0 : Math.ceil(Math.round((qty / (factor || 1)) * 1000) / 1000 - 1e-9));
const isoOf = (d) => d.toLocaleDateString('en-CA');
const todayIso = () => isoOf(new Date());
const weekIso = () => { const d = new Date(); d.setDate(d.getDate() + 7); return isoOf(d); };
const COVER = ['required', 'allocated', 'from_stock', 'on_pr', 'on_po'];

// Urgency of a needed-by date.
const dueOf = (d, today, week) => (!d ? 'LATER' : d < today ? 'LATE' : d === today ? 'TODAY' : d <= week ? 'WEEK' : 'LATER');
const DUE = [['LATE', 'Late', 'bg-rose-100 text-rose-800 border-rose-300'], ['TODAY', 'Due today', 'bg-amber-100 text-amber-900 border-amber-300'],
    ['WEEK', 'This week', 'bg-sky-50 text-sky-800 border-sky-200'], ['LATER', 'Later', 'bg-slate-50 text-slate-700 border-slate-200']];

// The row as shown: with an order picked, that order's share (scope 'order') or every order's (scope 'all').
// others = how many orders need the item; forAll = it is raised for all of them (no order_id).
const shape = (r, orderId, scope) => {
    if (!orderId) return r;
    const o = r.orders.find(x => String(x.order_id) === orderId);
    if (!o) return null;
    const others = r.orders.length > 1;
    if (scope === 'all' || !others) return { ...r, others: others ? r.orders.length : 0, forAll: others };
    const cover = Object.fromEntries(COVER.map(k => [k, o[k] || 0]));
    return { ...r, ...cover, to_raise: o.to_raise, purchase_qty: purchaseUnits(o.to_raise, r.factor), needed_by: o.needed_by,
        late: Boolean(o.needed_by && o.needed_by < todayIso()), others: r.orders.length, forAll: false };
};

// How the need is covered: allocated / issued (green) · on PO (blue) · on requisition (light blue) ·
// free stock to allocate (navy) · to buy (red) — the Order BOM's colours.
function CoverCell({ r }) {
    const req = Math.max(r.required || 0, 0.0001);
    const u = r.uom;
    const parts = [['allocated', 'allocated', 'bg-emerald-500'], ['on_po', 'on PO', 'bg-sky-600'], ['on_pr', 'on PR', 'bg-sky-300'], ['from_stock', 'free stock', 'bg-blue-900']];
    const seg = (key, v, cls) => (v > 0 ? <span key={key} className={cls} style={{ width: `${Math.min(100, (v / req) * 100)}%` }} /> : null);
    const shown = parts.filter(([k]) => r[k] > 0.0005);
    return (
        <div className="min-w-[170px]" title={`Needed ${fmt(r.required, u)} ${u}\n${parts.map(([k, l]) => `${l} ${fmt(r[k], u)}`).join('\n')}\nto buy ${fmt(r.to_raise, u)}`}>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {parts.map(([k, , cls]) => seg(k, r[k], cls))}{seg('raise', r.to_raise, 'bg-rose-400')}
            </div>
            <p className="mt-1 text-xs text-slate-600 tabular-nums">
                need {fmt(r.required, u)} {u}
                {shown.map(([k, l]) => <span key={k}> · {l} {fmt(r[k], u)}</span>)}
            </p>
            {r.from_stock > 0.0005 && <p className="text-[11px] font-semibold text-blue-900">free stock — allocate it on the Order BOM</p>}
        </div>
    );
}

const TABS = [['TRIM', 'Trims'], ['FABRIC', 'Fabric'], ['', 'All']];
const GROUPS = [['type', 'Type'], ['brand', 'Brand'], ['none', 'None']];
const GROUP_KEY = 'v3.buyList.groupBy';
const readGroup = () => { try { return localStorage.getItem(GROUP_KEY) || 'type'; } catch { return 'type'; } };

export default function BuyListPage() {
    const [params, setParams] = useSearchParams();
    const orderId = params.get('order') || '';
    const scope = params.get('scope') === 'all' ? 'all' : 'order';
    const due = params.get('due') || '';
    const [kinds, setKinds] = useState(null);   // kinds this user plans: merchandiser both, each store its own
    // A store plans one kind: it sees only that kind (17 Oct 2026). Others: ?kind= (links from an order's
    // requirements), else All. Null only while permissions load.
    const single = kinds?.length === 1 ? kinds[0] : null;
    const kind = kinds == null ? null : single || (params.get('kind') ?? '');
    const [all, setAll] = useState(null);
    const [search, setSearch] = useState('');
    const [groupBy, setGroupBy] = useState(readGroup);
    const [collapsed, setCollapsed] = useState(new Set());
    const [picked, setPicked] = useState(new Set());
    const [order, setOrder] = useState(null);   // picked order's number / customer, when it has nothing left to buy
    const [error, setError] = useState('');
    const [raising, setRaising] = useState(null); // { target: 'new' | prId, notes, drafts }
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [done, setDone] = useState(null);       // { id, pr_no, count, added } after raising

    const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
    const pickGroup = (g) => { setGroupBy(g); setCollapsed(new Set()); try { localStorage.setItem(GROUP_KEY, g); } catch { /* per-viewer convenience only */ } };

    useEffect(() => {
        planningApi.permissions().then(res => {
            setKinds(res.data.plan_kinds || (res.data.plan ? ['FABRIC', 'TRIM'] : []));
        }).catch(() => setKinds([]));
    }, []);

    // Every kind at once; tabs, search and filters work on it here, so nothing ticked is lost.
    const load = useCallback(() => planningApi.buyList({})
        .then(res => { setAll(res.data); setError(''); })
        .catch(err => setError(apiError(err, 'Failed to load the buy list.'))), []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        setOrder(null);
        if (orderId) workApi.orderSummary(orderId).then(res => setOrder(res.data)).catch(() => {});
    }, [orderId]);

    const today = todayIso();
    const week = weekIso();
    const mayPick = (r) => (kinds || []).includes(r.kind);

    // Rows of the kind shown (a store: its own), shaped for the picked order.
    const kindRows = useMemo(() => (all || []).filter(r => !kind || r.kind === kind), [all, kind]);
    const otherKind = single ? (all || []).filter(r => r.kind !== single).length : 0;
    // Orders that still need something of this kind (for the picker).
    const orders = useMemo(() => {
        const m = new Map();
        for (const r of kindRows) for (const o of r.orders) {
            const id = String(o.order_id);
            const cur = m.get(id);
            if (!cur) m.set(id, { id, order_no: o.order_no, customer_name: o.customer_name, items: 1 });
            else cur.items += 1;
        }
        return [...m.values()].sort((a, b) => String(a.order_no).localeCompare(String(b.order_no)));
    }, [kindRows]);
    const shaped = useMemo(() => kindRows.map(r => shape(r, orderId, scope)).filter(Boolean)
        .map(r => ({ ...r, due: dueOf(r.needed_by, today, week) })), [kindRows, orderId, scope, today, week]);
    const orderNo = order?.order_no || orders.find(o => o.id === orderId)?.order_no || '';

    // Search, then the urgency / on-PR / units filter (client side).
    const searched = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return shaped;
        return shaped.filter(r => `${r.label} ${r.type_name} ${r.brand} ${r.orders.map(o => o.order_no).join(' ')}`.toLowerCase().includes(q));
    }, [shaped, search]);
    const counts = useMemo(() => {
        const c = { UNITS: 0, ONPR: 0 };
        for (const r of searched) { c[r.due] = (c[r.due] || 0) + 1; if (r.unit_check) c.UNITS += 1; if (r.on_prs?.length) c.ONPR += 1; }
        return c;
    }, [searched]);
    const rows = useMemo(() => searched.filter(r => !due || (due === 'UNITS' ? r.unit_check : due === 'ONPR' ? r.on_prs?.length > 0 : r.due === due)), [searched, due]);

    // Groups: trim type, brand / mill, or one flat list; earliest need first.
    const groups = useMemo(() => {
        if (groupBy === 'none') return [{ key: '', name: '', rows }];
        const m = new Map();
        for (const r of rows) {
            const name = (groupBy === 'brand' ? r.brand : r.type_name) || '—';
            if (!m.has(name)) m.set(name, []);
            m.get(name).push(r);
        }
        return [...m].map(([name, rs]) => ({ key: name, name, rows: rs, firstNeed: rs.reduce((d, r) => (r.needed_by && (!d || r.needed_by < d) ? r.needed_by : d), null) }))
            .sort((a, b) => (a.firstNeed || '9999').localeCompare(b.firstNeed || '9999') || a.name.localeCompare(b.name));
    }, [rows, groupBy]);

    // Ticks are kept by key across search / filters / tabs; what is raised is every ticked row still to buy.
    const pickedRows = shaped.filter(r => picked.has(r.key));
    const hiddenPicked = pickedRows.filter(r => !rows.some(x => x.key === r.key)).length;
    const setMany = (rs, on) => { const nx = new Set(picked); for (const r of rs.filter(mayPick)) { if (on) nx.add(r.key); else nx.delete(r.key); } setPicked(nx); };
    const toggle = (key) => { const nx = new Set(picked); if (nx.has(key)) nx.delete(key); else nx.add(key); setPicked(nx); };
    const allTicked = (rs) => { const p = rs.filter(mayPick); return p.length > 0 && p.every(r => picked.has(r.key)); };
    const toggleGroup = (key) => { const nx = new Set(collapsed); if (nx.has(key)) nx.delete(key); else nx.add(key); setCollapsed(nx); };

    const openRaise = async () => {
        setFormError('');
        const [d, rj] = await Promise.all([planningApi.prs({ status: 'DRAFT' }), planningApi.prs({ status: 'REJECTED' })]).catch(() => [{ data: [] }, { data: [] }]);
        // Items already on requisitions in play come with the row (on_prs): warned, with "put it there instead" for drafts.
        setRaising({ target: 'new', notes: '', drafts: [...d.data, ...rj.data].filter(p => p.purpose !== 'STORE') });
    };
    const raise = async () => {
        setBusy(true); setFormError('');
        // Per row: this order's need (order_id), or every order's (no order_id).
        const items = pickedRows.map(r => ({ kind: r.kind, item_id: r.item_id, order_id: orderId && !r.forAll ? orderId : undefined }));
        try {
            const res = raising.target === 'new'
                ? await planningApi.createPr({ items, notes: raising.notes })
                : await planningApi.addPrLines(raising.target, items);
            // Stay here: a banner links the requisition, the raised rows drop off when the list reloads.
            setDone({ id: res.data.id, pr_no: res.data.pr_no || 'the requisition', count: items.length, added: raising.target !== 'new' });
            setRaising(null); setPicked(new Set()); setBusy(false);
            load();
        } catch (err) {
            setFormError(apiError(err, 'Failed.'));
            setBusy(false);
        }
    };

    const showTabs = kinds != null && !single;
    const chip = (k, label, n, cls) => (
        <button key={k} type="button" onClick={() => setParam('due', due === k ? '' : k)} aria-pressed={due === k}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${cls} ${due === k ? 'ring-2 ring-indigo-500' : ''} ${!n ? 'opacity-50' : ''}`}>
            {label} <span className="tabular-nums">{n || 0}</span>
        </button>
    );

    return (
        <div className={picked.size ? 'pb-28' : ''}>
            <PageHeader
                title={orderId ? <>Buy list <span className="text-slate-400">—</span> <Link to={`/v3/planning/orders/${orderId}`} className="text-indigo-700 hover:underline">{orderNo || '…'}</Link></> : `Buy list${single ? ` — ${single === 'TRIM' ? 'trims' : 'fabric'}` : ''}`}
                subtitle={orderId && order ? `${order.customer_name}${order.buyer_po_no ? ` · PO ${order.buyer_po_no}` : ''} — what this order still needs to buy` : 'What approved orders still need to buy — not in stock and not already on a requisition.'}
                actions={<SecondaryButton onClick={() => exportBuyListExcel(rows)} disabled={!rows.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>} />

            {done && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900" role="status">
                    <CheckCircle2 size={16} />
                    <span><b>{done.count} item{done.count === 1 ? '' : 's'}</b> {done.added ? 'added to' : 'put on'} <b>{done.pr_no}</b> — submit it for approval when it is complete.</span>
                    <Link to={`/v3/planning/purchase-requisitions/${done.id}`} className="font-bold underline">Open {done.pr_no}</Link>
                    <button type="button" className="ml-auto text-emerald-700 hover:text-emerald-900" onClick={() => setDone(null)} aria-label="Dismiss"><X size={14} /></button>
                </div>
            )}

            {/* Filters: kind · order · group · search */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
                {showTabs && (
                    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist" aria-label="Fabric or trims">
                        {TABS.map(([k, label]) => (
                            <button key={k || 'all'} type="button" role="tab" aria-selected={kind === k} onClick={() => setParam('kind', k)}
                                className={`px-3 py-1.5 text-sm font-bold rounded-md ${kind === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
                        ))}
                    </div>
                )}
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white max-w-[min(360px,100%)]" value={orderId} onChange={e => setParam('order', e.target.value)} aria-label="Order">
                    <option value="">All orders</option>
                    {orderId && !orders.some(o => o.id === orderId) && <option value={orderId}>{orderNo || 'This order'} — nothing to buy</option>}
                    {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name} ({o.items} item{o.items === 1 ? '' : 's'})</option>)}
                </select>
                {orderId && <button type="button" onClick={() => setParam('order', '')} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><X size={12} /> Clear order</button>}
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">Group
                    <select className="px-2 py-1.5 text-sm font-normal text-slate-800 border border-slate-300 rounded-lg bg-white" value={groupBy} onChange={e => pickGroup(e.target.value)}>
                        {GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                </label>
                <div className="ml-auto"><SearchInput value={search} onChange={setSearch} placeholder="Item, brand, type, order" /></div>
            </div>

            {/* With an order picked: one switch for whose quantity is raised */}
            {orderId && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs font-bold text-slate-500">Quantities for</span>
                    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label="Quantities for">
                        {[['order', `${orderNo || 'this order'} only`], ['all', 'all orders needing the item']].map(([k, l]) => (
                            <button key={k} type="button" role="radio" aria-checked={scope === k} onClick={() => setParam('scope', k === 'all' ? 'all' : '')}
                                className={`px-3 py-1 text-xs font-bold rounded-md ${scope === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
                        ))}
                    </div>
                    {scope === 'order' && shaped.some(r => r.others > 1) && <span className="text-xs text-slate-500">{shaped.filter(r => r.others > 1).length} item(s) are also needed by other orders</span>}
                </div>
            )}

            {/* Urgency and check chips — click to filter */}
            {all && shaped.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    {DUE.map(([k, l, cls]) => chip(k, l, counts[k], cls))}
                    {counts.ONPR > 0 && chip('ONPR', 'Already on a PR', counts.ONPR, 'bg-sky-50 text-sky-900 border-sky-300')}
                    {counts.UNITS > 0 && chip('UNITS', 'Check units', counts.UNITS, 'bg-violet-50 text-violet-800 border-violet-300')}
                    {due && <button type="button" onClick={() => setParam('due', '')} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><X size={12} /> Show all</button>}
                    <span className="ml-auto text-sm text-slate-600"><b className="text-slate-800">{rows.length}</b> of {shaped.length} item{shaped.length === 1 ? '' : 's'}</span>
                </div>
            )}
            {single && otherKind > 0 && <p className="mb-2 text-xs text-slate-500">{otherKind} {single === 'TRIM' ? 'fabric' : 'trim'} item(s) are also short — the {single === 'TRIM' ? 'fabric' : 'trim'} store raises those.</p>}

            <ErrorBox text={error} />
            {!all || kinds == null ? <Loading /> : rows.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center">
                    <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
                    <p className="mt-2 font-bold text-slate-800">{shaped.length ? 'Nothing matches' : `Nothing to buy${orderId ? ` for ${orderNo || 'this order'}` : ''}`}</p>
                    <p className="text-sm text-slate-500">{shaped.length ? 'Clear the search or the filter.' : 'Every need is in stock or already on a requisition.'}</p>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto lg:overflow-visible">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider lg:sticky lg:top-14 z-10">
                            <tr className="text-left">
                                <th className="px-3 py-2.5 w-10 bg-slate-50 rounded-tl-xl">{rows.some(mayPick) && <input type="checkbox" aria-label="Tick every item shown" checked={allTicked(rows)} onChange={e => setMany(rows, e.target.checked)} />}</th>
                                <th className="px-3 py-2.5 bg-slate-50">Item</th>
                                <th className="px-3 py-2.5 bg-slate-50">Covered</th>
                                <th className="px-3 py-2.5 text-right bg-slate-50">To buy{orderId ? ` — ${scope === 'all' ? 'all orders' : orderNo || 'this order'}` : ''}</th>
                                <th className={`px-3 py-2.5 bg-slate-50 ${orderId ? 'rounded-tr-xl' : ''}`}>Needed by</th>
                                {!orderId && <th className="px-3 py-2.5 bg-slate-50 rounded-tr-xl">For orders</th>}
                            </tr>
                        </thead>
                        {groups.map(g => {
                            const open = !collapsed.has(g.key);
                            const urgent = g.rows.filter(r => r.due === 'LATE' || r.due === 'TODAY').length;
                            const tickedHere = g.rows.filter(r => picked.has(r.key)).length;
                            return (
                                <tbody key={g.key || 'all'}>
                                    {g.name && (
                                        <tr className="border-t border-slate-200 bg-slate-100/70">
                                            <td className="px-3 py-2">{g.rows.some(mayPick) && <input type="checkbox" aria-label={`Tick all ${g.name}`} checked={allTicked(g.rows)} onChange={e => setMany(g.rows, e.target.checked)} />}</td>
                                            <td colSpan={orderId ? 4 : 5} className="px-1 py-1.5">
                                                <button type="button" onClick={() => toggleGroup(g.key)} aria-expanded={open} className="inline-flex flex-wrap items-center gap-1.5 text-sm font-black text-slate-800">
                                                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {g.name}
                                                    <span className="text-xs font-bold text-slate-500">{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
                                                    {urgent > 0 && <span className="text-xs font-bold text-rose-700">· {urgent} due now</span>}
                                                    {tickedHere > 0 && <span className="text-xs font-bold text-indigo-700">· {tickedHere} ticked</span>}
                                                    {g.firstNeed && <span className="text-xs font-semibold text-slate-500">· from {fmtDate(g.firstNeed)}</span>}
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                    {open && g.rows.map(r => (
                                        <tr key={r.key} className={`border-t border-slate-100 align-top ${picked.has(r.key) ? 'bg-indigo-50/60' : ''}`}>
                                            <td className="px-3 py-3">{mayPick(r) && <input type="checkbox" aria-label={`Select ${r.label}`} checked={picked.has(r.key)} onChange={() => toggle(r.key)} />}</td>
                                            <td className="px-3 py-3">
                                                <Link to={`/v3/planning/position/${r.kind}/${r.item_id}`} className="font-semibold text-slate-800 hover:text-indigo-700 hover:underline">{r.label}</Link>
                                                <span className="block text-xs text-slate-500">{groupBy === 'brand' ? r.type_name : groupBy === 'type' ? r.brand : `${r.type_name}${r.brand ? ` · ${r.brand}` : ''}`}{!r.active && <span className="ml-1 font-bold text-rose-600">inactive</span>}</span>
                                                {(r.on_prs?.length > 0 || r.unit_check) && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {(r.on_prs || []).map(x => (
                                                            <Link key={x.line_id} to={`/v3/planning/purchase-requisitions/${x.pr_id}`} title={`Line ${x.line_no}: ${fmt(x.purchase_qty, 'pcs')} ${x.purchase_uom}${x.orders ? ` for ${x.orders}` : ''}`}
                                                                className="text-[11px] font-semibold rounded bg-sky-50 border border-sky-200 text-sky-900 px-1.5 hover:underline">on {x.pr_no} · {x.status.toLowerCase()}</Link>
                                                        ))}
                                                        {r.unit_check && (
                                                            <span title={`1 ${r.purchase_uom} = 1 ${r.uom}: the purchase unit converts one to one — check the item's units in the masters before raising.`}
                                                                className="inline-flex items-center gap-1 text-[11px] font-bold rounded bg-violet-50 border border-violet-300 text-violet-800 px-1.5"><Ruler size={11} /> check units: 1 {r.purchase_uom} = 1 {r.uom}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-3"><CoverCell r={r} /></td>
                                            <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                                                <span className="font-black text-slate-900">{fmt(r.purchase_qty, 'pcs')}</span> <span className="text-slate-600">{r.purchase_uom}</span>
                                                {r.purchase_uom !== r.uom && <span className="block text-xs text-slate-500">{fmt(r.to_raise, r.uom)} {r.uom}</span>}
                                                {orderId && r.forAll && <span className="block text-[11px] font-bold text-amber-700">{r.others} orders</span>}
                                                {orderId && !r.forAll && r.others > 1 && <span className="block text-[11px] text-slate-500">+ {r.others - 1} other order{r.others === 2 ? '' : 's'}</span>}
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                {r.due === 'LATE' ? <span className="inline-flex items-center gap-1 font-bold text-rose-700"><AlertTriangle size={13} /> {fmtDate(r.needed_by)} · late</span>
                                                    : r.due === 'TODAY' ? <span className="font-bold text-amber-800">{fmtDate(r.needed_by)} · today</span>
                                                        : <>{fmtDate(r.needed_by)}{r.due === 'WEEK' && <span className="ml-1 text-xs font-semibold text-sky-700">this week</span>}</>}
                                            </td>
                                            {!orderId && (
                                                <td className="px-3 py-3">
                                                    <div className="flex flex-col gap-0.5">
                                                        {r.orders.map(o => (
                                                            <button key={o.order_id} type="button" onClick={() => setParam('order', String(o.order_id))} title={`${o.customer_name} — show only this order`}
                                                                className="self-start text-xs bg-slate-100 hover:bg-indigo-100 hover:text-indigo-800 text-slate-700 rounded px-1.5 py-0.5 tabular-nums whitespace-nowrap">
                                                                <b>{o.order_no}</b> {fmt(o.to_raise, r.uom)} {r.uom}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            );
                        })}
                    </table>
                </div>
            )}

            {/* Action bar for what is ticked */}
            {picked.size > 0 && (
                <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
                    <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
                        <span className="text-sm text-slate-700"><b>{pickedRows.length}</b> item{pickedRows.length === 1 ? '' : 's'} ticked
                            {orderId && <> — for {scope === 'all' ? 'all orders needing them' : orderNo || 'this order'}</>}
                            {hiddenPicked > 0 && <span className="text-slate-500"> ({hiddenPicked} hidden by the search or filter)</span>}</span>
                        <button type="button" className="text-xs font-bold text-slate-500 hover:text-slate-800" onClick={() => setPicked(new Set())}>Clear</button>
                        <div className="ml-auto"><PrimaryButton onClick={openRaise} disabled={!pickedRows.length}><ShoppingCart size={14} /> Raise requisition</PrimaryButton></div>
                    </div>
                </div>
            )}

            {raising && (
                <Modal title="Raise requisition" onClose={() => setRaising(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <ul className="text-sm divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-56 overflow-y-auto">
                            {pickedRows.map(r => (
                                <li key={r.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-1.5">
                                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                    {orderId && <span className={`text-[11px] font-bold rounded px-1.5 ${r.forAll ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>{r.forAll ? `${r.others} orders` : (orderNo || 'this order')}</span>}
                                    <b className="tabular-nums">{fmt(r.purchase_qty, 'pcs')} {r.purchase_uom}</b>
                                    {r.unit_check && <span className="basis-full text-[11px] font-semibold rounded px-1.5 py-0.5 bg-violet-50 text-violet-800">Check units: 1 {r.purchase_uom} = 1 {r.uom}</span>}
                                    {(r.on_prs || []).map(x => {
                                        const editable = raising.drafts.some(d => String(d.id) === x.pr_id);
                                        const here = raising.target === x.pr_id;
                                        return (
                                            <span key={x.line_id} className={`basis-full text-[11px] font-semibold rounded px-1.5 py-0.5 ${here ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                                                {here ? `Will be added to line ${x.line_no} of ${x.pr_no}` : `Already on ${x.pr_no}`} ({x.status.toLowerCase()}, line {x.line_no}: {fmt(x.purchase_qty, 'pcs')} {x.purchase_uom}{x.orders ? ` for ${x.orders}` : ''})
                                                {!here && editable && <button type="button" onClick={() => setRaising({ ...raising, target: x.pr_id })} className="ml-1 underline">put it on {x.pr_no} instead</button>}
                                            </span>
                                        );
                                    })}
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-slate-500">{orderId ? `Each line covers ${scope === 'all' ? 'every order needing the item' : `${orderNo || 'this order'} only`}.` : 'For every order that needs these items.'} You can raise a quantity (e.g. for a minimum order) on the requisition before submitting.</p>
                        <Field label="Put on">
                            <select className={inputCls} value={raising.target} onChange={e => setRaising({ ...raising, target: e.target.value })}>
                                <option value="new">A new requisition</option>
                                {raising.drafts.map(d => <option key={d.id} value={String(d.id)}>{d.pr_no} — {d.status.toLowerCase()}, {d.line_count} line(s)</option>)}
                            </select>
                        </Field>
                        {raising.target === 'new' && (
                            <Field label="Notes (optional)"><textarea className={`${inputCls} min-h-[60px]`} value={raising.notes} onChange={e => setRaising({ ...raising, notes: e.target.value })} /></Field>
                        )}
                        {(() => {
                            const dup = pickedRows.filter(r => (r.on_prs || []).some(x => x.pr_id !== raising.target)).length;
                            return dup > 0 ? <p className="text-xs font-semibold text-amber-800">{dup} item{dup === 1 ? ' is' : 's are'} already on another requisition — check before raising a second one (it can be ordered twice).</p> : null;
                        })()}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setRaising(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={raise} busy={busy} disabled={busy}>{raising.target === 'new' ? 'Create requisition' : 'Add to requisition'}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

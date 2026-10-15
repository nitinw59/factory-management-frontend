// Buy list: what approved orders still need to buy after item-level netting —
// allocated stock, free stock, and all requisition quantities including MOQ /
// pack surplus raised for other orders (supplyPegging.js) — rounded up to
// purchase units, earliest needed-by first.
// Simplified 15 Oct 2026 ("very confusing"): one table (item · to buy · needed by · orders), Trims / Fabric
// tabs, an order picker (the quantities and the requisition follow it), one "Raise requisition" action for
// what is ticked (new or added to a draft, chosen in the dialog). The per-order breakdown lives on the item's
// position page and the order's requirements.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, ShoppingCart, AlertTriangle, CheckCircle2, X } from 'lucide-react';
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
const todayIso = () => new Date().toLocaleDateString('en-CA');

// One order picked: that order's share of each item; all_* = every order needing it (the user picks one per row).
const forOrder = (r, orderId) => {
    const o = r.orders.find(x => String(x.order_id) === orderId);
    if (!o) return null;
    return { ...r, to_raise: o.to_raise, purchase_qty: purchaseUnits(o.to_raise, r.factor), needed_by: o.needed_by,
        late: Boolean(o.needed_by && o.needed_by < todayIso()), orders: [o],
        all_to_raise: r.to_raise, all_purchase_qty: r.purchase_qty, all_orders: r.orders.length };
};
const hasOthers = (r) => r.all_orders > 1;

// One quantity a row can be raised for; picking it ticks the row.
function QtyChoice({ r, qty, need, note, chosen, canPick, onPick }) {
    const body = <>
        <span className="font-black text-slate-900 tabular-nums">{fmt(qty, 'pcs')}</span> <span className="text-slate-600">{r.purchase_uom}</span>
        {(r.purchase_uom !== r.uom || note) && <span className="block text-xs text-slate-500 tabular-nums">{r.purchase_uom !== r.uom ? `${fmt(need, r.uom)} ${r.uom} needed` : ''}{r.purchase_uom !== r.uom && note ? ' · ' : ''}{note || ''}</span>}
    </>;
    if (!canPick) return <div className="px-2 py-1 whitespace-nowrap">{body}</div>;
    return (
        <button type="button" onClick={onPick} aria-pressed={chosen}
            className={`w-full text-right whitespace-nowrap rounded-lg border px-2 py-1 transition ${chosen ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-transparent hover:border-slate-300'}`}>
            <span className="flex items-start justify-end gap-2">
                <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${chosen ? 'border-indigo-600 bg-indigo-600 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300'}`} />
                <span>{body}</span>
            </span>
        </button>
    );
}

const TABS = [['TRIM', 'Trims'], ['FABRIC', 'Fabric'], ['', 'All']];

export default function BuyListPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const orderId = params.get('order') || '';
    const kind = params.get('kind') ?? null;   // null until permissions say which kind to open on
    const [all, setAll] = useState(null);
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [allFor, setAllFor] = useState(new Set());   // rows raised for all orders instead of the picked one
    const [kinds, setKinds] = useState(null);   // kinds this user plans: merchandiser both, each store its own
    const [order, setOrder] = useState(null);   // picked order's number / customer, when it has nothing left to buy
    const [error, setError] = useState('');
    const [raising, setRaising] = useState(null); // { target: 'new' | prId, notes, drafts }
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

    useEffect(() => {
        planningApi.permissions().then(res => {
            const k = res.data.plan_kinds || (res.data.plan ? ['FABRIC', 'TRIM'] : []);
            setKinds(k);
            if (params.get('kind') == null) setParam('kind', k.length === 1 ? k[0] : '');   // a store opens on its own kind
        }).catch(() => setKinds([]));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const load = useCallback(() => {
        if (kind == null) return;
        planningApi.buyList({ kind: kind || undefined, q: search.trim() || undefined })
            .then(res => { setAll(res.data); setPicked(new Set()); setAllFor(new Set()); })
            .catch(err => setError(apiError(err, 'Failed to load the buy list.')));
    }, [kind, search]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
    useEffect(() => {
        setOrder(null);
        if (orderId) workApi.orderSummary(orderId).then(res => setOrder(res.data)).catch(() => {});
    }, [orderId]);

    // Orders that still need something (for the picker), earliest needed first.
    const orders = useMemo(() => {
        const m = new Map();
        for (const r of all || []) for (const o of r.orders) {
            const id = String(o.order_id);
            const cur = m.get(id);
            if (!cur) m.set(id, { id, order_no: o.order_no, customer_name: o.customer_name, items: 1, needed_by: o.needed_by });
            else { cur.items += 1; if (o.needed_by && (!cur.needed_by || o.needed_by < cur.needed_by)) cur.needed_by = o.needed_by; }
        }
        return [...m.values()].sort((a, b) => String(a.order_no).localeCompare(String(b.order_no)));
    }, [all]);
    const rows = useMemo(() => (all ? (orderId ? all.map(r => forOrder(r, orderId)).filter(Boolean) : all) : null), [all, orderId]);
    const orderNo = order?.order_no || orders.find(o => o.id === orderId)?.order_no || '';

    const mayPick = (r) => (kinds || []).includes(r.kind);
    const pickable = (rows || []).filter(mayPick);
    const toggle = (key) => { const nx = new Set(picked); if (nx.has(key)) nx.delete(key); else nx.add(key); setPicked(nx); };
    const pickedRows = (rows || []).filter(r => picked.has(r.key));
    // Choosing a quantity ticks the row: "this order" or "all orders".
    const choose = (r, all) => {
        if (!mayPick(r)) return;
        setPicked(new Set([...picked, r.key]));
        const nx = new Set(allFor); if (all) nx.add(r.key); else nx.delete(r.key); setAllFor(nx);
    };
    const forAll = (r) => Boolean(orderId) && hasOthers(r) && allFor.has(r.key);
    const qtyOf = (r) => (forAll(r) ? r.all_purchase_qty : r.purchase_qty);
    const setTickedTo = (all) => setAllFor(all ? new Set(pickedRows.filter(hasOthers).map(r => r.key)) : new Set());

    const openRaise = async () => {
        setFormError('');
        const [d, rj] = await Promise.all([planningApi.prs({ status: 'DRAFT' }), planningApi.prs({ status: 'REJECTED' })]).catch(() => [{ data: [] }, { data: [] }]);
        setRaising({ target: 'new', notes: '', drafts: [...d.data, ...rj.data].filter(p => p.purpose !== 'STORE') });
    };
    const raise = async () => {
        setBusy(true); setFormError('');
        // Per row: this order's need (order_id), or every order's (no order_id).
        const items = pickedRows.map(r => ({ kind: r.kind, item_id: r.item_id, order_id: orderId && !forAll(r) ? orderId : undefined }));
        try {
            const res = raising.target === 'new'
                ? await planningApi.createPr({ items, notes: raising.notes })
                : await planningApi.addPrLines(raising.target, items);
            navigate(`/v3/planning/purchase-requisitions/${res.data.id}`);
        } catch (err) {
            setFormError(apiError(err, 'Failed.'));
            setBusy(false);
        }
    };

    const lateCount = (rows || []).filter(r => r.late).length;

    return (
        <div className={picked.size ? 'pb-20' : ''}>
            <PageHeader
                title={orderId ? <>Buy list <span className="text-slate-400">—</span> <Link to={`/v3/planning/orders/${orderId}`} className="text-indigo-700 hover:underline">{orderNo || '…'}</Link></> : 'Buy list'}
                subtitle={orderId && order ? `${order.customer_name}${order.buyer_po_no ? ` · PO ${order.buyer_po_no}` : ''} — what this order still needs to buy` : 'What approved orders still need to buy — not in stock and not already on a requisition.'}
                actions={<SecondaryButton onClick={() => exportBuyListExcel(rows || [])} disabled={!rows?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>} />

            {/* Filters: kind · order · search */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist" aria-label="Fabric or trims">
                    {TABS.map(([k, label]) => (
                        <button key={k || 'all'} type="button" role="tab" aria-selected={kind === k} onClick={() => setParam('kind', k || '')}
                            className={`px-3 py-1.5 text-sm font-bold rounded-md ${kind === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
                    ))}
                </div>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white max-w-[min(360px,100%)]" value={orderId} onChange={e => { setParam('order', e.target.value); setPicked(new Set()); setAllFor(new Set()); }} aria-label="Order">
                    <option value="">All orders</option>
                    {orderId && !orders.some(o => o.id === orderId) && <option value={orderId}>{orderNo || 'This order'} — nothing to buy</option>}
                    {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name} ({o.items} item{o.items === 1 ? '' : 's'})</option>)}
                </select>
                {orderId && <button type="button" onClick={() => setParam('order', '')} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><X size={12} /> Clear order</button>}
                <div className="ml-auto"><SearchInput value={search} onChange={setSearch} placeholder="Item, brand, code, type" /></div>
            </div>

            <ErrorBox text={error} />
            {rows && rows.length > 0 && (
                <p className="mb-2 text-sm text-slate-600">
                    <b className="text-slate-800">{rows.length} item{rows.length === 1 ? '' : 's'} to buy</b>
                    {lateCount > 0 && <span className="ml-2 text-rose-700 font-semibold">· {lateCount} already late</span>}
                </p>
            )}

            {!rows ? <Loading /> : rows.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-10 text-center">
                    <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
                    <p className="mt-2 font-bold text-slate-800">Nothing to buy{orderId ? ` for ${orderNo || 'this order'}` : ''}</p>
                    <p className="text-sm text-slate-500">Every need is in stock or already on a requisition.</p>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-left">
                                <th className="px-3 py-2.5 w-10">{pickable.length > 0 && <input type="checkbox" aria-label="Select all" checked={picked.size > 0 && picked.size === pickable.length} onChange={e => setPicked(e.target.checked ? new Set(pickable.map(r => r.key)) : new Set())} />}</th>
                                <th className="px-3 py-2.5">Item</th>
                                {orderId ? <>
                                    <th className="px-3 py-2.5 text-right">To buy — {orderNo || 'this order'}</th>
                                    <th className="px-3 py-2.5 text-right">To buy — all orders</th>
                                </> : <th className="px-3 py-2.5 text-right">To buy</th>}
                                <th className="px-3 py-2.5">Needed by</th>
                                {!orderId && <th className="px-3 py-2.5">For orders</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.key} className={`border-t border-slate-100 align-top ${picked.has(r.key) ? 'bg-indigo-50/60' : ''}`}>
                                    <td className="px-3 py-3">{mayPick(r) && <input type="checkbox" aria-label={`Select ${r.label}`} checked={picked.has(r.key)} onChange={() => toggle(r.key)} />}</td>
                                    <td className="px-3 py-3">
                                        <Link to={`/v3/planning/position/${r.kind}/${r.item_id}`} className="font-semibold text-slate-800 hover:text-indigo-700 hover:underline">{r.label}</Link>
                                        <span className="block text-xs text-slate-500">{r.type_name}{!r.active && <span className="ml-1 font-bold text-rose-600">inactive</span>}</span>
                                    </td>
                                    {orderId ? <>
                                        <td className="px-2 py-2 text-right">
                                            <QtyChoice r={r} qty={r.purchase_qty} need={r.to_raise} chosen={picked.has(r.key) && !forAll(r)} canPick={mayPick(r) && hasOthers(r)} onPick={() => choose(r, false)} />
                                        </td>
                                        <td className="px-2 py-2 text-right">
                                            {hasOthers(r)
                                                ? <QtyChoice r={r} qty={r.all_purchase_qty} need={r.all_to_raise} note={`${r.all_orders} orders`} chosen={picked.has(r.key) && forAll(r)} canPick={mayPick(r)} onPick={() => choose(r, true)} />
                                                : <span className="inline-block px-2 py-1 text-xs text-slate-400">only this order</span>}
                                        </td>
                                    </> : (
                                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                                            <span className="font-black text-slate-900">{fmt(r.purchase_qty, 'pcs')}</span> <span className="text-slate-600">{r.purchase_uom}</span>
                                            {r.purchase_uom !== r.uom && <span className="block text-xs text-slate-500">{fmt(r.to_raise, r.uom)} {r.uom} needed</span>}
                                        </td>
                                    )}
                                    <td className="px-3 py-3 whitespace-nowrap">
                                        {r.late ? <span className="inline-flex items-center gap-1 font-bold text-rose-700"><AlertTriangle size={13} /> {fmtDate(r.needed_by)} · late</span> : fmtDate(r.needed_by)}
                                    </td>
                                    {!orderId && (
                                        <td className="px-3 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {r.orders.map(o => (
                                                    <button key={o.order_id} type="button" onClick={() => setParam('order', String(o.order_id))} title={`${o.customer_name} · ${fmt(o.to_raise, r.uom)} ${r.uom} — show only this order`}
                                                        className="text-xs font-semibold bg-slate-100 hover:bg-indigo-100 hover:text-indigo-800 text-slate-700 rounded px-1.5 py-0.5">{o.order_no}</button>
                                                ))}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Action bar for what is ticked */}
            {picked.size > 0 && (
                <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
                    <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
                        <span className="text-sm text-slate-700"><b>{picked.size}</b> item{picked.size === 1 ? '' : 's'} ticked
                            {orderId && <> — {pickedRows.filter(r => !forAll(r)).length} for {orderNo || 'this order'}, {pickedRows.filter(forAll).length} for all orders</>}</span>
                        {orderId && pickedRows.some(hasOthers) && (
                            <span className="text-xs text-slate-500">Set ticked to:{' '}
                                <button type="button" className="font-bold text-indigo-700 hover:underline" onClick={() => setTickedTo(false)}>{orderNo || 'this order'}</button>{' · '}
                                <button type="button" className="font-bold text-indigo-700 hover:underline" onClick={() => setTickedTo(true)}>all orders</button>
                            </span>
                        )}
                        <button type="button" className="text-xs font-bold text-slate-500 hover:text-slate-800" onClick={() => { setPicked(new Set()); setAllFor(new Set()); }}>Clear</button>
                        <div className="ml-auto"><PrimaryButton onClick={openRaise}><ShoppingCart size={14} /> Raise requisition</PrimaryButton></div>
                    </div>
                </div>
            )}

            {raising && (
                <Modal title="Raise requisition" onClose={() => setRaising(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <ul className="text-sm divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                            {pickedRows.map(r => (
                                <li key={r.key} className="flex items-baseline gap-2 px-3 py-1.5">
                                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                                    {orderId && <span className={`text-[11px] font-bold rounded px-1.5 ${forAll(r) ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>{forAll(r) ? 'all orders' : (orderNo || 'this order')}</span>}
                                    <b className="tabular-nums">{fmt(qtyOf(r), 'pcs')} {r.purchase_uom}</b>
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-slate-500">{orderId ? `Each line covers what you chose: ${orderNo || 'this order'} only, or every order needing the item.` : 'For every order that needs these items.'} You can raise a quantity (e.g. for a minimum order) on the requisition before submitting.</p>
                        <Field label="Put on">
                            <select className={inputCls} value={raising.target} onChange={e => setRaising({ ...raising, target: e.target.value })}>
                                <option value="new">A new requisition</option>
                                {raising.drafts.map(d => <option key={d.id} value={String(d.id)}>{d.pr_no} — {d.status.toLowerCase()}, {d.line_count} line(s)</option>)}
                            </select>
                        </Field>
                        {raising.target === 'new' && (
                            <Field label="Notes (optional)"><textarea className={`${inputCls} min-h-[60px]`} value={raising.notes} onChange={e => setRaising({ ...raising, notes: e.target.value })} /></Field>
                        )}
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

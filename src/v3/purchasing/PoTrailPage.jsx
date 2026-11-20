// A purchase order's trail (20 Nov 2026, owner: "can we add complete information from po issued to all grn to all invoices in map
// or visualise with detailed drill down — PO3/2026-27/0018"). /v3/purchasing/orders/:id/trail, from the PO page.
// Summary per PO line (ordered → received → billed → not billed), then a map — PO lines → goods receipts → invoices (Billing),
// or → where the goods went (Goods: issued to an order, allocated, free in stock, returned, into trim / store stock) — joined by
// flows as wide as the quantity, coloured by PO line. Hover a box to follow its flows; click it for the detail (lines, rolls,
// approvals, totals, debit notes), each table with totals. Then the timeline of every document. Read-only.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, X, ExternalLink, Receipt } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PO_STATUS, inr } from './poShared';
import { INVOICE_STATUS, APPROVAL_STATUS } from './returnShared';

const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const COLOURS = ['#4f46e5', '#0d9488', '#d97706', '#e11d48', '#7c3aed', '#0284c7', '#65a30d', '#ea580c'];
const GRN_STATUS = { APPROVED: 'Approved', PENDING_APPROVAL: 'Waiting for approval', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn', REVERSED: 'Reversed' };
const live = (i) => i.status !== 'CANCELLED' && i.approval_status !== 'DRAFT';
const th = 'px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500';
const thr = `${th} text-right`;
const td = 'px-2 py-1.5';
const tdr = 'px-2 py-1.5 text-right tabular-nums';

// The map's boxes and flows, worked out from the trail.
function build(t) {
    const colour = new Map(t.lines.map((l, i) => [l.id, COLOURS[i % COLOURS.length]]));
    const lineOf = new Map(t.lines.map(l => [l.id, l]));
    const glines = t.grns.flatMap(g => g.lines.map(l => ({ ...l, grn: g })));
    const billedLive = new Map();
    for (const i of t.invoices.filter(live)) for (const l of i.lines) billedLive.set(l.grn_line_id, r3((billedLive.get(l.grn_line_id) || 0) + l.qty));
    const counts = (g) => g.status === 'APPROVED';
    const nodes = { po: [], grn: [], inv: [], dest: [] };
    const edges = [];
    const per = {};   // PO line totals
    for (const l of t.lines) per[l.id] = { ordered: l.qty, received: 0, rejected: 0, returned: 0, billed: 0, unbilled: 0 };
    for (const l of t.lines) nodes.po.push({ id: `L:${l.id}`, kind: 'line', line: l });
    for (const g of t.grns) nodes.grn.push({ id: `G:${g.id}`, kind: 'grn', grn: g, dim: !counts(g) });
    for (const i of t.invoices) nodes.inv.push({ id: `I:${i.id}`, kind: 'inv', inv: i, dim: !live(i) });
    const dest = new Map();
    const addDest = (key, make) => { if (!dest.has(key)) dest.set(key, { id: `D:${key}`, ...make(), items: [] }); return dest.get(key); };
    let unbilled = [];
    for (const gl of glines) {
        const col = colour.get(gl.po_line_id);
        const uom = gl.purchase_uom;
        if (!counts(gl.grn)) { edges.push({ from: `L:${gl.po_line_id}`, to: `G:${gl.grn.id}`, qty: gl.accepted + gl.rejected, uom, colour: col, line: gl.po_line_id, dim: true }); continue; }
        const p = per[gl.po_line_id];
        p.received = r3(p.received + gl.accepted); p.rejected = r3(p.rejected + gl.rejected);
        edges.push({ from: `L:${gl.po_line_id}`, to: `G:${gl.grn.id}`, qty: gl.accepted, uom, colour: col, line: gl.po_line_id });
        const retStock = r3(gl.returns.filter(r => r.source === 'STOCK').reduce((s, r) => s + r.qty, 0));
        p.returned = r3(p.returned + retStock);
        const billed = billedLive.get(gl.id) || 0;
        p.billed = r3(p.billed + billed);
        const left = r3(Math.max(0, gl.accepted - retStock - billed));
        if (left > 0.0005) { p.unbilled = r3(p.unbilled + left); unbilled.push({ ...gl, left }); edges.push({ from: `G:${gl.grn.id}`, to: 'I:none', qty: left, uom, colour: col, line: gl.po_line_id, dashed: true }); }
        // Where it went: rolls (fabric) by issue / allocation / free; trims and store items into stock.
        if (gl.rolls.length) {
            for (const r of gl.rolls) {
                let used = 0;
                for (const is of r.issues) { used += is.qty; const d = addDest(`O:${is.order_id}`, () => ({ kind: 'order', order: { id: is.order_id, order_no: is.order_no } })); d.items.push({ gl, roll: r, qty: is.qty, how: 'issued', issue: is }); edges.push({ from: `G:${gl.grn.id}`, to: d.id, qty: is.qty, uom, colour: col, line: gl.po_line_id }); }
                if (r.status === 'IN_STOCK' && r.qty_now > 0.0005) {
                    const d = r.allocated ? addDest(`O:${r.allocated.id}`, () => ({ kind: 'order', order: r.allocated })) : addDest('stock', () => ({ kind: 'stock' }));
                    d.items.push({ gl, roll: r, qty: r.qty_now, how: r.allocated ? 'allocated' : 'free' });
                    edges.push({ from: `G:${gl.grn.id}`, to: d.id, qty: r.qty_now, uom, colour: col, line: gl.po_line_id, dashed: !r.allocated });
                    used += r.qty_now;
                }
                const other = r3(r.qty_in - used);
                if (other > 0.05) { const d = addDest('other', () => ({ kind: 'other' })); d.items.push({ gl, roll: r, qty: other, how: r.status === 'RETURNED' ? 'returned' : 'used or adjusted without an issue slip' }); edges.push({ from: `G:${gl.grn.id}`, to: d.id, qty: other, uom, colour: col, line: gl.po_line_id }); }
            }
        } else if (gl.accepted - retStock > 0.0005) {
            const kind = lineOf.get(gl.po_line_id)?.kind;
            const d = addDest(kind === 'STORE' ? 'storestock' : 'trimstock', () => ({ kind: kind === 'STORE' ? 'storestock' : 'trimstock' }));
            d.items.push({ gl, qty: r3(gl.accepted - retStock), how: 'into stock' });
            edges.push({ from: `G:${gl.grn.id}`, to: d.id, qty: r3(gl.accepted - retStock), uom, colour: col, line: gl.po_line_id });
        }
        if (retStock > 0.0005) { const d = addDest('returned', () => ({ kind: 'returned' })); d.items.push({ gl, qty: retStock, how: 'returned', returns: gl.returns }); edges.push({ from: `G:${gl.grn.id}`, to: d.id, qty: retStock, uom, colour: col, line: gl.po_line_id }); }
    }
    for (const i of t.invoices) for (const l of i.lines) {
        const gl = glines.find(x => x.id === l.grn_line_id);
        if (gl) edges.push({ from: `G:${gl.grn.id}`, to: `I:${i.id}`, qty: l.qty, uom: gl.purchase_uom, colour: colour.get(gl.po_line_id), line: gl.po_line_id, dim: !live(i) });
    }
    if (unbilled.length) nodes.inv.push({ id: 'I:none', kind: 'unbilled', items: unbilled });
    const order = { order: 0, stock: 1, trimstock: 2, storestock: 3, returned: 4, other: 5 };
    nodes.dest = [...dest.values()].sort((a, b) => order[a.kind] - order[b.kind] || String(a.order?.order_no).localeCompare(String(b.order?.order_no)));
    // Merge flows between the same two boxes for the same PO line.
    const merged = new Map();
    for (const e of edges) { const k = `${e.from}|${e.to}|${e.line}|${e.dashed ? 1 : 0}|${e.dim ? 1 : 0}`; if (merged.has(k)) merged.get(k).qty = r3(merged.get(k).qty + e.qty); else merged.set(k, { ...e }); }
    const lineMax = new Map(t.lines.map(l => [l.id, Math.max(l.qty, per[l.id].received, 1)]));
    return { nodes, edges: [...merged.values()].map(e => ({ ...e, w: 2 + 16 * Math.min(1, e.qty / lineMax.get(e.line)) })), per, colour, unbilled };
}

function Section({ title, children }) {
    return <div className="mb-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">{title}</p>{children}</div>;
}

export default function PoTrailPage() {
    const { id } = useParams();
    const [t, setT] = useState(null);
    const [error, setError] = useState('');
    const [hover, setHover] = useState(null);
    const [open, setOpen] = useState(null);
    const [view, setView] = useState('bill');   // the map's third column: invoices, or where the goods went
    const wrap = useRef(null);
    const boxes = useRef({});
    const [paths, setPaths] = useState([]);
    useEffect(() => { purchasingApi.orderTrail(id).then(res => setT(res.data)).catch(err => setError(apiError(err, 'Failed to load the trail.'))); }, [id]);
    const m = useMemo(() => (t ? build(t) : null), [t]);

    // Flows: from the right edge of one box to the left edge of the next, ports spread down each side in the order of the far end.
    useLayoutEffect(() => {
        if (!m || !wrap.current) return undefined;
        const draw = () => {
            const base = wrap.current.getBoundingClientRect();
            const rect = (nid) => { const el = boxes.current[nid]; if (!el) return null; const r = el.getBoundingClientRect(); return { x1: r.left - base.left, x2: r.right - base.left, y1: r.top - base.top, y2: r.bottom - base.top }; };
            const R = Object.fromEntries([...m.nodes.po, ...m.nodes.grn, ...m.nodes.inv, ...m.nodes.dest].map(n => [n.id, rect(n.id)]));
            const out = {}; const inn = {};
            for (const e of m.edges) { if (!R[e.from] || !R[e.to]) continue; (out[e.from] = out[e.from] || []).push(e); (inn[e.to] = inn[e.to] || []).push(e); }
            const port = (list, key, r, other) => {
                list.sort((a, b) => (R[other(a)].y1 + R[other(a)].y2) - (R[other(b)].y1 + R[other(b)].y2));
                const total = list.reduce((s, e) => s + e.w, 0); const h = r.y2 - r.y1; const gap = Math.max(0, (h - 16 - total) / (list.length + 1));
                let y = r.y1 + 8 + gap; for (const e of list) { e[key] = y + e.w / 2; y += e.w + gap; }
            };
            for (const [nid, list] of Object.entries(out)) port(list, 'ys', R[nid], e => e.to);
            for (const [nid, list] of Object.entries(inn)) port(list, 'yt', R[nid], e => e.from);
            setPaths(m.edges.filter(e => R[e.from] && R[e.to]).map(e => {
                const x1 = R[e.from].x2; const x2 = R[e.to].x1; const c = (x2 - x1) / 2;
                return { ...e, d: `M${x1},${e.ys} C${x1 + c},${e.ys} ${x2 - c},${e.yt} ${x2},${e.yt}`, mx: (x1 + x2) / 2, my: (e.ys + e.yt) / 2 };
            }));
        };
        draw();
        const ro = new ResizeObserver(draw); ro.observe(wrap.current);
        return () => ro.disconnect();
    }, [m, view]);

    if (error) return <ErrorBox text={error} />;
    if (!t || !m) return <Loading />;
    const { po } = t;
    const linked = (nid) => !hover || nid === hover || m.edges.some(e => (e.from === hover && e.to === nid) || (e.to === hover && e.from === nid) || (hover.startsWith('L:') && e.line === hover.slice(2) && (e.from === nid || e.to === nid)));
    const lit = (e) => !hover || e.from === hover || e.to === hover || (hover.startsWith('L:') && e.line === hover.slice(2));
    const value = { ordered: t.lines.reduce((s, l) => s + l.qty * l.rate * (1 + l.gst_pct / 100), 0), received: 0, billed: t.invoices.filter(live).reduce((s, i) => s + i.total_amount, 0), debited: t.invoices.filter(live).reduce((s, i) => s + (i.debit_notes || []).filter(d => d.status === 'APPROVED').reduce((x, d) => x + d.total, 0), 0) };
    for (const g of t.grns.filter(x => x.status === 'APPROVED')) for (const l of g.lines) value.received += l.accepted * l.rate * (1 + l.gst_pct / 100);
    const box = (n, body, tone = '') => (
        <button key={n.id} ref={el => { boxes.current[n.id] = el; }} type="button" onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setOpen(n)}
            className={`relative z-10 w-full text-left rounded-xl border bg-white px-3 py-2 shadow-sm transition-opacity hover:shadow-md ${open?.id === n.id ? 'ring-2 ring-indigo-500' : ''} ${n.dim ? 'opacity-50 border-dashed' : ''} ${tone} ${linked(n.id) ? '' : 'opacity-25'}`}>{body}</button>
    );
    const qtyBy = (list, f) => { const u = {}; for (const x of list) { const k = x.gl?.purchase_uom || x.purchase_uom || ''; u[k] = r3((u[k] || 0) + f(x)); } return Object.entries(u).map(([k, v]) => `${fmt(v)} ${k}`).join(' + '); };

    return (
        <div>
            <Link to={`/v3/purchasing/orders/${po.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-2"><ArrowLeft size={15} /> {po.po_no}</Link>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <h1 className="text-lg font-black text-slate-900">Trail · {po.po_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PO_STATUS[po.status]?.cls}`}>{PO_STATUS[po.status]?.label}</span>
                <span className="text-sm text-slate-600">{po.supplier_name}{po.supplier_gstin ? ` · ${po.supplier_gstin}` : ''} · ordered {fmtDate(po.po_date)}{po.delivery_date ? ` · due ${fmtDate(po.delivery_date)}` : ''} · by {po.created_by_name || '—'} · terms {po.payment_terms_days} days</span>
            </div>

            {/* Summary per PO line and in value */}
            <div className="grid lg:grid-cols-[1fr_auto] gap-3 mb-4">
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50"><tr><th className={th}>PO line</th><th className={thr}>Ordered</th><th className={thr}>Received</th><th className={thr}>Rejected</th><th className={thr}>Returned</th><th className={thr}>Billed</th><th className={thr}>Not billed</th></tr></thead>
                        <tbody>
                            {t.lines.map(l => { const p = m.per[l.id]; const over = p.received - l.qty; const pct = l.qty ? Math.round((over / l.qty) * 1000) / 10 : 0; return (
                                <tr key={l.id} className="border-t border-slate-100" onMouseEnter={() => setHover(`L:${l.id}`)} onMouseLeave={() => setHover(null)}>
                                    <td className={td}><span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ background: m.colour.get(l.id) }} />{l.line_no}. {l.label}</td>
                                    <td className={tdr}>{fmt(l.qty)} {l.purchase_uom}</td>
                                    <td className={`${tdr} ${pct > (t.tolerance.over_pct ?? 5) ? 'text-amber-800 font-bold' : ''}`}>{fmt(p.received)}{Math.abs(over) > 0.0005 && <span className="block text-[11px]">{over > 0 ? '+' : ''}{fmt(over)} ({over > 0 ? '+' : ''}{pct}%)</span>}</td>
                                    <td className={tdr}>{p.rejected ? fmt(p.rejected) : '—'}</td><td className={tdr}>{p.returned ? fmt(p.returned) : '—'}</td>
                                    <td className={tdr}>{fmt(p.billed)}</td><td className={`${tdr} ${p.unbilled > 0.0005 ? 'text-amber-800 font-bold' : 'text-slate-400'}`}>{p.unbilled > 0.0005 ? fmt(p.unbilled) : '—'}</td>
                                </tr>); })}
                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                <td className={td}>Total · {t.lines.length} line{t.lines.length === 1 ? '' : 's'}</td>
                                {['ordered', 'received', 'rejected', 'returned', 'billed', 'unbilled'].map(k => <td key={k} className={tdr}>{new Set(t.lines.map(l => l.purchase_uom)).size === 1 ? fmt(t.lines.reduce((s, l) => s + m.per[l.id][k], 0)) : '—'}</td>)}
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div className="grid grid-cols-2 gap-2 content-start min-w-[300px]">
                    {[['Ordered', value.ordered], ['Received', value.received, value.received > value.ordered * 1.0001 ? `+₹${inr(value.received - value.ordered)} over the PO` : ''], ['Billed', value.billed, `${t.invoices.filter(live).length} invoice${t.invoices.filter(live).length === 1 ? '' : 's'}`], ['Debit notes', value.debited, value.debited ? `net ₹${inr(value.billed - value.debited)}` : 'none']].map(([k, v, note]) => (
                        <div key={k} className="bg-white border border-slate-200 rounded-xl px-3 py-2"><p className="text-[11px] font-bold text-slate-500">{k} <span className="font-normal">(with GST)</span></p><p className="font-black tabular-nums">₹{inr(v)}</p>{note ? <p className={`text-[11px] ${String(note).includes('over') ? 'text-amber-800 font-semibold' : 'text-slate-500'}`}>{note}</p> : null}</div>
                    ))}
                </div>
            </div>

            {/* The map */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 overflow-x-auto">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold bg-white" role="group" aria-label="Map">
                        {[['bill', 'Billing: GRNs → invoices'], ['goods', 'Goods: GRNs → where it went']].map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => { setView(k); setOpen(null); }} className={`px-3 py-1.5 ${view === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
                    </div>
                    <span className="text-[11px] text-slate-500">Flows are as wide as the quantity, coloured by PO line; dashed = {view === 'bill' ? 'not billed yet' : 'free in stock'}; faded = rejected, withdrawn, reversed, draft or cancelled. Hover a box to follow it, click it for the detail.</span>
                </div>
                <div ref={wrap} className="relative grid grid-cols-3 gap-x-24 min-w-[1000px]">
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" aria-hidden="true">
                        {paths.map((e, i) => <path key={i} d={e.d} fill="none" stroke={e.colour} strokeWidth={e.w} strokeOpacity={e.dim ? 0.15 : lit(e) ? (hover ? 0.75 : 0.45) : 0.08} strokeDasharray={e.dashed ? '6 4' : undefined} />)}
                        {hover && paths.filter(lit).map((e, i) => <text key={`t${i}`} x={e.mx} y={e.my - 3} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold" style={{ paintOrder: 'stroke', stroke: '#f8fafc', strokeWidth: 3 }}>{fmt(e.qty)} {e.uom}</text>)}
                    </svg>
                    {[['Ordered', m.nodes.po], ['Received', m.nodes.grn], view === 'bill' ? ['Billed', m.nodes.inv] : ['Where it went', m.nodes.dest]].map(([title, list], c) => (
                        <div key={title} className="relative z-10 flex flex-col gap-3 justify-center">
                            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 text-center">{title} <span className="font-normal normal-case">· {list.filter(n => n.kind !== 'unbilled').length}</span></p>
                            {list.length === 0 && <p className="text-xs text-slate-400 text-center">{c === 1 ? 'Nothing received yet' : c === 2 && view === 'bill' ? 'Nothing billed yet' : '—'}</p>}
                            {list.map(n => {
                                if (n.kind === 'line') { const p = m.per[n.line.id]; return box(n, <>
                                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className="w-2.5 h-2.5 rounded-full" style={{ background: m.colour.get(n.line.id) }} />Line {n.line.line_no} · {n.line.kind?.toLowerCase()}</span>
                                    <span className="block text-sm font-semibold text-slate-800 leading-tight">{n.line.label}</span>
                                    <span className="block text-xs text-slate-600 mt-0.5">{fmt(n.line.qty)} {n.line.purchase_uom} @ ₹{n.line.rate} · received <b className={p.received > n.line.qty * 1.05 ? 'text-amber-800' : ''}>{fmt(p.received)}</b></span>
                                    {(n.line.orders.length > 0 || n.line.extra_reason) && <span className="block text-[11px] text-slate-500">{n.line.orders.length ? `for ${n.line.orders.map(o => o.order_no.replace(/^SO3\/\d{4}-\d{2}\//, 'SO ')).join(', ')}` : 'advance buy, no order'}</span>}
                                </>); }
                                if (n.kind === 'grn') { const g = n.grn; const over = (g.approval_reasons || []).length > 0; return box(n, <>
                                    <span className="flex items-center justify-between gap-2"><b className="text-sm text-indigo-700">{g.grn_no}</b><span className="text-[11px] text-slate-500">{fmtDate(g.received_date)}</span></span>
                                    <span className="block text-[11px] text-slate-500">challan {g.challan_no || '—'} · {g.lines.reduce((s, l) => s + l.rolls.length, 0) ? `${g.lines.reduce((s, l) => s + l.rolls.length, 0)} rolls` : `${g.lines.length} line${g.lines.length === 1 ? '' : 's'}`}{g.status !== 'APPROVED' ? ` · ${GRN_STATUS[g.status] || g.status}` : ''}</span>
                                    {g.lines.map(l => <span key={l.id} className="flex items-center gap-1 text-xs"><span className="w-2 h-2 rounded-full" style={{ background: m.colour.get(l.po_line_id) }} />L{l.po_line_no}: {fmt(l.accepted)} {l.purchase_uom}{l.rejected ? <span className="text-rose-700"> · {fmt(l.rejected)} rejected</span> : null}</span>)}
                                    {over && <span className="block text-[11px] font-semibold text-amber-800">over tolerance · approved by {g.approved_by || '—'}</span>}
                                </>, over ? 'border-amber-300' : ''); }
                                if (n.kind === 'inv') { const i = n.inv; const st = i.status === 'CANCELLED' ? 'CANCELLED' : i.approval_status; return box(n, <>
                                    <span className="flex items-center justify-between gap-2"><b className="text-sm text-indigo-700">{i.invoice_no}</b><span className="text-[11px] text-slate-500">{fmtDate(i.invoice_date)}</span></span>
                                    <span className="block text-sm font-black tabular-nums">₹{inr(i.total_amount)}</span>
                                    <span className="flex flex-wrap gap-1 mt-0.5"><span className={`text-[10px] font-black px-1.5 rounded border ${APPROVAL_STATUS[st]?.cls}`}>{APPROVAL_STATUS[st]?.label}</span>{i.status !== 'CANCELLED' && i.status !== 'NOT_CHECKED' && <span className={`text-[10px] font-black px-1.5 rounded border ${INVOICE_STATUS[i.status]?.cls}`}>{INVOICE_STATUS[i.status]?.label}</span>}</span>
                                    {i.other_pos.length > 0 && <span className="block text-[11px] text-slate-500">also bills {i.other_pos.join(', ')}</span>}
                                    {(i.debit_notes || []).length > 0 && <span className="block text-[11px] text-rose-700">{i.debit_notes.length} debit note{i.debit_notes.length === 1 ? '' : 's'}</span>}
                                </>, i.status === 'MISMATCH' || i.status === 'MISMATCH_OVERRIDDEN' ? 'border-rose-300' : ''); }
                                if (n.kind === 'unbilled') return box(n, <>
                                    <b className="text-sm text-amber-800">Not billed yet</b>
                                    <span className="block text-xs text-slate-600">{qtyBy(n.items, x => x.left)} on {new Set(n.items.map(x => x.grn.id)).size} GRN{new Set(n.items.map(x => x.grn.id)).size === 1 ? '' : 's'}</span>
                                    <span className="block text-[11px] text-slate-500">₹{inr(n.items.reduce((s, x) => s + x.left * x.rate * (1 + x.gst_pct / 100), 0))} with GST</span>
                                </>, 'border-amber-300 border-dashed');
                                const title2 = n.kind === 'order' ? n.order.order_no : { stock: 'In stock, free', trimstock: 'Into trim stock', storestock: 'Into store stock', returned: 'Returned to supplier', other: 'Used or adjusted (no issue slip)' }[n.kind];
                                const issued = n.items.filter(x => x.how === 'issued'); const alloc = n.items.filter(x => x.how === 'allocated');
                                return box(n, <>
                                    <b className={`text-sm ${n.kind === 'order' ? 'text-indigo-700' : n.kind === 'stock' ? 'text-amber-800' : 'text-slate-800'}`}>{title2}</b>
                                    {n.kind === 'order' ? <>
                                        {issued.length > 0 && <span className="block text-xs text-slate-600">issued {qtyBy(issued, x => x.qty)}</span>}
                                        {alloc.length > 0 && <span className="block text-xs text-slate-600">allocated {qtyBy(alloc, x => x.qty)}</span>}
                                    </> : <span className="block text-xs text-slate-600">{qtyBy(n.items, x => x.qty)}{n.items.some(x => x.roll) ? ` · ${new Set(n.items.map(x => x.roll?.roll_id)).size} roll(s)` : ''}</span>}
                                </>, n.kind === 'stock' ? 'border-amber-300 border-dashed' : '');
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <Timeline t={t} />
            {open && <Detail n={open} t={t} m={m} onClose={() => setOpen(null)} />}
        </div>
    );
}

function Timeline({ t }) {
    const ev = [
        { d: t.po.po_date, what: `PO ${t.po.po_no} made`, who: t.po.created_by_name },
        ...(t.po.issued_at ? [{ d: String(t.po.issued_at).slice(0, 10), what: 'PO issued to the supplier', who: '' }] : []),
        ...t.grns.flatMap(g => [{ d: g.received_date, what: `${g.grn_no} received (challan ${g.challan_no || '—'})`, who: g.received_by, tone: g.status !== 'APPROVED' ? 'dim' : '' },
            ...(g.approved_at ? [{ d: String(g.approved_at).slice(0, 10), what: `${g.grn_no} approved${(g.approval_reasons || []).length ? ' over tolerance' : ''}${g.approval_note ? `: "${g.approval_note}"` : ''}`, who: g.approved_by, tone: (g.approval_reasons || []).length ? 'warn' : '' }] : [])]),
        ...t.invoices.flatMap(i => [{ d: i.invoice_date, what: `Invoice ${i.invoice_no} dated · ₹${inr(i.total_amount)}`, who: i.created_by_name ? `entered by ${i.created_by_name}` : '', tone: live(i) ? '' : 'dim' },
            ...(i.approved_at ? [{ d: String(i.approved_at).slice(0, 10), what: `Invoice ${i.invoice_no} approved${i.override_note ? ` with override: "${i.override_note}"` : ''}`, who: i.approved_by_name }] : [])]),
    ].filter(e => e.d).sort((a, b) => a.d.localeCompare(b.d));
    return (
        <Section title={`Timeline · ${ev.length} events`}>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]"><tbody>
                    {ev.map((e, i) => <tr key={i} className={`border-t border-slate-100 first:border-t-0 ${e.tone === 'dim' ? 'opacity-50' : ''}`}><td className={`${td} whitespace-nowrap text-slate-500 w-28`}>{fmtDate(e.d)}</td><td className={`${td} ${e.tone === 'warn' ? 'text-amber-800 font-semibold' : ''}`}>{e.what}</td><td className={`${td} text-xs text-slate-500`}>{e.who}</td></tr>)}
                </tbody></table>
            </div>
        </Section>
    );
}

// The drill-down panel for the box clicked.
function Detail({ n, t, m, onClose }) {
    const billedOf = (glId) => t.invoices.filter(live).flatMap(i => i.lines.filter(l => l.grn_line_id === glId)).reduce((s, l) => s + l.qty, 0);
    let title = ''; let link = null; let body = null;
    if (n.kind === 'line') {
        const l = n.line; const p = m.per[l.id];
        const recs = t.grns.flatMap(g => g.lines.filter(x => x.po_line_id === l.id).map(x => ({ g, x })));
        const bills = t.invoices.flatMap(i => i.lines.filter(x => recs.some(r => r.x.id === x.grn_line_id)).map(x => ({ i, x, g: recs.find(r => r.x.id === x.grn_line_id).g })));
        title = `PO line ${l.line_no}`;
        body = <>
            <p className="text-sm font-semibold text-slate-800 mb-1">{l.label}</p>
            <p className="text-xs text-slate-600 mb-3">{fmt(l.qty)} {l.purchase_uom} @ ₹{l.rate} + GST {l.gst_pct}% = ₹{inr(l.qty * l.rate * (1 + l.gst_pct / 100))}{l.delivery_date ? ` · due ${fmtDate(l.delivery_date)}` : ''}<br />
                {l.orders.length ? <>For {l.orders.map(o => <Link key={o.id} to={`/v3/sales-orders/${o.id}`} className="text-indigo-700 hover:underline mr-1">{o.order_no}</Link>)}{l.prs.length ? ` · ${l.prs.map(x => x.pr_no).join(', ')}` : ''}</> : `No requisition: ${l.extra_reason === 'ADVANCE' ? 'advance buy for an expected order' : (l.extra_reason || 'reason not given').toLowerCase()}`}<br />
                Over-receipt allowed without approval: {t.tolerance.over_pct ?? 5}% → {fmt(l.qty * (1 + (t.tolerance.over_pct ?? 5) / 100))} {l.purchase_uom}. Received {fmt(p.received)} ({l.qty ? `${Math.round(((p.received - l.qty) / l.qty) * 1000) / 10 > 0 ? '+' : ''}${Math.round(((p.received - l.qty) / l.qty) * 1000) / 10}%` : ''}).</p>
            <Section title="Received">
                <table className="w-full text-sm"><thead><tr><th className={th}>GRN</th><th className={th}>Date</th><th className={thr}>Accepted</th><th className={thr}>Rejected</th><th className={thr}>Billed</th></tr></thead><tbody>
                    {recs.map(({ g, x }) => <tr key={x.id} className={`border-t border-slate-100 ${g.status !== 'APPROVED' ? 'opacity-50' : ''}`}><td className={td}>{g.grn_no}{g.status !== 'APPROVED' ? ` (${GRN_STATUS[g.status]})` : ''}</td><td className={td}>{fmtDate(g.received_date)}</td><td className={tdr}>{fmt(x.accepted)}</td><td className={tdr}>{x.rejected ? fmt(x.rejected) : '—'}</td><td className={tdr}>{fmt(billedOf(x.id))}</td></tr>)}
                    <tr className="border-t-2 border-slate-300 font-black"><td className={td} colSpan={2}>Total</td><td className={tdr}>{fmt(p.received)}</td><td className={tdr}>{p.rejected ? fmt(p.rejected) : '—'}</td><td className={tdr}>{fmt(p.billed)}</td></tr>
                </tbody></table>
            </Section>
            <Section title="Billed">
                <table className="w-full text-sm"><thead><tr><th className={th}>Invoice</th><th className={th}>GRN</th><th className={thr}>Qty</th><th className={thr}>Taxable ₹</th></tr></thead><tbody>
                    {bills.length === 0 && <tr><td colSpan={4} className={`${td} text-slate-400`}>Not billed yet.</td></tr>}
                    {bills.map(({ i, x, g }) => <tr key={`${i.id}-${x.grn_line_id}`} className={`border-t border-slate-100 ${live(i) ? '' : 'opacity-50'}`}><td className={td}>{i.invoice_no}</td><td className={td}>{g.grn_no}</td><td className={tdr}>{fmt(x.qty)}</td><td className={tdr}>{inr(x.net_taxable)}</td></tr>)}
                    {bills.length > 0 && <tr className="border-t-2 border-slate-300 font-black"><td className={td} colSpan={2}>Total (live invoices)</td><td className={tdr}>{fmt(bills.filter(b => live(b.i)).reduce((s, b) => s + b.x.qty, 0))}</td><td className={tdr}>{inr(bills.filter(b => live(b.i)).reduce((s, b) => s + b.x.net_taxable, 0))}</td></tr>}
                </tbody></table>
            </Section>
        </>;
    } else if (n.kind === 'grn') {
        const g = n.grn; title = g.grn_no; link = `/v3/purchasing/grns/${g.id}`;
        const rolls = g.lines.flatMap(l => l.rolls.map(r => ({ ...r, l })));
        body = <>
            <p className="text-xs text-slate-600 mb-3">{GRN_STATUS[g.status] || g.status} · received {fmtDate(g.received_date)} by {g.received_by || '—'} · challan {g.challan_no || '—'}{g.challan_date ? ` of ${fmtDate(g.challan_date)}` : ''}{g.vehicle_no ? ` · vehicle ${g.vehicle_no}` : ''}{g.approved_at ? ` · approved ${fmtDate(g.approved_at)} by ${g.approved_by || '—'}` : ''}</p>
            {(g.approval_reasons || []).length > 0 && <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"><b>Over tolerance, approved by {g.approved_by || '—'}</b>{g.approval_note ? `: "${g.approval_note}"` : ' — no note'}<ul className="list-disc pl-4 mt-1">{g.approval_reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            <Section title="Lines">
                <table className="w-full text-sm"><thead><tr><th className={th}>PO line</th><th className={thr}>Accepted</th><th className={thr}>Rejected</th><th className={thr}>Returned</th><th className={thr}>Billed</th><th className={thr}>Value ₹</th></tr></thead><tbody>
                    {g.lines.map(l => { const ret = l.returns.filter(r => r.source === 'STOCK').reduce((s, r) => s + r.qty, 0); return <tr key={l.id} className="border-t border-slate-100 align-top"><td className={td}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.colour.get(l.po_line_id) }} />{l.po_line_no}. {l.label}{l.rejection_reason ? <span className="block text-[11px] text-rose-700">{l.rejection_reason}</span> : null}</td><td className={tdr}>{fmt(l.accepted)} {l.purchase_uom}</td><td className={tdr}>{l.rejected ? fmt(l.rejected) : '—'}</td><td className={tdr}>{ret ? fmt(ret) : '—'}</td><td className={tdr}>{fmt(billedOf(l.id))}</td><td className={tdr}>{inr(l.accepted * l.rate * (1 + l.gst_pct / 100))}</td></tr>; })}
                    <tr className="border-t-2 border-slate-300 font-black"><td className={td}>Total</td><td className={tdr}>{new Set(g.lines.map(l => l.purchase_uom)).size === 1 ? fmt(g.lines.reduce((s, l) => s + l.accepted, 0)) : '—'}</td><td className={tdr}>{fmt(g.lines.reduce((s, l) => s + l.rejected, 0))}</td><td /><td className={tdr}>{fmt(g.lines.reduce((s, l) => s + billedOf(l.id), 0))}</td><td className={tdr}>{inr(g.lines.reduce((s, l) => s + l.accepted * l.rate * (1 + l.gst_pct / 100), 0))}</td></tr>
                </tbody></table>
            </Section>
            {rolls.length > 0 && <Section title={`Rolls · ${rolls.length}`}>
                <table className="w-full text-sm"><thead><tr><th className={th}>Roll</th><th className={thr}>In</th><th className={thr}>Now</th><th className={th}>Went to</th></tr></thead><tbody>
                    {rolls.map((r, i) => <tr key={i} className="border-t border-slate-100 align-top"><td className={td}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.colour.get(r.l.po_line_id) }} />{r.roll_no}{r.dye_lot ? <span className="block text-[11px] text-slate-500">lot {r.dye_lot}</span> : null}</td><td className={tdr}>{fmt(r.qty_in)}</td><td className={tdr}>{r.status === 'IN_STOCK' ? fmt(r.qty_now) : <span className="text-slate-400">{(r.status || '').toLowerCase().replace('_', ' ')}</span>}</td>
                        <td className={`${td} text-xs`}>{r.issues.map(x => <span key={x.issue_id} className="block">{fmt(x.qty)} issued on <Link to={`/v3/material-issue/issues/${x.issue_id}`} className="text-indigo-700 hover:underline">{x.issue_no}</Link> to <Link to={`/v3/sales-orders/${x.order_id}`} className="text-indigo-700 hover:underline">{x.order_no}</Link></span>)}{r.status === 'IN_STOCK' && r.qty_now > 0 && <span className={`block ${r.allocated ? '' : 'text-amber-800 font-semibold'}`}>{fmt(r.qty_now)} in stock{r.allocated ? `, allocated to ${r.allocated.order_no}` : ', free'}</span>}</td></tr>)}
                    <tr className="border-t-2 border-slate-300 font-black"><td className={td}>Total</td><td className={tdr}>{fmt(rolls.reduce((s, r) => s + r.qty_in, 0))}</td><td className={tdr}>{fmt(rolls.filter(r => r.status === 'IN_STOCK').reduce((s, r) => s + r.qty_now, 0))}</td><td className={`${td} text-xs`}>issued {fmt(rolls.reduce((s, r) => s + r.issues.reduce((x, y) => x + y.qty, 0), 0))}</td></tr>
                </tbody></table>
            </Section>}
        </>;
    } else if (n.kind === 'inv') {
        const i = n.inv; title = `Invoice ${i.invoice_no}`; link = `/v3/purchasing/invoices/${i.id}`;
        const glOf = (id) => t.grns.flatMap(g => g.lines.map(l => ({ ...l, g }))).find(l => l.id === id);
        const st = i.status === 'CANCELLED' ? 'CANCELLED' : i.approval_status;
        body = <>
            <p className="text-xs text-slate-600 mb-2">Dated {fmtDate(i.invoice_date)} · {APPROVAL_STATUS[st]?.label}{i.status !== 'CANCELLED' ? ` · ${INVOICE_STATUS[i.status]?.label || i.status}` : ''}{i.warnings ? ` (${i.warnings} warning${i.warnings === 1 ? '' : 's'})` : ''} · entered by {i.created_by_name || '—'}{i.approved_at ? ` · approved ${fmtDate(i.approved_at)} by ${i.approved_by_name || '—'}` : ''}{i.other_pos.length ? ` · also bills ${i.other_pos.join(', ')}` : ''}</p>
            {i.hold_reason && i.approval_status === 'ON_HOLD' && <p className="mb-2 text-xs rounded bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1"><b>On hold:</b> {i.hold_reason}</p>}
            {i.override_note && <p className="mb-2 text-xs rounded bg-rose-50 border border-rose-200 text-rose-900 px-2 py-1"><b>Approved despite a mismatch:</b> {i.override_note}</p>}
            {i.cancelled_reason && <p className="mb-2 text-xs rounded bg-slate-50 border border-slate-200 px-2 py-1"><b>Cancelled:</b> {i.cancelled_reason}</p>}
            <Section title="Lines of this PO">
                <table className="w-full text-sm"><thead><tr><th className={th}>GRN · PO line</th><th className={thr}>Qty</th><th className={thr}>Rate ₹</th><th className={thr}>Taxable ₹</th><th className={thr}>GST</th></tr></thead><tbody>
                    {i.lines.map(l => { const gl = glOf(l.grn_line_id); return <tr key={l.grn_line_id} className="border-t border-slate-100"><td className={td}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.colour.get(gl?.po_line_id) }} />{gl?.g.grn_no} · L{gl?.po_line_no}</td><td className={tdr}>{fmt(l.qty)} {gl?.purchase_uom}</td><td className={tdr}>{inr(l.rate)}{l.discount_pct ? <span className="block text-[11px] text-slate-500">less {l.discount_pct}%</span> : null}</td><td className={tdr}>{inr(l.net_taxable)}</td><td className={tdr}>{l.gst_pct}%</td></tr>; })}
                    <tr className="border-t-2 border-slate-300 font-black"><td className={td}>Total</td><td className={tdr}>{new Set(i.lines.map(l => glOf(l.grn_line_id)?.purchase_uom)).size === 1 ? fmt(i.lines.reduce((s, l) => s + l.qty, 0)) : '—'}</td><td /><td className={tdr}>{inr(i.lines.reduce((s, l) => s + l.net_taxable, 0))}</td><td /></tr>
                </tbody></table>
            </Section>
            <Section title="Invoice totals">
                <table className="w-full text-sm"><tbody>
                    {i.discount_amount > 0 && <tr className="border-t border-slate-100"><td className={td}>Overall discount{i.discount_pct ? ` (${i.discount_pct}%)` : ''}</td><td className={tdr}>−{inr(i.discount_amount)}</td></tr>}
                    <tr className="border-t border-slate-100"><td className={td}>Taxable</td><td className={tdr}>{inr(i.taxable_amount)}</td></tr>
                    {(i.tax_type === 'INTER' ? [['IGST', i.igst_amount]] : [['CGST', i.cgst_amount], ['SGST', i.sgst_amount]]).map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className={td}>{k}</td><td className={tdr}>{inr(v)}</td></tr>)}
                    {i.tcs_amount ? <tr className="border-t border-slate-100"><td className={td}>TCS</td><td className={tdr}>{inr(i.tcs_amount)}</td></tr> : null}
                    {i.round_off_amount ? <tr className="border-t border-slate-100"><td className={td}>Round-off</td><td className={tdr}>{inr(i.round_off_amount)}</td></tr> : null}
                    <tr className="border-t-2 border-slate-300 font-black"><td className={td}>Total</td><td className={tdr}>{inr(i.total_amount)}</td></tr>
                </tbody></table>
            </Section>
            {(i.debit_notes || []).length > 0 && <Section title="Debit notes">
                <table className="w-full text-sm"><tbody>{i.debit_notes.map(d => <tr key={d.id} className="border-t border-slate-100"><td className={td}><Link to={`/v3/purchasing/debit-notes/${d.id}`} className="text-indigo-700 hover:underline">{d.debit_no}</Link> · {d.reason_code} · {d.status.toLowerCase()}</td><td className={tdr}>{inr(d.total)}</td></tr>)}
                    <tr className="border-t-2 border-slate-300 font-black"><td className={td}>Total</td><td className={tdr}>{inr(i.debit_notes.reduce((s, d) => s + d.total, 0))}</td></tr></tbody></table>
            </Section>}
        </>;
    } else if (n.kind === 'unbilled') {
        title = 'Not billed yet';
        const lines = n.items.map(x => x.id).join(',');
        body = <>
            <table className="w-full text-sm mb-3"><thead><tr><th className={th}>GRN · PO line</th><th className={thr}>Qty</th><th className={thr}>Value ₹ (with GST)</th></tr></thead><tbody>
                {n.items.map(x => <tr key={x.id} className="border-t border-slate-100"><td className={td}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.colour.get(x.po_line_id) }} />{x.grn.grn_no} · L{x.po_line_no}</td><td className={tdr}>{fmt(x.left)} {x.purchase_uom}</td><td className={tdr}>{inr(x.left * x.rate * (1 + x.gst_pct / 100))}</td></tr>)}
                <tr className="border-t-2 border-slate-300 font-black"><td className={td}>Total</td><td className={tdr}>{new Set(n.items.map(x => x.purchase_uom)).size === 1 ? fmt(n.items.reduce((s, x) => s + x.left, 0)) : '—'}</td><td className={tdr}>{inr(n.items.reduce((s, x) => s + x.left * x.rate * (1 + x.gst_pct / 100), 0))}</td></tr>
            </tbody></table>
            <Link to={`/v3/purchasing/invoices/new?supplier=${t.po.supplier_id}&lines=${lines}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"><Receipt size={13} /> Enter the invoice for these</Link>
        </>;
    } else {
        title = n.kind === 'order' ? n.order.order_no : { stock: 'In stock, free', trimstock: 'Into trim stock', storestock: 'Into store stock', returned: 'Returned to supplier', other: 'Used or adjusted without an issue slip' }[n.kind];
        if (n.kind === 'order') link = `/v3/sales-orders/${n.order.id}`;
        body = <table className="w-full text-sm"><thead><tr><th className={th}>GRN · roll</th><th className={th}>How</th><th className={thr}>Qty</th></tr></thead><tbody>
            {n.items.map((x, i) => <tr key={i} className="border-t border-slate-100"><td className={td}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: m.colour.get(x.gl.po_line_id) }} />{x.gl.grn.grn_no}{x.roll ? ` · roll ${x.roll.roll_no}` : ` · L${x.gl.po_line_no}`}</td><td className={`${td} text-xs`}>{x.how}{x.issue ? <> on <Link to={`/v3/material-issue/issues/${x.issue.issue_id}`} className="text-indigo-700 hover:underline">{x.issue.issue_no}</Link></> : null}{x.returns ? ` (${x.returns.map(r => r.rn_no).join(', ')})` : ''}</td><td className={tdr}>{fmt(x.qty)} {x.gl.purchase_uom}</td></tr>)}
            <tr className="border-t-2 border-slate-300 font-black"><td className={td} colSpan={2}>Total</td><td className={tdr}>{new Set(n.items.map(x => x.gl.purchase_uom)).size === 1 ? `${fmt(n.items.reduce((s, x) => s + x.qty, 0))} ${n.items[0].gl.purchase_uom}` : '—'}</td></tr>
        </tbody></table>;
    }
    return (
        <div className="fixed inset-0 z-40" role="dialog" aria-label={title}>
            <button type="button" className="absolute inset-0 bg-slate-900/20" onClick={onClose} aria-label="Close" />
            <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[560px] bg-white shadow-2xl overflow-y-auto p-4">
                <div className="flex items-center gap-2 mb-2"><h2 className="text-base font-black text-slate-900">{title}</h2>
                    {link && <Link to={link} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"><ExternalLink size={12} /> Open</Link>}
                    <button type="button" onClick={onClose} className="ml-auto p-1 rounded text-slate-500 hover:text-slate-800" aria-label="Close"><X size={18} /></button></div>
                {body}
            </aside>
        </div>
    );
}


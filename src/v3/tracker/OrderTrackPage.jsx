// One order in the tracker: the trail (BOM → materials → issue → cutting →
// production → milestones) with live numbers, the progress grid per order line
// (colour × size: ordered, cut, then garments cleared at each route stage, with
// rework / rejected), and what is behind each step — POs and GRNs, issue slips,
// cut batches and their stages, re-cuts, milestones. Links go to the page that
// owns each step, shown only to roles that can open it. Next steps: what waits
// in each phase and who does it — only the signed-in user's own steps, each a
// link to the page where the step is done (the tracker itself never acts).
// 20 Oct 2026 (Overview tables "bad UI"): every card is a coloured Section with a header row and a totals row;
// the line grid and Materials show a summary first — one row per colour / per material kind — and the detail
// (sizes / items) opens on tap; stage columns appear only once a batch reaches that stage.
// 27 Oct 2026: the cut batches card is now Batches × stages (BatchStages.jsx) — like 2.0's production workflow.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import OrderTabs from '../orders/OrderTabs';
import { ArrowRight } from 'lucide-react';
import { trackerApi } from '../api/trackerApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading, fmtQty } from '../components/ui';
import { Section, TONE, Caret } from '../components/Section';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { READY_STATUS, daysText } from '../planning/readinessShared';
import { useV3Access } from '../V3Access';
import { PHASES, RagChip } from './trackerShared';
import BatchStages from './BatchStages';

const lower = (s) => String(s || '').toLowerCase().replace(/_/g, ' ');
const MS_CLS = { DONE: 'text-emerald-700', DONE_LATE: 'text-amber-700', LATE: 'text-rose-700 font-bold', DUE: 'text-amber-700', UPCOMING: 'text-slate-600', NO_DATE: 'text-slate-400', NA: 'text-slate-400' };

const TH = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider';
const isPast = (d) => d && new Date(d) < new Date(new Date().toDateString());

function StepLink({ s, compact }) {
    return (
        <Link to={s.to} title={`${s.who}${s.detail ? ` — ${s.detail}` : ''}`}
            className={`flex items-start gap-1 text-indigo-700 hover:text-indigo-900 font-semibold ${compact ? 'mt-1.5 text-[11px]' : 'text-sm'}`}>
            <ArrowRight size={compact ? 12 : 14} className="shrink-0 mt-0.5" />
            <span>{s.label}{!compact && s.detail ? <span className="font-normal text-slate-500"> · {s.detail}</span> : null}</span>
        </Link>
    );
}

const ZERO = { done: 0, rework: 0, rejected: 0 };
const StageCell = ({ c, of }) => (
    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
        <span className={c.done && c.done >= of ? 'text-emerald-700 font-bold' : ''}>{c.done ? fmtQty(c.done) : ''}</span>
        {c.rework > 0 && <span className="ml-1 text-[11px] text-amber-700" title="in rework">↻{c.rework}</span>}
        {c.rejected > 0 && <span className="ml-1 text-[11px] text-rose-700" title="rejected">✗{c.rejected}</span>}
    </td>
);

// Order line progress: one row per colour (ordered, cut, garments cleared at each stage reached), tap a colour for
// its sizes; nothing cut yet → the ordered quantities as a colour × size table.
function LineGrid({ line }) {
    const [open, setOpen] = useState(null);
    const t0 = TONE.emerald;
    const colours = [...new Map(line.rows.map(r => [r.garment_colour_id, r.colour])).entries()];
    const sizes = [...new Map(line.rows.map(r => [r.size_id, r.size])).entries()];
    const rowsOf = (cid) => line.rows.filter(r => r.garment_colour_id === cid);
    const reached = (c) => c && (c.done || c.rework || c.rejected);
    const stages = line.route.filter(s => reached(line.total.stages[s.stage_type_id]));
    const waiting = line.route.filter(s => !reached(line.total.stages[s.stage_type_id]));
    const stageName = (s) => (s.name === 'Cutting' ? 'Numbering' : s.name);
    const agg = (rows) => ({
        ordered: rows.reduce((a, r) => a + r.ordered, 0),
        cut: rows.reduce((a, r) => a + (r.cut || 0), 0),
        stages: Object.fromEntries(line.route.map(s => [s.stage_type_id, rows.reduce((a, r) => {
            const c = r.stages[s.stage_type_id] || ZERO; return { done: a.done + c.done, rework: a.rework + c.rework, rejected: a.rejected + c.rejected };
        }, { ...ZERO })])),
    });

    if (!line.total.cut && !stages.length) {   // nothing cut: what is ordered, colour × size
        const qty = (cid, sid) => line.rows.find(r => r.garment_colour_id === cid && r.size_id === sid)?.ordered;
        return (
            <div className="overflow-x-auto">
                <p className="px-4 pt-2.5 pb-1.5 text-sm text-slate-600"><b>Not cut yet</b> — {fmtQty(line.total.ordered)} garments ordered ({colours.length} colours × {sizes.length} sizes).</p>
                <table className="w-full text-sm">
                    <thead className={`${t0.head} text-left`}><tr><th className={TH}>Colour</th>{sizes.map(([sid, s]) => <th key={sid} className={`${TH} text-right`}>{s}</th>)}<th className={`${TH} text-right border-l border-slate-200`}>Ordered</th></tr></thead>
                    <tbody>{colours.map(([cid, c]) => (
                        <tr key={cid} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 font-semibold">{c}</td>
                            {sizes.map(([sid]) => <td key={sid} className="px-3 py-1.5 text-right tabular-nums">{qty(cid, sid) != null ? fmtQty(qty(cid, sid)) : <span className="text-slate-300">—</span>}</td>)}
                            <td className="px-3 py-1.5 text-right tabular-nums font-bold border-l border-slate-200">{fmtQty(agg(rowsOf(cid)).ordered)}</td>
                        </tr>
                    ))}</tbody>
                    <tfoot className={`${t0.foot} border-t-2 font-bold`}><tr>
                        <td className="px-3 py-2">Total</td>
                        {sizes.map(([sid]) => <td key={sid} className="px-3 py-2 text-right tabular-nums">{fmtQty(line.rows.filter(r => r.size_id === sid).reduce((a, r) => a + r.ordered, 0))}</td>)}
                        <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">{fmtQty(line.total.ordered)}</td>
                    </tr></tfoot>
                </table>
            </div>
        );
    }

    const cutCls = (cut, ordered) => (cut >= ordered && ordered ? 'text-emerald-700 font-bold' : '');
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
                <thead className={`${t0.head} text-left`}>
                    <tr><th className={TH}>Colour</th><th className={`${TH} text-right`}>Ordered</th><th className={`${TH} text-right`}>Cut</th>
                        {stages.map(s => <th key={s.stage_type_id} className={`${TH} text-right`}>{stageName(s)}</th>)}</tr>
                </thead>
                <tbody>
                    {colours.map(([cid, c]) => {
                        const rows = rowsOf(cid); const t = agg(rows); const isOpen = open === cid;
                        return [
                            <tr key={cid} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => setOpen(isOpen ? null : cid)}>
                                <td className="px-3 py-1.5 font-semibold whitespace-nowrap"><button type="button" className="inline-flex items-center gap-1" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} ${c} sizes`}><Caret open={isOpen} />{c}</button><span className="ml-1.5 text-[11px] font-normal text-slate-400">{rows.length} sizes</span></td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(t.ordered)}</td>
                                <td className={`px-2 py-1.5 text-right tabular-nums ${cutCls(t.cut, t.ordered)}`}>{t.cut ? fmtQty(t.cut) : ''}</td>
                                {stages.map(s => <StageCell key={s.stage_type_id} c={t.stages[s.stage_type_id]} of={t.ordered} />)}
                            </tr>,
                            ...(isOpen ? rows.map(r => (
                                <tr key={`${cid}-${r.size_id}`} className="bg-slate-50 text-xs">
                                    <td className="pl-8 pr-3 py-1 text-slate-600 font-semibold">Size {r.size}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{fmtQty(r.ordered)}</td>
                                    <td className={`px-2 py-1 text-right tabular-nums ${cutCls(r.cut, r.ordered)}`}>{r.cut ? fmtQty(r.cut) : ''}</td>
                                    {stages.map(s => <StageCell key={s.stage_type_id} c={r.stages[s.stage_type_id] || ZERO} of={r.ordered} />)}
                                </tr>
                            )) : []),
                        ];
                    })}
                </tbody>
                <tfoot className={`${t0.foot} border-t-2 font-bold`}><tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtQty(line.total.ordered)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${cutCls(line.total.cut, line.total.ordered)}`}>{fmtQty(line.total.cut)}</td>
                    {stages.map(s => <StageCell key={s.stage_type_id} c={line.total.stages[s.stage_type_id] || ZERO} of={line.total.ordered} />)}
                </tr></tfoot>
            </table>
            {waiting.length > 0 && <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Not reached yet: {waiting.map(stageName).join(' → ')} — their columns appear when the first garments get there.</p>}
        </div>
    );
}

// Materials not ready: one row per kind (fabric / trims) — items short, part allocated, on order, to raise,
// needed by — with a Total row; tap a kind for its items (to raise first).
const KIND_LABEL = { FABRIC: 'Fabric', TRIM: 'Trims' };
function MaterialsTable({ blockers, L }) {
    const [open, setOpen] = useState(null);
    const t0 = TONE.amber;
    const kinds = [...new Set(blockers.map(b => b.kind))];
    const stat = (list) => ({
        items: list.length,
        part: list.filter(b => b.allocated + b.issued > 0).length,
        onOrder: list.filter(b => b.pr_approved > 0).length,
        raise: list.filter(b => b.to_raise > 0).length,
        dates: [...new Set(list.map(b => b.needed_by).filter(Boolean))].sort(),
    });
    const all = stat(blockers);
    const needCell = (dates) => (!dates.length ? '—' : <span className={isPast(dates[0]) ? 'text-rose-700 font-semibold' : ''}>{fmtDate(dates[0])}{dates.length > 1 ? ` – ${fmtDate(dates[dates.length - 1])}` : ''}{isPast(dates[0]) ? ' · late' : ''}</span>);
    const num = (v, cls = '') => <td className={`px-3 py-1.5 text-right tabular-nums ${v ? cls : 'text-slate-300'}`}>{v || '—'}</td>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
                <thead className={`${t0.head} text-left`}><tr><th className={TH}>Material</th><th className={`${TH} text-right`}>Short items</th><th className={`${TH} text-right`}>Part allocated</th><th className={`${TH} text-right`}>On order</th><th className={`${TH} text-right`}>To raise</th><th className={`${TH} text-right`}>Needed by</th></tr></thead>
                <tbody>
                    {kinds.map(k => {
                        const list = blockers.filter(b => b.kind === k);
                        const s = stat(list); const isOpen = open === k;
                        const items = [...list].sort((a, b) => (b.to_raise > 0) - (a.to_raise > 0) || a.label.localeCompare(b.label));
                        return [
                            <tr key={k} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => setOpen(isOpen ? null : k)}>
                                <td className="px-3 py-1.5 font-semibold"><button type="button" className="inline-flex items-center gap-1" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} ${KIND_LABEL[k] || lower(k)} items`}><Caret open={isOpen} />{KIND_LABEL[k] || lower(k)}</button></td>
                                {num(s.items, 'font-bold')}{num(s.part)}{num(s.onOrder)}{num(s.raise, 'text-rose-700 font-bold')}
                                <td className="px-3 py-1.5 text-right text-xs whitespace-nowrap">{needCell(s.dates)}</td>
                            </tr>,
                            ...(isOpen ? [
                                <tr key={`${k}-head`} className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    <td className="pl-8 pr-3 pt-2 pb-1">Item</td><td className="px-3 pt-2 pb-1 text-right">Required</td><td className="px-3 pt-2 pb-1 text-right">Allocated + issued</td><td className="px-3 pt-2 pb-1 text-right">On order</td><td className="px-3 pt-2 pb-1 text-right">To raise</td><td className="px-3 pt-2 pb-1 text-right">{s.dates.length > 1 ? 'Needed by' : ''}</td>
                                </tr>,
                                ...items.map(b => (
                                    <tr key={`${b.kind}:${b.item_id}`} className="bg-slate-50 text-xs border-t border-slate-100/70">
                                        <td className="pl-8 pr-3 py-1"><L to={`/v3/planning/position/${b.kind}/${b.item_id}`} k="planning.position">{b.label}</L></td>
                                        <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap">{fmtQty(b.required)} {b.uom}</td>
                                        <td className="px-3 py-1 text-right tabular-nums">{b.allocated + b.issued ? fmtQty(b.allocated + b.issued) : <span className="text-slate-300">—</span>}</td>
                                        <td className="px-3 py-1 text-right tabular-nums">{b.pr_approved ? fmtQty(b.pr_approved) : <span className="text-slate-300">—</span>}{b.pr_pending ? <span className="block text-[10px] text-slate-500">{fmtQty(b.pr_pending)} PR pending</span> : null}</td>
                                        <td className={`px-3 py-1 text-right tabular-nums ${b.to_raise ? 'text-rose-700 font-bold' : 'text-slate-300'}`}>{b.to_raise ? fmtQty(b.to_raise) : '—'}</td>
                                        <td className="px-3 py-1 text-right whitespace-nowrap">{s.dates.length > 1 && b.needed_by ? fmtDate(b.needed_by) : ''}</td>
                                    </tr>
                                )),
                            ] : []),
                        ];
                    })}
                </tbody>
                <tfoot className={`${t0.foot} border-t-2 font-bold`}><tr>
                    <td className="px-3 py-2">Total</td>
                    {[all.items, all.part, all.onOrder].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{v}</td>)}
                    <td className={`px-3 py-2 text-right tabular-nums ${all.raise ? 'text-rose-700' : ''}`}>{all.raise}</td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">{needCell(all.dates)}</td>
                </tr></tfoot>
            </table>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Counts of items not yet fully allocated — tap fabric or trims for the items, those still to raise first.</p>
        </div>
    );
}

export default function OrderTrackPage() {
    const { id } = useParams();
    const { me } = useV3Access();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { setD(null); trackerApi.order(id).then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load the order.'))); }, [id]);
    if (!d) return error ? <div><Link to="/v3/tracker" className="text-sm font-semibold text-slate-500">← Order tracker</Link><ErrorBox text={error} /></div> : <Loading />;
    const can = (k) => Boolean(me.menu[k]);
    const L = ({ to, k, children }) => (can(k) ? <Link to={to} className="font-semibold text-indigo-700 hover:underline">{children}</Link> : <span className="font-semibold">{children}</span>);

    return (
        <div>
            <OrderTabs orderId={id} active="overview" />
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">{d.order_no} <RagChip rag={d.rag}>{lower(d.rag)}</RagChip></h1>
                    <p className="text-sm text-slate-500">{d.customer_name}{d.buyer_po_no ? ` · buyer PO ${d.buyer_po_no}` : ''} · {d.styles} · ordered {fmtDate(d.order_date)}</p>
                </div>
                <div className="ml-auto text-right">
                    <p className={`text-sm font-bold ${d.days_to_ship != null && d.days_to_ship < 0 ? 'text-rose-700' : 'text-slate-800'}`}>Ship {fmtDate(d.ship_date)} · {daysText(d.days_to_ship)}</p>
                    <p className="text-xs text-slate-500">{d.ordered} ordered · {d.cut} cut</p>
                    <span className="text-xs space-x-2">{can('sales.orders') && <Link to={`/v3/sales-orders/${d.order_id}`} className="text-indigo-700 underline">Sales order</Link>}{can('planning.requirements') && <Link to={`/v3/planning/orders/${d.order_id}`} className="text-indigo-700 underline">Requirements</Link>}{can('production.insightsCost') && <Link to={`/v3/insights/cost/${d.order_id}`} className="text-indigo-700 underline">Material cost</Link>}</span>
                </div>
            </div>

            {d.next_steps.length > 0 && (
                <Section tone="indigo" title="Your next steps" right={`${d.next_steps.length}`} className="mb-4">
                    <div className="px-4 py-2 flex flex-col gap-1">{d.next_steps.map((s, j) => <StepLink key={j} s={s} />)}</div>
                </Section>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-6">
                {PHASES.map((p, i) => (
                    <div key={p.key} className="bg-white border border-slate-200 rounded-xl p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{i + 1}. {p.label}</p>
                        <RagChip rag={d.phases[p.key].rag}>{p.key === 'materials' && d.materials ? READY_STATUS[d.materials.status]?.label || d.materials.status : lower(d.phases[p.key].rag === 'GREY' ? 'not started' : d.phases[p.key].rag)}</RagChip>
                        <p className="text-xs text-slate-600 mt-1">{d.phases[p.key].text}</p>
                        {d.next_steps.filter(s => s.phase === p.key).map((s, j) => <StepLink key={j} s={s} compact />)}
                    </div>
                ))}
            </div>

            {d.lines.map(l => (
                <Section key={l.line_id} tone="emerald" title={`Line ${l.line_no} · ${l.style_code} — ${l.style_name}`}
                    subtitle={l.total.cut || l.total.stages && Object.keys(l.total.stages).length ? 'tap a colour for its sizes' : null}
                    right={<span>ship {fmtDate(l.ship_date)} · BOM v{l.bom_version}{l.bom_outdated ? <span className="text-amber-700"> (v{l.current_bom_version} approved)</span> : ''}</span>}>
                    <LineGrid line={l} />
                    <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Garments cleared at each stage (piece stages: all its parts cleared there). ↻ in rework, ✗ rejected. Green = the ordered quantity reached.</p>
                </Section>
            ))}

            <Section tone="amber" title="Materials" right={d.materials ? `${d.materials.items_allocated}/${d.materials.items_total} allocated${d.materials.needed_by ? ` · needed by ${fmtDate(d.materials.needed_by)}` : ''}` : ''}>
                {!d.materials || !d.materials.blockers.length ? <p className="px-4 py-3 text-sm text-slate-500">{d.materials ? 'All materials allocated or issued.' : 'No requirements.'}</p> : <MaterialsTable blockers={d.materials.blockers} L={L} />}
                {d.materials?.override && <p className="px-3 py-1.5 text-xs text-amber-800 border-t border-slate-100">Cutting released by override: {d.materials.override.reason}</p>}
            </Section>

            <div className="grid lg:grid-cols-2 gap-x-4">
                <Section tone="violet" title="Purchasing" right={`${d.purchase_orders.length} PO · ${d.grns.length} GRN`}>
                    {!d.purchase_orders.length ? <p className="px-4 py-3 text-sm text-slate-500">No purchase orders for this order (from stock).</p> : (
                        <table className="w-full text-sm">
                            <thead className={`${TONE.violet.head} text-left`}><tr><th className={TH}>Purchase order · supplier</th><th className={`${TH} text-right`}>Status · due</th></tr></thead>
                            <tbody>{d.purchase_orders.map(p => (
                                <tr key={p.id} className="border-t border-slate-100">
                                    <td className="px-3 py-1.5"><L to={`/v3/purchasing/orders/${p.id}`} k="purchasing.orders">{p.po_no}</L><span className="block text-[11px] text-slate-500">{p.supplier} · {p.items}</span></td>
                                    <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap">{lower(p.status)}{p.delivery_date ? <span className={`block ${isPast(p.delivery_date) && !/received|closed/i.test(p.status) ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>due {fmtDate(p.delivery_date)}</span> : null}</td>
                                </tr>
                            ))}</tbody>
                            <tfoot className={`${TONE.violet.foot} border-t-2 font-bold text-xs`}><tr><td className="px-3 py-2">Total · {d.purchase_orders.length} PO{d.purchase_orders.length === 1 ? '' : 's'}</td><td className="px-3 py-2 text-right">{d.grns.length} GRN{d.grns.length === 1 ? '' : 's'} received</td></tr></tfoot>
                        </table>
                    )}
                    {d.grns.length > 0 && <p className="px-3 py-1.5 text-xs border-t border-slate-100">GRNs: {d.grns.map((g, i) => <span key={g.id}>{i ? ', ' : ''}<L to={`/v3/purchasing/grns/${g.id}`} k="purchasing.grns">{g.grn_no}</L> ({lower(g.status)}, {fmtDate(g.received_date)})</span>)}</p>}
                </Section>
                <Section tone="slate" title="Milestones" right={(() => { const late = d.milestones.filter(m => m.status === 'LATE').length; return late ? <span className="text-rose-700">{late} late</span> : null; })()}>
                    <table className="w-full text-sm">
                        <thead className={`${TONE.slate.head} text-left`}><tr><th className={TH}>Milestone</th><th className={`${TH} text-right`}>Plan · done</th><th className={`${TH} text-right`}>Status</th></tr></thead>
                        <tbody>{d.milestones.map(m => (
                            <tr key={m.code} className="border-t border-slate-100">
                                <td className="px-3 py-1.5">{m.name}</td>
                                <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap">plan {fmtDate(m.planned)}{m.actual ? ` · done ${fmtDate(m.actual)}` : ''}</td>
                                <td className={`px-3 py-1.5 text-xs text-right ${MS_CLS[m.status] || ''}`}>{lower(m.status)}{m.days_late ? ` (${m.days_late}d)` : ''}</td>
                            </tr>
                        ))}</tbody>
                        <tfoot className={`${TONE.slate.foot} border-t-2 font-bold text-xs`}><tr>
                            <td className="px-3 py-2">Total · {d.milestones.length}</td>
                            <td className="px-3 py-2 text-right" colSpan={2}>{['DONE', 'DONE_LATE', 'LATE', 'DUE', 'UPCOMING'].map(st => [st, d.milestones.filter(m => m.status === st).length]).filter(([, n]) => n).map(([st, n]) => <span key={st} className={`ml-2 ${MS_CLS[st]}`}>{n} {lower(st)}</span>)}</td>
                        </tr></tfoot>
                    </table>
                </Section>
                {/* hidden while material issue is switched off (16 Oct 2026) */}
                {!(me.hidden || []).includes('issue.materialIssue') && (
                <Section tone="sky" title="Material issue" right={`${d.issues.length} slip(s)`}>
                    {!d.issues.length ? <p className="px-4 py-3 text-sm text-slate-500">Nothing issued yet.</p> : (
                        <table className="w-full text-sm">
                            <thead className={`${TONE.sky.head} text-left`}><tr><th className={TH}>Issue slip · to</th><th className={`${TH} text-right`}>Date</th></tr></thead>
                            <tbody>{d.issues.map(s => (
                                <tr key={s.id} className="border-t border-slate-100">
                                    <td className="px-3 py-1.5"><L to={`/v3/material-issue/issues/${s.id}`} k="issue.materialIssue">{s.issue_no}</L><span className="block text-[11px] text-slate-500">to {s.stage || '—'}{s.batch_code ? ` · batch ${s.batch_code}` : ''} · {s.lines} line(s)</span></td>
                                    <td className="px-3 py-1.5 text-xs text-right">{fmtDate(s.issue_date)}</td>
                                </tr>
                            ))}</tbody>
                            <tfoot className={`${TONE.sky.foot} border-t-2 font-bold text-xs`}><tr><td className="px-3 py-2">Total · {d.issues.length} slip{d.issues.length === 1 ? '' : 's'}</td><td className="px-3 py-2 text-right">{d.issues.reduce((a, s) => a + (Number(s.lines) || 0), 0)} line(s)</td></tr></tfoot>
                        </table>
                    )}
                </Section>
                )}
            </div>

            {/* Batches × stages (27 Oct 2026) — replaces the stage status chips: done / total per stage, line, rework,
                stuck, and the rolls / sizes of each stage on tap. */}
            <BatchStages orderId={id} can={can} />
        </div>
    );
}

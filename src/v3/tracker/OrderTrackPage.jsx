// One order in the tracker: the trail (BOM → materials → issue → cutting →
// production → milestones) with live numbers, the progress grid per order line
// (colour × size: ordered, cut, then garments cleared at each route stage, with
// rework / rejected), and what is behind each step — POs and GRNs, issue slips,
// cut batches and their stages, re-cuts, milestones. Links go to the page that
// owns each step, shown only to roles that can open it. Next steps: what waits
// in each phase and who does it — only the signed-in user's own steps, each a
// link to the page where the step is done (the tracker itself never acts).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { trackerApi } from '../api/trackerApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { READY_STATUS, daysText } from '../planning/readinessShared';
import { useV3Access } from '../V3Access';
import { PHASES, RagChip } from './trackerShared';

const lower = (s) => String(s || '').toLowerCase().replace(/_/g, ' ');
const STAGE_CLS = { COMPLETED: 'bg-emerald-100 text-emerald-800', IN_PROGRESS: 'bg-amber-100 text-amber-800', PENDING: 'bg-slate-100 text-slate-500' };
const MS_CLS = { DONE: 'text-emerald-700', DONE_LATE: 'text-amber-700', LATE: 'text-rose-700 font-bold', DUE: 'text-amber-700', UPCOMING: 'text-slate-600', NO_DATE: 'text-slate-400', NA: 'text-slate-400' };

function Box({ title, children, right }) {
    return (
        <section className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
            <p className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-500 bg-slate-50 flex items-center">{title}<span className="ml-auto normal-case font-semibold">{right}</span></p>
            {children}
        </section>
    );
}

function StepLink({ s, compact }) {
    return (
        <Link to={s.to} title={`${s.who}${s.detail ? ` — ${s.detail}` : ''}`}
            className={`flex items-start gap-1 text-indigo-700 hover:text-indigo-900 font-semibold ${compact ? 'mt-1.5 text-[11px]' : 'text-sm'}`}>
            <ArrowRight size={compact ? 12 : 14} className="shrink-0 mt-0.5" />
            <span>{s.label}{!compact && s.detail ? <span className="font-normal text-slate-500"> · {s.detail}</span> : null}</span>
        </Link>
    );
}

function Grid({ line }) {
    const stages = line.route;
    const cellOf = (r, s) => r.stages[s.stage_type_id] || { done: 0, rework: 0, rejected: 0 };
    const Cell = ({ c, of }) => (
        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
            <span className={c.done && c.done >= of ? 'text-emerald-700 font-bold' : ''}>{c.done || ''}</span>
            {c.rework > 0 && <span className="ml-1 text-[11px] text-amber-700" title="in rework">↻{c.rework}</span>}
            {c.rejected > 0 && <span className="ml-1 text-[11px] text-rose-700" title="rejected">✗{c.rejected}</span>}
        </td>
    );
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
                <thead className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr><th className="px-3 py-1.5">Colour</th><th className="px-2 py-1.5">Size</th><th className="px-2 py-1.5 text-right">Ordered</th><th className="px-2 py-1.5 text-right">Cut</th>
                        {stages.map(s => <th key={s.stage_type_id} className="px-2 py-1.5 text-right">{s.name === 'Cutting' ? 'Numbering' : s.name}</th>)}</tr>
                </thead>
                <tbody>
                    {line.rows.map(r => (
                        <tr key={`${r.garment_colour_id}-${r.size_id}`} className="border-t border-slate-50">
                            <td className="px-3 py-1.5">{r.colour}</td><td className="px-2 py-1.5">{r.size}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.ordered}</td>
                            <td className={`px-2 py-1.5 text-right tabular-nums ${r.cut >= r.ordered && r.ordered ? 'text-emerald-700 font-bold' : ''}`}>{r.cut || ''}</td>
                            {stages.map(s => <Cell key={s.stage_type_id} c={cellOf(r, s)} of={r.ordered} />)}
                        </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                        <td className="px-3 py-1.5" colSpan={2}>Total</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{line.total.ordered}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{line.total.cut}</td>
                        {stages.map(s => <Cell key={s.stage_type_id} c={line.total.stages[s.stage_type_id] || { done: 0, rework: 0, rejected: 0 }} of={line.total.ordered} />)}
                    </tr>
                </tbody>
            </table>
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
            <Link to="/v3/tracker" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={14} /> Order tracker</Link>
            <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">{d.order_no} <RagChip rag={d.rag}>{lower(d.rag)}</RagChip></h1>
                    <p className="text-sm text-slate-500">{d.customer_name}{d.buyer_po_no ? ` · buyer PO ${d.buyer_po_no}` : ''} · {d.styles} · ordered {fmtDate(d.order_date)}</p>
                </div>
                <div className="ml-auto text-right">
                    <p className={`text-sm font-bold ${d.days_to_ship != null && d.days_to_ship < 0 ? 'text-rose-700' : 'text-slate-800'}`}>Ship {fmtDate(d.ship_date)} · {daysText(d.days_to_ship)}</p>
                    <p className="text-xs text-slate-500">{d.ordered} ordered · {d.cut} cut</p>
                    <span className="text-xs space-x-2">{can('sales.orders') && <Link to={`/v3/sales-orders/${d.order_id}`} className="text-indigo-700 underline">Sales order</Link>}{can('planning.requirements') && <Link to={`/v3/planning/orders/${d.order_id}`} className="text-indigo-700 underline">Requirements</Link>}</span>
                </div>
            </div>

            {d.next_steps.length > 0 && (
                <Box title="Your next steps" right={`${d.next_steps.length}`}>
                    <div className="px-3 py-2 flex flex-col gap-1">{d.next_steps.map((s, j) => <StepLink key={j} s={s} />)}</div>
                </Box>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-4">
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
                <Box key={l.line_id} title={`Line ${l.line_no} · ${l.style_code} — ${l.style_name}`}
                    right={<span className="text-xs">ship {fmtDate(l.ship_date)} · BOM v{l.bom_version}{l.bom_outdated ? <span className="text-amber-700"> (v{l.current_bom_version} approved)</span> : ''}</span>}>
                    <Grid line={l} />
                    <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Garments cleared at each stage (piece stages: all its parts cleared there). ↻ in rework, ✗ rejected. Green = the ordered quantity reached.</p>
                </Box>
            ))}

            <div className="grid lg:grid-cols-2 gap-4">
                <Box title="Materials" right={d.materials ? `${d.materials.items_allocated}/${d.materials.items_total} allocated${d.materials.needed_by ? ` · needed by ${fmtDate(d.materials.needed_by)}` : ''}` : ''}>
                    {!d.materials || !d.materials.blockers.length ? <p className="px-3 py-3 text-sm text-slate-500">{d.materials ? 'All materials allocated or issued.' : 'No requirements.'}</p> : (
                        <table className="w-full text-sm"><tbody>{d.materials.blockers.map(b => (
                            <tr key={`${b.kind}:${b.item_id}`} className="border-t border-slate-100">
                                <td className="px-3 py-1.5"><L to={`/v3/planning/position/${b.kind}/${b.item_id}`} k="planning.position">{b.label}</L><span className="block text-[11px] text-slate-500">{lower(b.kind)}{b.needed_by ? ` · needed by ${fmtDate(b.needed_by)}` : ''}</span></td>
                                <td className="px-3 py-1.5 text-right text-xs tabular-nums whitespace-nowrap">{b.allocated + b.issued} / {b.required} {b.uom}{b.pr_approved ? ` · ${b.pr_approved} on order` : ''}{b.to_raise ? <span className="text-rose-700"> · {b.to_raise} to raise</span> : ''}</td>
                            </tr>
                        ))}</tbody></table>
                    )}
                    {d.materials?.override && <p className="px-3 py-1.5 text-xs text-amber-800 border-t border-slate-100">Cutting released by override: {d.materials.override.reason}</p>}
                </Box>
                <Box title="Purchasing" right={`${d.purchase_orders.length} PO · ${d.grns.length} GRN`}>
                    {!d.purchase_orders.length ? <p className="px-3 py-3 text-sm text-slate-500">No purchase orders for this order (from stock).</p> : (
                        <table className="w-full text-sm"><tbody>{d.purchase_orders.map(p => (
                            <tr key={p.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5"><L to={`/v3/purchasing/orders/${p.id}`} k="purchasing.orders">{p.po_no}</L><span className="block text-[11px] text-slate-500">{p.supplier} · {p.items}</span></td>
                                <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap">{lower(p.status)}{p.delivery_date ? <span className="block text-slate-500">due {fmtDate(p.delivery_date)}</span> : null}</td>
                            </tr>
                        ))}</tbody></table>
                    )}
                    {d.grns.length > 0 && <p className="px-3 py-1.5 text-xs border-t border-slate-100">GRNs: {d.grns.map((g, i) => <span key={g.id}>{i ? ', ' : ''}<L to={`/v3/purchasing/grns/${g.id}`} k="purchasing.grns">{g.grn_no}</L> ({lower(g.status)}, {fmtDate(g.received_date)})</span>)}</p>}
                </Box>
                <Box title="Material issue" right={`${d.issues.length} slip(s)`}>
                    {!d.issues.length ? <p className="px-3 py-3 text-sm text-slate-500">Nothing issued yet.</p> : (
                        <table className="w-full text-sm"><tbody>{d.issues.map(s => (
                            <tr key={s.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5"><L to={`/v3/material-issue/issues/${s.id}`} k="issue.materialIssue">{s.issue_no}</L><span className="block text-[11px] text-slate-500">to {s.stage || '—'}{s.batch_code ? ` · batch ${s.batch_code}` : ''} · {s.lines} line(s)</span></td>
                                <td className="px-3 py-1.5 text-xs text-right">{fmtDate(s.issue_date)}</td>
                            </tr>
                        ))}</tbody></table>
                    )}
                </Box>
                <Box title="Milestones">
                    <table className="w-full text-sm"><tbody>{d.milestones.map(m => (
                        <tr key={m.code} className="border-t border-slate-100">
                            <td className="px-3 py-1.5">{m.name}</td>
                            <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap">plan {fmtDate(m.planned)}{m.actual ? ` · done ${fmtDate(m.actual)}` : ''}</td>
                            <td className={`px-3 py-1.5 text-xs text-right ${MS_CLS[m.status] || ''}`}>{lower(m.status)}{m.days_late ? ` (${m.days_late}d)` : ''}</td>
                        </tr>
                    ))}</tbody></table>
                </Box>
            </div>

            <Box title="Cut batches" right={`${d.batches.length} batch(es)${d.recuts.OPEN ? ` · ${d.recuts.OPEN} re-cut(s) open` : ''}`}>
                {!d.batches.length ? <p className="px-3 py-3 text-sm text-slate-500">No cut batches yet.</p> : (
                    <table className="w-full text-sm"><tbody>{d.batches.map(b => (
                        <tr key={b.id} className="border-t border-slate-100 align-top">
                            <td className="px-3 py-1.5 whitespace-nowrap"><L to={`/v3/cutting/batches/${b.id}`} k="production.cutting">{b.batch_code}</L><span className="block text-[11px] text-slate-500">line {b.line_no} · {lower(b.status)} · {b.garments} garments</span></td>
                            <td className="px-3 py-1.5"><span className="flex flex-wrap gap-1">{b.stages.length ? b.stages.map(s => (
                                <span key={s.name} className={`text-[11px] px-1.5 py-0.5 rounded ${STAGE_CLS[s.status] || STAGE_CLS.PENDING}`} title={s.line || ''}>{s.name === 'Cutting' ? 'Numbering' : s.name}: {lower(s.status)}</span>
                            )) : <span className="text-xs text-slate-400">stages start when the batch is finalised</span>}</span></td>
                        </tr>
                    ))}</tbody></table>
                )}
            </Box>
        </div>
    );
}

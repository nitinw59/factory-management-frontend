// Order tracker → Production (27 Oct 2026, owner: "how can merchandiser track batches on each stage for sales order
// like we had production workflow in 2.0" → "build all"): every order with the garments through each route stage
// (of what is cut), dispatched, and what needs a look — batches stuck (work on the line, no check for a shift), rework
// older than a shift, open re-cuts and replacements, late milestones. Worst first. Tap an order for its batches ×
// stages.
import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackerApi } from '../api/trackerApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading, fmtQty } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { daysText } from '../planning/readinessShared';
import { Dot } from './trackerShared';

const TH = 'px-2 py-2';
const stageName = (s) => (s.name === 'Cutting' ? 'Numbering' : s.name);
const pctOf = (d, t) => (t > 0 ? Math.min(100, Math.floor((d / t) * 100)) : 0);

export default function ProductionOrders({ state, filter, mine, rag, onCounts }) {
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        setD(null); setError('');
        trackerApi.production({ state, q: filter || undefined, created: mine ? 'me' : undefined })
            .then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load production.')));
    }, [state, filter, mine]);
    useEffect(() => {
        if (d) onCounts?.({ RED: d.orders.filter(o => o.rag === 'RED').length, AMBER: d.orders.filter(o => o.rag === 'AMBER').length, GREEN: d.orders.filter(o => o.rag === 'GREEN').length });
    }, [d, onCounts]);

    if (error) return <ErrorBox text={error} />;
    if (!d) return <Loading />;
    const rows = rag ? d.orders.filter(o => o.rag === rag) : d.orders;
    // Stage columns: every stage of the orders' routes, in route order (stages are shared masters).
    const cols = [];
    for (const o of rows) for (const s of o.stages) if (!cols.some(c => c.stage_type_id === s.stage_type_id)) cols.push(s);
    const sum = (f) => rows.reduce((a, o) => a + (f(o) || 0), 0);
    const stageOf = (o, c) => o.stages.find(s => s.stage_type_id === c.stage_type_id);

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                        <th className="px-3 py-2">Order</th><th className={TH}>Ship</th><th className={`${TH} text-right`}>Ordered</th><th className={`${TH} text-right`}>Cut</th>
                        {cols.map(c => <th key={c.stage_type_id} className={`${TH} border-l border-slate-200`}>{stageName(c)}</th>)}
                        <th className={`${TH} text-right border-l border-slate-200`}>Dispatched</th><th className={TH}>Needs a look</th>
                    </tr>
                </thead>
                <tbody>{rows.length === 0 ? <tr><td colSpan={cols.length + 6} className="px-3 py-6 text-center text-slate-400">{mine ? 'No orders created by you.' : 'No orders.'}</td></tr> : rows.map(o => {
                    const f = o.flags;
                    const look = [
                        f.stuck ? <span key="s" className="text-rose-700" title={`work on the line with no check for ${d.stuck_hours} h`}>⏱ {f.stuck} stuck ({f.stuck_batches.join(', ')})</span> : null,
                        f.rework_old ? <span key="r" className="text-amber-700">↻ {f.rework_old} rework &gt; {d.stuck_hours} h</span> : null,
                        f.recuts_open ? <span key="c" className="text-amber-700">{f.recuts_open} re-cut open</span> : null,
                        f.replacements_open ? <span key="p" className="text-amber-700">{f.replacements_open} replacement waiting</span> : null,
                        f.milestones_late ? <span key="m" className="text-rose-700">{f.milestones_late} milestone{f.milestones_late === 1 ? '' : 's'} late</span> : null,
                    ].filter(Boolean);
                    return (
                        <tr key={o.order_id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer align-top" onClick={() => navigate(`/v3/tracker/orders/${o.order_id}#batches`)}>
                            <td className="px-3 py-2 min-w-[14rem]"><span className="inline-flex items-center gap-2 whitespace-nowrap"><Dot rag={o.rag} title={`Production: ${o.rag.toLowerCase()}`} /><b>{o.order_no}</b></span>
                                <span className="block text-xs text-slate-500">{o.customer_name}{o.buyer_po_no ? ` · PO ${o.buyer_po_no}` : ''} · {o.styles}</span>
                                <span className="block text-[11px] text-slate-400">{o.batches} batch{o.batches === 1 ? '' : 'es'}</span></td>
                            <td className={`px-2 py-2 whitespace-nowrap ${o.days_to_ship != null && o.days_to_ship < 0 ? 'text-rose-700 font-bold' : ''}`}>{fmtDate(o.ship_date)}<span className="block text-xs text-slate-500">{daysText(o.days_to_ship)}</span></td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtQty(o.ordered)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtQty(o.cut)}</td>
                            {cols.map(c => {
                                const s = stageOf(o, c);
                                if (!s) return <td key={c.stage_type_id} className="border-l border-slate-100 text-center text-slate-300">·</td>;
                                const p = pctOf(s.done, o.cut);
                                const any = s.done || s.rework || s.rejected || s.batches_on;
                                return (
                                    <td key={c.stage_type_id} className="px-2 py-1.5 border-l border-slate-100 whitespace-nowrap" title={`${stageName(s)}: ${s.done} garments through of ${o.cut} cut`}>
                                        {!any ? <span className="text-xs text-slate-300">—</span> : (
                                            <Fragment>
                                                <span className="flex items-baseline gap-1"><b className="tabular-nums">{fmtQty(s.done)}</b><span className="text-[11px] text-slate-500">{p}%</span></span>
                                                <span className="block h-1 w-20 bg-slate-200 rounded-full overflow-hidden my-0.5"><span className={`block h-full ${p >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${p}%` }} /></span>
                                                <span className="flex gap-1.5 text-[11px] font-semibold">
                                                    {s.batches_on > 0 && <span className="text-sky-700">{s.batches_on} on line</span>}
                                                    {s.rework > 0 && <span className="text-amber-700" title="garments in rework">↻{s.rework}</span>}
                                                    {s.rejected > 0 && <span className="text-rose-700" title="garments rejected">✗{s.rejected}</span>}
                                                </span>
                                            </Fragment>
                                        )}
                                    </td>
                                );
                            })}
                            <td className="px-2 py-2 text-right tabular-nums border-l border-slate-200">{fmtQty(o.dispatched)}<span className="block text-[11px] text-slate-500">{pctOf(o.dispatched, o.ordered)}%</span></td>
                            <td className="px-2 py-2 text-xs font-semibold min-w-[11rem]"><span className="flex flex-col gap-0.5">{look.length ? look : <span className="text-slate-300 font-normal">—</span>}</span></td>
                        </tr>
                    );
                })}</tbody>
                {rows.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold"><tr>
                        <td className="px-3 py-2">Total · {rows.length} order{rows.length === 1 ? '' : 's'}</td><td />
                        <td className="px-2 py-2 text-right tabular-nums">{fmtQty(sum(o => o.ordered))}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtQty(sum(o => o.cut))}</td>
                        {cols.map(c => <td key={c.stage_type_id} className="px-2 py-2 tabular-nums border-l border-slate-100">{fmtQty(sum(o => stageOf(o, c)?.done))}</td>)}
                        <td className="px-2 py-2 text-right tabular-nums border-l border-slate-200">{fmtQty(sum(o => o.dispatched))}</td>
                        <td className="px-2 py-2 text-xs text-rose-700">{sum(o => o.flags.stuck) ? `⏱ ${sum(o => o.flags.stuck)} stuck` : ''}</td>
                    </tr></tfoot>
                )}
            </table>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">
                Each stage: garments through it (every piece the stage checks cleared; garment stages: the garment), % of what is cut, batches on a line there, ↻ rework, ✗ rejected.
                ⏱ stuck: work on the line with no check for {d.stuck_hours} h (clock hours — nights and Sundays count). Tap an order for its batches × stages.
            </p>
        </div>
    );
}

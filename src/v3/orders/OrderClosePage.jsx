// Ship & close (20 Oct 2026, phase 7 — docs/SALES_ORDER_V3_PLAN.md "Shipped → Closed"): per colour × size ordered, finished,
// dispatched, short-closed, at the outlet, still open; the merchandiser short-closes what the buyer won't take (reason) →
// SHIPPED once everything is dispatched or short-closed; the close checklist with links; Close (surplus finished garments
// to the factory outlet in the same step, warnings confirmed); accounts acknowledges; the factory admin force-closes /
// reopens. Closures (snapshots), short-closes and outlet transfers listed.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertTriangle, Info, Lock, Unlock, Scissors, BookCheck } from 'lucide-react';
import Modal from '../../shared/Modal';
import OrderTabs from './OrderTabs';
import { orderCloseApi } from '../api/packingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const LEVEL = { RED: [XCircle, 'text-rose-600'], WARN: [AlertTriangle, 'text-amber-600'], GREEN: [CheckCircle2, 'text-emerald-600'], INFO: [Info, 'text-slate-400'] };
const key = (c) => `${c.line_id}|${c.colour_id}|${c.size_id}`;
const lineOf = (c, qty) => ({ line_id: c.line_id, garment_colour_id: c.colour_id, size_id: c.size_id, qty });

export default function OrderClosePage() {
    const { orderId } = useParams();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [sc, setSc] = useState(null);       // short-close { qty: {key: n}, reason }
    const [cl, setCl] = useState(null);       // close { mode: 'close' | 'force', outlet: {key: n}, handed_by, note, reason, confirm }
    const [ask, setAsk] = useState(null);     // reopen / acknowledge { kind, text }
    const load = useCallback(() => orderCloseApi.get(orderId).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [orderId]);
    useEffect(() => { load(); }, [load]);
    if (!d) return <div><OrderTabs orderId={orderId} active="close" />{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const o = d.order; const p = d.permissions;
    const run = async (fn, close) => {
        setBusy(true); setFormError('');
        try { setD((await fn()).data); close(); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const openCells = d.cells.filter(c => c.open > 0);
    const surplusCells = d.cells.filter(c => c.ready > 0);
    const startClose = (mode) => { setFormError(''); setCl({ mode, outlet: Object.fromEntries(surplusCells.map(c => [key(c), String(c.ready)])), handed_by: '', note: '', reason: '', confirm: false }); };
    const outletLines = (m) => d.cells.filter(c => Number(m[key(c)]) > 0).map(c => lineOf(c, Number(m[key(c)])));
    const warn = d.checklist.filter(r => r.level === 'WARN');
    return (
        <div>
            <OrderTabs orderId={orderId} active="close" />
            <ErrorBox text={error} />
            {o.status === 'CLOSED' && (
                <div className="mb-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <b className="inline-flex items-center gap-1.5"><Lock size={14} /> Closed{o.force_closed ? ' (forced)' : ''}</b> by {o.closed_by_name || '—'} on {new Date(o.closed_at).toLocaleString()}{o.close_note ? ` — ${o.close_note}` : ''}{o.force_reason ? ` · reason: ${o.force_reason}` : ''}.
                    {o.close_ack_at ? <span className="text-emerald-700"> Acknowledged by accounts ({o.close_ack_by_name || '—'}).</span> : <span className="text-amber-700"> Not acknowledged by accounts yet.</span>} Read-only — the factory admin can reopen it.
                </div>
            )}
            <div className="flex flex-wrap gap-2 mb-3">
                {p.close && ['APPROVED', 'SHIPPED'].includes(o.status) && openCells.length > 0 && <SecondaryButton onClick={() => { setFormError(''); setSc({ qty: {}, reason: '' }); }}><Scissors size={14} /> Short-close…</SecondaryButton>}
                {p.close && o.status === 'SHIPPED' && <PrimaryButton onClick={() => startClose('close')}><Lock size={14} /> Close the order…</PrimaryButton>}
                {p.admin && ['APPROVED', 'SHIPPED'].includes(o.status) && !d.ready && <SecondaryButton onClick={() => startClose('force')}><Lock size={14} /> Force close…</SecondaryButton>}
                {p.admin && o.status === 'CLOSED' && <SecondaryButton onClick={() => { setFormError(''); setAsk({ kind: 'reopen', text: '' }); }}><Unlock size={14} /> Reopen…</SecondaryButton>}
                {p.acknowledge && o.status === 'CLOSED' && !o.close_ack_at && <PrimaryButton onClick={() => { setFormError(''); setAsk({ kind: 'ack', text: '' }); }}><BookCheck size={14} /> Acknowledge the closure</PrimaryButton>}
            </div>
            <div className="grid lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-black text-slate-800 mb-2">Close checklist</p>
                    {d.checklist.map(r => { const [Icon, cls] = LEVEL[r.level]; return (
                        <div key={r.key} className="flex items-start gap-2 py-1.5 border-t border-slate-100 first:border-0 text-sm">
                            <Icon size={16} className={`mt-0.5 shrink-0 ${cls}`} />
                            <span className="flex-1"><b className="text-slate-800">{r.label}</b> <span className="text-slate-600">— {r.text}</span></span>
                            {r.to && r.level !== 'GREEN' && <Link to={r.to} className="text-xs font-bold text-indigo-700 hover:underline whitespace-nowrap">Open →</Link>}
                        </div>
                    ); })}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-black text-slate-800 mb-2">Figures</p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                        {[['Ordered', d.figures.ordered], ['Cut', d.figures.cut], ['Finished', d.figures.finished], ['Dispatched', d.figures.dispatched], ['Short-closed', d.figures.short_closed], ['To the outlet', d.figures.outlet],
                            ['Surplus now', d.figures.surplus], ['Rejected (garments)', d.figures.rejected]].map(([k, v]) => (
                            <div key={k} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold text-slate-500">{k}</p><p className="font-black text-slate-800 tabular-nums">{v}</p></div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><tr><th className="px-3 py-2 text-left">Line · colour · size</th><th className="px-3 py-2">Ordered</th><th className="px-3 py-2">Finished</th><th className="px-3 py-2">Dispatched</th><th className="px-3 py-2">Short-closed</th><th className="px-3 py-2">Outlet</th><th className="px-3 py-2">Ready</th><th className="px-3 py-2">Still to ship</th></tr></thead>
                    <tbody>{d.cells.map(c => (
                        <tr key={key(c)} className="border-t border-slate-100 text-right tabular-nums">
                            <td className="px-3 py-1.5 text-left">L{c.line_no} {c.style_code} · {c.colour} · <b>{c.size}</b></td>
                            <td className="px-3 py-1.5">{c.ordered}</td><td className="px-3 py-1.5">{c.finished}</td><td className="px-3 py-1.5 font-semibold">{c.dispatched}</td>
                            <td className="px-3 py-1.5">{c.short_closed || '—'}</td><td className="px-3 py-1.5">{c.outlet || '—'}</td><td className="px-3 py-1.5">{c.ready || '—'}</td>
                            <td className={`px-3 py-1.5 font-bold ${c.open ? 'text-rose-700' : 'text-emerald-700'}`}>{c.open || '✓'}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <div className="grid lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="font-black text-slate-800 mb-1">Short-closed</p>
                    {d.short_closes.length === 0 ? <p className="text-slate-400">None.</p> : d.short_closes.map(x => <p key={x.id} className="py-0.5">L{x.line_no} {x.colour} {x.size} × <b>{x.qty}</b> <span className="text-slate-500">— {x.reason} ({x.user_name || '—'})</span></p>)}</div>
                <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="font-black text-slate-800 mb-1">To the factory outlet</p>
                    {d.outlet_transfers.length === 0 ? <p className="text-slate-400">None.</p> : d.outlet_transfers.map(x => <p key={x.id} className="py-0.5"><b>{x.qty}</b> garment(s) · {new Date(x.created_at).toLocaleDateString()}{x.handed_by ? ` · handed by ${x.handed_by}` : ''}</p>)}</div>
                <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="font-black text-slate-800 mb-1">Closures</p>
                    {d.closures.length === 0 ? <p className="text-slate-400">Not closed yet.</p> : d.closures.map(x => <p key={x.id} className="py-0.5">{new Date(x.created_at).toLocaleString()} · {x.user_name || '—'}{x.forced ? <b className="text-rose-700"> forced</b> : ''}{x.reopened_at ? <span className="text-slate-500"> · reopened {new Date(x.reopened_at).toLocaleDateString()} ({x.reopen_reason})</span> : ''}</p>)}</div>
            </div>

            {sc && (
                <Modal title="Short-close" onClose={() => setSc(null)}>
                    <div className="space-y-3 w-[min(560px,92vw)]">
                        <p className="text-sm text-slate-600">What the buyer won't take. It counts as done for shipping and comes off the material requirement (allocations above it are released).</p>
                        <div className="max-h-[40vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">{openCells.map(c => (
                            <div key={key(c)} className="flex items-center gap-2 px-3 py-1.5 text-sm"><span className="flex-1">L{c.line_no} · {c.colour} · <b>{c.size}</b> <span className="text-xs text-slate-500">({c.open} open)</span></span>
                                <input className="w-20 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" max={c.open} value={sc.qty[key(c)] || ''} onChange={e => setSc({ ...sc, qty: { ...sc.qty, [key(c)]: e.target.value } })} aria-label={`Short-close ${c.size}`} />
                                <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => setSc({ ...sc, qty: { ...sc.qty, [key(c)]: String(c.open) } })}>all</button></div>
                        ))}</div>
                        <Field label="Reason *"><input className={inputCls} value={sc.reason} onChange={e => setSc({ ...sc, reason: e.target.value })} placeholder="e.g. buyer cut the quantity, shade rejected" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setSc(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !sc.reason.trim() || !openCells.some(c => Number(sc.qty[key(c)]) > 0)} onClick={() => run(() => orderCloseApi.shortClose(orderId, openCells.filter(c => Number(sc.qty[key(c)]) > 0).map(c => lineOf(c, Number(sc.qty[key(c)]))), sc.reason.trim()), () => setSc(null))}>Short-close</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {cl && (
                <Modal title={cl.mode === 'force' ? 'Force close (factory admin)' : `Close ${o.order_no}`} onClose={() => setCl(null)}>
                    <div className="space-y-3 w-[min(560px,92vw)]">
                        {cl.mode === 'force' && <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Closes despite the red checks — they are kept in the closure snapshot.</p>}
                        {surplusCells.length > 0 && (<>
                            <p className="text-sm font-bold text-slate-700">Surplus finished garments → factory outlet</p>
                            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">{surplusCells.map(c => (
                                <div key={key(c)} className="flex items-center gap-2 px-3 py-1.5 text-sm"><span className="flex-1">L{c.line_no} · {c.colour} · <b>{c.size}</b> <span className="text-xs text-slate-500">({c.ready} not dispatched)</span></span>
                                    <input className="w-20 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" max={c.ready} value={cl.outlet[key(c)] || ''} onChange={e => setCl({ ...cl, outlet: { ...cl.outlet, [key(c)]: e.target.value } })} aria-label={`Outlet ${c.size}`} /></div>
                            ))}</div>
                            <Field label="Handed over by"><input className={inputCls} value={cl.handed_by} onChange={e => setCl({ ...cl, handed_by: e.target.value })} /></Field>
                        </>)}
                        {cl.mode === 'force' && <Field label="Reason *"><input className={inputCls} value={cl.reason} onChange={e => setCl({ ...cl, reason: e.target.value })} /></Field>}
                        <Field label="Note"><input className={inputCls} value={cl.note} onChange={e => setCl({ ...cl, note: e.target.value })} /></Field>
                        {cl.mode === 'close' && warn.length > 0 && <label className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><input type="checkbox" className="mt-0.5" checked={cl.confirm} onChange={e => setCl({ ...cl, confirm: e.target.checked })} /><span>I know: {warn.map(w => w.text).join('; ')}</span></label>}
                        <p className="text-xs text-slate-500">Leftover allocations (trims, fabric rolls) are released. Accounts is asked to acknowledge.</p>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setCl(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (cl.mode === 'force' && !cl.reason.trim()) || (cl.mode === 'close' && warn.length > 0 && !cl.confirm)}
                                onClick={() => run(() => (cl.mode === 'force'
                                    ? orderCloseApi.forceClose(orderId, { reason: cl.reason.trim(), note: cl.note || undefined, outlet: { handed_by: cl.handed_by || undefined, lines: outletLines(cl.outlet) } })
                                    : orderCloseApi.close(orderId, { note: cl.note || undefined, confirm_warnings: cl.confirm, outlet: { handed_by: cl.handed_by || undefined, lines: outletLines(cl.outlet) } })), () => setCl(null))}>
                                {cl.mode === 'force' ? 'Force close' : 'Close the order'}</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {ask && (
                <Modal title={ask.kind === 'reopen' ? 'Reopen (factory admin)' : 'Acknowledge the closure'} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <p className="text-sm text-slate-600">{ask.kind === 'reopen' ? 'Back to shipped / approved as it stands. Released allocations stay released — allocate again if needed.' : 'For the record: the snapshot — figures, surplus to the outlet, forced or not.'}</p>
                        <Field label={ask.kind === 'reopen' ? 'Reason *' : 'Note'}><input className={inputCls} value={ask.text} onChange={e => setAsk({ ...ask, text: e.target.value })} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (ask.kind === 'reopen' && !ask.text.trim())} onClick={() => run(() => (ask.kind === 'reopen' ? orderCloseApi.reopen(orderId, ask.text.trim()) : orderCloseApi.acknowledge(orderId, ask.text.trim() || undefined)), () => setAsk(null))}>{ask.kind === 'reopen' ? 'Reopen' : 'Acknowledge'}</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

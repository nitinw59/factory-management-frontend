// One trim kit — /v3/trim-kits/:id. Since 19 Oct 2026 (phase 5) every kit is made from its cut batch when the batch is
// finalised: Order BOM rate × garments cut per colour × size (threads in whole cones) — the store can't change it.
// Store: prepare it, Mark ready; pull back, close / cancel with a reason. The kit shows the lines its batch is on.
// Line loader: on a ready kit, pick the line, count what is really in the kit and sign — that issues it (issue
// slip); a short count is a partial handover. Or send it back to the store with what is wrong.
// 20 Oct 2026 ("Over-cut and trims"): over-cut garments are kitted on their own lines, handed from the store's free
// stock; above the free limit they are held until the merchandiser approves (refused → taken off the kit).
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Undo2, Ban, PenLine, RotateCcw } from 'lucide-react';
import Modal from '../../shared/Modal';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { useV3Access } from '../V3Access';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { KIT_STATUS, ACTION, qty, handout } from './trimKitShared';

export default function TrimKitPage() {
    const { id } = useParams();
    return <KitView id={id} />;
}

function KitView({ id }) {
    const { me } = useV3Access();
    const [k, setK] = useState(null);
    const [perm, setPerm] = useState({ prepare: false, sign: false });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [basis, setBasis] = useState(null);     // kit line whose calculation is open
    const [count, setCount] = useState(null);     // { lines: [], line_id, counts: Map, note }
    const [ask, setAsk] = useState(null);         // { title, confirm, hint, run(reason) }
    const [askText, setAskText] = useState('');
    const [formError, setFormError] = useState('');
    const load = useCallback(() => trimKitsApi.get(id).then(res => setK(res.data)).catch(err => setError(apiError(err, 'Failed to load the kit.'))), [id]);
    useEffect(() => { load(); trimKitsApi.permissions().then(res => setPerm(res.data)).catch(() => {}); }, [load]);
    useV3Live(() => { if (!count) load(); });
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setK((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    if (!k) return error ? <ErrorBox text={error} /> : <Loading />;
    const S = k.status;
    const openCount = () => {
        setFormError('');
        // The batch's own line(s) first; any line loader may sign for any line.
        const mine = new Set((k.batch_lines || []).map(l => l.id));
        trimKitsApi.lines().then(res => setCount({
            lines: [...res.data.filter(l => mine.has(l.id)), ...res.data.filter(l => !mine.has(l.id))], line_id: k.batch_lines?.length === 1 ? k.batch_lines[0].id : '', note: '',
            counts: new Map(k.lines.filter(l => l.remaining > 0 && !l.held).map(l => [l.id, String(l.in_units ? Math.ceil(l.remaining_units - 1e-9) : l.remaining)])),
        })).catch(err => setError(apiError(err, 'Failed to load lines.')));
    };
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const handable = k.lines.filter(l => l.remaining > 0 && !l.held);
    const short = count ? handable.some(l => {
        const v = Number(count.counts.get(l.id) || 0);
        return l.in_units ? v * l.factor + 1e-9 < l.remaining : v + 1e-9 < l.remaining;
    }) : false;

    return (
        <div>
            <Link to="/v3/trim-kits" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Trim kits</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{k.kit_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${KIT_STATUS[S].cls}`}>{KIT_STATUS[S].label}</span>
            </div>
            <p className="text-sm text-slate-600 mb-1"><Link to={`/v3/orders/${k.order_id}`} className="font-semibold text-indigo-700 hover:underline">{k.order_no}</Link> · {k.customer_name}{k.batch_code ? <> · batch <b>#{k.floor_no}</b> {k.batch_code}</> : ''}</p>
            {k.auto && <p className="text-xs text-slate-500 mb-1">Made when the batch was finalised: Order BOM (wastage included) × the garments cut, per colour × size. The quantities can't be changed — hand over what is there; the rest follows on the same kit.</p>}
            <p className="text-sm mb-3">{k.batch_lines?.length ? <>Goes to: {k.batch_lines.map(l => <b key={l.id} className="mr-2 text-slate-800">{l.name} <span className="font-normal text-slate-500">({l.stage})</span></b>)}</> : <span className="text-slate-500">The batch is not on a sewing line yet — any line loader may sign for it.</span>}</p>
            {k.history[0]?.action === 'SENT_BACK' && S !== 'READY' && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2"><b>Sent back by the line{k.history[0].user_name ? ` (${k.history[0].user_name})` : ''}:</b> {k.history[0].reason} — correct the kit and mark it ready again.</div>}
            {S === 'READY' && <p className="mb-3 text-sm text-emerald-800">Ready for pickup{k.ready_by_name ? ` — marked by ${k.ready_by_name}` : ''}{k.ready_at ? ` on ${new Date(k.ready_at).toLocaleString()}` : ''}. {perm.sign ? 'Count what is in the kit, then sign.' : 'Waiting for the line loader.'}</p>}
            {(S === 'CLOSED' || S === 'CANCELLED') && <p className="mb-3 text-sm text-slate-600"><b>{KIT_STATUS[S].label}</b>{k.closed_by_name ? ` by ${k.closed_by_name}` : ''}: {k.close_reason}</p>}

            <div className="flex flex-wrap gap-2 mb-3">
                {perm.sign && S === 'READY' && <PrimaryButton onClick={openCount}><PenLine size={14} /> Count &amp; sign</PrimaryButton>}
                {perm.sign && S === 'READY' && <SecondaryButton onClick={() => askReason({ title: `Send ${k.kit_no} back to the store`, confirm: 'Send back', hint: 'Say what is wrong (wrong item, short, damaged…). The store corrects it and marks it ready again.', run: (r) => trimKitsApi.sendBack(id, r) })}><RotateCcw size={14} /> Send back</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && handable.length > 0 && <PrimaryButton onClick={() => run(() => trimKitsApi.ready(id))} busy={busy} disabled={busy}><PackageCheck size={14} /> {S === 'PARTLY_ISSUED' ? 'Mark the rest ready' : 'Mark ready'}</PrimaryButton>}
                {perm.prepare && S === 'READY' && <SecondaryButton onClick={() => run(() => trimKitsApi.unready(id))}><Undo2 size={14} /> Pull back</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && <SecondaryButton onClick={() => askReason({ title: S === 'DRAFT' ? `Cancel ${k.kit_no}` : `Close ${k.kit_no}`, confirm: S === 'DRAFT' ? 'Cancel kit' : 'Close kit', hint: S === 'DRAFT' ? 'Nothing was handed over. Say why the batch\'s kit is not needed.' : 'What was handed stays issued; the rest will not be handed. Say why (it shows in the trim reconciliation).', run: (r) => trimKitsApi.close(id, r) })}><Ban size={14} /> {S === 'DRAFT' ? 'Cancel' : 'Close'}</SecondaryButton>}
            </div>
            <ErrorBox text={error} />

            {k.lines.some(l => l.part !== 'ORDER') && <p className="mb-2 text-sm text-slate-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">This batch is cut above the order. Its over-cut lines are handed from the store's <b>free stock</b> (not the order's allocation){k.held_total ? <> — <b className="text-amber-800">{k.held_total} line(s) wait for the merchandiser's approval</b> before they can be handed</> : ''}.</p>}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[620px]">
                    <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right">
                        <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">In the kit</th><th className="px-3 py-2">Handed over</th><th className="px-3 py-2">Still to hand</th></tr>
                    </thead>
                    <tbody>
                        {k.lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 text-right tabular-nums">
                                <td className="px-3 py-2 text-left">{l.line_no}</td>
                                <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">{l.label}</span>
                                    {l.part !== 'ORDER' && <span className={`ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border ${l.held ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-sky-50 text-sky-800 border-sky-300'}`} title="Over-cut garments: handed from the store's free stock, not the order's allocation">{l.held ? 'over-cut · waiting for the merchandiser' : 'over-cut · free stock'}</span>}
                                    <span className="block text-xs text-slate-500">{l.type_name}{l.basis?.cells?.length ? <> · <button type="button" className="text-indigo-700 hover:underline" onClick={() => setBasis(l)}>how it's worked out</button></> : null}</span></td>
                                <td className="px-3 py-2 font-semibold">{handout(l)}</td>
                                <td className="px-3 py-2">{l.issued ? `${qty(l.issued, l.uom)} ${l.uom}` : '—'}</td>
                                <td className={`px-3 py-2 ${l.remaining > 0 ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>{l.remaining > 0 ? handout(l, l.remaining) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid lg:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">Handovers</p>
                    {k.handovers.length === 0 ? <p className="text-sm text-slate-400">Nothing handed over yet.</p> : k.handovers.map(h => (
                        <div key={h.id} className="py-2 border-t border-slate-100 first:border-0 text-sm">
                            {me?.menu['issue.materialIssue'] ? <Link to={`/v3/material-issue/issues/${h.issue_id}`} className="font-bold text-indigo-700 hover:underline">{h.issue_no}</Link> : <b className="text-slate-800">{h.issue_no}</b>}
                            <span className="text-slate-600"> · {h.production_line_name} · {h.signed_by_name || '—'} · {new Date(h.signed_at).toLocaleString()}{h.partial ? ' · part of the kit' : ''}</span>
                            {h.note && <span className="block text-xs text-slate-500">{h.note}</span>}
                            <ul className="ml-5 list-disc text-xs text-slate-600">{h.lines.map(x => <li key={x.kit_line_id}>{x.label}: {x.units ? `${x.units} ${k.lines.find(l => l.id === x.kit_line_id)?.purchase_uom} = ` : ''}{qty(x.qty, x.uom)} {x.uom}</li>)}</ul>
                        </div>
                    ))}
                    <p className="text-xs text-slate-500 mt-2">Unused thread comes back as a return on the issue slip, in metres.</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">History</p>
                    <div className="divide-y divide-slate-100 text-sm">
                        {k.history.map(h => (
                            <div key={h.id} className="py-1.5">
                                <span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                                {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {count && (
                <Modal title={`Count and sign — ${k.kit_no}`} onClose={() => setCount(null)}>
                    <div className="space-y-3 w-[min(640px,92vw)] max-h-[78vh] overflow-y-auto">
                        <Field label="Line it goes to *">
                            <select className={inputCls} value={count.line_id} onChange={e => setCount({ ...count, line_id: e.target.value })}>
                                <option value="">— pick —</option>
                                {count.lines.map(l => <option key={l.id} value={l.id}>{l.name}{l.stage ? ` (${l.stage})` : ''}</option>)}
                            </select>
                        </Field>
                        <p className="text-xs text-slate-500">Count what is really in the kit. Less than the kit holds = a part handover; the rest stays with the store.</p>
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {handable.map(l => (
                                <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                                    <span className="flex-1 min-w-[180px]"><span className="font-semibold text-sm text-slate-800">{l.label}</span>{l.free_stock && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-sky-50 text-sky-800 border-sky-300">over-cut · free stock</span>}<span className="block text-xs text-slate-500">kit: {handout(l, l.remaining)}</span></span>
                                    <input className="w-24 px-2 py-1.5 text-sm text-right border border-slate-300 rounded" type="number" min="0" step={l.in_units || l.uom === 'pcs' ? 1 : 'any'} value={count.counts.get(l.id) ?? ''}
                                        onChange={e => setCount({ ...count, counts: new Map(count.counts).set(l.id, e.target.value) })} aria-label={`Counted ${l.label}`} />
                                    <span className="text-xs text-slate-500 w-12">{l.in_units ? l.purchase_uom : l.uom}</span>
                                </div>
                            ))}
                        </div>
                        {short && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><b>Part handover:</b> {handable.filter(l => (l.in_units ? Number(count.counts.get(l.id) || 0) * l.factor + 1e-9 < l.remaining : Number(count.counts.get(l.id) || 0) + 1e-9 < l.remaining)).map(l => l.label).join(', ')} short. You sign for what you counted; the rest stays on this kit and the store is reminded every day until it is handed over.</p>}
                        <Field label="Note"><input className={inputCls} value={count.note} onChange={e => setCount({ ...count, note: e.target.value })} placeholder={short ? 'e.g. 50 buttons short' : ''} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCount(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !count.line_id}
                                onClick={() => run(() => trimKitsApi.sign(id, {
                                    production_line_id: count.line_id, note: count.note || null,
                                    lines: handable.map(l => (l.in_units ? { kit_line_id: l.id, units: Number(count.counts.get(l.id) || 0) } : { kit_line_id: l.id, qty: Number(count.counts.get(l.id) || 0) })),
                                }), () => setCount(null))}><PenLine size={14} /> Sign — I received this</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {basis && (
                <Modal title={`${basis.label} — how much`} onClose={() => setBasis(null)}>
                    <div className="space-y-2 w-[min(560px,92vw)]">
                        <table className="w-full text-sm"><thead className="text-xs text-slate-500 text-right"><tr><th className="text-left py-1">Colour</th><th className="text-left py-1">Size</th><th className="py-1">Garments cut</th><th className="py-1">× per garment</th><th className="py-1">= {basis.uom}</th></tr></thead>
                            <tbody>{basis.basis.cells.map((c, i) => <tr key={i} className="border-t border-slate-100 text-right tabular-nums"><td className="text-left py-1">{c.colour}</td><td className="text-left py-1">{c.size}</td><td>{c.garments}</td><td>{c.rate}</td><td className="font-semibold">{qty(c.qty, basis.uom)}</td></tr>)}
                                <tr className="border-t-2 border-slate-200 text-right font-bold"><td className="text-left py-1" colSpan={4}>Needed (Order BOM rate, wastage included)</td><td>{qty(basis.basis.need, basis.uom)}</td></tr></tbody></table>
                        <p className="text-xs text-slate-500">In the kit: {handout(basis)}{basis.in_units ? ` — whole ${basis.purchase_uom}s` : basis.uom === 'pcs' ? ' — rounded up to whole pieces' : ''}.</p>
                        <div className="flex justify-end"><SecondaryButton onClick={() => setBasis(null)}>Close</SecondaryButton></div>
                    </div>
                </Modal>
            )}

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => ask.run(askText.trim()), () => setAsk(null))} busy={busy} disabled={busy || !askText.trim()}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

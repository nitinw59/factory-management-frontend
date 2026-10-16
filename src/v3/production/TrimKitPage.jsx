// One trim kit — /v3/trim-kits/new (?order_id=) and /v3/trim-kits/:id.
// Store: pick the order (and a cut batch if it is for one), type each item's quantity out of what is free on the
// order's allocation (threads in whole cones), save, Mark ready; pull back, close / cancel with a reason.
// Line loader: on a ready kit, pick the line, count what is really in the kit and sign — that issues it (issue
// slip); a short count is a partial handover. Or send it back to the store with what is wrong.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Undo2, Ban, Pencil, PenLine, RotateCcw } from 'lucide-react';
import Modal from '../../shared/Modal';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { useV3Access } from '../V3Access';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, PageHeader } from '../components/ui';
import { KIT_STATUS, ACTION, qty, handout } from './trimKitShared';

// Item table for making / changing a kit: picks = Map itemId → string (cones for threads, else qty).
function KitItems({ trims, picks, setPicks, current }) {
    if (!trims.length) return <p className="text-sm text-slate-500 py-3">This order has no trims allocated yet — allocate them first (Order BOM / Stock position).</p>;
    const set = (id, v) => { const n = new Map(picks); if (v === '') n.delete(id); else n.set(id, v); setPicks(n); };
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
                <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right">
                    <tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">Order needs</th><th className="px-3 py-2">Allocated</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">On other kits</th><th className="px-3 py-2">Free for kits</th><th className="px-3 py-2 w-48">In this kit</th></tr>
                </thead>
                <tbody>
                    {trims.map(t => {
                        const handed = current?.get(t.item_id)?.issued || 0;
                        const maxUnits = t.in_units ? Math.ceil(Math.round(((t.free_to_kit + handed) / t.factor) * 1000) / 1000 - 1e-9) : null;
                        const v = picks.get(t.item_id) ?? '';
                        return (
                            <tr key={t.item_id} className={`border-t border-slate-100 text-right tabular-nums ${v !== '' ? 'bg-indigo-50/40' : ''}`}>
                                <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">{t.label}</span><span className="block text-xs text-slate-500">{t.type_name}{t.in_units ? ` · by the ${t.purchase_uom} (${qty(t.factor, t.uom)} ${t.uom})` : ''}</span></td>
                                <td className="px-3 py-2">{qty(t.required, t.uom)} {t.uom}</td>
                                <td className="px-3 py-2">{qty(t.allocated, t.uom)}</td>
                                <td className="px-3 py-2">{qty(t.issued, t.uom)}</td>
                                <td className="px-3 py-2">{qty(t.on_other_kits, t.uom)}</td>
                                <td className={`px-3 py-2 font-semibold ${t.free_to_kit > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{qty(t.free_to_kit, t.uom)}{t.in_units && t.free_to_kit > 0 ? <span className="block text-[11px] font-normal text-slate-500">up to {maxUnits} {t.purchase_uom}</span> : null}</td>
                                <td className="px-3 py-2">
                                    <span className="inline-flex items-center gap-1.5">
                                        <input className="w-24 px-2 py-1 text-sm text-right border border-slate-300 rounded" type="number" min="0" step={t.in_units || t.uom === 'pcs' ? 1 : 'any'} value={v}
                                            onChange={e => set(t.item_id, e.target.value)} aria-label={`${t.label} in this kit`} />
                                        <span className="text-xs text-slate-500 w-10 text-left">{t.in_units ? t.purchase_uom : t.uom}</span>
                                    </span>
                                    {t.in_units && Number(v) > 0 && <span className="block text-[11px] text-slate-500">= {qty(Number(v) * t.factor, 'm')} m</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
const payload = (trims, picks) => trims.filter(t => Number(picks.get(t.item_id)) > 0).map(t => (t.in_units ? { trim_item_id: t.item_id, units: Number(picks.get(t.item_id)) } : { trim_item_id: t.item_id, qty: Number(picks.get(t.item_id)) }));

function NewKit() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [orders, setOrders] = useState(null);
    const [orderId, setOrderId] = useState(params.get('order_id') || '');
    const [pic, setPic] = useState(null);
    const [picks, setPicks] = useState(new Map());
    const [form, setForm] = useState({ cut_batch_id: '', notes: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { trimKitsApi.orders().then(res => setOrders(res.data)).catch(err => setError(apiError(err, 'Failed to load orders.'))); }, []);
    useEffect(() => {
        setPic(null); setPicks(new Map());
        if (orderId) trimKitsApi.orderPicture(orderId).then(res => setPic(res.data)).catch(err => setError(apiError(err, 'Failed to load the order.')));
    }, [orderId]);
    const fillFree = () => setPicks(new Map(pic.trims.filter(t => t.free_to_kit > 0).map(t => [t.item_id, String(t.in_units ? Math.ceil(Math.round((t.free_to_kit / t.factor) * 1000) / 1000 - 1e-9) : t.free_to_kit)])));
    const save = async () => {
        setBusy(true); setError('');
        try { const res = await trimKitsApi.create({ order_id: orderId, ...form, cut_batch_id: form.cut_batch_id || null, lines: payload(pic.trims, picks) }); navigate(`/v3/trim-kits/${res.data.id}`, { replace: true }); }
        catch (err) { setError(apiError(err, 'Failed to save the kit.')); setBusy(false); }
    };
    return (
        <div>
            <Link to="/v3/trim-kits" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Trim kits</Link>
            <PageHeader title="New trim kit" subtitle="Pick the order, then what goes in the kit — out of what is allocated to the order and not already on another kit. The Order BOM quantity already includes wastage. Threads go by the cone." />
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3 grid sm:grid-cols-3 gap-3">
                <Field label="Order *">
                    <select className={inputCls} value={orderId} onChange={e => setOrderId(e.target.value)}>
                        <option value="">{orders ? '— pick —' : 'Loading…'}</option>
                        {(orders || []).map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name} ({o.trim_items} trim item{o.trim_items === 1 ? '' : 's'} allocated)</option>)}
                    </select>
                </Field>
                <Field label="Cut batch" hint="If the kit is for one batch.">
                    <select className={inputCls} value={form.cut_batch_id} onChange={e => setForm({ ...form, cut_batch_id: e.target.value })} disabled={!pic}>
                        <option value="">— none —</option>
                        {(pic?.cut_batches || []).map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}
                    </select>
                </Field>
                <Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. first lot for line 2" /></Field>
            </div>
            {orderId && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3">
                    {!pic ? <Loading /> : <>
                        <div className="flex items-center mb-2"><p className="font-bold text-slate-800">Items</p>{pic.trims.some(t => t.free_to_kit > 0) && <button type="button" onClick={fillFree} className="ml-auto text-xs font-bold text-indigo-700 hover:underline">Fill all that is free</button>}</div>
                        <KitItems trims={pic.trims} picks={picks} setPicks={setPicks} />
                    </>}
                </div>
            )}
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !pic || !payload(pic.trims, picks).length}>Save kit</PrimaryButton>
        </div>
    );
}

export default function TrimKitPage() {
    const { id } = useParams();
    if (id === 'new') return <NewKit />;
    return <KitView id={id} />;
}

function KitView({ id }) {
    const { me } = useV3Access();
    const [k, setK] = useState(null);
    const [perm, setPerm] = useState({ prepare: false, sign: false });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [edit, setEdit] = useState(null);       // { pic, picks, cut_batch_id, notes }
    const [count, setCount] = useState(null);     // { lines: [], line_id, counts: Map, note }
    const [ask, setAsk] = useState(null);         // { title, confirm, hint, run(reason) }
    const [askText, setAskText] = useState('');
    const [formError, setFormError] = useState('');
    const load = useCallback(() => trimKitsApi.get(id).then(res => setK(res.data)).catch(err => setError(apiError(err, 'Failed to load the kit.'))), [id]);
    useEffect(() => { load(); trimKitsApi.permissions().then(res => setPerm(res.data)).catch(() => {}); }, [load]);
    useV3Live(() => { if (!edit && !count) load(); });
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setK((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    if (!k) return error ? <ErrorBox text={error} /> : <Loading />;
    const S = k.status;
    const openEdit = () => {
        setFormError('');
        trimKitsApi.orderPicture(k.order_id, k.id).then(res => setEdit({
            pic: res.data, cut_batch_id: k.cut_batch_id || '', notes: k.notes || '',
            picks: new Map(k.lines.map(l => [l.item_id, String(l.in_units ? (l.units ?? Math.round(l.qty / l.factor)) : l.qty)])),
        })).catch(err => setError(apiError(err, 'Failed to load the order.')));
    };
    const openCount = () => {
        setFormError('');
        trimKitsApi.lines().then(res => setCount({
            lines: res.data, line_id: '', note: '',
            counts: new Map(k.lines.filter(l => l.remaining > 0).map(l => [l.id, String(l.in_units ? Math.ceil(l.remaining_units - 1e-9) : l.remaining)])),
        })).catch(err => setError(apiError(err, 'Failed to load lines.')));
    };
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const current = new Map(k.lines.map(l => [l.item_id, l]));
    const short = count ? k.lines.filter(l => l.remaining > 0).some(l => {
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
            <p className="text-sm text-slate-600 mb-3"><Link to={`/v3/orders/${k.order_id}`} className="font-semibold text-indigo-700 hover:underline">{k.order_no}</Link> · {k.customer_name}{k.batch_code ? ` · cut batch ${k.batch_code}` : ''}{k.notes ? ` · ${k.notes}` : ''}</p>
            {k.history[0]?.action === 'SENT_BACK' && S !== 'READY' && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2"><b>Sent back by the line{k.history[0].user_name ? ` (${k.history[0].user_name})` : ''}:</b> {k.history[0].reason} — correct the kit and mark it ready again.</div>}
            {S === 'READY' && <p className="mb-3 text-sm text-emerald-800">Ready for pickup{k.ready_by_name ? ` — marked by ${k.ready_by_name}` : ''}{k.ready_at ? ` on ${new Date(k.ready_at).toLocaleString()}` : ''}. {perm.sign ? 'Count what is in the kit, then sign.' : 'Waiting for the line loader.'}</p>}
            {(S === 'CLOSED' || S === 'CANCELLED') && <p className="mb-3 text-sm text-slate-600"><b>{KIT_STATUS[S].label}</b>{k.closed_by_name ? ` by ${k.closed_by_name}` : ''}: {k.close_reason}</p>}

            <div className="flex flex-wrap gap-2 mb-3">
                {perm.sign && S === 'READY' && <PrimaryButton onClick={openCount}><PenLine size={14} /> Count &amp; sign</PrimaryButton>}
                {perm.sign && S === 'READY' && <SecondaryButton onClick={() => askReason({ title: `Send ${k.kit_no} back to the store`, confirm: 'Send back', hint: 'Say what is wrong (wrong item, short, damaged…). The store corrects it and marks it ready again.', run: (r) => trimKitsApi.sendBack(id, r) })}><RotateCcw size={14} /> Send back</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && <PrimaryButton onClick={() => run(() => trimKitsApi.ready(id))} busy={busy} disabled={busy}><PackageCheck size={14} /> {S === 'PARTLY_ISSUED' ? 'Mark the rest ready' : 'Mark ready'}</PrimaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && <SecondaryButton onClick={openEdit}><Pencil size={14} /> Change</SecondaryButton>}
                {perm.prepare && S === 'READY' && <SecondaryButton onClick={() => run(() => trimKitsApi.unready(id))}><Undo2 size={14} /> Pull back</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && <SecondaryButton onClick={() => askReason({ title: S === 'DRAFT' ? `Cancel ${k.kit_no}` : `Close ${k.kit_no}`, confirm: S === 'DRAFT' ? 'Cancel kit' : 'Close kit', hint: S === 'DRAFT' ? 'Nothing was handed over; the quantities go back to the order for other kits.' : 'What was handed stays issued; the rest is not handed on this kit (it goes back to the order for other kits).', run: (r) => trimKitsApi.close(id, r) })}><Ban size={14} /> {S === 'DRAFT' ? 'Cancel' : 'Close'}</SecondaryButton>}
            </div>
            <ErrorBox text={error} />

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[620px]">
                    <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right">
                        <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">In the kit</th><th className="px-3 py-2">Handed over</th><th className="px-3 py-2">Still to hand</th></tr>
                    </thead>
                    <tbody>
                        {k.lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 text-right tabular-nums">
                                <td className="px-3 py-2 text-left">{l.line_no}</td>
                                <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">{l.label}</span><span className="block text-xs text-slate-500">{l.type_name}</span></td>
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

            {edit && (
                <Modal title={`Change ${k.kit_no}`} onClose={() => setEdit(null)}>
                    <div className="space-y-3 w-[min(980px,94vw)] max-h-[78vh] overflow-y-auto">
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Cut batch"><select className={inputCls} value={edit.cut_batch_id} onChange={e => setEdit({ ...edit, cut_batch_id: e.target.value })}><option value="">— none —</option>{edit.pic.cut_batches.map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}</select></Field>
                            <Field label="Notes"><input className={inputCls} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field>
                        </div>
                        {S === 'PARTLY_ISSUED' && <p className="text-xs text-amber-800">Part of this kit is handed over — a line can't go below what was handed.</p>}
                        <KitItems trims={edit.pic.trims} picks={edit.picks} setPicks={(p) => setEdit({ ...edit, picks: p })} current={current} />
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !payload(edit.pic.trims, edit.picks).length}
                                onClick={() => run(() => trimKitsApi.update(id, { cut_batch_id: edit.cut_batch_id || null, notes: edit.notes, lines: payload(edit.pic.trims, edit.picks) }), () => setEdit(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

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
                            {k.lines.filter(l => l.remaining > 0).map(l => (
                                <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                                    <span className="flex-1 min-w-[180px]"><span className="font-semibold text-sm text-slate-800">{l.label}</span><span className="block text-xs text-slate-500">kit: {handout(l, l.remaining)}</span></span>
                                    <input className="w-24 px-2 py-1.5 text-sm text-right border border-slate-300 rounded" type="number" min="0" step={l.in_units || l.uom === 'pcs' ? 1 : 'any'} value={count.counts.get(l.id) ?? ''}
                                        onChange={e => setCount({ ...count, counts: new Map(count.counts).set(l.id, e.target.value) })} aria-label={`Counted ${l.label}`} />
                                    <span className="text-xs text-slate-500 w-12">{l.in_units ? l.purchase_uom : l.uom}</span>
                                </div>
                            ))}
                        </div>
                        {short && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Some items are short — you sign for what you counted; the rest stays with the store.</p>}
                        <Field label="Note"><input className={inputCls} value={count.note} onChange={e => setCount({ ...count, note: e.target.value })} placeholder={short ? 'e.g. 50 buttons short' : ''} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCount(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !count.line_id}
                                onClick={() => run(() => trimKitsApi.sign(id, {
                                    production_line_id: count.line_id, note: count.note || null,
                                    lines: k.lines.filter(l => l.remaining > 0).map(l => (l.in_units ? { kit_line_id: l.id, units: Number(count.counts.get(l.id) || 0) } : { kit_line_id: l.id, qty: Number(count.counts.get(l.id) || 0) })),
                                }), () => setCount(null))}><PenLine size={14} /> Sign — I received this</PrimaryButton>
                        </div>
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

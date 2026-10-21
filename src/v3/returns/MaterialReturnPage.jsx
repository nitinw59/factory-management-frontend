// One return slip (21 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Return to store — custody"). Draft: the cutting manager
// adds the order's end bits, pocketing / lining left at cutting and issued rolls not cut, then submits. Submitted: the
// fabric store manager counts each line — received (its length) or not received (reason), partial allowed — or sends it
// back; the cutting manager can recall it. Both can download the material return slip (PDF).
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Send, RotateCcw, Ban, Trash2, Plus, CheckCircle2, PackageCheck } from 'lucide-react';
import Modal from '../../shared/Modal';
import { materialReturnsApi } from '../api/materialReturnsApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { loadLetterhead } from '../components/letterhead';
import { ReturnChip } from './MaterialReturnsPage';
import { exportReturnSlip, itemOf, fromOf, LINE_STATUS } from './returnPrint';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 }));
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ACTION = { CREATED: 'Draft made', LINES_ADDED: 'Added', LINE_REMOVED: 'Removed', EDITED: 'Edited', SUBMITTED: 'Submitted', RECALLED: 'Recalled', SENT_BACK: 'Sent back by the store', RECEIVED: 'Received', CANCELLED: 'Cancelled' };
const age = (d) => { const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`; };

// What the order can put on the draft: end bits by fabric × colour, pocketing left at cutting, rolls not cut.
function AddPanel({ cand, busy, onAdd }) {
    const [pickEb, setPickEb] = useState({});
    const [sup, setSup] = useState({});
    const [pickRoll, setPickRoll] = useState({});
    const groups = new Map();
    for (const e of cand.end_bits) {
        const k = `${e.fabric_item_id}|${e.colour_id}`;
        if (!groups.has(k)) groups.set(k, { label: `${e.fabric_label} · ${e.colour}`, rows: [] });
        groups.get(k).rows.push(e);
    }
    const lines = [
        ...Object.keys(pickEb).filter(k => pickEb[k]).map(id => ({ kind: 'END_BIT', end_bit_id: id })),
        ...Object.entries(sup).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ kind: 'SUPPORT', fabric_item_id: id, qty: Number(v) })),
        ...Object.keys(pickRoll).filter(k => pickRoll[k]).map(id => ({ kind: 'ROLL', fabric_roll_id: id })),
    ];
    const none = !cand.end_bits.length && !cand.support.length && !cand.rolls.length;
    return (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 mb-4">
            <p className="font-black text-slate-800 mb-1">Add to this slip</p>
            {none ? <p className="text-sm text-slate-500">Nothing of this order is left in the cutting room.</p> : (<>
                {[...groups.values()].map(g => {
                    const all = g.rows.every(e => pickEb[e.id]);
                    return (
                        <div key={g.label} className="mb-2">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" className="w-4 h-4" checked={all} onChange={e => setPickEb({ ...pickEb, ...Object.fromEntries(g.rows.map(r => [r.id, e.target.checked])) })} />
                                {g.label} <span className="text-xs font-normal text-slate-500">{g.rows.length} end bit(s) · {fmt(g.rows.reduce((a, r) => a + r.metres, 0))} {g.rows[0].uom}</span></label>
                            <div className="flex flex-wrap gap-2 mt-1 ml-6">{g.rows.map(e => (
                                <label key={e.id} className={`flex items-center gap-1.5 text-xs rounded border px-2 py-1 ${pickEb[e.id] ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
                                    <input type="checkbox" checked={Boolean(pickEb[e.id])} onChange={ev => setPickEb({ ...pickEb, [e.id]: ev.target.checked })} />
                                    <b>{e.tag}</b> {e.kind === 'RESERVE' ? 'reserve' : 'lay'} · {fmt(e.metres)} {e.uom} · {age(e.created_at)}</label>
                            ))}</div>
                        </div>
                    );
                })}
                {cand.support.map(s => (
                    <div key={s.fabric_item_id} className="flex flex-wrap items-center gap-2 text-sm mb-2">
                        <b>{s.fabric_label}</b><span className="text-xs text-slate-500">pocketing / lining · {fmt(s.left)} {s.uom} at cutting</span>
                        <input type="number" min="0" step="any" className="w-28 px-2 py-1 border border-slate-300 rounded text-right" placeholder={String(s.left)} value={sup[s.fabric_item_id] ?? ''} onChange={e => setSup({ ...sup, [s.fabric_item_id]: e.target.value })} aria-label={`${s.fabric_label} metres`} />
                        <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => setSup({ ...sup, [s.fabric_item_id]: String(s.left) })}>all</button>
                    </div>
                ))}
                {cand.rolls.length > 0 && <div className="flex flex-wrap gap-2 mb-2">{cand.rolls.map(r => (
                    <label key={r.fabric_roll_id} className={`flex items-center gap-1.5 text-xs rounded border px-2 py-1 ${pickRoll[r.fabric_roll_id] ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
                        <input type="checkbox" checked={Boolean(pickRoll[r.fabric_roll_id])} onChange={e => setPickRoll({ ...pickRoll, [r.fabric_roll_id]: e.target.checked })} />
                        Roll <b>{r.roll_no}</b> (not cut) · {r.fabric_label} · {fmt(r.qty)} {r.uom}</label>
                ))}</div>}
                <PrimaryButton busy={busy} disabled={busy || !lines.length} onClick={() => onAdd(lines, () => { setPickEb({}); setSup({}); setPickRoll({}); })}><Plus size={14} /> Add {lines.length || ''} to the slip</PrimaryButton>
            </>)}
        </div>
    );
}

export default function MaterialReturnPage() {
    const { id } = useParams();
    const [mr, setMr] = useState(null);
    const [perm, setPerm] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(null);       // { title, label, required, run(text) }
    const [txt, setTxt] = useState('');
    const [rcv, setRcv] = useState(null);       // receive mode: { [lineId]: { received, qty, reason, note } }
    const [rcvNote, setRcvNote] = useState('');
    const [formError, setFormError] = useState('');
    const load = useCallback(() => materialReturnsApi.get(id).then(r => setMr(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [id]);
    useEffect(() => { load(); materialReturnsApi.permissions().then(r => setPerm(r.data)).catch(() => {}); }, [load]);
    if (!mr) return error ? <ErrorBox text={error} /> : <Loading />;
    const run = async (fn) => {
        setBusy(true); setError('');
        try { await fn(); await load(); return true; }
        catch (err) { setError(apiError(err, 'Failed.')); return false; } finally { setBusy(false); }
    };
    const open = (cfg) => { setTxt(''); setFormError(''); setAsk(cfg); };
    const doAsk = async () => {
        if (ask.required && !txt.trim()) return;
        setBusy(true); setFormError('');
        try { setMr((await ask.run(txt.trim())).data); setAsk(null); load(); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const startReceive = () => { setFormError(''); setRcvNote(''); setRcv(Object.fromEntries(mr.lines.map(l => [l.id, { received: true, qty: String(l.listed_qty), reason: '', note: '' }]))); };
    const doReceive = async () => {
        setBusy(true); setFormError('');
        try {
            const r = await materialReturnsApi.receive(id, mr.lines.map(l => { const v = rcv[l.id]; return v.received ? { line_id: l.id, received: true, qty: Number(v.qty), note: v.note || undefined } : { line_id: l.id, received: false, reason: v.reason, note: v.note || undefined }; }), rcvNote || undefined);
            setMr(r.data); setRcv(null);
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const draft = mr.status === 'DRAFT';
    const receiving = Boolean(rcv);
    const rcvReady = receiving && mr.lines.every(l => { const v = rcv[l.id]; return v.received ? Number(v.qty) > 0 && Number(v.qty) <= l.listed_qty + 1e-9 : v.reason.trim(); });
    const th = 'px-2 py-2';
    const td = 'px-2 py-1.5';
    return (
        <div>
            <Link to="/v3/material-returns" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Material returns</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{mr.return_no}</h1>
                <ReturnChip status={mr.status} />
            </div>
            <p className="text-sm text-slate-600">{mr.order_no} · {mr.customer_name}{mr.styles ? ` · ${mr.styles}` : ''}</p>
            <p className="text-xs text-slate-500 mb-3">Prepared by {mr.created_by_name || '—'} {when(mr.created_at)}{mr.submitted_at ? ` · submitted by ${mr.submitted_by_name} ${when(mr.submitted_at)}` : ''}{mr.received_at ? ` · received by ${mr.received_by_name} ${when(mr.received_at)}` : ''}{mr.cancelled_reason ? ` · cancelled: ${mr.cancelled_reason}` : ''}</p>
            <div className="flex flex-wrap gap-2 mb-3">
                {draft && perm.prepare && <PrimaryButton busy={busy} disabled={busy || !mr.lines.length} onClick={() => run(() => materialReturnsApi.submit(id))}><Send size={14} /> Submit to the fabric store</PrimaryButton>}
                {draft && perm.prepare && <SecondaryButton onClick={() => open({ title: 'Note on the slip', label: 'Note', run: (t) => materialReturnsApi.update(id, t || null) })}>Note</SecondaryButton>}
                {draft && perm.prepare && <SecondaryButton onClick={() => open({ title: `Cancel ${mr.return_no}`, label: 'Reason *', required: true, run: (t) => materialReturnsApi.cancel(id, t) })}><Ban size={14} /> Cancel draft</SecondaryButton>}
                {mr.status === 'SUBMITTED' && perm.receive && !receiving && <PrimaryButton onClick={startReceive}><PackageCheck size={14} /> Receive</PrimaryButton>}
                {mr.status === 'SUBMITTED' && perm.receive && !receiving && <SecondaryButton onClick={() => open({ title: 'Send back to the cutting room', label: 'Why *', required: true, run: (t) => materialReturnsApi.sendBack(id, t) })}><RotateCcw size={14} /> Send back</SecondaryButton>}
                {mr.status === 'SUBMITTED' && perm.prepare && !receiving && <SecondaryButton onClick={() => open({ title: `Recall ${mr.return_no}`, label: 'Reason (optional)', run: (t) => materialReturnsApi.recall(id, t || undefined) })}><RotateCcw size={14} /> Recall</SecondaryButton>}
                <span className="ml-auto"><SecondaryButton onClick={async () => exportReturnSlip(mr, await loadLetterhead())}><FileDown size={14} /> Material return slip (PDF)</SecondaryButton></span>
            </div>
            <ErrorBox text={error} />
            {mr.notes && <p className="text-sm text-slate-700 mb-3"><b>Note:</b> {mr.notes}</p>}
            {draft && perm.prepare && mr.candidates && <AddPanel cand={mr.candidates} busy={busy} onAdd={async (lines, reset) => { if (await run(() => materialReturnsApi.addLines(id, lines))) reset(); }} />}
            {receiving && <p className="mb-2 text-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">Count each line. Received: enter the length you got (up to what was sent; a roll comes back whole). Not received: give the reason — it goes back to the cutting room. Stock moves only when you approve.</p>}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>
                        <th className={th}>#</th><th className={th}>Item</th><th className={th}>Fabric · colour</th><th className={th}>From</th><th className={`${th} text-right`}>Sent</th>
                        <th className={`${th} text-right`}>Received</th><th className={th}>Status</th><th className={th} /></tr></thead>
                    <tbody>
                        {mr.lines.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Nothing on the slip yet — add from above.</td></tr>}
                        {mr.lines.map((l, i) => {
                            const v = rcv?.[l.id];
                            return (
                                <tr key={l.id} className={`border-t border-slate-100 align-top ${l.status === 'NOT_RECEIVED' ? 'bg-rose-50/60' : ''}`}>
                                    <td className={`${td} text-slate-400`}>{i + 1}</td>
                                    <td className={`${td} font-semibold whitespace-nowrap`}>{itemOf(l)}</td>
                                    <td className={td}>{l.fabric_label}{l.colour ? <span className="text-slate-500"> · {l.colour}</span> : null}</td>
                                    <td className={`${td} text-xs text-slate-600`}>{fromOf(l)}</td>
                                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{fmt(l.listed_qty)} {l.uom}</td>
                                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                                        {receiving ? (v.received ? <input type="number" min="0" step="any" className="w-24 px-2 py-1 border border-slate-300 rounded text-right" value={v.qty} disabled={l.kind === 'ROLL'} onChange={e => setRcv({ ...rcv, [l.id]: { ...v, qty: e.target.value } })} aria-label={`Received ${itemOf(l)}`} /> : '0')
                                            : l.status === 'PENDING' ? '—' : `${fmt(l.received_qty)} ${l.uom}`}
                                    </td>
                                    <td className={td}>
                                        {receiving ? (
                                            <div className="space-y-1 min-w-[260px]">
                                                <div className="flex gap-3 text-xs font-semibold">
                                                    <label className="flex items-center gap-1"><input type="radio" checked={v.received} onChange={() => setRcv({ ...rcv, [l.id]: { ...v, received: true } })} /> Received</label>
                                                    <label className="flex items-center gap-1"><input type="radio" checked={!v.received} onChange={() => setRcv({ ...rcv, [l.id]: { ...v, received: false } })} /> Not received</label>
                                                </div>
                                                {!v.received && <input className={inputCls} placeholder="Reason * (missing, damaged, wrong item…)" value={v.reason} onChange={e => setRcv({ ...rcv, [l.id]: { ...v, reason: e.target.value } })} />}
                                                <input className={inputCls} placeholder="Note (optional)" value={v.note} onChange={e => setRcv({ ...rcv, [l.id]: { ...v, note: e.target.value } })} />
                                            </div>
                                        ) : (
                                            <span className="text-xs"><b className={l.status === 'RECEIVED' ? 'text-emerald-700' : l.status === 'NOT_RECEIVED' ? 'text-rose-700' : 'text-slate-600'}>{LINE_STATUS[l.status]}</b>
                                                {l.not_received_reason && <span className="block text-rose-700">{l.not_received_reason}</span>}
                                                {l.remnant_roll_no && <span className="block text-slate-500">→ remnant roll {l.remnant_roll_no}</span>}
                                                {l.receive_note && <span className="block text-slate-500">{l.receive_note}</span>}</span>
                                        )}
                                    </td>
                                    <td className={`${td} text-right`}>{draft && perm.prepare && <button type="button" className="p-1 text-rose-500" title="Take off the slip" aria-label={`Remove ${itemOf(l)}`} disabled={busy} onClick={() => run(() => materialReturnsApi.removeLine(id, l.id))}><Trash2 size={14} /></button>}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {mr.totals?.length > 0 && <tfoot>{mr.totals.map(t => (
                        <tr key={t.uom} className="border-t-2 border-slate-300 bg-slate-50 font-black">
                            <td className={td} /><td className={td} colSpan={3}>Total ({t.uom})</td>
                            <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{fmt(t.listed)} {t.uom}</td>
                            <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{mr.status === 'RECEIVED' ? `${fmt(t.received)} ${t.uom}` : '—'}</td><td className={td} colSpan={2} />
                        </tr>
                    ))}</tfoot>}
                </table>
            </div>
            {receiving && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                    <Field label="Note for the slip (optional)"><input className={inputCls} value={rcvNote} onChange={e => setRcvNote(e.target.value)} /></Field>
                    <ErrorBox text={formError} />
                    <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setRcv(null)}>Back</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !rcvReady} onClick={doReceive}><CheckCircle2 size={14} /> Approve receipt ({mr.lines.filter(l => rcv[l.id].received).length} received, {mr.lines.filter(l => !rcv[l.id].received).length} not)</PrimaryButton></div>
                </div>
            )}
            {mr.receive_note && <p className="text-sm text-slate-700 mb-3"><b>Store note:</b> {mr.receive_note}</p>}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">History</p>
                {mr.history.map(h => (
                    <div key={h.id} className="py-1 text-sm"><span className="text-xs text-slate-400 mr-2">{when(h.created_at)}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                        {(h.detail?.summary || []).map(x => <span key={x} className="block text-xs text-slate-500 ml-4">{x}</span>)}</div>
                ))}
            </div>
            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <Field label={ask.label}><textarea className={`${inputCls} min-h-[80px]`} value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton><PrimaryButton onClick={doAsk} busy={busy} disabled={busy || (ask.required && !txt.trim())}>Save</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

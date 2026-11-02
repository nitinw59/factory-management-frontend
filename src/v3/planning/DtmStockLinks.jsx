// DTM needs of an order (3 Nov 2026): each garment colour's need, the real trim item matched to it, and in-house links. The trim
// store links stock that matches the fabric, the merchandiser or factory admin checks the shade and approves; approving makes the
// match and allocates. Otherwise the purchase manager's code on the PO makes the match (backend dtmMatch.js, dtmLinksController.js).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const STATUS = {
    PENDING: ['Waiting for approval', 'bg-amber-50 text-amber-800 border-amber-300'], APPROVED: ['Approved', 'bg-emerald-50 text-emerald-700 border-emerald-300'],
    REJECTED: ['Rejected', 'bg-rose-50 text-rose-700 border-rose-300'], CANCELLED: ['Cancelled', 'bg-slate-50 text-slate-500 border-slate-300'],
};
const SOURCE = { PO: 'supplier code on PO', IN_HOUSE: 'in-house' };
const th = 'px-3 py-2';

export function DtmLinksPanel({ orderId, tick, onChanged, onLinks }) {
    const [d, setD] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);   // { title, hint, label, run(reason) }
    const [open, setOpen] = useState(false);   // folded until clicked; the header says what is waiting
    const load = useCallback(() => planningApi.dtmLinks(orderId).then(r => { setD(r.data); onLinks?.(r.data.links, r.data.can_request); }).catch(err => setError(apiError(err, 'Failed to load DTM needs.'))), [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { load(); }, [load, tick]);
    const act = async (id, fn) => {
        setBusy(id); setError('');
        try { await fn(); await load(); onChanged?.(); setAsk(null); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(null); }
    };
    if (!d?.needs.length && !d?.links.length) return error ? <ErrorBox text={error} /> : null;
    const matched = d.needs.filter(n => n.matched_item_id).length;
    const units = [...new Set(d.needs.map(n => n.uom))];
    const waiting = d.links.filter(l => l.status === 'PENDING').length;
    return (
        <div className="bg-white border border-violet-200 rounded-xl mb-3 overflow-x-auto">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full text-left flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 hover:bg-violet-50/50 rounded-xl">
                <ChevronRight size={16} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                <span className="font-bold text-slate-800">DTM needs: {matched} of {d.needs.length} matched</span>
                {waiting > 0 && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-violet-100 text-violet-900 border-violet-300">{waiting} waiting for approval</span>}
            </button>
            {!open && <ErrorBox text={error} />}
            {open && <>
            <p className="px-4 pb-2 text-xs text-slate-500">Matched by the purchase manager's code or pick on the PO, or by in-house stock the store or purchase manager links and the merchandiser approves. A match stays for repeat orders of the same fabric.</p>
            <ErrorBox text={error} />
            {d.links.length > 0 && (
                <>
                    <p className="px-4 pt-1 pb-1 text-sm font-bold text-slate-700">In-house links</p>
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                            <tr><th className={th}>Need</th><th className={th}>Stock item</th><th className={`${th} text-right`}>To allocate</th><th className={th}>Status</th><th className={th}>By</th><th className={`${th} w-44`} /></tr>
                        </thead>
                        <tbody>
                            {d.links.map(l => (
                                <tr key={l.id} className="border-t border-slate-100 align-top">
                                    <td className={th}><span className="font-semibold text-slate-800">{l.quality}</span>{l.dtm_reference && <span className="block text-xs text-slate-500">{l.dtm_reference}</span>}</td>
                                    <td className={th}>{l.source_label}{l.note && <span className="block text-xs text-slate-500">{l.note}</span>}</td>
                                    <td className={`${th} text-right tabular-nums whitespace-nowrap`}>{fmt(l.qty, l.uom)} {l.uom}</td>
                                    <td className={th}><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${STATUS[l.status][1]}`}>{STATUS[l.status][0]}</span>{l.decision_reason && <span className="block text-xs text-rose-700 mt-0.5">{l.decision_reason}</span>}</td>
                                    <td className={`${th} text-xs text-slate-600`}>{l.requested_by_name || '—'}{l.decided_by_name && <span className="block">{l.status === 'CANCELLED' ? 'cancelled by' : 'decided by'} {l.decided_by_name}</span>}</td>
                                    <td className={`${th} text-right whitespace-nowrap`}>
                                        {l.status === 'PENDING' && d.can_decide && <>
                                            <button type="button" disabled={busy === l.id} className="text-xs font-bold text-emerald-700 hover:underline mr-3 disabled:opacity-50" onClick={() => { if (window.confirm(`Approve? Checked the shade against the fabric: ${l.source_label} becomes the item for this fabric, and ${fmt(l.qty, l.uom)} ${l.uom} is allocated to ${l.order_no}.`)) act(l.id, () => planningApi.approveDtmLink(l.id)); }}>Approve</button>
                                            <button type="button" disabled={busy === l.id} className="text-xs font-bold text-rose-700 hover:underline mr-3 disabled:opacity-50" onClick={() => setAsk({ title: 'Reject the link', hint: `${l.source_label} for ${l.quality}. The order then buys this need instead.`, label: 'Reason *', placeholder: 'e.g. shade too dark on the fabric', run: (reason) => act(l.id, () => planningApi.rejectDtmLink(l.id, reason)) })}>Reject</button>
                                        </>}
                                        {l.status === 'PENDING' && (d.can_decide || d.can_request) && <button type="button" disabled={busy === l.id} className="text-xs font-bold text-slate-600 hover:underline disabled:opacity-50" onClick={() => act(l.id, () => planningApi.cancelDtmLink(l.id))}>Cancel</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="px-4 pt-3 pb-1 text-sm font-bold text-slate-700">All DTM needs</p>
                </>
            )}
            <table className="w-full text-sm min-w-[860px]">
                <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <tr><th className={th}>Quality</th><th className={th}>Garment colour</th><th className={th}>Match to fabric</th><th className={`${th} text-right`}>Needed</th><th className={th}>Trim item</th><th className={`${th} w-24`} /></tr>
                </thead>
                <tbody>
                    {d.needs.map(n => (
                        <tr key={`${n.stand_in_id}-${n.colour}`} className="border-t border-slate-100 align-top">
                            <td className={`${th} font-semibold text-slate-800`}>{n.quality}</td>
                            <td className={th}>{n.colour}</td>
                            <td className={`${th} text-xs text-slate-600`}>{n.dtm_reference}</td>
                            <td className={`${th} text-right tabular-nums whitespace-nowrap`}>{fmt(n.required, n.uom)} {n.uom}</td>
                            <td className={th}>{n.matched_code ? <><b className="text-emerald-800">{n.matched_code}</b><span className="block text-xs text-slate-500">{SOURCE[n.source]}{n.matched_by_name ? ` · ${n.matched_by_name}` : ''}</span></> : <span className="text-amber-800 font-semibold">To match</span>}</td>
                            <td className={`${th} text-right`}>{n.matched_item_id && d.can_decide && <button type="button" disabled={busy === n.stand_in_id} className="text-xs font-bold text-slate-600 hover:underline disabled:opacity-50"
                                onClick={() => setAsk({ title: `Clear the match of ${n.colour}`, hint: `${n.matched_code} stops being used for this fabric. Refused if it is already allocated, issued, or on a requisition or PO.`, label: 'Reason *', placeholder: 'e.g. wrong shade picked', run: (reason) => act(n.stand_in_id, () => planningApi.clearDtmMatch(n.stand_in_id, reason)) })}>Clear</button>}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                    <td className={th} colSpan={3}>Total · {d.needs.length} need(s)</td>
                    <td className={`${th} text-right tabular-nums whitespace-nowrap`}>{units.map(u => `${fmt(d.needs.filter(n => n.uom === u).reduce((t, n) => t + n.required, 0), u)} ${u}`).join(' + ')}</td>
                    <td colSpan={2} />
                </tr></tfoot>
            </table>
            </>}
            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(460px,92vw)]">
                        <p className="text-sm text-slate-600">{ask.hint}</p>
                        <Field label={ask.label}><input className={inputCls} autoFocus value={ask.reason || ''} onChange={e => setAsk({ ...ask, reason: e.target.value })} placeholder={ask.placeholder} /></Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton disabled={!String(ask.reason || '').trim() || busy != null} onClick={() => ask.run(ask.reason)}>Confirm</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// The store or the purchase manager picks the item and how much to allocate. One need, one item: any balance is bought under the same code.
export function DtmLinkModal({ orderId, item, onClose, onDone }) {
    const [d, setD] = useState(null);
    const [sourceId, setSourceId] = useState('');
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        planningApi.dtmLinkSources({ order_id: orderId, item_id: item.item_id }).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load the stock.')));
    }, [orderId, item.item_id]);
    const src = d?.sources.find(s => s.id === sourceId);
    const most = src ? Math.min(d.required, src.free) : 0;
    const n = Number(qty);
    const bad = !src || !(n > 0) || n > most + 1e-9 || (d.item.uom === 'pcs' && !Number.isInteger(n));
    const pick = (s) => { setSourceId(s.id); setQty(String(Math.min(d.required, s.free))); };
    const save = async () => {
        setBusy(true); setError('');
        try { await planningApi.createDtmLink({ order_id: orderId, dtm_item_id: item.item_id, source_item_id: sourceId, qty: n, note: note.trim() || undefined }); onDone(); }
        catch (err) { setError(apiError(err, 'Failed to link the stock.')); setBusy(false); }
    };
    return (
        <Modal title="Use in-house stock for this DTM need" onClose={onClose}>
            <div className="space-y-3 w-[min(760px,92vw)]">
                <ErrorBox text={error} />
                {!d ? (!error && <Loading />) : <>
                    <p className="text-sm text-slate-700"><b>{item.label}</b>. Needed: <b>{fmt(d.required, d.item.uom)} {d.item.uom}</b>. The merchandiser checks the shade against the fabric. If there is not enough, the balance is bought under the same code.</p>
                    {d.sources.length === 0 ? <p className="text-sm text-slate-500 py-3">No free stock of this trim type and unit.</p> : (
                        <div className="max-h-[45vh] overflow-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0"><tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">Stock item</th><th className="px-3 py-2 text-right">Free</th></tr></thead>
                                <tbody>{d.sources.map(s => (
                                    <tr key={s.id} className={`border-t border-slate-100 cursor-pointer ${sourceId === s.id ? 'bg-violet-50' : 'hover:bg-slate-50'}`} onClick={() => pick(s)}>
                                        <td className="px-3 py-2"><input type="radio" name="dtm-source" checked={sourceId === s.id} onChange={() => pick(s)} aria-label={s.label} /></td>
                                        <td className="px-3 py-2 font-semibold text-slate-800">{s.label}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(s.free, d.item.uom)} {d.item.uom}</td>
                                    </tr>
                                ))}</tbody>
                                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 sticky bottom-0"><td /><td className="px-3 py-2">Total {d.sources.length} item(s)</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(d.sources.reduce((t, s) => t + s.free, 0), d.item.uom)} {d.item.uom}</td></tr></tfoot>
                            </table>
                        </div>
                    )}
                    {d.backfill_only > 0 && <p className="text-xs text-amber-800">{d.backfill_only} item(s) not listed: their stock is only the temporary backfill, which isn't on the shelf. Count them first.</p>}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={`Allocate (${d.item.uom}) *`} hint={src ? `At most ${fmt(most, d.item.uom)} ${d.item.uom}.` : 'Choose the stock first.'}><input className={inputCls} type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} /></Field>
                        <Field label="Note"><input className={inputCls} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. rack B2, close to the fabric" /></Field>
                    </div>
                    <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || bad} onClick={save}>Send for approval</PrimaryButton>
                    </div>
                </>}
            </div>
        </Modal>
    );
}

// One in-house link, on the Approvals page: the merchandiser decides right there, with everything needed to decide.
export function DtmLinkReview({ id, onClose, onDone }) {
    const [l, setL] = useState(null);
    const [reason, setReason] = useState(null);   // null: not rejecting
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { planningApi.dtmLink(id).then(r => setL(r.data)).catch(err => setError(apiError(err, 'Failed to load the request.'))); }, [id]);
    const act = async (fn) => {
        setBusy(true); setError('');
        try { await fn(); onDone(); } catch (err) { setError(apiError(err, 'Failed.')); setBusy(false); }
    };
    const row = (k, v) => <tr className="border-t border-slate-100 first:border-t-0"><td className="py-1.5 pr-4 text-slate-500 whitespace-nowrap align-top">{k}</td><td className="py-1.5 font-semibold text-slate-800">{v}</td></tr>;
    return (
        <Modal title="DTM from in-house stock" onClose={onClose}>
            <div className="space-y-3 w-[min(560px,92vw)]">
                <ErrorBox text={error} />
                {!l ? (!error && <Loading />) : <>
                    <table className="w-full text-sm"><tbody>
                        {row('Order', <Link to={`/v3/planning/orders/${l.order_id}?tab=TRIM`} className="text-indigo-700 hover:underline">{l.order_no}</Link>)}
                        {row('Quality', l.quality)}
                        {row('Garment colour', l.colours.join(', ') || '—')}
                        {row('Match to fabric', l.dtm_reference || '—')}
                        {row('Stock item', l.source_label)}
                        {row('Needed', `${fmt(l.required, l.uom)} ${l.uom}`)}
                        {row('To allocate', `${fmt(l.qty, l.uom)} ${l.uom}`)}
                        {row('Free stock of this item', `${fmt(l.source_free, l.uom)} ${l.uom}`)}
                        {row('Asked by', l.requested_by_name || '—')}
                        {l.note && row('Note', l.note)}
                    </tbody></table>
                    {l.status !== 'PENDING' ? <p className="text-sm font-bold text-slate-600">This request is already {l.status.toLowerCase()}.</p> : !l.can_decide ? <p className="text-sm text-slate-600">Waiting for the merchandiser or factory admin.</p> : reason === null ? (
                        <>
                            <p className="text-sm text-slate-600">Check the shade against the fabric first. Approving makes {l.source_label} the item for this fabric, on repeat orders too, and allocates the quantity to this order. Any balance is bought under the same code.</p>
                            <div className="flex justify-end gap-2">
                                <SecondaryButton onClick={onClose}>Close</SecondaryButton>
                                <SecondaryButton disabled={busy} onClick={() => setReason('')}>Reject</SecondaryButton>
                                <PrimaryButton busy={busy} disabled={busy} onClick={() => act(() => planningApi.approveDtmLink(l.id))}>Approve</PrimaryButton>
                            </div>
                        </>
                    ) : (
                        <>
                            <Field label="Why reject? *" hint="The order then buys this need instead."><input className={inputCls} autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. shade too dark on the fabric" /></Field>
                            <div className="flex justify-end gap-2">
                                <SecondaryButton onClick={() => setReason(null)}>Back</SecondaryButton>
                                <PrimaryButton busy={busy} disabled={busy || !reason.trim()} onClick={() => act(() => planningApi.rejectDtmLink(l.id, reason))}>Reject</PrimaryButton>
                            </div>
                        </>
                    )}
                </>}
            </div>
        </Modal>
    );
}

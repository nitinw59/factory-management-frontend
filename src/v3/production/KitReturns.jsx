// Trims the line loader rejected from a kit (26 Nov 2026, migration 92; owner: "loader might reject 1 or more item and
// confirm kit rejected items goes back to store with notification" → "notification is enough but also build confirmation
// flow with auto confirm for now"). Nothing moved in stock at signing (they were never issued); the store confirms each:
// back on the shelf (it goes in the next kit), or written off (stock adjusted down, the order's allocation released
// first). With auto confirm on (Settings) they are received at signing — the store can still write one off.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';
import { REJECT_REASON, RETURN_STATE, qty } from './trimKitShared';

const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// rows: GET /trim-kits/returns rows (or a trim order's `returns`); canConfirm: the trim store; onDone(row) after a confirmation;
// showOrder: a column for the trim order / kit (the list); compact: no outer card (inside another card).
export default function KitReturns({ rows, canConfirm, onDone, showOrder = false }) {
    const [ask, setAsk] = useState(null);   // { row, outcome, note }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setBusy(true); setError('');
        try { const res = await trimKitsApi.confirmReturn(ask.row.id, { outcome: ask.outcome, note: ask.note.trim() || undefined }); setAsk(null); if (onDone) onDone(res.data); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const n = (st) => rows.filter(r => r.status === st).length;
    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                    <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-left"><tr>
                        {showOrder && <th className="px-3 py-2">Kit · trim order</th>}
                        <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Rejected</th><th className="px-3 py-2">Why</th><th className="px-3 py-2">By · line</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
                    </tr></thead>
                    <tbody>
                        {rows.map(r => {
                            const st = RETURN_STATE[r.status] || RETURN_STATE.PENDING;
                            const can = canConfirm && (r.status === 'PENDING' || (r.status === 'RECEIVED' && r.auto_confirmed));
                            return (
                                <tr key={r.id} className="border-t border-slate-100 align-top">
                                    {showOrder && <td className="px-3 py-2"><Link to={`/v3/trim-kits/${r.kit_id}`} className="font-black text-indigo-700 hover:underline whitespace-nowrap">{r.kit_no}</Link>
                                        <span className="block text-xs text-slate-500">{r.trim_order_no} · {r.order_no}{r.floor_no ? ` · #${r.floor_no}` : ''}</span></td>}
                                    <td className="px-3 py-2"><span className="font-semibold text-slate-800">{r.label}</span><span className="block text-xs text-slate-500">line {r.line_no}</span></td>
                                    <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap">{qty(r.qty, r.uom)} {r.uom}</td>
                                    <td className="px-3 py-2 text-xs"><b>{REJECT_REASON[r.reason] || r.reason}</b>{r.note ? ` — ${r.note}` : ''}</td>
                                    <td className="px-3 py-2 text-xs">{r.rejected_by_name || '—'}{r.production_line_name ? ` · ${r.production_line_name}` : ''}<span className="block text-slate-500">{when(r.rejected_at)}</span></td>
                                    <td className="px-3 py-2 text-xs"><span className={`text-[11px] font-black px-2 py-0.5 rounded border whitespace-nowrap ${st.cls}`}>{st.label}</span>
                                        {r.status !== 'PENDING' && <span className="block mt-1 text-slate-500">{r.auto_confirmed ? 'received automatically' : `${r.confirmed_by_name || '—'} · ${when(r.confirmed_at)}`}{r.adjusted_qty ? ` · stock −${qty(r.adjusted_qty, r.uom)} ${r.uom}` : ''}{r.confirm_note && !r.auto_confirmed ? ` — ${r.confirm_note}` : ''}</span>}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{can && (
                                        <span className="inline-flex gap-1.5">
                                            {r.status === 'PENDING' && <button type="button" className="text-xs font-bold px-2 py-1 rounded border border-emerald-300 text-emerald-800 hover:bg-emerald-50" onClick={() => { setError(''); setAsk({ row: r, outcome: 'SHELF', note: '' }); }}>Received back</button>}
                                            <button type="button" className="text-xs font-bold px-2 py-1 rounded border border-rose-300 text-rose-800 hover:bg-rose-50" onClick={() => { setError(''); setAsk({ row: r, outcome: 'WRITE_OFF', note: '' }); }}>Write off…</button>
                                        </span>)}</td>
                                </tr>
                            );
                        })}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                            <td className="px-3 py-2" colSpan={showOrder ? 2 : 1}>Total · {rows.length} rejected line(s)</td>
                            <td className="px-3 py-2" colSpan={5}>{[[n('PENDING'), 'to confirm', 'text-rose-700'], [n('RECEIVED'), 'back on the shelf', 'text-emerald-700'], [n('WRITTEN_OFF'), 'written off', 'text-slate-600']].filter(([x]) => x).map(([x, t, c]) => <span key={t} className={`mr-3 ${c}`}>{x} {t}</span>)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            {ask && (
                <Modal title={ask.outcome === 'SHELF' ? 'Received back — on the shelf' : 'Write off'} onClose={() => setAsk(null)}>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700"><b>{ask.row.label}</b> — {qty(ask.row.qty, ask.row.uom)} {ask.row.uom} rejected from {ask.row.kit_no || 'the kit'} ({REJECT_REASON[ask.row.reason]}{ask.row.note ? `: ${ask.row.note}` : ''}).</p>
                        <p className="text-sm text-slate-600">{ask.outcome === 'SHELF'
                            ? 'It came back and is good: it stays in stock and goes in the next kit.'
                            : 'It is damaged or lost: the stock goes down by it (what is on the shelf for it), the order\'s reservation of it is released first. The item stays owed on the trim order.'}</p>
                        <Field label={ask.outcome === 'SHELF' ? 'Note (optional)' : 'Why it is written off'}>
                            <input className={inputCls} value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} placeholder={ask.outcome === 'SHELF' ? '' : 'e.g. torn packets, not usable'} autoFocus />
                        </Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (ask.outcome === 'WRITE_OFF' && !ask.note.trim())} onClick={save}>{ask.outcome === 'SHELF' ? 'Received back' : 'Write off'}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}

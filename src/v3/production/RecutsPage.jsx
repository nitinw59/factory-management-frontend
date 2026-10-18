// Re-cuts: pieces rejected at a stage check. The cutting manager cuts a
// replacement (same garment number) from fabric issued to cutting for the
// order; it starts again at the first stage. Or cancels with a reason.
// 18 Oct 2026: also the material replacement queue (as 2.0) — pieces in rework flagged by the line loader for new
// material: accept (sourcing), then fulfil (new material on the same piece → back to "to check"), or cancel.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const REP = { REQUESTED: ['Requested', 'bg-violet-50 text-violet-800 border-violet-300'], ACCEPTED: ['Accepted — sourcing', 'bg-indigo-50 text-indigo-800 border-indigo-300'], FULFILLED: ['Fulfilled', 'bg-emerald-50 text-emerald-800 border-emerald-300'], CANCELLED: ['Cancelled', 'bg-slate-50 text-slate-500 border-slate-300'] };

function ReplacementQueue({ perms }) {
    const [status, setStatus] = useState('open');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(null);
    const load = useCallback(() => productionApi.replacements({ status }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [status]);
    useEffect(() => { load(); }, [load]);
    const act = async (id, fn) => {
        setBusy(id); setError('');
        try { await fn(); load(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(null); }
    };
    if (rows && rows.length === 0 && status === 'open' && !perms.replaceFulfil) return null;
    return (
        <div className="mb-5">
            <div className="flex flex-wrap items-end gap-2 mb-2">
                <div><h2 className="text-base font-black text-slate-800">Material replacement</h2><p className="text-xs text-slate-500">Pieces in rework that need new material (flagged from the line loader). Accept while sourcing, then fulfil — the same piece goes back to "to check" at that stage.</p></div>
                <select className="ml-auto px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Replacement status"><option value="open">Open</option><option value="FULFILLED">Fulfilled</option><option value="CANCELLED">Cancelled</option></select>
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-5 text-center">No requests.</p> : (
                <div className="bg-white border border-violet-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-violet-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Piece</th><th className="px-3 py-2">Batch · stage</th><th className="px-3 py-2">Defect</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Status</th><th /></tr></thead>
                        <tbody>{rows.map(r => (
                            <tr key={r.id} className="border-t border-slate-100">
                                <td className="px-3 py-2"><b>{r.part_name} · {r.size} #{r.no}</b><span className="block text-xs text-slate-500">roll #{r.roll_no ?? '—'} · {r.colour} · {r.uid}</span></td>
                                <td className="px-3 py-2"><b>#{r.floor_no}</b> {r.batch_code}<span className="block text-xs text-slate-500">{r.stage}</span></td>
                                <td className="px-3 py-2 text-xs">{r.defect_code ? `${r.defect_code} — ${r.defect}` : '—'}{r.notes ? <span className="block text-slate-500">“{r.notes}”</span> : null}</td>
                                <td className="px-3 py-2 text-xs text-slate-600">{r.requested_by_name || '—'}<span className="block text-slate-400">{new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></td>
                                <td className="px-3 py-2"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${REP[r.status][1]}`}>{REP[r.status][0]}</span>{r.accepted_by_name && <span className="block text-[11px] text-slate-500">by {r.accepted_by_name}</span>}{r.cancelled_reason && <span className="block text-[11px] text-slate-500">{r.cancelled_reason}</span>}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">{perms.replaceFulfil && ['REQUESTED', 'ACCEPTED'].includes(r.status) && <span className="inline-flex gap-1">
                                    {r.status === 'REQUESTED' && <SecondaryButton disabled={busy === r.id} onClick={() => act(r.id, () => productionApi.acceptReplacement(r.id))}>Accept</SecondaryButton>}
                                    {r.status === 'ACCEPTED' && <PrimaryButton busy={busy === r.id} disabled={busy === r.id} onClick={() => act(r.id, () => productionApi.fulfilReplacement(r.id))}>Fulfil</PrimaryButton>}
                                    <SecondaryButton disabled={busy === r.id} onClick={() => { const why = window.prompt('Why cancel? The piece stays in rework.'); if (why !== null) act(r.id, () => productionApi.cancelReplacement(r.id, why.trim() || undefined)); }}>Cancel</SecondaryButton>
                                </span>}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function RecutsPage() {
    const [status, setStatus] = useState('OPEN');
    const [rows, setRows] = useState(null);
    const [params, setParams] = useSearchParams();
    const orderFilter = params.get('order');   // from the order tracker
    const [perms, setPerms] = useState({});
    const [cut, setCut] = useState(null);
    const [cancel, setCancel] = useState(null);
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => productionApi.recuts({ status: status || undefined }).then(res => setRows(orderFilter ? res.data.filter(r => r.order_id === orderFilter) : res.data)).catch(err => setError(apiError(err, 'Failed to load re-cuts.'))), [status, orderFilter]);
    useEffect(() => { load(); productionApi.permissions().then(res => setPerms(res.data)).catch(() => {}); }, [load]);
    const openCut = async (r) => {
        setFormError('');
        try { const res = await productionApi.recutRolls(r.id); setCut({ r, rolls: res.data, roll: res.data[0]?.id || '', metres: '' }); } catch (err) { setError(apiError(err, 'Failed.')); }
    };
    const run = async (fn, close) => { setBusy(true); setFormError(''); try { await fn(); close(); load(); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); } };
    return (
        <div>
            <PageHeader title="Re-cuts" subtitle="Pieces rejected at a check. Cut a replacement from fabric issued to cutting — it keeps the garment number and goes straight back to the stage that rejected the piece. A later stage repairing the piece cancels its re-cut."
                actions={<select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="OPEN">Open</option><option value="CUT">Cut</option><option value="CANCELLED">Cancelled</option><option value="">All</option></select>} />
            {orderFilter && <p className="mb-3 text-sm bg-indigo-50 text-indigo-800 rounded-lg px-3 py-2">Showing one order's re-cuts (from the order tracker). <button type="button" className="underline font-semibold" onClick={() => setParams({})}>Show all</button></p>}
            <ReplacementQueue perms={perms} />
            <h2 className="text-base font-black text-slate-800 mb-2">Re-cuts (rejected pieces)</h2>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Piece</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Rejected at</th><th className="px-3 py-2">Defect</th><th className="px-3 py-2">Status</th><th /></tr></thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No re-cuts.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2"><b>{r.part_name}</b> {r.size} · {r.colour}<span className="block text-xs text-slate-500">{r.uid}</span></td>
                                    <td className="px-3 py-2"><Link to={`/v3/cutting/batches/${r.batch_id}`} className="text-indigo-700 hover:underline">{r.batch_code}</Link></td>
                                    <td className="px-3 py-2">{r.stage}<span className="block text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}{r.requested_by_name ? ` · ${r.requested_by_name}` : ''}</span></td>
                                    <td className="px-3 py-2 text-xs">{r.defect || '—'}</td>
                                    <td className="px-3 py-2 text-xs">{r.status === 'CUT' ? <>Cut from {r.roll_no} ({r.metres} {r.uom || 'm'})<span className="block">{r.replacement_uid}</span></> : r.status === 'CANCELLED' ? `Cancelled: ${r.cancelled_reason}` : 'Open'}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{perms.manage && r.status === 'OPEN' && <>
                                        <SecondaryButton onClick={() => openCut(r)}>Cut replacement</SecondaryButton> <button type="button" className="text-xs text-slate-500 hover:underline ml-2" onClick={() => { setFormError(''); setCancel({ r, reason: '' }); }}>Cancel</button></>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {cut && (
                <Modal title={`Re-cut ${cut.r.part_name} ${cut.r.size} · ${cut.r.colour}`} onClose={() => setCut(null)}>
                    <div className="space-y-3 w-[min(460px,88vw)]">
                        {cut.rolls.length === 0 ? <p className="text-sm text-rose-700">No roll of this fabric is free at cutting for the order. Issue fabric to cutting first (Material issue).</p> : (
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Roll"><select className={inputCls} value={cut.roll} onChange={e => setCut({ ...cut, roll: e.target.value })}>{cut.rolls.map(x => <option key={x.id} value={x.id}>{x.roll_no}{x.dye_lot ? ` (lot ${x.dye_lot})` : ''} · {x.available} {x.uom} free</option>)}</select></Field>
                                <Field label={`Fabric used (${cut.rolls.find(x => x.id === cut.roll)?.uom || 'm'}) *`}><input className={inputCls} type="number" min="0" step="any" value={cut.metres} onChange={e => setCut({ ...cut, metres: e.target.value })} autoFocus /></Field>
                            </div>
                        )}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setCut(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => productionApi.cutRecut(cut.r.id, { fabric_roll_id: cut.roll, metres: Number(cut.metres) }), () => setCut(null))} busy={busy} disabled={busy || !cut.roll || !(Number(cut.metres) > 0)}>Cut replacement</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {cancel && (
                <Modal title="Cancel re-cut" onClose={() => setCancel(null)}>
                    <div className="space-y-3 w-[min(420px,85vw)]">
                        <Field label="Reason *"><input className={inputCls} value={cancel.reason} onChange={e => setCancel({ ...cancel, reason: e.target.value })} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setCancel(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => productionApi.cancelRecut(cancel.r.id, cancel.reason.trim()), () => setCancel(null))} busy={busy} disabled={busy || !cancel.reason.trim()}>Cancel re-cut</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

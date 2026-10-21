// Fabric is allocated in whole rolls (19 Oct 2026, "on clicking assign open modal with list of rolls and user select and
// assign fabric rolls, allow selection until required quantity is hit"). The fabric store ticks free rolls of the fabric;
// ticking is allowed while the ticked total is below what the order still needs — the roll that crosses it is the last
// one. Rolls the order already holds can be given back (un-assign) with a reason.
import { useEffect, useState } from 'react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// target: { orderId, orderNo, itemId, label }
export default function RollAssignModal({ target, canAssign, onClose, onDone }) {
    const [d, setD] = useState(null);
    const [pick, setPick] = useState([]);          // free roll ids, in the order ticked
    const [back, setBack] = useState(new Set());   // held roll ids to give back
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { planningApi.fabricRolls(target.orderId, target.itemId).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load the rolls.'))); }, [target]);

    const picked = d ? d.free.filter(r => pick.includes(r.id)) : [];
    const pickedQty = picked.reduce((s, r) => s + r.qty, 0);
    const covered = d ? pickedQty + 1e-9 >= d.open : false;   // the roll that crossed the need was the last one
    const toggle = (r) => setPick(p => (p.includes(r.id) ? p.filter(x => x !== r.id) : covered ? p : [...p, r.id]));
    const assign = async () => {
        setBusy(true); setError('');
        try { await planningApi.allocateRolls({ order_id: target.orderId, item_id: target.itemId, roll_ids: pick }); onDone(`${pick.length} roll(s) assigned to ${target.orderNo}.`); }
        catch (err) { setError(apiError(err, 'Failed to assign.')); setBusy(false); }
    };
    const giveBack = async () => {
        setBusy(true); setError('');
        try { await planningApi.releaseRolls({ order_id: target.orderId, item_id: target.itemId, roll_ids: [...back], reason: reason.trim() }); onDone(`${back.size} roll(s) given back to free stock.`); }
        catch (err) { setError(apiError(err, 'Failed to un-assign.')); setBusy(false); }
    };
    const u = d?.uom || '';
    return (
        <Modal title={`Assign rolls — ${target.label}`} onClose={onClose}>
            <div className="w-[min(760px,92vw)] space-y-4 p-1">
                <ErrorBox text={error} />
                {!d ? (!error && <Loading />) : (<>
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">Needed {fmt(d.required)} {u}</span>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">Held {fmt(d.allocated)} {u} ({d.held.filter(r => r.status === 'IN_STOCK').length} rolls)</span>
                        {d.issued > 0 && <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700">Issued {fmt(d.issued)} {u}</span>}
                        <span className={`px-2.5 py-1 rounded-lg ${d.open > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{d.open > 0 ? `Still to cover ${fmt(d.open)} ${u}` : 'Covered'}</span>
                    </div>
                    {canAssign && d.open > 0 && (
                        <div>
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Free rolls — tick whole rolls ({picked.length} ticked · {fmt(pickedQty)} {u}{covered ? ' · covered — no more' : ''})</p>
                            {d.free.length === 0 ? <p className="text-sm text-slate-500">No free rolls of this fabric in stock.</p> : (
                                <div className="max-h-[38vh] overflow-y-auto border border-slate-200 rounded-xl">
                                    <table className="w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500 text-left sticky top-0"><tr><th className="px-3 py-2 w-10" /><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Dye lot</th><th className="px-3 py-2 text-right">Length</th><th className="px-3 py-2">Width</th><th className="px-3 py-2">Location</th></tr></thead>
                                        <tbody>{d.free.map(r => {
                                            const on = pick.includes(r.id);
                                            const off = !on && covered;
                                            return (
                                                <tr key={r.id} className={`border-t border-slate-100 ${on ? 'bg-indigo-50' : off ? 'opacity-40' : ''}`}>
                                                    <td className="px-3 py-2"><input type="checkbox" className="w-4 h-4" checked={on} disabled={off} onChange={() => toggle(r)} aria-label={`Roll ${r.roll_no}`} /></td>
                                                    <td className="px-3 py-2 font-semibold">{r.roll_no}</td><td className="px-3 py-2">{r.dye_lot || '—'}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.qty)} {u}</td><td className="px-3 py-2">{r.width ? `${r.width} ${r.width_unit || ''}` : '—'}</td><td className="px-3 py-2">{r.location || '—'}</td>
                                                </tr>
                                            );
                                        })}</tbody></table>
                                </div>
                            )}
                            <div className="flex justify-end mt-2"><PrimaryButton onClick={assign} busy={busy} disabled={busy || !pick.length}>Assign {pick.length || ''} roll{pick.length === 1 ? '' : 's'}</PrimaryButton></div>
                        </div>
                    )}
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Rolls held by {target.orderNo}</p>
                        {d.held.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
                            <div className="flex flex-wrap gap-2">{d.held.map(r => {
                                const on = back.has(r.id);
                                const can = canAssign && r.status === 'IN_STOCK';
                                return (
                                    <button key={r.id} type="button" disabled={!can} onClick={() => setBack(b => { const x = new Set(b); if (x.has(r.id)) x.delete(r.id); else x.add(r.id); return x; })}
                                        className={`text-left text-xs font-bold px-2.5 py-1.5 rounded-lg border-2 ${on ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-200 text-slate-700'} ${can ? '' : 'cursor-default opacity-70'}`}>
                                        {r.roll_no} · {fmt(r.qty)} {u}{r.dye_lot ? ` · lot ${r.dye_lot}` : ''}
                                    </button>
                                );
                            })}</div>
                        )}
                        {canAssign && back.size > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <input className={`${inputCls} !w-80`} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for giving the rolls back" maxLength={1000} />
                                <SecondaryButton onClick={giveBack} disabled={busy || !reason.trim()}>Un-assign {back.size} roll{back.size === 1 ? '' : 's'}</SecondaryButton>
                            </div>
                        )}
                    </div>
                </>)}
                <div className="flex justify-end"><SecondaryButton onClick={onClose}>Close</SecondaryButton></div>
            </div>
        </Modal>
    );
}

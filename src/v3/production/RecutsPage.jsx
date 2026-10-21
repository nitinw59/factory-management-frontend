// Re-cuts: pieces rejected at a stage check. The cutting manager cuts a
// replacement (same garment number) from fabric issued to cutting for the
// order; it starts again at the first stage. Or cancels with a reason.
// 18 Oct 2026: also the material replacement queue (as 2.0) — pieces in rework flagged by the line loader for new
// material: accept (sourcing), then fulfil (new material on the same piece → back to "to check"), or cancel.
// 19 Oct 2026 (phase 3, end bits §6a): the fulfil records where the panel came from — an end bit of the order (reserve
// pieces first) or a whole roll the fabric store issued — and the metres used.
// 21 Oct 2026 ("Material replacement after returns"): when nothing in the cutting room gives the panel, the fulfil asks
// the fabric store for fabric (metres); the store issues a whole roll (beyond the allocation if needed — added to
// consumed) and it shows here as a source. The queue: status tabs (Requested · Picked up · Accepted · Waiting for the
// store · Fulfilled · Rejected / cancelled), grouped by order → batch → stage, with the age of each request.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const REP = { REQUESTED: ['Requested — waiting for pickup', 'bg-violet-50 text-violet-800 border-violet-300'], PICKED_UP: ['Picked up', 'bg-sky-50 text-sky-800 border-sky-300'], REJECTED: ['Rejected — checked again', 'bg-rose-50 text-rose-700 border-rose-300'], ACCEPTED: ['Accepted — sourcing', 'bg-indigo-50 text-indigo-800 border-indigo-300'], FULFILLED: ['Fulfilled', 'bg-emerald-50 text-emerald-800 border-emerald-300'], CANCELLED: ['Cancelled', 'bg-slate-50 text-slate-500 border-slate-300'] };

const fmtM = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

// Fulfil: pick the source (end bit / whole roll) and the metres used for the panel.
function FulfilModal({ req, onClose, onDone }) {
    const [d, setD] = useState(null);
    const [pick, setPick] = useState('');      // 'E:<id>' | 'R:<id>'
    const [metres, setMetres] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);      // fabric from the store: { metres, note }
    const [asked, setAsked] = useState('');
    useEffect(() => {
        productionApi.replacementSources(req.id).then(r => { setD(r.data); const e = r.data.end_bits[0]; const rl = r.data.rolls[0]; setPick(e ? `E:${e.id}` : rl ? `R:${rl.id}` : ''); })
            .catch(err => setError(apiError(err, 'Failed to load the fabric to use.')));
    }, [req.id]);
    const u = d?.need?.uom || 'm';
    const chosen = pick.startsWith('E:') ? d?.end_bits.find(e => `E:${e.id}` === pick) : d?.rolls.find(r => `R:${r.id}` === pick);
    const m = Number(metres);
    const left = chosen && m > 0 ? Math.round((chosen.metres - m) * 1000) / 1000 : null;
    const save = async () => {
        setBusy(true); setError('');
        try {
            const body = pick.startsWith('E:') ? { source: 'END_BIT', end_bit_id: pick.slice(2), metres: m } : { source: 'ROLL', fabric_roll_id: pick.slice(2), metres: m };
            const r = await productionApi.fulfilReplacement(req.id, body); onDone(`Fulfilled from ${r.data.from} — ${fmtM(m)} ${u}.`);
        } catch (err) { setError(apiError(err, 'Failed to fulfil.')); setBusy(false); }
    };
    const requestFabric = async () => {
        setBusy(true); setError('');
        try { await productionApi.requestReplacementFabric(req.id, { metres: Number(ask.metres), note: ask.note || undefined }); setAsked(`${fmtM(ask.metres)} ${u} asked from the fabric store — it shows on their My work. Once they issue a roll it appears here as a source.`); setAsk(null); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const fq = d?.fabric_request;
    const opt = (key, label, sub, tone) => (
        <label key={key} className={`flex items-center gap-3 px-3 py-2 rounded-lg border-2 cursor-pointer ${pick === key ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
            <input type="radio" name="src" checked={pick === key} onChange={() => setPick(key)} className="w-4 h-4" />
            <span className="flex-1"><b className="text-slate-800">{label}</b><span className="block text-xs text-slate-500">{sub}</span></span>
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${tone}`}>{key.startsWith('R:') ? 'ROLL' : ''}</span>
        </label>
    );
    return (
        <Modal title={`Fulfil — ${req.part_name} · ${req.size} #${req.no}`} onClose={onClose}>
            <div className="w-[min(560px,92vw)] space-y-3">
                <ErrorBox text={error} />
                {!d ? (!error && <Loading />) : (<>
                    <p className="text-sm text-slate-600">{d.need.fabric_label} · {d.need.colour} · batch #{req.floor_no} · {req.stage}</p>
                    {fq && fq.status === 'OPEN' && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Waiting for the fabric store: {fmtM(fq.metres)} {u} asked.</p>}
                    {fq && fq.status === 'ISSUED' && <p className="text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">The fabric store issued roll {fq.roll_no} on {fq.issue_no}{fq.beyond_allocation ? ' (beyond the allocation — counts in the order\'s consumption)' : ''}.</p>}
                    {asked && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{asked}</p>}
                    {d.end_bits.length === 0 && d.rolls.length === 0 ? (
                        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No end bit of this fabric and colour is left on the order, and no whole roll is issued to cutting.{(!fq || fq.status !== 'OPEN') && !asked ? ' Ask the fabric store for fabric below.' : ''}</p>
                    ) : (
                        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                            {d.end_bits.map(e => opt(`E:${e.id}`, `${e.tag} · ${fmtM(e.metres)} ${u}`, e.kind === 'RESERVE' ? 'Replacement reserve' : 'Lay piece (no reserve left?)', ''))}
                            {d.rolls.map(r => opt(`R:${r.id}`, `Roll ${r.roll_no} · ${fmtM(r.metres)} ${u}`, `Whole roll from the fabric store${r.dye_lot ? ` · lot ${r.dye_lot}` : ''} — the rest becomes the order's end bits`, 'bg-sky-100 text-sky-800'))}
                        </div>
                    )}
                    {(!fq || fq.status !== 'OPEN') && !asked && (ask ? (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                            <p className="text-sm font-bold text-slate-800">Ask the fabric store for fabric</p>
                            <p className="text-xs text-slate-600">They issue a whole roll to this order's cutting (a remnant if there is one). Beyond the allocation, it comes from free stock and counts in the order's consumption.</p>
                            <div className="grid grid-cols-2 gap-2"><Field label={`Fabric needed (${u}) *`}><input className={inputCls} type="number" min="0" step="0.01" value={ask.metres} onChange={e => setAsk({ ...ask, metres: e.target.value })} /></Field>
                                <Field label="Note"><input className={inputCls} value={ask.note} onChange={e => setAsk({ ...ask, note: e.target.value })} /></Field></div>
                            <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton><PrimaryButton onClick={requestFabric} busy={busy} disabled={busy || !(Number(ask.metres) > 0)}>Ask the fabric store</PrimaryButton></div>
                        </div>
                    ) : <button type="button" className="text-sm font-bold text-indigo-700 hover:underline" onClick={() => setAsk({ metres: '', note: '' })}>Not enough here? Ask the fabric store for fabric</button>)}
                    <Field label={`Fabric used for the panel (${u}) *`} hint={left != null ? (left < 0 ? 'More than the piece has.' : chosen && pick.startsWith('E:') && left < d.min_m ? `${fmtM(left)} ${u} left — under ${fmtM(d.min_m)} ${u}, written off.` : `${fmtM(left)} ${u} left.`) : undefined}>
                        <input className={inputCls} type="number" min="0" step="0.01" value={metres} onChange={e => setMetres(e.target.value)} autoFocus />
                    </Field>
                </>)}
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={save} busy={busy} disabled={busy || !chosen || !(m > 0) || (left != null && left < 0)}>Fulfil</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}

const QTABS = [['REQUESTED', 'Requested'], ['PICKED_UP', 'Picked up'], ['ACCEPTED', 'Accepted — sourcing'], ['STORE', 'Waiting for the store'], ['FULFILLED', 'Fulfilled'], ['CLOSED', 'Rejected / cancelled']];
const tabOf = (r) => (r.status === 'ACCEPTED' && r.fabric_request?.status === 'OPEN' ? 'STORE' : r.status);
const ageOf = (d) => { const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000); return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`; };

function ReplacementQueue({ perms }) {
    const [tab, setTab] = useState('PICKED_UP');
    const [open, setOpen] = useState(null);     // REQUESTED / PICKED_UP / ACCEPTED rows (for the first four tabs)
    const [done, setDone] = useState(null);     // FULFILLED or CLOSED rows
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(null);
    const [ful, setFul] = useState(null);
    const [msg, setMsg] = useState('');
    const closedTab = ['FULFILLED', 'CLOSED'].includes(tab);
    const load = useCallback(() => {
        productionApi.replacements({ status: 'open' }).then(r => setOpen(r.data)).catch(err => setError(apiError(err, 'Failed to load.')));
        if (closedTab) productionApi.replacements({ status: tab }).then(r => setDone(r.data)).catch(err => setError(apiError(err, 'Failed to load.')));
    }, [tab, closedTab]);
    useEffect(() => { load(); }, [load]);
    const act = async (id, fn) => {
        setBusy(id); setError('');
        try { await fn(); load(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(null); }
    };
    if (open && open.length === 0 && !perms.replaceFulfil && !closedTab) return null;
    const rows = closedTab ? done : open?.filter(r => tabOf(r) === tab);
    const count = (k) => (open || []).filter(r => tabOf(r) === k).length;
    // order → batch → stage
    const groups = [];
    for (const r of [...(rows || [])].sort((x, y) => (x.order_no || '').localeCompare(y.order_no || '') || x.floor_no - y.floor_no || x.stage.localeCompare(y.stage) || new Date(x.created_at) - new Date(y.created_at))) {
        const k = `${r.order_no}|${r.batch_id}|${r.stage_type_id}`;
        if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, r, rows: [] });
        groups[groups.length - 1].rows.push(r);
    }
    return (
        <div className="mb-5">
            <div className="mb-2"><h2 className="text-base font-black text-slate-800">Material replacement</h2><p className="text-xs text-slate-500">Pieces in rework that need new material. The line loader picks them up; accept while sourcing, then fulfil — from the order's end bits, or fabric the fabric store issues — and the same piece goes back to "to check" at that stage. Reject (with a reason) if it isn't worth replacing. No replacement once the order is shipped.</p></div>
            <div className="flex flex-wrap items-center gap-1 mb-2 border-b border-slate-200">
                {QTABS.map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}{!['FULFILLED', 'CLOSED'].includes(k) && open ? <span className="ml-1 text-xs font-black text-slate-400">{count(k)}</span> : null}</button>)}
            </div>
            <ErrorBox text={error} />
            {msg && <p className="mb-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
            {ful && <FulfilModal req={ful} onClose={() => { setFul(null); load(); }} onDone={(m) => { setFul(null); setMsg(m); load(); }} />}
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-5 text-center">No requests.</p> : (
                <div className="bg-white border border-violet-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-violet-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Piece</th><th className="px-3 py-2">Defect</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Status</th><th /></tr></thead>
                        <tbody>{groups.map(g => [
                            <tr key={g.k} className="bg-slate-50 border-t border-slate-200"><td colSpan={5} className="px-3 py-1.5 text-xs font-black text-slate-700">{g.r.order_no} · <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white">#{g.r.floor_no}</span> {g.r.batch_code} · {g.r.stage} <span className="font-semibold text-slate-400">({g.rows.length})</span></td></tr>,
                            ...g.rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2"><b>{r.part_name} · {r.size} #{r.no}</b><span className="block text-xs text-slate-500">roll #{r.roll_no ?? '—'} · {r.colour} · {r.uid}</span></td>
                                    <td className="px-3 py-2 text-xs">{r.defect_code ? `${r.defect_code} — ${r.defect}` : '—'}{r.notes ? <span className="block text-slate-500">“{r.notes}”</span> : null}</td>
                                    <td className="px-3 py-2 text-xs text-slate-600">{r.line && <span className="block font-semibold text-slate-700">{r.line}</span>}{r.requested_by_name || '—'}<span className="block text-slate-400">{new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {ageOf(r.created_at)} ago</span></td>
                                    <td className="px-3 py-2"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${REP[r.status][1]}`}>{REP[r.status][0]}</span>
                                        {r.fabric_request && <span className={`block text-[11px] font-semibold ${r.fabric_request.status === 'OPEN' ? 'text-amber-700' : 'text-sky-700'}`}>{r.fabric_request.status === 'OPEN' ? `fabric asked from the store · ${fmtM(r.fabric_request.metres)}` : `store issued roll ${r.fabric_request.roll_no} (${r.fabric_request.issue_no})${r.fabric_request.beyond_allocation ? ' · beyond allocation' : ''}`}</span>}
                                        {r.picked_up_by_name && <span className="block text-[11px] text-slate-500">picked up by {r.picked_up_by_name}</span>}{r.pickup_skipped && <span className="block text-[11px] font-semibold text-amber-700">pickup skipped</span>}{r.accepted_by_name && <span className="block text-[11px] text-slate-500">accepted by {r.accepted_by_name}</span>}{r.rejected_reason && <span className="block text-[11px] text-rose-700">“{r.rejected_reason}”</span>}{r.cancelled_reason && <span className="block text-[11px] text-slate-500">{r.cancelled_reason}</span>}{r.source && <span className="block text-[11px] text-slate-500">{r.source === 'END_BIT' ? r.end_bit_tag : `roll ${r.source_roll_no}`} · {fmtM(r.metres_used)}</span>}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-right">{perms.replaceFulfil && ['REQUESTED', 'PICKED_UP', 'ACCEPTED'].includes(r.status) && <span className="inline-flex gap-1">
                                        {r.status === 'PICKED_UP' && <SecondaryButton disabled={busy === r.id} onClick={() => act(r.id, () => productionApi.acceptReplacement(r.id))}>Accept</SecondaryButton>}
                                        {r.status === 'REQUESTED' && <SecondaryButton disabled={busy === r.id} title="Accept before the line loader picks it up (logged)" onClick={() => { if (window.confirm('Accept without waiting for the line loader to pick the piece up? This is logged.')) act(r.id, () => productionApi.acceptReplacement(r.id)); }}>Accept now</SecondaryButton>}
                                        <SecondaryButton disabled={busy === r.id} onClick={() => { const why = window.prompt('Why reject the replacement? The piece goes back to its station to be checked as it is.'); if (why !== null && why.trim()) act(r.id, () => productionApi.rejectReplacement(r.id, why.trim())); }}>Reject</SecondaryButton>
                                        {r.status === 'ACCEPTED' && <PrimaryButton disabled={busy === r.id} onClick={() => { setMsg(''); setFul(r); }}>Fulfil…</PrimaryButton>}
                                        <SecondaryButton disabled={busy === r.id} onClick={() => { const why = window.prompt('Why cancel? The piece stays in rework.'); if (why !== null) act(r.id, () => productionApi.cancelReplacement(r.id, why.trim() || undefined)); }}>Cancel</SecondaryButton>
                                    </span>}</td>
                                </tr>
                            )),
                        ])}</tbody>
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

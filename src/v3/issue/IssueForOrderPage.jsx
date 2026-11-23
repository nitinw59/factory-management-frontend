// Issue fabric for one order: the rolls it holds (whole rolls, 19 Oct 2026), pocketing / lining by metres (20 Oct 2026). Saves a draft;
// the slip page submits it to cutting (4 Nov 2026: custody, stock moves on receipt). Always to Cutting. Trims go out on trim kits, but
// trims not allocated can close the cutting gate, so the gate says whose job each shortage is.
// 23 Nov 2026 (owner: "collapse line items by default with detailed summary"): each fabric is one summary line — required,
// issued, allocated, not covered, on its way, rolls, picked x of y with a bar, dye lots — that opens to its rolls; tick all
// works closed; a scanned roll opens its fabric; expand / collapse all and a total over the fabrics.
// Pocketing / lining by metres (23 Nov 2026): "Fill to allocated" fills the rolls in order up to what is allocated; the
// metres can't go above it (the server refuses it too); when the free rolls can't cover it, the line says who holds the rest.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import OrderTabs from '../orders/OrderTabs';
import { Save, ChevronDown, ChevronRight } from 'lucide-react';
import { materialIssueApi } from '../api/materialIssueApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { useCanOpen } from '../V3Access';
import { useWedgeScanner, feedback } from '../production/scanShared';
import { STATUS, fmtN } from './issuePrint';

const shortOf = (b) => Math.max(0, Math.round((b.required - b.allocated - b.issued) * 1000) / 1000);

// Whose job each shortage is: the fabric store's, or the trim store's. Trims here are for reading only.
function Blockers({ title, owner, items, action }) {
    if (!items.length) return null;
    return (
        <details className="mt-1">
            <summary className="cursor-pointer font-semibold">{title}: {items.length} item{items.length === 1 ? '' : 's'} not allocated <span className="font-normal">({owner})</span>{action}</summary>
            <ul className="mt-1 ml-4 list-disc text-xs">{items.map(b => <li key={`${b.kind}${b.item_id}`}>{b.label}: {fmtN(shortOf(b))} {b.uom} short</li>)}</ul>
        </details>
    );
}

export default function IssueForOrderPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const canBom = useCanOpen('planning.requirements');
    const [d, setD] = useState(null);
    const [perm, setPerm] = useState(null);
    const [form, setForm] = useState({ cut_batch_id: '', issue_date: todayLocal(), backdate_reason: '', notes: '' });
    const [rolls, setRolls] = useState({});    // roll id → true, or metres when by metres
    const [draftId, setDraftId] = useState(null);
    const [scanMsg, setScanMsg] = useState(null);
    const [open, setOpen] = useState(() => new Set());   // fabrics shown open (collapsed by default)
    const toggle = (id) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const r3 = (n) => Math.round(Number(n || 0) * 1000) / 1000;
    const roomOf = (i) => r3(Math.max(0, i.allocated - i.in_transit));
    // By metres: fill the rolls in the listed order (dye lot, roll no.) up to the allocation.
    const fillToAllocated = (i) => setRolls(prev => {
        const next = { ...prev };
        let left = roomOf(i);
        for (const r of i.rolls) { const take = r3(Math.min(r.qty, Math.max(0, left))); next[r.id] = take > 0 ? String(take) : ''; left = r3(left - take); }
        return next;
    });
    // By metres: one roll's entry, never above the roll nor above what the allocation leaves after the other rolls.
    const setMetres = (i, r, raw) => setRolls(prev => {
        if (raw === '') return { ...prev, [r.id]: '' };
        const others = i.rolls.filter(x => x.id !== r.id).reduce((a, x) => a + (Number(prev[x.id]) || 0), 0);
        const cap = r3(Math.min(r.qty, Math.max(0, roomOf(i) - others)));
        const v = Number(raw);
        return { ...prev, [r.id]: Number.isFinite(v) && v > cap ? String(cap) : raw };
    });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => materialIssueApi.order(orderId).then(res => {
        const data = res.data;
        setD(data);
        const dr = data.draft;
        setDraftId(dr ? dr.id : null);
        if (dr) {
            const byMetres = new Set(data.items.filter(i => i.by_metres).map(i => i.item_id));
            setRolls(Object.fromEntries(dr.planned.map(p => [p.roll_id, byMetres.has(p.item_id) ? String(p.qty) : true])));
            setForm({ cut_batch_id: dr.cut_batch_id ? String(dr.cut_batch_id) : '', issue_date: dr.issue_date, backdate_reason: dr.backdate_reason || '', notes: dr.notes || '' });
        }
    }).catch(err => setError(apiError(err, 'Failed to load the order.'))), [orderId]);
    useEffect(() => { load(); materialIssueApi.permissions().then(res => setPerm(res.data)).catch(() => setPerm({ issue: false })); }, [load]);

    const shown = (d?.items || []).filter(i => i.kind === 'FABRIC' && i.allocated > 0);
    // A scanned roll is ticked: its barcode (R<id>), or its number if only one roll here has it.
    useWedgeScanner((code) => {
        const c = String(code).trim();
        const all = shown.flatMap(i => i.rolls.map(r => ({ ...r, by_metres: i.by_metres })));
        const hits = all.filter(r => r.code.toLowerCase() === c.toLowerCase());
        const found = hits.length ? hits : all.filter(r => String(r.roll_no).toLowerCase() === c.toLowerCase());
        if (found.length !== 1) { feedback('error'); setScanMsg({ ok: false, text: found.length ? `${c}: more than one roll has this number. Scan the roll label.` : `${c} isn't a roll this order can send.` }); return; }
        const r = found[0];
        const owner = shown.find(i => i.rolls.some(x => x.id === r.id));
        if (owner) setOpen(prev => new Set(prev).add(owner.item_id));   // show the fabric the scanned roll is in
        if (r.by_metres) { feedback('success'); setScanMsg({ ok: true, text: `Roll ${r.roll_no}: enter the metres to take.` }); return; }
        setRolls(prev => ({ ...prev, [r.id]: true }));
        feedback('success'); setScanMsg({ ok: true, text: `Roll ${r.roll_no} ticked.` });
    }, perm?.issue === true);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const lines = shown.flatMap(i => {
        const picks = i.by_metres ? i.rolls.filter(r => Number(rolls[r.id]) > 0).map(r => ({ roll_id: r.id, qty: Number(rolls[r.id]) })) : i.rolls.filter(r => rolls[r.id]).map(r => ({ roll_id: r.id }));
        return picks.length ? [{ kind: 'FABRIC', item_id: i.item_id, rolls: picks }] : [];
    });
    const past = form.issue_date && form.issue_date < todayLocal();
    const gate = d.cutting_gate;
    const blockers = gate.blockers || [];
    const save = async () => {
        setBusy(true); setError('');
        const body = { order_id: orderId, cut_batch_id: form.cut_batch_id || null, issue_date: past ? form.issue_date : null, backdate_reason: past ? form.backdate_reason : null, notes: form.notes, lines };
        try {
            const res = draftId ? await materialIssueApi.update(draftId, body) : await materialIssueApi.create(body);
            navigate(`/v3/material-issue/issues/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to save.')); setBusy(false); load(); }
    };
    const others = (d.open_slips || []).filter(x => x.id !== draftId);

    return (
        <div>
            <OrderTabs orderId={orderId} active="issue" />
            <PageHeader title={`Issue fabric for ${d.order.order_no}`} subtitle={`${d.order.customer_name} · ships ${fmtDate(d.order.ship_date)}. Pick the rolls and save a draft; you submit it to cutting from the slip. Scan a roll label to tick it.`} />
            <div className={`mb-3 text-sm rounded-lg px-3 py-2 border ${gate.allowed ? (gate.ready ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900') : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                <b>Cutting gate:</b> {gate.allowed ? (gate.ready ? 'open, all materials covered.' : `released. ${gate.override?.by_name ? `By ${gate.override.by_name}: ` : ''}${gate.override?.reason || gate.reason}`) : 'closed. You can save a draft, but it can\'t be submitted yet.'}
                <Blockers title="Fabric" owner="fabric store" items={blockers.filter(b => b.kind === 'FABRIC')} action={canBom ? <> · <Link to={`/v3/planning/orders/${orderId}`} className="underline">assign rolls on the Order BOM</Link></> : null} />
                <Blockers title="Trims" owner="trim store" items={blockers.filter(b => b.kind === 'TRIM')} />
                {!gate.allowed && <p className="mt-1 text-xs">The merchandiser or factory admin can release the order for cutting.</p>}
            </div>
            {draftId && <p className="mb-3 text-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">You're changing draft <Link to={`/v3/material-issue/issues/${draftId}`} className="font-bold text-indigo-700 hover:underline">{d.draft.issue_no}</Link>.</p>}
            {others.length > 0 && <p className="mb-3 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">{others.map((x, i) => <span key={x.id}>{i > 0 && ', '}<Link to={`/v3/material-issue/issues/${x.id}`} className="font-bold underline">{x.issue_no}</Link> ({STATUS[x.status]?.label.toLowerCase()})</span>)}: those rolls aren't listed below.</p>}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 gap-3">
                <Field label="Cut batch" hint="Optional: the batch this fabric is for."><select className={inputCls} value={form.cut_batch_id} onChange={e => setForm({ ...form, cut_batch_id: e.target.value })}><option value="">—</option>{(d.cut_batches || []).map(b => <option key={b.id} value={b.id}>{b.batch_code}</option>)}</select></Field>
                <Field label="Date" hint={`Today unless the fabric really moved earlier. Up to ${d.backdate_days} days back; further needs the factory admin.`}><input className={inputCls} type="date" max={todayLocal()} value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></Field>
                <Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
                {past && <div className="sm:col-span-3"><Field label="Reason for a date in the past *"><input className={inputCls} value={form.backdate_reason} onChange={e => setForm({ ...form, backdate_reason: e.target.value })} /></Field></div>}
            </div>
            {scanMsg && <p className={`mb-3 text-sm font-semibold rounded-lg px-3 py-2 border ${scanMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{scanMsg.text}</p>}
            {shown.length > 0 && (() => {
                // Total over the fabrics (units can differ per fabric, so metres only when all share one unit).
                const pickedOf = (i) => (i.by_metres ? i.rolls.reduce((a, r) => a + (Number(rolls[r.id]) || 0), 0) : i.rolls.filter(r => rolls[r.id]).reduce((a, r) => a + r.qty, 0));
                const uoms = [...new Set(shown.map(i => i.uom))];
                const sum = (f) => shown.reduce((a, i) => a + f(i), 0);
                const rollsPicked = sum(i => (i.by_metres ? i.rolls.filter(r => Number(rolls[r.id]) > 0).length : i.rolls.filter(r => rolls[r.id]).length));
                return (
                    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-bold text-slate-700">{shown.length} fabric{shown.length === 1 ? '' : 's'} · {rollsPicked} of {sum(i => i.rolls.length)} rolls picked
                            {uoms.length === 1 && <> · picked {fmtN(sum(pickedOf))} of {fmtN(sum(i => Math.max(0, i.allocated - i.in_transit)))} {uoms[0]} · required {fmtN(sum(i => i.required))} · not covered <span className={sum(i => i.still_to_cover || 0) > 0 ? 'text-rose-700' : ''}>{fmtN(sum(i => i.still_to_cover || 0))}</span> {uoms[0]}</>}</span>
                        <span className="ml-auto flex gap-3">
                            <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={() => setOpen(new Set(shown.map(i => i.item_id)))}>Expand all</button>
                            <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={() => setOpen(new Set())}>Collapse all</button>
                        </span>
                    </div>
                );
            })()}
            <div className="space-y-3 mb-4">
                {shown.length === 0 && <p className="text-sm text-slate-500">No fabric is allocated to this order yet. {canBom && <Link to={`/v3/planning/orders/${orderId}`} className="font-semibold text-indigo-700 hover:underline">Assign rolls on the Order BOM</Link>}</p>}
                {shown.map(i => {
                    const picked = i.by_metres ? i.rolls.reduce((s, r) => s + (Number(rolls[r.id]) || 0), 0) : i.rolls.filter(r => rolls[r.id]).reduce((s, r) => s + r.qty, 0);
                    const room = Math.round((i.allocated - i.in_transit) * 1000) / 1000;
                    return (
                        <div key={i.item_id} className="bg-white border border-slate-200 rounded-xl">
                            {(() => {
                                const isOpen = open.has(i.item_id);
                                const nPicked = i.by_metres ? i.rolls.filter(r => Number(rolls[r.id]) > 0).length : i.rolls.filter(r => rolls[r.id]).length;
                                const lots = [...new Set(i.rolls.map(r => r.dye_lot).filter(Boolean))];
                                const noLot = i.rolls.filter(r => !r.dye_lot).length;
                                const pct = room > 0 ? Math.min(100, Math.round((picked / room) * 100)) : 0;
                                const over = picked > room + 1e-9;
                                const Chip = ({ label, value, cls = 'text-slate-800' }) => <span className="whitespace-nowrap"><span className="text-slate-500">{label}</span> <b className={`tabular-nums ${cls}`}>{value}</b></span>;
                                return (
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 cursor-pointer hover:bg-slate-50 rounded-xl" onClick={(e) => { if (!e.target.closest('button')) toggle(i.item_id); }}>
                                        <span className="flex items-center gap-1 min-w-[260px] font-bold text-slate-800">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {i.label}
                                            {i.by_metres && <span className="ml-1 text-xs font-normal text-slate-500">pocketing / lining, by metres</span>}</span>
                                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                            <Chip label="Required" value={`${fmtN(i.required)} ${i.uom}`} />
                                            <Chip label="Issued" value={fmtN(i.issued)} />
                                            <Chip label="Allocated" value={fmtN(i.allocated)} cls="text-indigo-700" />
                                            {i.in_transit > 0 && <Chip label="On its way" value={fmtN(i.in_transit)} cls="text-sky-700" />}
                                            {i.still_to_cover > 0 ? <Chip label="Not covered" value={fmtN(i.still_to_cover)} cls="text-rose-700" /> : <span className="font-semibold text-emerald-700">covered</span>}
                                            <Chip label="Rolls" value={`${nPicked} of ${i.rolls.length} picked`} />
                                            {i.rolls.length > 0 && <span className={lots.length > 1 ? 'font-semibold text-amber-700' : 'text-slate-500'}>{lots.length ? `${lots.length} dye lot${lots.length === 1 ? '' : 's'}` : ''}{noLot ? `${lots.length ? ' · ' : ''}${noLot} without dye lot` : ''}</span>}
                                        </span>
                                        <span className="ml-auto flex items-center gap-3">
                                            <span className="w-52">
                                                <span className={`block text-xs font-bold text-right whitespace-nowrap ${over ? 'text-rose-700' : 'text-slate-800'}`}>picked {fmtN(picked)} of {fmtN(room)} {i.uom}</span>
                                                <span className="mt-1 block h-1.5 w-full rounded bg-slate-200"><span className={`block h-1.5 rounded ${over ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} /></span>
                                            </span>
                                            {!i.by_metres && i.rolls.length > 0 && <button type="button" className="text-xs text-indigo-700 font-semibold hover:underline" onClick={() => setRolls({ ...rolls, ...Object.fromEntries(i.rolls.map(r => [r.id, true])) })}>tick all</button>}
                                            {i.by_metres && i.rolls.length > 0 && room > 0 && <button type="button" className="text-xs text-indigo-700 font-semibold hover:underline whitespace-nowrap" onClick={() => { fillToAllocated(i); setOpen(prev => new Set(prev).add(i.item_id)); }}>fill to allocated</button>}
                                        </span>
                                    </div>
                                );
                            })()}
                            {i.by_metres && (() => {
                                const free = r3(i.rolls.reduce((a, r) => a + r.qty, 0));
                                if (free + 1e-9 >= room) return null;
                                const held = i.held_elsewhere || [];
                                return (
                                    <p className="mx-4 mb-2 -mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                                        {fmtN(room)} {i.uom} allocated, only {fmtN(free)} {i.uom} in free rolls.{' '}
                                        {held.length ? <>The rest is in rolls held whole by {held.map((h, k) => <span key={h.order_id}>{k > 0 && ', '}<b>{h.order_no}</b> ({h.rolls} roll{h.rolls === 1 ? '' : 's'}, {fmtN(h.metres)} {i.uom})</span>)} — pocketing / lining is held by metres, so those holds should be let go (factory admin).</> : 'Not enough of this fabric is in the store.'}
                                    </p>
                                );
                            })()}
                            {open.has(i.item_id) && <div className="px-4 pb-4">
                            {i.rolls.length === 0 ? <p className="text-xs text-slate-500">{i.by_metres ? 'No roll of this fabric is free in stock.' : i.in_transit > 0 ? 'All of its rolls are on their way to cutting.' : 'No rolls assigned to this order yet: assign them on the Order BOM (Fabric → Assign).'}</p> : (
                                <table className="w-full text-sm">
                                    <thead className="text-xs text-slate-500 text-left"><tr>{!i.by_metres && <th className="py-1 w-10" />}<th>Roll</th><th>Dye lot</th><th className="text-right">In roll</th>{i.by_metres && <th className="text-right w-32">Take ({i.uom})</th>}<th className="pl-3">Width</th><th>Location</th></tr></thead>
                                    <tbody>{i.rolls.map(r => (
                                        <tr key={r.id} className={`border-t border-slate-100 ${!i.by_metres && rolls[r.id] ? 'bg-indigo-50/50' : ''}`}>
                                            {!i.by_metres && <td className="py-1"><input type="checkbox" className="w-4 h-4" checked={Boolean(rolls[r.id])} onChange={e => setRolls({ ...rolls, [r.id]: e.target.checked })} aria-label={`Issue roll ${r.roll_no}`} /></td>}
                                            <td className="py-1 font-semibold">{r.roll_no}</td><td>{r.dye_lot || <span className="text-amber-700">not recorded</span>}</td><td className="text-right tabular-nums">{fmtN(r.qty)}</td>
                                            {i.by_metres && <td className="text-right"><input type="number" min="0" max={r.qty} step="any" className="w-24 px-2 py-1 text-right border border-slate-300 rounded" value={rolls[r.id] || ''} onChange={e => setMetres(i, r, e.target.value)} aria-label={`Take from roll ${r.roll_no}`} /></td>}
                                            <td className="pl-3">{r.width ? `${r.width} ${r.width_unit}` : '—'}</td><td>{r.location || '—'}</td>
                                        </tr>
                                    ))}</tbody>
                                    <tfoot><tr className="border-t-2 border-slate-200 font-bold"><td className="py-1" colSpan={i.by_metres ? 2 : 3}>Total · {i.rolls.length} roll{i.rolls.length === 1 ? '' : 's'}</td><td className="text-right tabular-nums">{fmtN(i.rolls.reduce((s, r) => s + r.qty, 0))}</td>{i.by_metres && <td className="text-right tabular-nums">{fmtN(picked)}</td>}<td colSpan={2} /></tr></tfoot>
                                </table>
                            )}
                            </div>}
                        </div>
                    );
                })}
            </div>
            <ErrorBox text={error} />
            {perm?.issue && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PrimaryButton onClick={save} busy={busy} disabled={busy || !lines.length || (past && !form.backdate_reason.trim())}><Save size={15} /> {draftId ? 'Save draft' : 'Save as draft'} · {lines.reduce((a, l) => a + l.rolls.length, 0)} roll(s)</PrimaryButton>
                    {draftId && <SecondaryButton onClick={() => navigate(`/v3/material-issue/issues/${draftId}`)}>Back to the slip</SecondaryButton>}
                    <span className="text-xs text-slate-500">Nothing leaves the store until the cutting manager receives the slip.</span>
                </div>
            )}
        </div>
    );
}

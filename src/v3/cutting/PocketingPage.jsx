// Pocketing & lining (20 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Pocketing and lining fabric"). Pocketing / lining is
// issued by metres and laid once per sales order per tone in its own lay (own marker: layer length, plies, pieces per ply
// per part × size). Its pieces go into the order's pocket stock per size and are handed over with each shell batch
// (batch page). Here: the orders, and per order per fabric — what is at cutting, the stock per part × size against the
// order's need, the lays (new / cancel), and writing off what is left.
// 21 Oct 2026: Add to return slip — what is left at cutting goes onto the order's draft return slip (Material returns:
// submitted by the cutting manager, received by the fabric store); it must be back (or written off) before the order's
// fabric reconciliation. Metres on a slip are reserved (not left to lay / write off).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Ban, Trash2, Scissors, Undo2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { cuttingApi } from '../api/cuttingApi';
import { materialReturnsApi } from '../api/materialReturnsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmt, useCuttingPermissions } from './cutShared';

const IN_TO = { m: 0.0254, yd: 1 / 36 };
const M_PER = { m: 1, yd: 0.9144 };
const r3 = (n) => Math.round(n * 1000) / 1000;
const up1 = (n) => Math.ceil(n * 10 - 1e-9) / 10;

// Suggested plies and waste for a lay (20 Oct 2026): as soon as the layer length is typed. Plies = the fewest that cover
// what the order still needs with the marker (pieces per ply), but no more than fit in the pocketing at cutting after
// the reserve kept for replacements; waste = plies × the end allowance at both ends (Settings → Production & quality).
function suggestLay({ fabric, suggest, layer, perCells }) {
    const perIn = IN_TO[fabric.uom] || 0;
    const L = Number(layer);
    if (!(L > 0) || !perIn) return null;
    const allow = Number(suggest?.end_allowance_in ?? 1);
    const endPerPly = 2 * allow * perIn;                       // waste per ply (fabric unit)
    const existing = Number(fabric.reserve || 0);              // reserve of the lays already cut
    const left = Number(fabric.balance.left || 0);
    let maxPlies; let keep;
    if (suggest?.reserve_starting) {
        const newReserve = up1(Number(suggest.start_reserve_m || 1) / (M_PER[fabric.uom] || 1));
        maxPlies = Math.floor((left - existing - newReserve) / (L * perIn + endPerPly) + 1e-9);
        keep = r3(existing + newReserve);
    } else {
        const rate = Number(suggest?.rate || 0);
        maxPlies = Math.floor((left - existing) / (L * perIn * (1 + rate) + endPerPly) + 1e-9);
        keep = r3(existing + up1(Math.max(0, maxPlies) * L * perIn * rate));
    }
    maxPlies = Math.max(0, maxPlies);
    let needPlies = 0;
    for (const c of fabric.cells) {
        const per = Number(perCells[`${c.part_id}|${c.size_id}`]);
        if (per > 0 && c.to_cut > 0) needPlies = Math.max(needPlies, Math.ceil(c.to_cut / per));
    }
    const plies = needPlies ? Math.min(needPlies, maxPlies) : maxPlies;
    const short = needPlies > maxPlies ? r3((needPlies - maxPlies) * (L * perIn + endPerPly)) : 0;
    return { plies, maxPlies, needPlies, waste: r3(plies * endPerPly), allow, short, keep };
}

function OrderList() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { cuttingApi.pocketing().then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))); }, []);
    return (
        <div>
            <PageHeader title="Pocketing & lining" subtitle="Issued by metres, laid once per order per tone in its own lay; its pieces are counted per size and handed over with each shell batch." />
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No approved order has pocketing / lining fabric (BOM lines cutting Pocket / Lining parts).</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Fabric</th><th className="px-3 py-2 text-right">At cutting</th><th className="px-3 py-2 text-right">Pieces cut</th><th className="px-3 py-2 text-right">Handed</th><th className="px-3 py-2 text-right">In stock</th></tr></thead>
                        <tbody>{rows.flatMap(o => o.fabrics.map((f, i) => (
                            <tr key={`${o.id}|${f.id}`} className="border-t border-slate-100">
                                <td className="px-3 py-2">{i === 0 && <Link to={`/v3/cutting/pocketing?order=${o.id}`} className="font-bold text-indigo-700 hover:underline">{o.order_no}</Link>}{i === 0 && <span className="block text-xs text-slate-500">{o.customer_name}</span>}</td>
                                <td className="px-3 py-2">{f.label}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(f.balance.left)} {f.uom}<span className="block text-[11px] text-slate-400">of {fmt(f.balance.issued)} issued</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{f.cut}</td><td className="px-3 py-2 text-right tabular-nums">{f.handed}</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{f.left}</td>
                            </tr>
                        )))}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// One lay (20 Oct 2026): one layer length and marker; one or several of the order's pocketing / lining fabrics stacked in
// it (e.g. Black + Fawn plies together) — per fabric its plies and waste (suggested, editable), its metres from its own
// balance at cutting and its pieces into its own stock.
function LayDialog({ order, fabrics, startId, sizes, suggest, onClose, onSaved }) {
    const [f, setF] = useState({ layer: '', notes: '', per: {} });
    const [rows, setRows] = useState(() => Object.fromEntries(fabrics.map(x => [x.item_id, { on: x.item_id === startId, plies: '', waste: '', tp: false, tw: false }])));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const key = (pp, ss) => `${pp}|${ss}`;
    const on = fabrics.filter(x => rows[x.item_id]?.on);
    const perIn = (fab) => IN_TO[fab.uom] || 0;
    // Plies / waste of each stacked fabric filled in from its suggestion (unless typed by hand).
    const refill = (nextF, nextRows) => {
        const out = { ...nextRows };
        for (const fab of fabrics) {
            const rw = out[fab.item_id];
            if (!rw?.on) continue;
            const sg = suggestLay({ fabric: fab, suggest, layer: nextF.layer, perCells: nextF.per });
            if (!sg) continue;
            const plies = rw.tp ? rw.plies : (sg.plies > 0 ? String(sg.plies) : '');
            const waste = rw.tw ? rw.waste : (Number(plies) > 0 ? String(r3(Number(plies) * 2 * sg.allow * perIn(fab))) : '');
            out[fab.item_id] = { ...rw, plies, waste };
        }
        return out;
    };
    const change = (nextF, nextRows = rows) => { setF(nextF); setRows(refill(nextF, nextRows)); };
    const setRow = (id, patch) => setRows({ ...rows, [id]: { ...rows[id], ...patch } });
    // Marker parts: every part the stacked fabrics cut.
    const parts = [...new Map(on.flatMap(x => x.parts).map(pp => [pp.part_id, pp])).values()];
    const laidOf = (fab) => { const rw = rows[fab.item_id]; return Number(f.layer) > 0 && Number(rw.plies) > 0 ? r3(Number(f.layer) * Number(rw.plies) * perIn(fab)) : 0; };
    const ready = Number(f.layer) > 0 && on.length > 0 && on.every(x => Number(rows[x.item_id].plies) > 0) && Object.values(f.per).some(v => Number(v) > 0);
    const save = async () => {
        setBusy(true); setError('');
        try {
            const cells = Object.entries(f.per).filter(([k, v]) => Number(v) > 0 && parts.some(pp => k.startsWith(`${pp.part_id}|`))).map(([k, v]) => { const [part_id, size_id] = k.split('|'); return { part_id, size_id, per_ply: Number(v) }; });
            const r = await cuttingApi.createLay(order.id, { layer_length_in: Number(f.layer), notes: f.notes || undefined, cells,
                fabrics: on.map(x => ({ fabric_item_id: x.item_id, plies: Number(rows[x.item_id].plies), waste_m: rows[x.item_id].waste === '' ? 0 : Number(rows[x.item_id].waste) })) });
            onSaved(r.data);
        } catch (err) { setError(apiError(err, 'Failed to save the lay.')); setBusy(false); }
    };
    return (
        <Modal title={`New lay — ${order.order_no}`} onClose={onClose}>
            <div className="space-y-3 w-[min(820px,94vw)] max-h-[82vh] overflow-y-auto">
                <p className="text-sm text-slate-600">One layer length and one marker. Tick every pocketing / lining fabric laid together on this table (e.g. Black and Fawn plies stacked) and give each its plies — each comes from its own fabric at cutting and goes into its own pocket stock.</p>
                <div className="flex flex-wrap gap-2">{fabrics.map(x => (
                    <label key={x.item_id} className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${rows[x.item_id]?.on ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                        <input type="checkbox" className="w-4 h-4" checked={Boolean(rows[x.item_id]?.on)} onChange={e => change(f, { ...rows, [x.item_id]: { ...rows[x.item_id], on: e.target.checked } })} />
                        <span className="font-semibold">{x.label}</span><span className="text-xs text-slate-500">{fmt(x.balance.left)} {x.uom} at cutting</span>
                    </label>
                ))}</div>
                <div className="grid sm:grid-cols-3 gap-3">
                    <Field label="Layer length (in) *"><input className={inputCls} type="number" min="0" step="0.01" value={f.layer} onChange={e => change({ ...f, layer: e.target.value })} autoFocus /></Field>
                </div>
                {parts.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="px-2 py-1.5 text-left">Pieces per ply (marker)</th>{sizes.map(sz => <th key={sz.id} className="px-2 py-1.5 text-center">{sz.name}</th>)}</tr></thead>
                            <tbody>{parts.map(pp => (
                                <tr key={pp.part_id} className="border-t border-slate-100">
                                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{pp.part_name}<span className="block text-[11px] font-normal text-slate-500">{pp.per_garment} per garment</span></td>
                                    {sizes.map(sz => (
                                        <td key={sz.id} className="px-1 py-1.5 text-center">
                                            <input type="number" min="0" step="1" className="w-16 px-2 py-1 text-right border border-slate-300 rounded" value={f.per[key(pp.part_id, sz.id)] ?? ''} aria-label={`${pp.part_name} ${sz.name} per ply`}
                                                onChange={e => change({ ...f, per: { ...f.per, [key(pp.part_id, sz.id)]: e.target.value } })} />
                                        </td>
                                    ))}
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
                {on.map(fab => {
                    const rw = rows[fab.item_id];
                    const sg = suggestLay({ fabric: fab, suggest, layer: f.layer, perCells: f.per });
                    const laid = laidOf(fab);
                    const take = r3(laid + (Number(rw.waste) || 0));
                    return (
                        <div key={fab.item_id} className="rounded-lg border border-slate-200 p-3">
                            <p className="font-black text-slate-800 mb-2">{fab.label} <span className="text-xs font-normal text-slate-500">{fmt(fab.balance.left)} {fab.uom} at cutting</span></p>
                            <div className="grid sm:grid-cols-3 gap-3 items-end">
                                <Field label="Plies *"><input className={inputCls} type="number" min="1" step="1" value={rw.plies}
                                    onChange={e => { const v = e.target.value; setRow(fab.item_id, { plies: v, tp: true, ...(rw.tw || !sg ? {} : { waste: Number(v) > 0 ? String(r3(Number(v) * 2 * sg.allow * perIn(fab))) : '' }) }); }} /></Field>
                                <Field label={`Waste at the lay (${fab.uom})`}><input className={inputCls} type="number" min="0" step="any" value={rw.waste} onChange={e => setRow(fab.item_id, { waste: e.target.value, tw: true })} /></Field>
                                <p className={`text-sm pb-2 ${take > fab.balance.left + 1e-9 ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>Takes <b>{fmt(take)} {fab.uom}</b> ({fmt(laid)} laid{Number(rw.waste) ? ` + ${fmt(Number(rw.waste))} waste` : ''})</p>
                            </div>
                            {sg && (
                                <p className={`mt-2 text-sm rounded-lg border px-3 py-2 ${sg.short ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
                                    <b>Suggested {sg.plies} plies</b> — most that fit {sg.maxPlies} (keeping {fmt(sg.keep)} {fab.uom} for replacements){sg.needPlies ? ` · to cover what this colour still needs ${sg.needPlies}` : ' · enter the pieces per ply to fit the order'}. Waste = plies × {fmt(sg.allow)} in at each end.
                                    {sg.short > 0 && <span className="block font-bold">To cut the whole order: {sg.needPlies - sg.maxPlies} plies are missing — issue about {fmt(sg.short)} {fab.uom} of this fabric to cutting.</span>}
                                    {(rw.tp || rw.tw) && <button type="button" className="ml-1 underline font-semibold" onClick={() => change(f, { ...rows, [fab.item_id]: { ...rw, tp: false, tw: false } })}>Use the suggestion</button>}
                                </p>
                            )}
                        </div>
                    );
                })}
                <Field label="Notes"><input className={inputCls} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="e.g. marker no." /></Field>
                <ErrorBox text={error} />
                <div className="flex justify-end gap-2"><SecondaryButton onClick={onClose}>Back</SecondaryButton>
                    <PrimaryButton onClick={save} busy={busy} disabled={busy || !ready}><Scissors size={14} /> Record the lay</PrimaryButton></div>
            </div>
        </Modal>
    );
}

function OrderView({ orderId }) {
    const navigate = useNavigate();
    const perms = useCuttingPermissions();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [lay, setLay] = useState(null);         // fabric for the new lay dialog
    const [ask, setAsk] = useState(null);         // { title, fields, run }
    const [vals, setVals] = useState({});
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const load = useCallback(() => cuttingApi.pocketingOrder(orderId).then(r => { setD(r.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load.'))), [orderId]);
    useEffect(() => { load(); }, [load]);
    const sizes = useMemo(() => d?.sizes || [], [d]);
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const runAsk = async () => {
        setBusy(true); setFormError('');
        try { const r = await ask.run(vals); if (r) setD(r.data); setAsk(null); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <div>
            <Link to="/v3/cutting/pocketing" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Pocketing & lining</Link>
            <PageHeader title={`${d.order.order_no} — pocketing & lining`} subtitle={`${d.order.customer_name}. Laid once per tone for the order; pieces counted per size and handed over with each shell batch (batch page).`} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p>}
            {d.fabrics.length === 0 && <p className="text-sm text-slate-500">This order has no pocketing / lining fabric.</p>}
            {d.fabrics.map(f => {
                const parts = [...new Set(f.cells.map(c => c.part_id))];
                return (
                    <section key={f.item_id} className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h2 className="font-black text-slate-900">{f.label}</h2>
                            <span className="ml-auto flex flex-wrap gap-2">
                                {perms.manage && <PrimaryButton onClick={() => { setMsg(''); setLay(f); }}><Plus size={14} /> New lay</PrimaryButton>}
                                {perms.manage && f.balance.left > 0 && <SecondaryButton onClick={() => { setFormError(''); setVals({ metres: String(f.balance.left), reason: '' }); setAsk({ title: `Add ${f.label} to the return slip`, hint: `What is left at cutting (${fmt(f.balance.left)} ${f.uom}) goes onto this order's draft return slip. You submit the slip; it is back in the store once the fabric store receives it. It must be back (or written off) before the fabric reconciliation.`, fields: [['metres', `How much (${f.uom})`, 'number']], run: async (v) => { const r = await materialReturnsApi.draft(orderId, [{ kind: 'SUPPORT', fabric_item_id: f.item_id, qty: Number(v.metres) }]); navigate(`/v3/material-returns/${r.data.id}`); return null; } }); }}><Undo2 size={14} /> Add to return slip</SecondaryButton>}
                                {perms.manage && f.balance.left > 0 && <SecondaryButton onClick={() => { setFormError(''); setVals({ metres: String(f.balance.left), reason: '' }); setAsk({ title: `Write off ${f.label}`, hint: `What is left at cutting (${fmt(f.balance.left)} ${f.uom}) and won't be used — it shows on the fabric reconciliation.`, fields: [['metres', `How much (${f.uom})`, 'number'], ['reason', 'Reason', 'text']], run: (v) => cuttingApi.writeOffPocketing(orderId, { fabric_item_id: f.item_id, metres: Number(v.metres), reason: v.reason }) }); }}><Trash2 size={14} /> Write off what is left</SecondaryButton>}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-sm">
                            {[['Issued', f.balance.issued], ['Laid', f.balance.laid], ['Waste', f.balance.waste], ['Written off', f.balance.written_off], ['At cutting', f.balance.left], ...(f.balance.on_return > 0 ? [['On a return slip', f.balance.on_return]] : [])].map(([k, v]) => (
                                <div key={k} className={`rounded-lg border px-3 py-2 ${k === 'At cutting' ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200'}`}><p className="text-xs font-bold text-slate-500">{k}</p><p className="font-black tabular-nums">{fmt(v)} {f.uom}</p></div>
                            ))}
                        </div>
                        <p className="text-xs text-slate-500 mb-2">Kept for replacements: <b>{fmt(f.reserve)} {f.uom}</b> ({f.reserve_rule}).</p>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg mb-3">
                            <table className="w-full text-sm min-w-[560px]">
                                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="px-2 py-1.5 text-left">Part · size</th><th className="px-2 py-1.5 text-right">Order needs</th><th className="px-2 py-1.5 text-right">Cut</th><th className="px-2 py-1.5 text-right">Handed with batches</th><th className="px-2 py-1.5 text-right">Replaced</th><th className="px-2 py-1.5 text-right">In stock</th><th className="px-2 py-1.5 text-right">Still to cut</th></tr></thead>
                                <tbody>{parts.flatMap(pid => f.cells.filter(c => c.part_id === pid).map(c => (
                                    <tr key={`${c.part_id}|${c.size_id}`} className="border-t border-slate-100 text-right tabular-nums">
                                        <td className="px-2 py-1.5 text-left">{c.part_name} · <b>{c.size}</b></td><td className="px-2 py-1.5">{c.need}</td><td className="px-2 py-1.5">{c.cut}</td><td className="px-2 py-1.5">{c.handed}</td>
                                        <td className="px-2 py-1.5">{c.replaced || '—'}</td><td className="px-2 py-1.5 font-semibold">{c.left}</td><td className={`px-2 py-1.5 ${c.to_cut ? 'text-rose-700 font-bold' : 'text-emerald-700'}`}>{c.to_cut || '✓'}</td>
                                    </tr>
                                )))}</tbody>
                            </table>
                        </div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Lays</p>
                        {f.lays.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : f.lays.map(l => (
                            <div key={l.id} className={`flex flex-wrap items-center gap-2 py-1.5 border-t border-slate-100 text-sm ${l.status === 'CANCELLED' ? 'opacity-50 line-through' : ''}`}>
                                <b>Lay {l.lay_no}</b><span className="text-slate-600">{l.plies} plies × {fmt(l.layer_length_in)} in = {fmt(l.laid)} {f.uom}{l.waste ? ` + ${fmt(l.waste)} waste` : ''}</span>
                                {l.stacked_with && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800">stacked with {l.stacked_with}</span>}
                                <span className="text-xs text-slate-500">{l.cells.map(c => `${c.part_name} ${c.size} ${c.pieces}`).join(' · ')}</span>
                                <span className="text-xs text-slate-400">{l.created_by_name} · {new Date(l.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{l.notes ? ` · ${l.notes}` : ''}{l.cancel_reason ? ` · cancelled: ${l.cancel_reason}` : ''}</span>
                                {perms.manage && l.status === 'CUT' && <button type="button" className="ml-auto text-xs font-bold text-rose-700 hover:underline" onClick={() => { setFormError(''); setVals({ reason: '' }); setAsk({ title: `Cancel lay ${l.lay_no}`, hint: `Only while none of its pieces is handed over with a batch.${l.stacked_with ? ` The whole lay is cancelled — ${l.stacked_with} too.` : ''}`, fields: [['reason', 'Reason', 'text']], run: (v) => cuttingApi.cancelLay(l.id, v.reason) }); }}><Ban size={12} className="inline" /> Cancel</button>}
                            </div>
                        ))}
                        {f.writeoffs.length > 0 && <p className="text-xs text-slate-500 mt-2">Written off: {f.writeoffs.map(w => `${fmt(w.metres)} ${f.uom} (${w.reason})`).join(' · ')}</p>}
                    </section>
                );
            })}
            {d.batches.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-black text-slate-800 mb-2">Shell batches — pieces handed over with each</p>
                    {d.batches.map(b => (
                        <Link key={b.id} to={`/v3/cutting/batches/${b.id}`} className="flex items-center gap-3 py-1.5 border-t border-slate-100 first:border-0 text-sm hover:bg-slate-50">
                            <b>#{b.floor_no}</b><span>{b.batch_code}</span><span className={`ml-auto font-bold ${b.handed < b.need ? 'text-rose-700' : 'text-emerald-700'}`}>{b.handed} / {b.need} handed</span>
                        </Link>
                    ))}
                </section>
            )}
            {lay && <LayDialog order={d.order} fabrics={d.fabrics} startId={lay.item_id} sizes={sizes} suggest={d.suggest} onClose={() => setLay(null)} onSaved={(r) => { setLay(null); setD(r); setMsg(r.warning || ''); }} />}
            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(460px,92vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        {ask.fields.map(([k, label, type]) => <Field key={k} label={label}><input className={inputCls} type={type} value={vals[k] ?? ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></Field>)}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton><PrimaryButton onClick={runAsk} busy={busy} disabled={busy || ask.fields.some(([k]) => !(ask.optional || []).includes(k) && !String(vals[k] ?? '').trim())}>Save</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default function PocketingPage() {
    const [sp] = useSearchParams();
    const order = sp.get('order');
    return order ? <OrderView orderId={order} /> : <OrderList />;
}

// Packing one order (17 Oct 2026): per order line the colour × size grid (ordered · finished at the last stage ·
// packed · dispatched), cartons with their assortment, a scan box that packs into the selected open carton, close /
// reopen / remove cartons, carton labels, and a new dispatch note from the closed cartons.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, PackageCheck, Lock, Unlock, Trash2, Printer, Truck, ScanLine, X } from 'lucide-react';
import Modal from '../../shared/Modal';
import { packingApi } from '../api/packingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { loadLetterhead } from '../components/letterhead';
import { exportCartonLabels } from './packPrint';
import { DispatchStatus } from './PackingPage';

const CT = { OPEN: 'bg-amber-50 text-amber-800 border-amber-300', CLOSED: 'bg-sky-50 text-sky-800 border-sky-300', DISPATCHED: 'bg-emerald-50 text-emerald-800 border-emerald-300' };

function LineGrid({ L }) {
    const cell = (c, s) => L.cells.find(x => x.colour_id === c.id && x.size_id === s.id);
    return (
        <div className="overflow-x-auto">
            <table className="text-xs tabular-nums">
                <thead><tr className="text-slate-500"><th className="px-2 py-1 text-left">Colour</th>{L.sizes.map(s => <th key={s.id} className="px-2 py-1 text-center">{s.name}</th>)}</tr></thead>
                <tbody>
                    {L.colours.map(c => (
                        <tr key={c.id} className="border-t border-slate-100">
                            <td className="px-2 py-1 font-semibold text-slate-700">{c.name}</td>
                            {L.sizes.map(s => {
                                const x = cell(c, s);
                                if (!x) return <td key={s.id} className="px-2 py-1 text-center text-slate-300">—</td>;
                                const ready = x.finished - x.packed;
                                return (
                                    <td key={s.id} className="px-2 py-1 text-center" title={`Ordered ${x.ordered} · finished ${x.finished} · packed ${x.packed} · dispatched ${x.dispatched}`}>
                                        <b className={x.dispatched >= x.ordered && x.ordered ? 'text-emerald-700' : 'text-slate-800'}>{x.packed}</b><span className="text-slate-400">/{x.ordered}</span>
                                        {ready > 0 && <span className="block text-[10px] font-bold text-amber-700">+{ready} ready</span>}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function PackOrderPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [perms, setPerms] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [active, setActive] = useState(null);     // carton id the scan box packs into
    const [scan, setScan] = useState('');
    const [flash, setFlash] = useState(null);       // { ok, text }
    const [closing, setClosing] = useState(null);   // { carton, weight }
    const [view, setView] = useState(null);         // carton detail with garments
    const [picking, setPicking] = useState(null);   // Set of closed carton ids for a new dispatch note
    const scanRef = useRef(null);

    const load = useCallback(() => packingApi.order(orderId).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [orderId]);
    useEffect(() => { load(); packingApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, [load]);
    useEffect(() => {   // keep a valid open carton selected
        if (!d) return;
        const open = d.cartons.filter(c => c.status === 'OPEN');
        if (!open.some(c => c.id === active)) setActive(open[0]?.id || null);
    }, [d, active]);

    const run = async (fn, okText) => {
        setBusy(true); setError('');
        try { const res = await fn(); const data = res.data.order || res.data; if (data?.lines) setD(data); if (okText) setFlash({ ok: true, text: okText(res.data) }); return res.data; }
        catch (err) { setFlash({ ok: false, text: apiError(err, 'Failed.') }); return null; }
        finally { setBusy(false); }
    };
    const openCarton = async (lineId) => { const r = await run(() => packingApi.openCarton(lineId), () => 'Carton opened — scan garments into it.'); if (r?.carton_id) { setActive(r.carton_id); setTimeout(() => scanRef.current?.focus(), 50); } };
    const doScan = async (e) => {
        e.preventDefault();
        const codes = scan.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
        if (!codes.length || !active) return;
        const r = await run(() => packingApi.pack(active, codes), (x) => `Packed ${x.packed} garment${x.packed === 1 ? '' : 's'}.`);
        if (r) setScan('');
        scanRef.current?.focus();
    };
    const labels = async (cartons) => { const lh = await loadLetterhead(); exportCartonLabels(cartons, d.order, d.cartons.length, lh.company, { logo: lh.logo }); };
    const showCarton = async (id) => { try { setView((await packingApi.carton(id)).data); } catch (err) { setError(apiError(err, 'Failed.')); } };

    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const activeCarton = d.cartons.find(c => c.id === active);
    const closedFree = d.cartons.filter(c => c.status === 'CLOSED' && !c.dispatch_id);
    return (
        <div className={picking ? 'pb-20' : ''}>
            <Link to="/v3/packing" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Packing & dispatch</Link>
            <div className="flex flex-wrap items-baseline gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{d.order.order_no}</h1>
                <span className="text-sm text-slate-500">{d.order.customer_name}{d.order.buyer_po_no ? ` · PO ${d.order.buyer_po_no}` : ''} · ship {fmtDate(d.order.ship_date)}</span>
                <span className="ml-auto text-xs text-slate-500">Ship tolerance <b>{d.tolerance.pct} %</b>{d.tolerance.own ? ' (this order)' : ' (default)'}
                    {perms.dispatch && <button type="button" className="ml-1 underline" onClick={async () => { const v = window.prompt('Ship tolerance % for this order (blank = factory default):', d.order.own_tolerance ?? ''); if (v !== null) run(() => packingApi.setTolerance(orderId, v.trim() === '' ? null : Number(v))); }}>change</button>}</span>
            </div>
            <p className="text-sm text-slate-600 mb-3"><b className="text-amber-700">{d.ready_to_pack}</b> garment{d.ready_to_pack === 1 ? '' : 's'} finished and ready to pack.</p>
            <ErrorBox text={error} />

            {/* Scan box */}
            {perms.pack && (
                <form onSubmit={doScan} className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-end gap-3">
                    <Field label="Pack into">
                        <select className={`${inputCls} !w-56`} value={active || ''} onChange={e => setActive(e.target.value)} disabled={!d.cartons.some(c => c.status === 'OPEN')}>
                            {!d.cartons.some(c => c.status === 'OPEN') && <option value="">No open carton — open one below</option>}
                            {d.cartons.filter(c => c.status === 'OPEN').map(c => <option key={c.id} value={c.id}>{c.carton_no} · line {c.line_no} · {c.qty} pcs</option>)}
                        </select>
                    </Field>
                    <div className="flex-1 min-w-[260px]">
                        <Field label="Scan garment no. or piece label (Enter)">
                            <div className="relative"><ScanLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input ref={scanRef} className={`${inputCls} pl-9`} value={scan} onChange={e => setScan(e.target.value)} placeholder="e.g. …-B1-R1-32-0007 (several: separate with spaces)" disabled={!active || busy} autoFocus /></div>
                        </Field>
                    </div>
                    <PrimaryButton type="submit" disabled={!active || busy || !scan.trim()}><PackageCheck size={14} /> Pack</PrimaryButton>
                    {flash && <p className={`basis-full text-sm font-semibold ${flash.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{flash.text} <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss"><X size={12} /></button></p>}
                    {activeCarton && <p className="basis-full text-xs text-slate-500">{activeCarton.carton_no}: {activeCarton.assortment.map(a => `${a.colour} ${a.size} × ${a.qty}`).join(' · ') || 'empty'}</p>}
                </form>
            )}

            {/* Lines */}
            {d.lines.map(L => (
                <div key={L.line_id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <b className="text-slate-800">Line {L.line_no} · {L.style_code}</b><span className="text-xs text-slate-500">{L.style_name} · last stage {L.last_stage?.name || '—'}</span>
                        <span className="text-xs text-slate-600 tabular-nums ml-2">{L.totals.finished} finished · {L.totals.packed} packed · {L.totals.dispatched} of {L.totals.ordered} dispatched</span>
                        {perms.pack && L.last_stage?.unit === 'GARMENT' && <span className="ml-auto"><SecondaryButton onClick={() => openCarton(L.line_id)} disabled={busy}><Plus size={14} /> Open carton</SecondaryButton></span>}
                    </div>
                    {L.last_stage && L.last_stage.unit !== 'GARMENT' && <p className="text-xs text-amber-800 mb-1">The route ends with {L.last_stage.name} (not a garment stage) — garments can't be packed.</p>}
                    <LineGrid L={L} />
                </div>
            ))}

            {/* Cartons */}
            <div className="flex items-center gap-2 mt-5 mb-2">
                <h2 className="font-black text-slate-800">Cartons ({d.cartons.length})</h2>
                {d.cartons.length > 0 && <SecondaryButton onClick={() => labels(d.cartons)}><Printer size={14} /> All labels</SecondaryButton>}
                {perms.dispatch && closedFree.length > 0 && <span className="ml-auto"><PrimaryButton onClick={() => setPicking(new Set(closedFree.map(c => c.id)))}><Truck size={14} /> New dispatch note</PrimaryButton></span>}
            </div>
            {d.cartons.length === 0 ? <p className="text-sm text-slate-500">No cartons yet.</p> : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {d.cartons.map(c => (
                        <div key={c.id} className={`bg-white border rounded-xl px-3 py-2.5 ${c.id === active ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-2">
                                {picking && c.status === 'CLOSED' && !c.dispatch_id && <input type="checkbox" checked={picking.has(c.id)} onChange={() => { const nx = new Set(picking); if (nx.has(c.id)) nx.delete(c.id); else nx.add(c.id); setPicking(nx); }} aria-label={`Put ${c.carton_no} on the note`} />}
                                <button type="button" className="font-bold text-slate-800 hover:underline" onClick={() => showCarton(c.id)}>{c.carton_no}</button>
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${CT[c.status]}`}>{c.status.toLowerCase()}</span>
                                <span className="ml-auto text-sm font-black tabular-nums">{c.qty} pcs</span>
                            </div>
                            <p className="text-xs text-slate-500">line {c.line_no} · {c.style_code}{c.weight_kg ? ` · ${c.weight_kg} kg` : ''}{c.dispatch_no ? ` · ${c.dispatch_no}` : ''}</p>
                            <p className="text-xs text-slate-700 mt-1">{c.assortment.map(a => `${a.colour} ${a.size} × ${a.qty}`).join(' · ') || 'empty'}</p>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                                {perms.pack && c.status === 'OPEN' && c.id !== active && <button type="button" className="text-indigo-700" onClick={() => setActive(c.id)}>Pack into</button>}
                                {perms.pack && c.status === 'OPEN' && c.qty > 0 && <button type="button" className="inline-flex items-center gap-1 text-indigo-700" onClick={() => setClosing({ carton: c, weight: '' })}><Lock size={11} /> Close</button>}
                                {perms.pack && c.status === 'OPEN' && c.qty === 0 && <button type="button" className="inline-flex items-center gap-1 text-rose-700" onClick={() => run(() => packingApi.removeCarton(c.id))}><Trash2 size={11} /> Remove</button>}
                                {perms.pack && c.status === 'CLOSED' && !c.dispatch_id && <button type="button" className="inline-flex items-center gap-1 text-slate-600" onClick={() => run(() => packingApi.reopenCarton(c.id))}><Unlock size={11} /> Reopen</button>}
                                {c.qty > 0 && <button type="button" className="inline-flex items-center gap-1 text-slate-600" onClick={() => labels([c])}><Printer size={11} /> Label</button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {d.dispatches.length > 0 && (
                <div className="mt-5">
                    <h2 className="font-black text-slate-800 mb-2">Dispatch notes</h2>
                    <div className="flex flex-wrap gap-2">{d.dispatches.map(x => (
                        <Link key={x.id} to={`/v3/packing/dispatches/${x.id}`} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm hover:border-indigo-400"><b>{x.dispatch_no}</b> · {fmtDate(x.dispatch_date)} · {x.cartons} carton(s) <DispatchStatus s={x.status} /></Link>
                    ))}</div>
                </div>
            )}

            {picking && (
                <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
                    <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-3">
                        <span className="text-sm"><b>{picking.size}</b> closed carton(s) · {closedFree.filter(c => picking.has(c.id)).reduce((s, c) => s + c.qty, 0)} pcs on the new dispatch note</span>
                        <button type="button" className="text-xs font-bold text-slate-500" onClick={() => setPicking(null)}>Cancel</button>
                        <div className="ml-auto"><PrimaryButton disabled={!picking.size || busy} onClick={async () => {
                            const r = await run(() => packingApi.createDispatch({ order_id: orderId, carton_ids: [...picking] }));
                            if (r?.id) navigate(`/v3/packing/dispatches/${r.id}`);
                        }}><Truck size={14} /> Create dispatch note</PrimaryButton></div>
                    </div>
                </div>
            )}

            {closing && (
                <Modal title={`Close ${closing.carton.carton_no}`} onClose={() => setClosing(null)}>
                    <div className="space-y-3 w-[min(380px,85vw)]">
                        <p className="text-sm text-slate-600">{closing.carton.qty} pcs: {closing.carton.assortment.map(a => `${a.colour} ${a.size} × ${a.qty}`).join(' · ')}</p>
                        <Field label="Gross weight (kg, optional)"><input className={inputCls} type="number" min="0" step="any" value={closing.weight} onChange={e => setClosing({ ...closing, weight: e.target.value })} autoFocus /></Field>
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setClosing(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy} onClick={async () => { await run(() => packingApi.closeCarton(closing.carton.id, { weight_kg: closing.weight === '' ? undefined : Number(closing.weight) }), () => `${closing.carton.carton_no} closed.`); setClosing(null); }}><Lock size={14} /> Close carton</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {view && (
                <Modal title={`${view.carton_no} — ${view.qty} pcs`} onClose={() => setView(null)}>
                    <div className="w-[min(520px,88vw)] max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs text-slate-500"><tr className="text-left"><th className="py-1">Garment</th><th>Colour</th><th>Size</th><th /></tr></thead>
                            <tbody>{view.garments.map(g => (
                                <tr key={g.id} className="border-t border-slate-100"><td className="py-1 font-mono text-xs">{g.garment_no}</td><td>{g.colour}</td><td>{g.size}</td>
                                    <td className="text-right">{perms.pack && view.status === 'OPEN' && <button type="button" className="text-xs font-semibold text-rose-700" onClick={async () => { await run(() => packingApi.unpack(view.id, g.id)); showCarton(view.id); }}>Take out</button>}</td></tr>
                            ))}</tbody>
                        </table>
                    </div>
                </Modal>
            )}
        </div>
    );
}

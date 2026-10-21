// One dispatch note (17 Oct 2026): header (date, vehicle, transporter, LR, invoice no., destination, notes) and the
// closed cartons it carries while a draft; over-shipment warning (ordered + tolerance per colour × size, a reason
// dispatches anyway); Dispatch; cancel (draft; a dispatched note only by the factory admin); PDF; history.
// 20 Oct 2026 (phase 7): no packing — the note carries quantities per line × colour × size (editable while a draft, up to
// what is finished and ready) and the boxes typed for the paperwork; cartons only show on old carton notes.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Truck, Ban, FileDown, AlertTriangle, Save } from 'lucide-react';
import Modal from '../../shared/Modal';
import { packingApi } from '../api/packingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { loadLetterhead } from '../components/letterhead';
import { exportDispatchNote } from './packPrint';
import { DispatchStatus } from './PackingPage';

const FIELDS = [['dispatch_date', 'Date', 'date'], ['vehicle_no', 'Vehicle no. *'], ['transporter', 'Transporter'], ['lr_no', 'LR no.'], ['invoice_no', 'Invoice no.'], ['destination', 'Destination']];
const ACTION = { CREATED: 'Created', EDITED: 'Edited', DISPATCHED: 'Dispatched', CANCELLED: 'Cancelled' };

export default function DispatchPage() {
    const { id } = useParams();
    const [d, setD] = useState(null);
    const [perms, setPerms] = useState({});
    const [f, setF] = useState(null);
    const [picked, setPicked] = useState(new Set());
    const [qty, setQty] = useState({});   // `${line}|${colour}|${size}` → qty
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(null);   // { kind: 'over' | 'cancel', text }
    const take = (x) => {
        setD(x); setF(Object.fromEntries([...FIELDS.map(([k]) => [k, x[k] || '']), ['notes', x.notes || ''], ['boxes', x.boxes ?? '']])); setPicked(new Set(x.cartons.map(c => c.id)));
        setQty(Object.fromEntries((x.lines || []).map(l => [`${l.line_id}|${l.colour_id}|${l.size_id}`, String(l.qty)])));
    };
    const load = useCallback(() => packingApi.dispatch(id).then(r => take(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [id]);
    useEffect(() => { load(); packingApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, [load]);
    const run = async (fn) => { setBusy(true); setError(''); try { const x = (await fn()).data; take(x); return x; } catch (err) { setError(apiError(err, 'Failed.')); return null; } finally { setBusy(false); } };
    if (!d || !f) return error ? <ErrorBox text={error} /> : <Loading />;
    const draft = d.status === 'DRAFT';
    const canEdit = draft && perms.dispatch;
    const qtyLines = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([k, v]) => { const [line_id, garment_colour_id, size_id] = k.split('|'); return { line_id, garment_colour_id, size_id, qty: Number(v) }; });
    const save = () => run(() => packingApi.updateDispatch(id, { ...f, carton_ids: [...picked], lines: qtyLines }));
    const all = [...d.cartons, ...(d.available_cartons || [])];
    const dirtyCartons = draft && (picked.size !== d.cartons.length || d.cartons.some(c => !picked.has(c.id)));
    const pdf = async () => { const lh = await loadLetterhead(); exportDispatchNote(d, lh.company, { logo: lh.logo }); };
    return (
        <div>
            <Link to="/v3/packing?tab=dispatches" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Dispatch notes</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{d.dispatch_no}</h1><DispatchStatus s={d.status} />
                <span className="text-sm text-slate-500"><Link to={`/v3/packing/orders/${d.order_id}`} className="text-indigo-700 hover:underline">{d.order_no}</Link> · {d.customer_name}{d.buyer_po_no ? ` · PO ${d.buyer_po_no}` : ''}</span>
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={pdf}><FileDown size={14} /> Dispatch note</SecondaryButton>
                    {perms.dispatch && (draft || perms.cancel_dispatched) && d.status !== 'CANCELLED' && <SecondaryButton onClick={() => setAsk({ kind: 'cancel', text: '' })}><Ban size={14} /> Cancel note</SecondaryButton>}
                </span>
            </div>
            <p className="text-sm text-slate-600 mb-3">{d.cartons.length ? `${d.cartons.length} carton(s) · ` : ''}<b>{d.qty} pcs</b>{d.boxes != null ? ` · ${d.boxes} box(es)` : ''}{d.dispatched_at ? ` · dispatched ${fmtDate(d.dispatched_at)} by ${d.dispatched_by_name || ''}` : ''}{d.cancelled_reason ? ` · cancelled: ${d.cancelled_reason}` : ''}{d.over_reason ? ` · over-shipment: ${d.over_reason}` : ''}</p>
            <ErrorBox text={error} />
            {d.over_shipment?.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={14} /> More than ordered + {d.tolerance.pct} % would be shipped</p>
                    {d.over_shipment.map(w => <p key={w} className="text-xs">{w}</p>)}
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4">
                <div className="grid sm:grid-cols-3 gap-3">
                    {FIELDS.map(([k, label, type]) => (
                        <Field key={k} label={label}><input className={inputCls} type={type || 'text'} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} disabled={!canEdit} /></Field>
                    ))}
                </div>
                <div className="mt-3 grid sm:grid-cols-4 gap-3"><Field label="Boxes / cartons (paperwork)"><input className={inputCls} type="number" min="0" value={f.boxes} onChange={e => setF({ ...f, boxes: e.target.value })} disabled={!canEdit} /></Field></div>
                <div className="mt-3"><Field label="Notes"><textarea className={`${inputCls} min-h-[50px]`} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} disabled={!canEdit} /></Field></div>
            </div>

            <h2 className="font-black text-slate-800 mb-2">Quantities{draft ? ' — finished garments ready to ship' : ''}</h2>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><tr><th className="px-3 py-2 text-left">Line · colour · size</th>{draft && <><th className="px-3 py-2">Ordered</th><th className="px-3 py-2">Dispatched</th><th className="px-3 py-2">Ready</th></>}<th className="px-3 py-2 w-28">On this note</th></tr></thead>
                    <tbody>{(draft ? (d.cells || []).filter(c => c.ready > 0 || Number(qty[c.key]) > 0) : d.lines.map(l => ({ ...l, key: `${l.line_id}|${l.colour_id}|${l.size_id}` }))).map(c => (
                        <tr key={c.key} className="border-t border-slate-100 text-right tabular-nums">
                            <td className="px-3 py-1.5 text-left">L{c.line_no} · {c.colour} · <b>{c.size}</b></td>
                            {draft && <><td className="px-3 py-1.5">{c.ordered}</td><td className="px-3 py-1.5">{c.dispatched}</td><td className="px-3 py-1.5 text-emerald-700 font-semibold">{c.ready}</td></>}
                            <td className="px-3 py-1.5">{draft ? <input className="w-20 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" value={qty[c.key] || ''} onChange={e => setQty({ ...qty, [c.key]: e.target.value })} disabled={!canEdit} aria-label={`Ship ${c.colour} ${c.size}`} /> : <b>{c.qty}</b>}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>

            {d.cartons.length > 0 && <h2 className="font-black text-slate-800 mb-2">Cartons</h2>}
            {d.cartons.length === 0 ? null : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <table className="w-full text-sm min-w-[620px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr className="text-left">{draft && <th className="px-3 py-2 w-8" />}<th className="px-3 py-2">Carton</th><th className="px-3 py-2">Assortment</th><th className="px-3 py-2 text-right">Pcs</th><th className="px-3 py-2 text-right">Kg</th></tr></thead>
                        <tbody>{all.map(c => (
                            <tr key={c.id} className="border-t border-slate-100">
                                {draft && <td className="px-3 py-2"><input type="checkbox" checked={picked.has(c.id)} disabled={!canEdit} onChange={() => { const nx = new Set(picked); if (nx.has(c.id)) nx.delete(c.id); else nx.add(c.id); setPicked(nx); }} aria-label={c.carton_no} /></td>}
                                <td className="px-3 py-2 font-semibold">{c.carton_no}<span className="block text-xs font-normal text-slate-500">line {c.line_no} · {c.style_code}</span></td>
                                <td className="px-3 py-2 text-xs">{c.assortment.map(a => `${a.colour} ${a.size} × ${a.qty}`).join(' · ')}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">{c.qty}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{c.weight_kg || '—'}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}

            {canEdit && (
                <div className="flex flex-wrap gap-2 justify-end mb-5">
                    <SecondaryButton onClick={save} disabled={busy}><Save size={14} /> Save{dirtyCartons ? ' (cartons changed)' : ''}</SecondaryButton>
                    <PrimaryButton busy={busy} disabled={busy || !(picked.size || qtyLines.length)} onClick={async () => {
                        const saved = await save();   // fresh warnings for the cartons as saved
                        if (!saved) return;
                        if (saved.over_shipment?.length) { setAsk({ kind: 'over', text: '' }); return; }
                        if (window.confirm(`Dispatch ${saved.dispatch_no}? ${saved.qty} garment(s) leave the factory.`)) run(() => packingApi.confirmDispatch(id));
                    }}><Truck size={14} /> Dispatch</PrimaryButton>
                </div>
            )}

            {d.history?.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">History</p>
                    {d.history.map(h => <p key={h.id} className="text-xs text-slate-600"><b>{ACTION[h.action] || h.action}</b> · {new Date(h.created_at).toLocaleString('en-IN')} · {h.user_name || ''}{h.reason ? ` — ${h.reason}` : ''}</p>)}
                </div>
            )}

            {ask && (
                <Modal title={ask.kind === 'over' ? 'Dispatch above the tolerance' : `Cancel ${d.dispatch_no}`} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        {ask.kind === 'over' ? <p className="text-sm text-slate-600">{d.over_shipment.join('; ')}. Give the reason to dispatch anyway (it is logged).</p>
                            : <p className="text-sm text-slate-600">{d.status === 'DISPATCHED' ? 'The cartons go back to closed (the goods came back or the note was wrong).' : 'The cartons go back to closed and can go on another note.'}</p>}
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[60px]`} value={ask.text} onChange={e => setAsk({ ...ask, text: e.target.value })} autoFocus /></Field>
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !ask.text.trim()} onClick={async () => {
                                const ok = await run(() => (ask.kind === 'over' ? packingApi.confirmDispatch(id, ask.text.trim()) : packingApi.cancelDispatch(id, ask.text.trim())));
                                if (ok) setAsk(null);
                            }}>{ask.kind === 'over' ? 'Dispatch' : 'Cancel the note'}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

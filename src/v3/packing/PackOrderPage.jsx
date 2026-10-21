// Dispatch one order (20 Oct 2026, phase 7 — "Dispatch without packing"): per order line the colour × size picture
// (ordered · finished at the last stage · dispatched · short-closed · ready to ship), and a new dispatch note by quantity
// (pre-filled with what is ready, up to what is still to ship). The dispatch note page takes the vehicle, invoice and
// boxes and dispatches. Short-close and close live on the order's Ship & close tab. (Carton packing: PackOrderCartonsPage, 3.1.)
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Truck } from 'lucide-react';
import { packingApi } from '../api/packingApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, ErrorBox, Loading } from '../components/ui';
import SalesOrderStatusBadge, { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { DispatchStatus } from './PackingPage';

export default function PackOrderPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [perms, setPerms] = useState({});
    const [qty, setQty] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const load = useCallback(() => packingApi.order(orderId).then(r => {
        setD(r.data);
        const q = {};
        for (const L of r.data.lines) for (const c of L.cells) { const open = Math.max(0, c.ordered - c.short_closed - c.dispatched); const v = Math.min(c.ready, open); if (v > 0) q[`${L.line_id}|${c.colour_id}|${c.size_id}`] = String(v); }
        setQty(q);
    }).catch(err => setError(apiError(err, 'Failed to load.'))), [orderId]);
    useEffect(() => { load(); packingApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, [load]);
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const lines = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([k, v]) => { const [line_id, garment_colour_id, size_id] = k.split('|'); return { line_id, garment_colour_id, size_id, qty: Number(v) }; });
    const create = async () => {
        setBusy(true); setError('');
        try { const r = await packingApi.createDispatch({ order_id: orderId, lines }); navigate(`/v3/packing/dispatches/${r.data.id}`); }
        catch (err) { setError(apiError(err, 'Failed to make the dispatch note.')); setBusy(false); }
    };
    const canNew = perms.dispatch && d.order.status === 'APPROVED';
    return (
        <div>
            <Link to="/v3/packing" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Dispatch</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{d.order.order_no}</h1><SalesOrderStatusBadge status={d.order.status} />
                <span className="text-sm text-slate-500">{d.order.customer_name}{d.order.buyer_po_no ? ` · PO ${d.order.buyer_po_no}` : ''} · ships {fmtDate(d.order.ship_date)} · tolerance {d.tolerance.pct} %</span>
                <Link to={`/v3/orders/${orderId}/close`} className="ml-auto text-sm font-bold text-indigo-700 hover:underline">Ship &amp; close →</Link>
            </div>
            <p className="text-sm text-slate-600 mb-3"><b>{d.ready_to_ship}</b> finished garment(s) ready to ship. No packing in 3.0 — enter the quantities; the note marks that many finished garments dispatched.</p>
            <ErrorBox text={error} />
            {d.lines.map(L => (
                <div key={L.line_id} className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <p className="px-4 pt-3 font-black text-slate-800">Line {L.line_no} · {L.style_code} <span className="text-xs font-normal text-slate-500">last stage: {L.last_stage?.name || '—'}</span></p>
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><tr><th className="px-3 py-2 text-left">Colour · size</th><th className="px-3 py-2">Ordered</th><th className="px-3 py-2">Finished</th><th className="px-3 py-2">Dispatched</th><th className="px-3 py-2">Short-closed</th><th className="px-3 py-2">Ready</th><th className="px-3 py-2">Still to ship</th>{canNew && <th className="px-3 py-2 w-28">This note</th>}</tr></thead>
                        <tbody>{L.cells.map(c => {
                            const k = `${L.line_id}|${c.colour_id}|${c.size_id}`;
                            const open = Math.max(0, c.ordered - c.short_closed - c.dispatched);
                            const col = L.colours.find(x => x.id === c.colour_id)?.name; const sz = L.sizes.find(x => x.id === c.size_id)?.name;
                            return (
                                <tr key={k} className="border-t border-slate-100 text-right tabular-nums">
                                    <td className="px-3 py-1.5 text-left">{col} · <b>{sz}</b></td><td className="px-3 py-1.5">{c.ordered}</td><td className="px-3 py-1.5">{c.finished}</td>
                                    <td className="px-3 py-1.5 font-semibold">{c.dispatched}</td><td className="px-3 py-1.5">{c.short_closed || '—'}</td>
                                    <td className={`px-3 py-1.5 ${c.ready ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>{c.ready}</td><td className={`px-3 py-1.5 ${open ? 'text-rose-700' : 'text-emerald-700'}`}>{open || '✓'}</td>
                                    {canNew && <td className="px-3 py-1.5"><input className="w-20 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" max={c.ready} value={qty[k] || ''} onChange={e => setQty({ ...qty, [k]: e.target.value })} disabled={!c.ready} aria-label={`Ship ${col} ${sz}`} /></td>}
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            ))}
            {canNew && <div className="flex justify-end mb-5"><PrimaryButton onClick={create} busy={busy} disabled={busy || !lines.length}><Truck size={14} /> New dispatch note ({lines.reduce((s, l) => s + l.qty, 0)} pcs)</PrimaryButton></div>}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="font-black text-slate-800 mb-2">Dispatch notes</p>
                {d.dispatches.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : d.dispatches.map(x => (
                    <Link key={x.id} to={`/v3/packing/dispatches/${x.id}`} className="flex flex-wrap items-center gap-3 py-1.5 border-t border-slate-100 first:border-0 text-sm hover:bg-slate-50">
                        <b>{x.dispatch_no}</b><DispatchStatus s={x.status} /><span className="text-slate-600">{x.qty} pcs{x.boxes != null ? ` · ${x.boxes} box(es)` : ''}{x.invoice_no ? ` · invoice ${x.invoice_no}` : ''}</span><span className="ml-auto text-xs text-slate-500">{fmtDate(x.dispatch_date)}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}

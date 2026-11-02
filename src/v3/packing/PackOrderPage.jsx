// Dispatch one order (20 Oct 2026, phase 7 — "Dispatch without packing"). 2 Nov 2026 (owner: "let user select from which
// line he wants to take pieces and consider approved pieces from that line only and create despatch reciept"; packing slips
// and the customer's own process are by hand): 1 pick the line — garments approved at a garment stage by that line, not yet
// dispatched (as 2.0's "which stage to dispatch against"); 2 quantities per colour × size, up to that line's count; 3 the
// dispatch receipt page takes the vehicle, invoice and boxes and dispatches. Short-close and close live on the order's Ship
// & close tab. (Carton packing: PackOrderCartonsPage, 3.1.) Same day ("add batch id and buyer name"): a receipt is one batch of
// the line, as 2.0, so the batch printed on it is what was taken; picked after the line, by itself when there is only one.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Truck, Check } from 'lucide-react';
import { packingApi } from '../api/packingApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import SalesOrderStatusBadge, { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { DispatchStatus } from './PackingPage';

const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
const th = 'px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider';

// Quantities of one order line from the chosen line: colours × sizes that have something free there.
function QtyMatrix({ L, source, qty, setCell, canEdit }) {
    const keyOf = (c, s) => `${L.line_id}|${c.id}|${s.id}`;
    const free = (c, s) => source.cells[keyOf(c, s)] || 0;
    const colours = L.colours.filter(c => L.sizes.some(s => free(c, s) > 0));
    const sizes = L.sizes.filter(s => L.colours.some(c => free(c, s) > 0));
    if (!colours.length) return null;
    const val = (c, s) => Number(qty[keyOf(c, s)]) || 0;
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
            <p className="px-4 pt-3 pb-1 font-black text-slate-800">Line {L.line_no} · {L.style_code}</p>
            <table className="w-full text-sm">
                <thead><tr className="text-right"><th className={`${th} text-left`}>Colour</th>{sizes.map(s => <th key={s.id} className={th}>{s.name}</th>)}<th className={th}>Total</th></tr></thead>
                <tbody>
                    {colours.map(c => (
                        <tr key={c.id} className="border-t border-slate-100 text-right tabular-nums">
                            <td className="px-3 py-2 text-left font-bold text-slate-800 whitespace-nowrap">{c.name}</td>
                            {sizes.map(s => {
                                const max = free(c, s);
                                if (!max) return <td key={s.id} className="px-3 py-2 text-slate-300">—</td>;
                                return (
                                    <td key={s.id} className="px-2 py-1.5 align-top">
                                        {canEdit ? <input aria-label={`${c.name} ${s.name}`} className="w-16 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" max={max} value={qty[keyOf(c, s)] || ''} onChange={e => setCell(keyOf(c, s), e.target.value, max)} /> : null}
                                        <span className={`block text-[11px] ${canEdit ? 'text-slate-400' : 'text-slate-800 font-semibold text-sm'}`}>{canEdit ? `of ${max}` : max}</span>
                                    </td>
                                );
                            })}
                            <td className="px-3 py-2 font-black">{canEdit ? sum(sizes, s => val(c, s)) : sum(sizes, s => free(c, s))}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot><tr className="border-t border-slate-200 bg-slate-50 text-right tabular-nums font-black"><td className="px-3 py-2 text-left">Total</td>
                    {sizes.map(s => <td key={s.id} className="px-3 py-2">{sum(colours, c => (canEdit ? val(c, s) : free(c, s)))}</td>)}
                    <td className="px-3 py-2">{sum(colours, c => sum(sizes, s => (canEdit ? val(c, s) : free(c, s))))}</td></tr></tfoot>
            </table>
        </div>
    );
}

// The order at a glance, one row per colour: what is left to ship.
function OrderPicture({ L }) {
    const rows = L.colours.map(c => {
        const cells = L.cells.filter(x => x.colour_id === c.id);
        return { id: c.id, name: c.name, ordered: sum(cells, x => x.ordered), dispatched: sum(cells, x => x.dispatched), short: sum(cells, x => x.short_closed), open: sum(cells, x => Math.max(0, x.ordered - x.short_closed - x.dispatched)) };
    });
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
            <p className="px-4 pt-3 pb-1 font-black text-slate-800">Line {L.line_no} · {L.style_code} <span className="text-xs font-normal text-slate-500">order position</span></p>
            <table className="w-full text-sm">
                <thead><tr className="text-right"><th className={`${th} text-left`}>Colour</th><th className={th}>Ordered</th><th className={th}>Dispatched</th><th className={th}>Short-closed</th><th className={th}>Still to ship</th></tr></thead>
                <tbody>{rows.map(r => (
                    <tr key={r.id} className="border-t border-slate-100 text-right tabular-nums"><td className="px-3 py-1.5 text-left font-semibold">{r.name}</td><td className="px-3 py-1.5">{r.ordered}</td><td className="px-3 py-1.5">{r.dispatched}</td><td className="px-3 py-1.5">{r.short || '—'}</td><td className={`px-3 py-1.5 font-semibold ${r.open ? 'text-rose-700' : 'text-emerald-700'}`}>{r.open || '✓'}</td></tr>
                ))}</tbody>
                <tfoot><tr className="border-t border-slate-200 bg-slate-50 text-right tabular-nums font-black"><td className="px-3 py-2 text-left">Total</td><td className="px-3 py-2">{sum(rows, r => r.ordered)}</td><td className="px-3 py-2">{sum(rows, r => r.dispatched)}</td><td className="px-3 py-2">{sum(rows, r => r.short) || '—'}</td><td className="px-3 py-2">{sum(rows, r => r.open)}</td></tr></tfoot>
            </table>
        </div>
    );
}

export default function PackOrderPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [perms, setPerms] = useState({});
    const [pick, setPick] = useState(null);   // `${stage}|${line}`
    const [batchId, setBatchId] = useState(null);
    const [qty, setQty] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const load = useCallback(() => packingApi.order(orderId).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [orderId]);
    useEffect(() => { load(); packingApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, [load]);
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const sources = d.sources || [];
    const source = sources.find(s => `${s.stage_type_id}|${s.source_line_id}` === pick) || null;
    const freeBatches = source ? source.batches.filter(b => b.available > 0) : [];
    const batch = freeBatches.find(b => b.batch_id === batchId) || null;
    const canNew = perms.dispatch && d.order.status === 'APPROVED';
    const lines = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([k, v]) => { const [line_id, garment_colour_id, size_id] = k.split('|'); return { line_id, garment_colour_id, size_id, qty: Number(v) }; });
    const total = sum(lines, l => l.qty);
    const choose = (s) => { const free = s.batches.filter(b => b.available > 0); setPick(`${s.stage_type_id}|${s.source_line_id}`); setBatchId(free.length === 1 ? free[0].batch_id : null); setQty({}); setError(''); };
    const chooseBatch = (b) => { setBatchId(b.batch_id); setQty({}); setError(''); };
    const setCell = (k, v, max) => setQty(q => ({ ...q, [k]: v === '' ? '' : String(Math.min(Math.max(0, Math.floor(Number(v)) || 0), max)) }));
    const takeAll = () => setQty(Object.fromEntries(Object.entries(batch.cells).map(([k, n]) => [k, String(n)])));
    const create = async () => {
        setBusy(true); setError('');
        try { const r = await packingApi.createDispatch({ order_id: orderId, source_stage_type_id: source.stage_type_id, source_line_id: source.source_line_id, source_batch_id: batch.batch_id, lines }); navigate(`/v3/packing/dispatches/${r.data.id}`); }
        catch (err) { setError(apiError(err, 'Failed to make the dispatch receipt.')); setBusy(false); load(); }
    };
    const live = d.dispatches.filter(x => x.status !== 'CANCELLED');
    return (
        <div>
            <Link to="/v3/packing" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Dispatch</Link>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-2xl font-black text-slate-900">{d.order.order_no}</h1><SalesOrderStatusBadge status={d.order.status} />
                <span className="text-sm text-slate-500">Buyer <b className="text-slate-700">{d.order.customer_name}</b>{d.order.buyer_po_no ? ` · PO ${d.order.buyer_po_no}` : ''} · ships {fmtDate(d.order.ship_date)} · tolerance {d.tolerance.pct} %</span>
                <Link to={`/v3/orders/${orderId}/close`} className="ml-auto text-sm font-bold text-indigo-700 hover:underline">Ship &amp; close →</Link>
            </div>
            <ErrorBox text={error} />

            <h2 className="font-black text-slate-800 mb-2">1. Take garments from</h2>
            {sources.length === 0 ? <p className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-center text-sm text-slate-500 mb-4">No garment of this order has been approved on a line yet.</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    {sources.map(s => {
                        const on = source === s;
                        return (
                            <button key={`${s.stage_type_id}|${s.source_line_id}`} type="button" disabled={!s.available} onClick={() => choose(s)}
                                className={`relative text-left rounded-xl border-2 px-4 py-3 transition-colors ${on ? 'border-indigo-600 bg-indigo-50' : s.available ? 'border-slate-200 bg-white hover:border-indigo-400' : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'}`}>
                                {on && <Check size={18} className="absolute top-3 right-3 text-indigo-600" />}
                                <p className="font-black text-slate-900 pr-6">{s.line}</p>
                                <p className="text-xs font-semibold text-slate-500">{s.stage}</p>
                                <p className={`mt-2 text-2xl font-black tabular-nums ${s.available ? 'text-indigo-700' : 'text-slate-400'}`}>{s.available}</p>
                                <p className="text-xs text-slate-500">available · {s.approved} approved here</p>
                            </button>
                        );
                    })}
                </div>
            )}

            {source && (
                <>
                    <h2 className="font-black text-slate-800 mb-2">2. Batch</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        {freeBatches.map(b => {
                            const on = batch === b;
                            return (
                                <button key={b.batch_id} type="button" onClick={() => chooseBatch(b)} className={`relative text-left rounded-xl border-2 px-4 py-3 transition-colors ${on ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-400'}`}>
                                    {on && <Check size={18} className="absolute top-3 right-3 text-indigo-600" />}
                                    <p className="font-black text-slate-900 pr-6">Batch #{b.floor_no}</p>
                                    <p className="text-xs font-semibold text-slate-500 truncate">{b.batch_code}</p>
                                    <p className="mt-2 text-2xl font-black tabular-nums text-indigo-700">{b.available}</p>
                                    <p className="text-xs text-slate-500">available at {source.line}</p>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {batch && (
                <>
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h2 className="font-black text-slate-800">3. How many from {source.line}, batch #{batch.floor_no}</h2>
                        {canNew && <span className="ml-auto flex gap-2"><SecondaryButton onClick={takeAll}>Take all ({batch.available})</SecondaryButton><SecondaryButton onClick={() => setQty({})}>Clear</SecondaryButton></span>}
                    </div>
                    {d.lines.map(L => <QtyMatrix key={L.line_id} L={L} source={batch} qty={qty} setCell={setCell} canEdit={canNew} />)}
                    {canNew && <div className="flex justify-end mb-5"><PrimaryButton onClick={create} busy={busy} disabled={busy || !lines.length}><Truck size={14} /> Create dispatch receipt ({total} pcs)</PrimaryButton></div>}
                </>
            )}

            <h2 className="font-black text-slate-800 mb-2 mt-5">Order position</h2>
            {d.lines.map(L => <OrderPicture key={L.line_id} L={L} />)}

            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4">
                <p className="font-black text-slate-800 mb-2">Dispatch receipts</p>
                {d.dispatches.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : d.dispatches.map(x => (
                    <Link key={x.id} to={`/v3/packing/dispatches/${x.id}`} className="flex flex-wrap items-center gap-3 py-1.5 border-t border-slate-100 first:border-0 text-sm hover:bg-slate-50">
                        <b>{x.dispatch_no}</b><DispatchStatus s={x.status} /><span className="text-slate-600">{x.qty} pcs{x.source_floor_no ? ` · batch #${x.source_floor_no}` : ''}{x.source_line ? ` · from ${x.source_line}` : ''}{x.boxes != null ? ` · ${x.boxes} box(es)` : ''}{x.invoice_no ? ` · invoice ${x.invoice_no}` : ''}</span><span className="ml-auto text-xs text-slate-500">{fmtDate(x.dispatch_date)}</span>
                    </Link>
                ))}
                {live.length > 0 && <p className="border-t border-slate-200 mt-1 pt-2 text-sm font-black text-slate-800">Total {sum(live, x => x.qty)} pcs on {live.length} receipt{live.length === 1 ? '' : 's'} (cancelled left out)</p>}
            </div>
        </div>
    );
}

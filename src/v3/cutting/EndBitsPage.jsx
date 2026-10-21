// End bits in the cutting room (19 Oct 2026, phase 3 — docs/PRODUCTION_V3_PLAN.md → "Fabric end bits"). Each roll's
// end bit is the order's own record: a replacement reserve piece (R) and a lay piece (L), tagged. This page lists them
// per order × fabric with the 60-day replacement rate behind the reserve, every piece's history, write-off by hand
// (reason) and the surplus write-off once the order is done with the fabric at its piece stages.
// 21 Oct 2026 (owner: "data of end bits or reserve is not structured, it's just a long list"; "it is a real world
// production application"): by order → fabric × colour → pieces (opened on demand), totals per unit, age, tag search; no
// return by a click — pieces go onto the order's draft return slip (Material returns), the fabric store receives them.
// Whatever is still here at the fabric reconciliation counts as consumed.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Undo2, ChevronRight, ChevronDown, History } from 'lucide-react';
import Modal from '../../shared/Modal';
import { cuttingApi } from '../api/cuttingApi';
import { materialReturnsApi } from '../api/materialReturnsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import { fmt, useCuttingPermissions } from './cutShared';

const STATUS = { AVAILABLE: ['Available', 'bg-emerald-50 text-emerald-800 border-emerald-300'], ON_BATCH: ['On a batch', 'bg-sky-50 text-sky-800 border-sky-300'], USED: ['Used', 'bg-slate-50 text-slate-600 border-slate-300'], WRITTEN_OFF: ['Written off', 'bg-rose-50 text-rose-700 border-rose-300'], RETURNED: ['Returned to store', 'bg-indigo-50 text-indigo-800 border-indigo-300'], ON_RETURN: ['On a return slip', 'bg-amber-50 text-amber-800 border-amber-300'] };
const KIND = { RESERVE: ['Reserve', 'bg-violet-50 text-violet-800 border-violet-300'], LAY: ['Lay piece', 'bg-amber-50 text-amber-800 border-amber-300'] };
const WHY = { UNDER_MIN: 'under 0.3 m', SURPLUS: 'surplus', MANUAL: 'by hand' };
const ACTION = { CREATED: 'Made', ON_BATCH: 'Put on a batch', OFF_BATCH: 'Taken off the batch', LAID: 'Laid', REPLACEMENT: 'Used for a replacement', WRITTEN_OFF: 'Written off', RETURNED: 'Returned to the store', ON_RETURN: 'Put on a return slip', OFF_RETURN: 'Taken off the return slip' };
const chip = ([label, cls]) => <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;

function Detail({ id, onClose }) {
    const [e, setE] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { cuttingApi.endBit(id).then(r => setE(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))); }, [id]);
    return (
        <Modal title={e ? `End bit ${e.tag}` : 'End bit'} onClose={onClose}>
            <div className="w-[min(620px,92vw)] space-y-3">
                <ErrorBox text={error} />
                {!e ? (!error && <Loading />) : (<>
                    <div className="flex flex-wrap items-center gap-2 text-sm">{chip(KIND[e.kind])}{chip(STATUS[e.status])}
                        <b>{fmt(e.metres)} {e.uom}</b><span className="text-slate-500">of {fmt(e.original_m)} {e.uom}</span>{e.write_off_reason && <span className="text-xs text-rose-700">({WHY[e.write_off_reason]}{e.write_off_note ? ` — ${e.write_off_note}` : ''})</span>}</div>
                    <p className="text-sm text-slate-600">{e.order_no} · {e.fabric_label} · {e.colour}<br />{e.parent_tag ? `Left of lay piece ${e.parent_tag}` : `From roll ${e.parent_roll_no || '—'}`}{e.source_floor_no ? ` · batch #${e.source_floor_no}` : ''}</p>
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">When</th><th className="py-1">What</th><th className="py-1 text-right">Metres</th><th className="py-1 text-right">Left</th><th className="py-1">By</th></tr></thead>
                        <tbody>{e.log.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 align-top">
                                <td className="py-1 text-xs text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="py-1"><b>{ACTION[l.action] || l.action}</b>{l.floor_no ? ` · #${l.floor_no}` : ''}{l.piece_uid ? <span className="block text-xs text-slate-500">{l.part_name} {l.piece_uid}</span> : null}{l.note ? <span className="block text-xs text-slate-500">{l.note}</span> : null}</td>
                                <td className="py-1 text-right tabular-nums">{l.metres != null ? fmt(l.metres) : ''}</td>
                                <td className="py-1 text-right tabular-nums">{l.metres_after != null ? fmt(l.metres_after) : ''}</td>
                                <td className="py-1 text-xs text-slate-500">{l.user_name || ''}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                    {e.children.length > 0 && <p className="text-xs text-slate-600">Left after its lay: {e.children.map(c => `${c.tag} ${fmt(c.metres)} ${e.uom} (${STATUS[c.status][0].toLowerCase()})`).join(', ')}</p>}
                </>)}
                <div className="flex justify-end"><SecondaryButton onClick={onClose}>Close</SecondaryButton></div>
            </div>
        </Modal>
    );
}

const TABS = [['open', 'In the cutting room'], ['RETURNED', 'Returned to store'], ['WRITTEN_OFF', 'Written off'], ['USED', 'Used'], ['ALL', 'All']];
const ageOf = (d) => { if (!d) return '—'; const n = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return n <= 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`; };
const unitText = (totals, key) => (totals || []).filter(t => t[key] > 0).map(t => `${fmt(t[key])} ${t.uom}`).join(' · ') || '—';

// Pieces of one order × fabric × colour (loaded when the row is opened).
function Pieces({ order, f, status, perms, picks, setPicks, onDetail, onWriteOff, refreshKey, highlight }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        cuttingApi.endBits({ order_id: order.order_id, fabric_item_id: f.fabric_item_id, colour_id: f.colour_id, status: status === 'open' ? 'open' : status })
            .then(r => setRows(r.data.end_bits)).catch(err => setError(apiError(err, 'Failed to load.')));
    }, [order.order_id, f.fabric_item_id, f.colour_id, status, refreshKey]);
    if (error) return <tr><td colSpan={9} className="px-3 py-2"><ErrorBox text={error} /></td></tr>;
    if (!rows) return <tr><td colSpan={9} className="px-3 py-2"><Loading /></td></tr>;
    return (
        <tr><td colSpan={9} className="px-3 pb-3 bg-slate-50/60">
            <table className="w-full text-sm bg-white border border-slate-200 rounded-lg">
                <thead className="text-left text-[11px] font-bold text-slate-500 uppercase"><tr>
                    <th className="px-2 py-1.5 w-8" /><th className="px-2 py-1.5">Tag</th><th className="px-2 py-1.5">From</th><th className="px-2 py-1.5 text-right">Length</th><th className="px-2 py-1.5">Age</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5" /></tr></thead>
                <tbody>{rows.map(e => (
                    <tr key={e.id} className={`border-t border-slate-100 ${highlight && e.tag.toLowerCase().includes(highlight) ? 'bg-yellow-50' : ''}`}>
                        <td className="px-2 py-1.5">{perms.end_bits && e.status === 'AVAILABLE' && <input type="checkbox" className="w-4 h-4" checked={Boolean(picks[e.id])} onChange={ev => setPicks({ ...picks, [e.id]: ev.target.checked ? order.order_id : undefined })} aria-label={`Pick ${e.tag}`} />}</td>
                        <td className="px-2 py-1.5"><b>{e.tag}</b> <span className="ml-1">{chip(KIND[e.kind])}</span></td>
                        <td className="px-2 py-1.5 text-xs">{e.parent_tag ? `left of ${e.parent_tag}` : `roll ${e.parent_roll_no || '—'}`}{e.source_floor_no && <> · <Link className="text-indigo-700 hover:underline" to={`/v3/cutting/batches/${e.source_batch_id}`}>#{e.source_floor_no}</Link></>}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums"><b>{fmt(e.metres)}</b> {e.uom}{e.metres !== e.original_m && <span className="block text-[11px] text-slate-500">of {fmt(e.original_m)}</span>}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-600">{ageOf(e.created_at)}</td>
                        <td className="px-2 py-1.5">{chip(STATUS[e.status] || [e.status, ''])}
                            {e.return_slip && ['ON_RETURN', 'RETURNED'].includes(e.status) && <Link to={`/v3/material-returns/${e.return_slip.id}`} className="block text-[11px] font-bold text-indigo-700 hover:underline">{e.return_slip.return_no}</Link>}
                            {e.write_off_reason && <span className="block text-[11px] text-slate-500">{WHY[e.write_off_reason]}{e.write_off_note ? ` — ${e.write_off_note}` : ''}</span>}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            <button type="button" className="p-1 text-slate-500" title="History" aria-label={`History of ${e.tag}`} onClick={() => onDetail(e.id)}><History size={14} /></button>
                            {perms.end_bits && e.status === 'AVAILABLE' && <button type="button" className="p-1 text-rose-500" title="Write off" aria-label={`Write off ${e.tag}`} onClick={() => onWriteOff(e)}><Trash2 size={14} /></button>}
                        </td>
                    </tr>
                ))}</tbody>
            </table>
        </td></tr>
    );
}

export default function EndBitsPage() {
    const perms = useCuttingPermissions();
    const navigate = useNavigate();
    const [status, setStatus] = useState('open');
    const [q, setQ] = useState('');
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [openOrders, setOpenOrders] = useState({});    // order_id → true
    const [openRows, setOpenRows] = useState({});        // order|fabric|colour → true
    const [picks, setPicks] = useState({});              // end bit id → order id
    const [detail, setDetail] = useState(null);
    const [wo, setWo] = useState(null);                  // { e, reason }
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [highlight, setHighlight] = useState('');
    const load = useCallback(() => cuttingApi.endBitsSummary(status).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load end bits.'))), [status]);
    useEffect(() => { load(); setPicks({}); }, [load]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (s2) => !words.length || words.every(w => s2.toLowerCase().includes(w));
    const orders = d.orders.filter(o => hit(`${o.order_no} ${o.customer_name} ${o.styles || ''} ${o.fabrics.map(f => `${f.fabric_label} ${f.colour}`).join(' ')}`));
    const rate = d.rate;
    const rowKey = (o, f) => `${o.order_id}|${f.fabric_item_id}|${f.colour_id}`;
    // A tag (e.g. EB-21-L): find its order × fabric × colour and open it, the piece highlighted.
    const findTag = async () => {
        const tag = q.trim();
        if (!tag) return;
        setError(''); setMsg('');
        try {
            const r = await cuttingApi.endBits({ tag, status: 'ALL' });
            const e = r.data.end_bits[0];
            if (!e) { setMsg(`No end bit with a tag like "${tag}".`); return; }
            const st = ['AVAILABLE', 'ON_BATCH', 'ON_RETURN'].includes(e.status) ? 'open' : e.status;
            setQ(''); setHighlight(tag.toLowerCase()); setStatus(st);
            setOpenOrders(x => ({ ...x, [e.order_id]: true })); setOpenRows(x => ({ ...x, [`${e.order_id}|${e.fabric_item_id}|${e.colour_id}`]: true }));
        } catch (err) { setError(apiError(err, 'Failed.')); }
    };
    // Onto the order's draft return slip (made if none); the slip opens.
    const toSlip = async (orderId, lines) => {
        setBusy(true); setError(''); setMsg('');
        try { const r = await materialReturnsApi.draft(orderId, lines); navigate(`/v3/material-returns/${r.data.id}`); }
        catch (err) { setError(apiError(err, 'Failed.')); setBusy(false); }
    };
    const surplus = async (o, f) => {
        if (!window.confirm(`Write off every end bit of ${f.fabric_label} left on ${o.order_no}? It is counted as cutting wastage (a loss) in the order's fabric reconciliation.`)) return;
        setBusy(true); setError(''); setMsg('');
        try { const r = await cuttingApi.writeOffSurplus(o.order_id, f.fabric_item_id); setMsg(`Written off: ${r.data.written_off.map(e => `${e.tag} ${fmt(e.metres)}`).join(', ')} — ${fmt(r.data.metres)} ${r.data.uom}.`); load(); setRefreshKey(k => k + 1); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const writeOff = async () => {
        setBusy(true); setFormError('');
        try { await cuttingApi.writeOffEndBit(wo.e.id, wo.reason.trim()); setMsg(`${wo.e.tag} written off.`); setWo(null); load(); setRefreshKey(k => k + 1); }
        catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const picked = (orderId) => Object.entries(picks).filter(([, v]) => v === orderId).map(([id]) => id);
    const open = status === 'open';
    return (
        <div>
            <PageHeader title="End bits" subtitle="The order's fabric pieces left at the end of a roll — a replacement reserve and a lay piece per roll, tagged, kept in the cutting room. Put them on the order's return slip before its fabric reconciliation; whatever is still here then counts as consumed." />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{open ? 'In the cutting room' : TABS.find(t => t[0] === status)[1]}</p>
                    <p className="font-black text-slate-800">{d.orders.length} order{d.orders.length === 1 ? '' : 's'} · {d.totals.reduce((a, t) => a + t.pieces, 0)} pieces</p>
                    <p className="text-xs text-slate-500">reserve {unitText(d.totals, 'reserve_m')} · lay pieces {unitText(d.totals, 'lay_m')}</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Oldest piece</p>
                    <p className="font-black text-slate-800">{ageOf(d.oldest_at)}</p><p className="text-xs text-slate-500">{open ? 'in the cutting room' : ''}</p></div>
                <div className={`border rounded-xl p-3 ${open && d.waiting_on_returns ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}><p className="text-xs font-bold text-slate-500">Fully cut, end bits still here</p>
                    <p className="font-black text-slate-800">{open ? d.waiting_on_returns : '—'} order{d.waiting_on_returns === 1 ? '' : 's'}</p><p className="text-xs text-slate-500">return them before the fabric reconciliation</p></div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Reserve per roll · replacement rate {rate.rate_pct} %</p>
                    <p className="font-black text-slate-800">{rate.starting ? `${rate.start_reserve_m} m (starting value)` : `metres laid × ${rate.rate_pct} %`}</p>
                    <p className="text-xs text-slate-500">pieces under {rate.min_m} m are written off at once</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-1 mb-3 border-b border-slate-200">
                {TABS.map(([k, label]) => <button key={k} type="button" onClick={() => setStatus(k)} className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${status === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
                <form className="ml-auto mb-1 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); findTag(); }}>
                    <div className="w-72"><SearchInput value={q} onChange={setQ} placeholder="Order, style, fabric, colour — or a tag + Enter" /></div>
                </form>
            </div>
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{msg}</p>}
            {orders.length === 0 && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">{open ? 'No end bits in the cutting room.' : 'Nothing here.'}</p>}
            {orders.map(o => {
                const isOpen = Boolean(openOrders[o.order_id]);
                const mine = picked(o.order_id);
                return (
                    <section key={o.order_id} className={`bg-white border rounded-xl mb-3 ${open && o.cut_done && o.available_n ? 'border-amber-300' : 'border-slate-200'}`}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                            <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpenOrders({ ...openOrders, [o.order_id]: !isOpen })} aria-expanded={isOpen}>
                                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                <span><b className="text-slate-900">{o.order_no}</b><span className="block text-xs text-slate-500">{o.customer_name}{o.styles ? ` · ${o.styles}` : ''}</span></span>
                            </button>
                            <span className="text-xs text-slate-600">{o.batches_cut} batch{o.batches_cut === 1 ? '' : 'es'} finalised{o.batches_open ? ` · ${o.batches_open} being cut` : ''}</span>
                            {open && o.cut_done && o.available_n > 0 && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">fully cut — return before the reconciliation</span>}
                            {o.open_slip && <Link to={`/v3/material-returns/${o.open_slip.id}`} className="text-[11px] font-black px-2 py-0.5 rounded border bg-indigo-50 text-indigo-800 border-indigo-300 hover:underline">{o.open_slip.return_no} · {o.open_slip.status === 'DRAFT' ? 'draft' : 'submitted'}</Link>}
                            <span className="ml-auto flex flex-wrap items-center gap-4 text-sm tabular-nums">
                                <span><span className="text-xs text-slate-500">pieces </span><b>{o.pieces}</b></span>
                                <span><span className="text-xs text-slate-500">reserve </span><b>{unitText(o.totals, 'reserve_m')}</b></span>
                                <span><span className="text-xs text-slate-500">lay pieces </span><b>{unitText(o.totals, 'lay_m')}</b></span>
                                <span><span className="text-xs text-slate-500">oldest </span><b>{ageOf(o.oldest_at)}</b></span>
                                {open && perms.end_bits && o.available_n > 0 && <SecondaryButton busy={busy} disabled={busy} onClick={() => toSlip(o.order_id, [{ kind: 'ALL_END_BITS' }])}><Undo2 size={14} /> Add all to return slip</SecondaryButton>}
                            </span>
                        </div>
                        {isOpen && (
                            <div className="border-t border-slate-100 overflow-x-auto">
                                <table className="w-full text-sm min-w-[900px]">
                                    <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider"><tr>
                                        <th className="px-3 py-2">Fabric · colour</th><th className="px-3 py-2 text-right">Reserve</th><th className="px-3 py-2 text-right">Lay pieces</th>
                                        <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">On a return slip</th><th className="px-3 py-2">Oldest</th><th className="px-3 py-2">{open ? 'Surplus' : ''}</th><th className="px-3 py-2" colSpan={2} /></tr></thead>
                                    <tbody>{o.fabrics.map(f => {
                                        const rk = rowKey(o, f); const rowOpen = Boolean(openRows[rk]);
                                        return [
                                            <tr key={rk} className="border-t border-slate-100">
                                                <td className="px-3 py-2"><button type="button" className="flex items-center gap-1 font-semibold text-slate-800 text-left" onClick={() => setOpenRows({ ...openRows, [rk]: !rowOpen })} aria-expanded={rowOpen}>{rowOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{f.fabric_label} · {f.colour}</button></td>
                                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{f.reserve_n ? `${f.reserve_n} · ${fmt(f.reserve_m)} ${f.uom}` : '—'}</td>
                                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{f.lay_n ? `${f.lay_n} · ${fmt(f.lay_m)} ${f.uom}` : '—'}</td>
                                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold">{fmt(f.total_m)} {f.uom}</td>
                                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{f.on_return_n ? `${f.on_return_n} · ${fmt(f.on_return_m)} ${f.uom}` : '—'}</td>
                                                <td className="px-3 py-2 text-xs text-slate-600">{ageOf(f.oldest_at)}</td>
                                                <td className="px-3 py-2 text-xs">{open && f.surplus ? (f.surplus.ready ? (perms.end_bits ? <button type="button" className="font-bold text-rose-700 hover:underline" disabled={busy} onClick={() => surplus(o, f)}>Write off surplus</button> : <span className="text-emerald-700 font-semibold">surplus can be written off</span>) : <span className="text-slate-500">{f.surplus.reason}</span>) : null}</td>
                                                <td className="px-3 py-2 text-right" colSpan={2}>{open && perms.end_bits && f.available_n > 0 && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline whitespace-nowrap" disabled={busy} onClick={() => toSlip(o.order_id, [{ kind: 'ALL_END_BITS', fabric_item_id: f.fabric_item_id, colour_id: f.colour_id }])}>Add all ({f.available_n}) to return slip</button>}</td>
                                            </tr>,
                                            rowOpen && <Pieces key={`${rk}|p`} order={o} f={f} status={status} perms={perms} picks={picks} setPicks={setPicks} onDetail={setDetail} onWriteOff={(e) => { setFormError(''); setWo({ e, reason: '' }); }} refreshKey={refreshKey} highlight={highlight} />,
                                        ];
                                    })}</tbody>
                                    <tfoot>{o.totals.map(t => (
                                        <tr key={t.uom} className="border-t-2 border-slate-300 bg-slate-50 font-black">
                                            <td className="px-3 py-2">Total ({o.fabrics.filter(f => f.uom === t.uom).length} fabric · colour)</td>
                                            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(t.reserve_m)} {t.uom}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(t.lay_m)} {t.uom}</td>
                                            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(t.total_m)} {t.uom}</td>
                                            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(o.fabrics.filter(f => f.uom === t.uom).reduce((a, f) => a + f.on_return_m, 0))} {t.uom}</td><td colSpan={4} />
                                        </tr>
                                    ))}</tfoot>
                                </table>
                                {mine.length > 0 && <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-2"><span className="text-sm text-slate-700">{mine.length} piece{mine.length === 1 ? '' : 's'} ticked</span>
                                    <PrimaryButton busy={busy} disabled={busy} onClick={() => toSlip(o.order_id, mine.map(id => ({ kind: 'END_BIT', end_bit_id: id })))}><Undo2 size={14} /> Add to return slip</PrimaryButton></div>}
                            </div>
                        )}
                    </section>
                );
            })}
            {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
            {wo && (
                <Modal title={`Write off ${wo.e.tag}`} onClose={() => setWo(null)}>
                    <div className="space-y-3 w-[min(420px,85vw)]">
                        <p className="text-sm text-slate-600">{fmt(wo.e.metres)} {wo.e.uom} of {wo.e.fabric_label} · {wo.e.order_no}. A loss in the order's fabric reconciliation.</p>
                        <Field label="Reason *"><input className={inputCls} value={wo.reason} onChange={e => setWo({ ...wo, reason: e.target.value })} placeholder="e.g. soiled, lost, damaged" autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setWo(null)}>Back</SecondaryButton><PrimaryButton onClick={writeOff} busy={busy} disabled={busy || !wo.reason.trim()}>Write off</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

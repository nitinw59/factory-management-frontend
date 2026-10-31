// One trim kit — /v3/trim-kits/:id. Since 19 Oct 2026 (phase 5) every kit is made from its cut batch when the batch is
// finalised: Order BOM rate × garments cut per colour × size (threads in whole cones) — the store can't change it.
// 20 Oct 2026 ("Over-cut and trims"): over-cut garments are kitted on their own lines, handed from the store's free
// stock; above the free limit they are held until the merchandiser approves (refused → taken off the kit).
// 21 Oct 2026 ("Trim kits — store picking, handover and returns"):
//   Store: print the pick list, put the items in the kit and enter what went in, line by line — less than owed needs a
//   reason (not in stock / damaged / count short / other; damaged and count short adjust the stock); the kit goes ready
//   with what was picked and the rest waits in Pending to fulfil. For a line it can't hand, the store proposes an extra
//   line (another item, free stock) — the merchandiser approves; the original line is closed as replaced.
//   Line loader: count each picked line — as picked, short, excess, wrong item or damaged; the good lines are signed
//   (an MI3 issue slip and a valuation bill TB3/…), the bad ones go back to the store. Or send the whole kit back.
// 27 Oct 2026 (owner: "do not wait for approval add everything whatever is CUT in batch trim kit, make separate column for
// over cut quantity requirement and total quantity; in header clearly state in detailed small table"): nothing waits for
// the over-cut approval; one row per item — Order · Over-cut · Total — and the pick / count take one number per item,
// spread over its lines order first; a small table up top: per colour × size, ordered, cut before, cut now, for the
// order, over-cut within the free limit and above it; items not in the store say so, with what is on order.
// 25 Oct 2026 (kits follow the order's BOM, kitRefresh.js): an untouched kit is remade when the order's BOM changes (history
// "Remade"); a kit the store has started keeps its lines and shows a "BOM changed" notice with each difference — the store
// deals with it (an extra line for what is missing) and marks it dealt with (note optional).
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Undo2, Ban, PenLine, RotateCcw, FileDown, Replace, Tag } from 'lucide-react';
import Modal from '../../shared/Modal';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError, mastersApi } from '../api/mastersApi';
import { useV3Live } from '../live';
import { useV3Access } from '../V3Access';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { loadLetterhead } from '../components/letterhead';
import { KIT_STATUS, ACTION, SHORT_REASON, COUNT_ISSUE, qty, handout, groupKitLines, spread, isOver, unitsOwedOf } from './trimKitShared';
import { exportPickList, exportKitBill } from './kitPrint';
import KitLabelsPanel from './KitLabelsPanel';

const money = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const amount = (l, v) => (l.in_units ? `${v} ${l.purchase_uom}` : `${qty(v, l.uom)} ${l.uom}`);

const PART_LABEL = { ORDER: 'order', OVER_FREE: 'over-cut (free limit)', OVER_APPROVAL: 'over-cut (above it)', EXTRA: 'extra line' };

// What the batch cut, per colour × size (27 Oct 2026, "in header clearly state in detailed small table"): ordered, cut in
// earlier batches, cut now, for the order, over-cut within the free limit and above it, the over-cut garment numbers —
// and the approval, which no longer holds the kit. Without an over-cut record: the cells of the kit's order lines.
function CutSummary({ k, rows }) {
    const oc = k.over_cut;
    const cells = oc?.cells?.length ? oc.cells.map(c => ({ colour: c.colour, size: c.size, ordered: c.ordered, before: c.before, cut: c.cut, within: c.within, free: c.free, approval: c.approval, nos: [...(c.free_nos || []), ...(c.approval_nos || [])] }))
        : (() => {   // no over-cut: garments per colour × size from the order lines' basis
            const m = new Map();
            for (const l of k.lines.filter(x => x.part === 'ORDER')) for (const c of l.basis?.cells || []) { const key = `${c.colour}|${c.size}`; m.set(key, { colour: c.colour, size: c.size, cut: Math.max(m.get(key)?.cut || 0, c.garments) }); }
            return [...m.values()].map(c => ({ ...c, ordered: null, before: null, within: c.cut, free: 0, approval: 0, nos: [] }));
        })();
    if (!cells.length) return null;
    const t = cells.reduce((a, c) => ({ cut: a.cut + c.cut, within: a.within + c.within, free: a.free + c.free, approval: a.approval + c.approval }), { cut: 0, within: 0, free: 0, approval: 0 });
    const notInStore = rows.filter(g => g.stock_on_hand <= 0 && g.remaining > 0).length;
    const status = !oc || oc.status === 'WITHIN' ? null : oc.status === 'PENDING' ? 'waiting for the merchandiser — the kit does not wait'
        : oc.status === 'APPROVED' ? `approved${oc.decided_by_name ? ` by ${oc.decided_by_name}` : ''}` : `refused${oc.decided_by_name ? ` by ${oc.decided_by_name}` : ''} — those garments are written off${oc.decision_note ? ` (${oc.decision_note})` : ''}`;
    const TH = 'px-2 py-1 text-[10px] font-bold uppercase tracking-wider';
    return (
        <div className="bg-white border border-slate-200 border-l-4 border-l-sky-500 rounded-xl overflow-hidden mb-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 bg-sky-50 border-b border-sky-100">
                <span className="text-xs font-black uppercase tracking-wider text-sky-900">What this kit is for</span>
                <span className="text-xs text-slate-600"><b>{t.cut}</b> garments cut = <b>{t.within}</b> for the order{t.free + t.approval > 0 ? <> + <b className="text-sky-800">{t.free + t.approval}</b> over-cut ({t.free} within the {oc?.free_pct ?? 0}% free limit, {t.approval} above it)</> : ''} — all kitted</span>
                <span className="ml-auto text-xs text-slate-600">{rows.length} item(s){notInStore ? <> · <b className="text-rose-700">{notInStore} not in store</b></> : ''}</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-right"><tr>
                        <th className={`${TH} text-left`}>Colour</th><th className={`${TH} text-left`}>Size</th><th className={TH}>Ordered</th><th className={TH}>Cut before</th><th className={TH}>Cut now</th>
                        <th className={TH}>For the order</th><th className={TH}>Over-cut · free limit</th><th className={TH}>Over-cut · above it</th><th className={`${TH} text-left`}>Over-cut garment nos.</th>
                    </tr></thead>
                    <tbody>{cells.map((c, i) => (
                        <tr key={i} className="border-t border-slate-100 text-right tabular-nums">
                            <td className="px-2 py-1 text-left font-semibold">{c.colour}</td><td className="px-2 py-1 text-left">{c.size}</td>
                            <td className="px-2 py-1">{c.ordered ?? '—'}</td><td className="px-2 py-1">{c.before ?? '—'}</td><td className="px-2 py-1 font-bold">{c.cut}</td>
                            <td className="px-2 py-1">{c.within}</td><td className={`px-2 py-1 ${c.free ? 'text-sky-800 font-bold' : 'text-slate-300'}`}>{c.free || '—'}</td>
                            <td className={`px-2 py-1 ${c.approval ? 'text-amber-800 font-bold' : 'text-slate-300'}`}>{c.approval || '—'}</td>
                            <td className="px-2 py-1 text-left text-slate-600">{c.nos.length ? c.nos.join(', ') : '—'}</td>
                        </tr>
                    ))}</tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-right tabular-nums"><tr>
                        <td className="px-2 py-1 text-left" colSpan={2}>Total · {cells.length} colour × size</td>
                        <td className="px-2 py-1">{cells.every(c => c.ordered != null) ? cells.reduce((a, c) => a + c.ordered, 0) : '—'}</td>
                        <td className="px-2 py-1">{cells.every(c => c.before != null) ? cells.reduce((a, c) => a + c.before, 0) : '—'}</td>
                        <td className="px-2 py-1">{t.cut}</td><td className="px-2 py-1">{t.within}</td><td className="px-2 py-1">{t.free || '—'}</td><td className="px-2 py-1">{t.approval || '—'}</td>
                        <td className="px-2 py-1 text-left font-normal text-slate-600">{status ? <>Over-cut approval: <b className={oc.status === 'REFUSED' ? 'text-rose-700' : oc.status === 'APPROVED' ? 'text-emerald-700' : 'text-amber-800'}>{status}</b>{oc.cut_reason ? ` · cutting's reason: ${oc.cut_reason}` : ''}</> : ''}</td>
                    </tr></tfoot>
                </table>
            </div>
            {t.free + t.approval > 0 && <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Over-cut trims come from the store's <b>free stock</b> (not allocated to any order), never from this order's allocation — shown in the Over-cut column below.</p>}
        </div>
    );
}

export default function TrimKitPage() {
    const { id } = useParams();
    return <KitView id={id} />;
}

function KitView({ id }) {
    const { me } = useV3Access();
    const [k, setK] = useState(null);
    const [perm, setPerm] = useState({ prepare: false, sign: false });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [basis, setBasis] = useState(null);     // kit line whose calculation is open
    const [pick, setPick] = useState(null);       // { rows: Map(lineId → { v, reason, note }) }
    const [count, setCount] = useState(null);     // { lines: [], line_id, rows: Map(lineId → { v, issue, damaged, note }), note, legacy }
    const [extra, setExtra] = useState(null);     // { line, search, items, item_id, qty, reason }
    const [ask, setAsk] = useState(null);         // { title, confirm, hint, label, optional, run(reason) }
    const [askText, setAskText] = useState('');
    const [formError, setFormError] = useState('');
    const [labelsOpen, setLabelsOpen] = useState(false);   // garment barcode labels (23 Oct 2026)
    const load = useCallback(() => trimKitsApi.get(id).then(res => setK(res.data)).catch(err => setError(apiError(err, 'Failed to load the kit.'))), [id]);
    useEffect(() => { load(); trimKitsApi.permissions().then(res => setPerm(res.data)).catch(() => {}); }, [load]);
    useV3Live(() => { if (!count && !pick && !extra && !labelsOpen) load(); });
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setK((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    if (!k) return error ? <ErrorBox text={error} /> : <Loading />;
    const S = k.status;
    const open = k.lines.filter(l => l.remaining > 0 && !l.held);
    const picked = k.lines.filter(l => l.picked > 0);
    const LB = k.labels;   // garment labels line (23 Oct 2026): qty, issued, picked, remaining, printed, available — no stock
    const legacy = S === 'READY' && picked.length === 0 && !(LB && LB.picked > 0);   // made ready before picking existed: counted against what it owes
    const toCount = legacy ? open : picked;
    const pendingExtra = (k.extra_requests || []).filter(r => r.status === 'PENDING');
    const rows = groupKitLines(k.lines);           // one row per item (order + over-cut)
    const openRows = groupKitLines(open);           // what is still owed, per item
    const countRows = groupKitLines(toCount);       // what the loader counts, per item
    const BC = k.bom_change;   // the order's BOM changed after the store started on the kit (25 Oct 2026)
    const remadeAt = k.history.find(h => h.action === 'REMADE')?.created_at;

    // ── picking (store) — one number per item, spread over its lines (order first)
    // Starts at what the stock can give (owed, or less when the stock is short) — the keeper corrects it to what physically went in.
    const owedOf = (g) => (g.in_units ? g.units_owed : g.remaining);
    // the over-cut share only out of free stock (not allocated to any order) — the signing refuses it otherwise
    const canGive = (g) => {
        if (g.in_units) return Math.min(g.units_owed, Math.floor(g.stock_on_hand / g.factor + 1e-9));
        const fl = (v) => (g.uom === 'pcs' ? Math.floor(v + 1e-9) : Math.round(v * 1000) / 1000);
        const forOrder = Math.min(g.remaining - g.over_remaining, fl(g.stock_on_hand));
        const forOver = Math.min(g.over_remaining, fl(Math.max(0, Math.min(g.stock_on_hand - forOrder, g.stock_free))));
        return Math.max(0, forOrder + forOver);
    };
    const openPick = () => { setFormError(''); setPick({ rows: new Map(openRows.map(g => [g.key, { v: String(Math.max(0, canGive(g))), reason: canGive(g) <= 0 ? 'NOT_IN_STOCK' : '', note: '' }])) }); };
    const pickShort = (g, r) => Number(r.v || 0) + 1e-9 < owedOf(g);
    const pickReady = pick && openRows.every(g => { const r = pick.rows.get(g.key); return !pickShort(g, r) || (r.reason && (r.reason !== 'OTHER' || r.note.trim())); });
    const pickAny = pick && (openRows.some(g => Number(pick.rows.get(g.key).v || 0) > 0) || (LB && LB.available > 0));
    const canPick = open.length > 0 || Boolean(LB && LB.remaining > 0);
    const pickPayload = () => openRows.flatMap(g => {
        const r = pick.rows.get(g.key);
        const caps = g.lines.map(l => (l.in_units ? unitsOwedOf(l) : l.remaining));
        return spread(r.v, caps).map((v, i) => {
            const l = g.lines[i];
            return { kit_line_id: l.id, [l.in_units ? 'units' : 'qty']: v, ...(v + 1e-9 < caps[i] ? { reason: r.reason, note: r.note || undefined } : {}) };
        });
    });
    // ── count (loader) — one count per item, spread over the lines that were picked (order first)
    const openCount = () => {
        setFormError('');
        const mine = new Set((k.batch_lines || []).map(l => l.id));
        trimKitsApi.lines().then(res => setCount({
            lines: [...res.data.filter(l => mine.has(l.id)), ...res.data.filter(l => !mine.has(l.id))], line_id: k.batch_lines?.length === 1 ? k.batch_lines[0].id : '', note: '', legacy,
            rows: new Map(countRows.map(g => [g.key, { v: String(pickedOfG(g)), issue: '', damaged: '', note: '' }])),
            labels: LB && LB.picked > 0 ? { v: String(LB.picked), note: '' } : null,
        })).catch(err => setError(apiError(err, 'Failed to load lines.')));
    };
    const pickedOf = (l) => (l.in_units ? (legacy ? unitsOwedOf(l) : l.picked_units) : (legacy ? l.remaining : l.picked));
    const pickedOfG = (g) => Math.round(g.lines.reduce((a, l) => a + (Number(pickedOf(l)) || 0), 0) * 1000) / 1000;
    const outcome = (g, r) => {
        const p = pickedOfG(g); const v = Number(r.v || 0);
        if (r.issue === 'WRONG_ITEM') return { kind: 'WRONG_ITEM', signed: 0 };
        if (r.issue === 'DAMAGED') return { kind: 'DAMAGED', signed: Math.max(0, Math.min(v, p) - Number(r.damaged || 0)) };
        if (v > p) return { kind: 'EXCESS', signed: p };
        if (v < p) return { kind: 'SHORT', signed: v };
        return { kind: 'OK', signed: p };
    };
    const countPayload = () => countRows.flatMap(g => {
        const r = count.rows.get(g.key);
        const caps = g.lines.map(l => Number(pickedOf(l)) || 0);
        const shares = spread(r.v, caps);
        // damaged: taken off the over-cut lines first (the last lines), never above what each line counted
        let dLeft = r.issue === 'DAMAGED' ? Number(r.damaged || 0) : 0;
        const dmg = shares.map(() => 0);
        for (let i = shares.length - 1; i >= 0 && dLeft > 0; i -= 1) { const d = Math.min(dLeft, Math.min(shares[i], caps[i])); dmg[i] = d; dLeft = Math.round((dLeft - d) * 1000) / 1000; }
        return g.lines.map((l, i) => {
            const base = { kit_line_id: l.id, [l.in_units ? 'units' : 'qty']: shares[i] };
            if (r.issue === 'WRONG_ITEM') return { ...base, issue: 'WRONG_ITEM', note: r.note || undefined };
            if (r.issue === 'DAMAGED' && dmg[i] > 0) return { ...base, issue: 'DAMAGED', damaged: dmg[i], note: r.note || undefined };
            return base;
        });
    });
    const countReady = count && count.line_id && countRows.every(g => { const r = count.rows.get(g.key); return r.v !== '' && (r.issue !== 'WRONG_ITEM' || r.note.trim()) && (r.issue !== 'DAMAGED' || Number(r.damaged) > 0); })
        && (!count.labels || (count.labels.v !== '' && Number.isInteger(Number(count.labels.v)) && Number(count.labels.v) >= 0));
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const searchItems = async (q) => {
        try { const r = await mastersApi.trimItems({ search: q || undefined, active: 'true' }); setExtra(x => x && { ...x, items: r.data.filter(i => String(i.id) !== x.line.item_id) }); } catch (err) { setFormError(apiError(err, 'Failed.')); }
    };

    return (
        <div>
            <Link to="/v3/trim-kits" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Trim kits</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{k.kit_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${KIT_STATUS[S].cls}`}>{KIT_STATUS[S].label}</span>
                {pendingExtra.length > 0 && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">extra line waiting for the merchandiser</span>}
                {BC && !BC.seen_at && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">BOM changed</span>}
            </div>
            <p className="text-sm text-slate-600 mb-1"><Link to={`/v3/orders/${k.order_id}`} className="font-semibold text-indigo-700 hover:underline">{k.order_no}</Link> · {k.customer_name}{k.batch_code ? <> · batch <b>#{k.floor_no}</b> {k.batch_code}</> : ''}</p>
            {k.auto && <p className="text-xs text-slate-500 mb-1">Made when the batch was finalised: Order BOM × the garments cut, per colour × size — wastage on the order's garments, none on over-cut garments. The quantities can't be changed — put in what is there; the rest follows on the same kit.</p>}
            <p className="text-sm mb-3">{k.batch_lines?.length ? <>Goes to: {k.batch_lines.map(l => <b key={l.id} className="mr-2 text-slate-800">{l.name} <span className="font-normal text-slate-500">({l.stage})</span></b>)}</> : <span className="text-slate-500">The batch is not on a sewing line yet — any line loader may sign for it.</span>}</p>
            {k.history[0]?.action === 'SENT_BACK' && S !== 'READY' && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2"><b>Sent back by the line{k.history[0].user_name ? ` (${k.history[0].user_name})` : ''}:</b> {k.history[0].reason} — correct the kit and put it in again.</div>}
            {remadeAt && !BC && <p className="mb-2 text-xs text-sky-800">Remade from the order's BOM on {new Date(remadeAt).toLocaleString('en-IN')} — the BOM changed before anything was picked (see History).</p>}
            {BC && (BC.seen_at ? (
                <p className="mb-3 text-xs text-slate-600"><b>Order BOM changed</b> on {new Date(BC.at).toLocaleString('en-IN')} after this kit was started — dealt with{k.bom_change_seen_by_name ? ` by ${k.bom_change_seen_by_name}` : ''} on {new Date(BC.seen_at).toLocaleString('en-IN')}{BC.seen_note ? `: ${BC.seen_note}` : ''}.</p>
            ) : (
                <div className="mb-3 text-sm bg-amber-50 border border-amber-300 text-amber-950 rounded-lg px-3 py-2">
                    <p className="font-bold">The order's BOM changed on {new Date(BC.at).toLocaleString('en-IN')}{BC.reason ? ` (${BC.reason})` : ''} after this kit was started — nothing on the kit was changed.</p>
                    <p className="text-xs mb-1.5">For what is now missing, ask for an extra line (the merchandiser approves); tell the line about items no longer on the BOM. Then mark it dealt with.</p>
                    <table className="w-full text-xs bg-white/60 rounded">
                        <thead className="text-left font-bold text-amber-900/70 uppercase tracking-wider"><tr><th className="px-2 py-1">Item</th><th className="px-2 py-1 text-right">In the kit</th><th className="px-2 py-1 text-right">BOM now</th><th className="px-2 py-1 text-right">Change</th></tr></thead>
                        <tbody>{BC.diffs.map((d, i) => (
                            <tr key={i} className="border-t border-amber-200">
                                <td className="px-2 py-1">{d.label}{d.part !== 'ORDER' ? <span className="text-amber-800"> · over-cut</span> : null}{d.kind === 'NEW' ? <b className="ml-1 text-emerald-700">new</b> : d.kind === 'GONE' ? <b className="ml-1 text-rose-700">no longer on the BOM</b> : null}</td>
                                <td className="px-2 py-1 text-right tabular-nums">{qty(d.kit_qty, d.uom)} {d.uom}</td>
                                <td className="px-2 py-1 text-right tabular-nums">{qty(d.bom_qty, d.uom)} {d.uom}</td>
                                <td className={`px-2 py-1 text-right tabular-nums font-bold ${d.change > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{d.change > 0 ? '+' : ''}{qty(d.change, d.uom)} {d.uom}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                    {perm.prepare && <div className="mt-2"><SecondaryButton onClick={() => askReason({ title: 'BOM change dealt with', confirm: 'Mark as dealt with', label: 'Note', optional: true, hint: 'Say what was done (extra line asked, nothing needed …). The notice stays on the kit as a record.', run: (t) => trimKitsApi.bomChangeSeen(id, t || undefined) })}>Mark as dealt with</SecondaryButton></div>}
                </div>
            ))}
            {S === 'READY' && <p className="mb-3 text-sm text-emerald-800">Ready for pickup{k.ready_by_name ? ` — put in by ${k.ready_by_name}` : ''}{k.ready_at ? ` on ${new Date(k.ready_at).toLocaleString('en-IN')}` : ''}. {perm.sign ? 'Count each line, then sign.' : 'Waiting for the line loader.'}</p>}
            {(S === 'CLOSED' || S === 'CANCELLED') && <p className="mb-3 text-sm text-slate-600"><b>{KIT_STATUS[S].label}</b>{k.closed_by_name ? ` by ${k.closed_by_name}` : ''}: {k.close_reason}</p>}

            <div className="flex flex-wrap gap-2 mb-3">
                {perm.sign && S === 'READY' && <PrimaryButton onClick={openCount}><PenLine size={14} /> Count &amp; sign</PrimaryButton>}
                {perm.sign && S === 'READY' && <SecondaryButton onClick={() => askReason({ title: `Send ${k.kit_no} back to the store`, confirm: 'Send back', hint: 'The whole kit goes back (for a wrong or damaged line, count and mark that line instead — the good lines are signed).', run: (r) => trimKitsApi.sendBack(id, r) })}><RotateCcw size={14} /> Send the whole kit back</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && open.length > 0 && <SecondaryButton onClick={async () => exportPickList(k, await loadLetterhead())}><FileDown size={14} /> Pick list</SecondaryButton>}
                {LB && <SecondaryButton onClick={() => setLabelsOpen(true)}><Tag size={14} /> Garment labels {LB.printed}/{LB.qty}</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && canPick && <PrimaryButton onClick={openPick}><PackageCheck size={14} /> {S === 'PARTLY_ISSUED' ? 'Put the rest in the kit…' : 'Put in the kit…'}</PrimaryButton>}
                {perm.prepare && S === 'READY' && <SecondaryButton onClick={() => run(() => trimKitsApi.unready(id))}><Undo2 size={14} /> Pull back</SecondaryButton>}
                {perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && <SecondaryButton onClick={() => askReason({ title: S === 'DRAFT' ? `Cancel ${k.kit_no}` : `Close ${k.kit_no}`, confirm: S === 'DRAFT' ? 'Cancel kit' : 'Close kit', hint: S === 'DRAFT' ? 'Nothing was handed over. Say why the batch\'s kit is not needed.' : 'What was handed stays issued; the rest will not be handed. Say why (it shows in the trim reconciliation).', run: (r) => trimKitsApi.close(id, r) })}><Ban size={14} /> {S === 'DRAFT' ? 'Cancel' : 'Close'}</SecondaryButton>}
            </div>
            <ErrorBox text={error} />

            <CutSummary k={k} rows={rows} />
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[1100px]">
                    <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right">
                        <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">For the order</th><th className="px-3 py-2">Over-cut</th><th className="px-3 py-2">Total in the kit</th><th className="px-3 py-2">Handed over</th><th className="px-3 py-2">Still owed</th><th className="px-3 py-2">In store</th><th className="px-3 py-2 text-left">Last pick / count</th><th className="px-3 py-2" /></tr>
                    </thead>
                    <tbody>
                        {rows.map(g => {
                            const req = pendingExtra.find(r => g.lines.some(l => l.id === r.replaces_line_id));
                            const head = g.lines.find(l => l.part === 'ORDER' && l.remaining > 0) || g.lines.find(l => l.remaining > 0 && l.part !== 'EXTRA');
                            const replaced = g.lines.find(l => l.replaced_by_line_id);
                            const notes = g.lines.filter(l => (l.pick && l.pick.short > 0 && l.remaining > 0) || (l.count && l.count.issue !== 'OK'));
                            const shortStore = g.remaining > 0 && g.stock_on_hand > 0 && g.stock_on_hand + 1e-9 < g.remaining;
                            const shortFree = g.over_remaining > 0 && g.stock_free + 1e-9 < g.over_remaining;
                            return (
                                <tr key={g.key} className={`border-t border-slate-100 text-right tabular-nums align-top ${replaced && g.remaining === 0 ? 'bg-slate-50 text-slate-500' : ''}`}>
                                    <td className="px-3 py-2 text-left">{g.line_no}</td>
                                    <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">{g.label}</span>
                                        {g.extra && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-violet-50 text-violet-800 border-violet-300">extra line · free stock{g.lines[0].replaces_line_id ? ` · replaces line ${k.lines.find(x => x.id === g.lines[0].replaces_line_id)?.line_no}` : ''}</span>}
                                        {replaced && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-300">closed — replaced by line {k.lines.find(x => x.id === replaced.replaced_by_line_id)?.line_no}</span>}
                                        <span className="block text-xs text-slate-500">{g.type_name}{g.lines.some(l => l.basis?.cells?.length) ? <> · <button type="button" className="text-indigo-700 hover:underline" onClick={() => setBasis(g)}>how it's worked out</button></> : null}</span></td>
                                    <td className="px-3 py-2">{g.order_qty > 0 ? handout(g, g.order_qty) : '—'}</td>
                                    <td className={`px-3 py-2 ${g.over_qty > 0 ? 'text-sky-800' : 'text-slate-300'}`}>{g.over_qty > 0 ? handout(g, g.over_qty) : '—'}
                                        {g.over_qty > 0 && <span className="block text-[11px] text-slate-500">{g.over_free_qty > 0 ? `free limit ${qty(g.over_free_qty, g.uom)}` : ''}{g.over_free_qty > 0 && g.over_limit_qty > 0 ? ' · ' : ''}{g.over_limit_qty > 0 ? `above it ${qty(g.over_limit_qty, g.uom)}` : ''}</span>}</td>
                                    <td className="px-3 py-2 font-bold">{handout(g, g.qty)}{g.closed > 0 && <span className="block text-[11px] font-normal text-slate-500">closed {qty(g.closed, g.uom)}</span>}</td>
                                    <td className="px-3 py-2">{g.issued ? `${qty(g.issued, g.uom)} ${g.uom}` : '—'}</td>
                                    <td className={`px-3 py-2 ${g.remaining > 0 ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>{g.remaining > 0 ? handout(g, g.remaining) : '—'}{g.picked > 0 && <span className="block text-[11px] font-bold text-emerald-700">in the kit now: {g.in_units ? `${g.picked_units} ${g.purchase_uom}` : `${qty(g.picked, g.uom)} ${g.uom}`}</span>}</td>
                                    <td className="px-3 py-2 text-xs">{qty(g.stock_on_hand, g.uom)} {g.uom}
                                        {g.stock_on_hand <= 0 && g.remaining > 0 && <span className="block font-black text-rose-700">not in store</span>}
                                        {shortStore && <span className="block font-bold text-amber-800">short for the kit</span>}
                                        {shortFree && <span className="block text-amber-800" title="over-cut is handed from free stock (not allocated to any order)">free stock {qty(Math.max(0, g.stock_free), g.uom)} — over-cut short</span>}
                                        {g.on_order && g.remaining > 0 && (g.stock_on_hand + 1e-9 < g.remaining) && <span className="block text-slate-600">on order {qty(g.on_order.qty, g.on_order.uom)} {g.on_order.uom} · {g.on_order.pos}{g.on_order.due ? ` · due ${new Date(g.on_order.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}</span>}
                                        {!g.on_order && g.remaining > 0 && g.stock_on_hand + 1e-9 < g.remaining && <span className="block text-rose-700">not on any open PO</span>}</td>
                                    <td className="px-3 py-2 text-left text-xs">
                                        {notes.map(l => (
                                            <span key={l.id} className="block">
                                                {g.lines.length > 1 && <span className="text-slate-400">{isOver(l) ? 'over-cut: ' : 'order: '}</span>}
                                                {l.pick && l.pick.short > 0 && l.remaining > 0 && <span className="text-amber-800"><b>{qty(l.pick.short, l.uom)} short</b> — {SHORT_REASON[l.pick.reason]}{l.pick.note ? ` (${l.pick.note})` : ''}{l.pick.adjusted ? ` · stock −${qty(l.pick.adjusted, l.uom)}` : ''} </span>}
                                                {l.count && l.count.issue !== 'OK' && <span className={['WRONG_ITEM', 'DAMAGED', 'SHORT'].includes(l.count.issue) ? 'text-rose-700' : 'text-slate-600'}>loader: <b>{COUNT_ISSUE[l.count.issue]}</b>{l.count.issue === 'SHORT' ? ` (${qty(l.count.counted, l.uom)} of ${qty(l.count.picked, l.uom)})` : l.count.issue === 'DAMAGED' ? ` (${qty(l.count.damaged, l.uom)})` : ''}{l.count.note ? ` — ${l.count.note}` : ''}</span>}
                                            </span>
                                        ))}
                                        {req && <span className="block text-violet-800">extra line asked: {req.label} {qty(req.qty, req.uom)} {req.uom}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{perm.prepare && ['DRAFT', 'PARTLY_ISSUED'].includes(S) && head && !req && (
                                        <button type="button" className="text-xs font-bold text-violet-700 hover:underline inline-flex items-center gap-1" onClick={() => { setFormError(''); setExtra({ line: head, search: '', items: null, item_id: '', qty: '', reason: head.pick?.reason ? SHORT_REASON[head.pick.reason] : '' }); searchItems(''); }}><Replace size={12} /> Extra line…</button>)}</td>
                                </tr>
                            );
                        })}
                        {LB && (
                            <tr className="border-t border-slate-100 text-right tabular-nums align-top bg-indigo-50/30">
                                <td className="px-3 py-2 text-left">L</td>
                                <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">Garment barcode labels</span>
                                    <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">printed by the store · no stock</span>
                                    <span className="block text-xs text-slate-500">One per garment · <button type="button" className="text-indigo-700 hover:underline" onClick={() => setLabelsOpen(true)}>{perm.prepare ? 'print / reprint…' : 'see the labels'}</button></span></td>
                                <td className="px-3 py-2">{LB.qty} pcs</td>
                                <td className="px-3 py-2 text-slate-300">—</td>
                                <td className="px-3 py-2 font-bold">{LB.qty} pcs</td>
                                <td className="px-3 py-2">{LB.issued ? `${LB.issued} pcs` : '—'}</td>
                                <td className={`px-3 py-2 ${LB.remaining > 0 ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>{LB.remaining > 0 ? `${LB.remaining} pcs` : '—'}{LB.picked > 0 && <span className="block text-[11px] font-bold text-emerald-700">in the kit now: {LB.picked}</span>}</td>
                                <td className="px-3 py-2 text-xs">{LB.printed} printed</td>
                                <td className="px-3 py-2 text-left text-xs">{LB.remaining > 0 && LB.available < LB.remaining ? <span className="text-amber-800">{LB.remaining - LB.available} not printed yet</span> : null}</td>
                                <td className="px-3 py-2" />
                            </tr>
                        )}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 text-right">
                            <td className="px-3 py-2 text-left" colSpan={2}>Total · {rows.length + (LB ? 1 : 0)} item(s){rows.some(g => g.over_qty > 0) ? ` · ${rows.filter(g => g.over_qty > 0).length} with over-cut` : ''}</td>
                            <td className="px-3 py-2" colSpan={3}>{rows.filter(g => g.issued > 0).length} handed (fully or in part)</td>
                            <td className="px-3 py-2" colSpan={2}><span className="text-amber-800">{openRows.length + (LB && LB.remaining > 0 ? 1 : 0)} still owed</span>{picked.length + (LB && LB.picked > 0 ? 1 : 0) ? ` · ${groupKitLines(picked).length + (LB && LB.picked > 0 ? 1 : 0)} in the kit now` : ''}</td>
                            <td className="px-3 py-2 text-rose-700" colSpan={3}>{rows.filter(g => g.stock_on_hand <= 0 && g.remaining > 0).length ? `${rows.filter(g => g.stock_on_hand <= 0 && g.remaining > 0).length} not in store` : ''}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {(k.extra_requests || []).length > 0 && (
                <div className="bg-white border border-violet-200 rounded-xl p-4 mb-4">
                    <p className="font-bold text-slate-800 mb-2">Extra lines (from free stock — the merchandiser approves)</p>
                    {k.extra_requests.map(r => (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 py-1.5 border-t border-slate-100 first:border-0 text-sm">
                            <b>{r.label}</b><span>{qty(r.qty, r.uom)} {r.uom}</span><span className="text-slate-500">for line {k.lines.find(x => x.id === r.replaces_line_id)?.line_no} — {r.reason}</span>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${r.status === 'PENDING' ? 'bg-amber-50 text-amber-800 border-amber-300' : r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-500 border-slate-300'}`}>{r.status.toLowerCase()}</span>
                            <span className="text-xs text-slate-500">{r.requested_by_name}{r.decided_by_name ? ` · ${r.decided_by_name}` : ''}{r.decision_note ? ` — ${r.decision_note}` : ''}</span>
                            {r.status === 'PENDING' && <span className="ml-auto flex gap-2">
                                {perm.approve_extra && <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => trimKitsApi.approveExtra(r.id))}>Approve</PrimaryButton>}
                                {perm.approve_extra && <SecondaryButton onClick={() => askReason({ title: 'Refuse the extra line', confirm: 'Refuse', hint: 'The kit stays as it is.', run: (t) => trimKitsApi.refuseExtra(r.id, t) })}>Refuse</SecondaryButton>}
                                {perm.prepare && <SecondaryButton onClick={() => run(() => trimKitsApi.withdrawExtra(r.id))}>Withdraw</SecondaryButton>}
                            </span>}
                        </div>
                    ))}
                </div>
            )}

            <div className="grid lg:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">Handovers and valuation bills</p>
                    {k.handovers.length === 0 ? <p className="text-sm text-slate-400">Nothing handed over yet.</p> : k.handovers.map(h => {
                        const bill = (k.bills || []).find(b => b.handover_id === h.id);
                        return (
                            <div key={h.id} className="py-2 border-t border-slate-100 first:border-0 text-sm">
                                {!h.issue_id ? <b className="text-slate-800">Garment labels</b> : me?.menu['issue.materialIssue'] ? <Link to={`/v3/material-issue/issues/${h.issue_id}`} className="font-bold text-indigo-700 hover:underline">{h.issue_no}</Link> : <b className="text-slate-800">{h.issue_no}</b>}
                                <span className="text-slate-600"> · {h.production_line_name} · {h.signed_by_name || '—'} · {new Date(h.signed_at).toLocaleString('en-IN')}{h.partial ? ' · part of the kit' : ''}</span>
                                {h.note && <span className="block text-xs text-slate-500">{h.note}</span>}
                                <ul className="ml-5 list-disc text-xs text-slate-600">{h.lines.map(x => <li key={x.kit_line_id}>{x.label}: {x.units ? `${x.units} ${k.lines.find(l => l.id === x.kit_line_id)?.purchase_uom} = ` : ''}{qty(x.qty, x.uom)} {x.uom}</li>)}
                                    {h.labels_qty > 0 && <li>Garment labels: {h.labels_qty} pcs{h.labels_counted != null && h.labels_counted !== h.labels_qty ? ` (counted ${h.labels_counted})` : ''}{h.labels_note ? ` — ${h.labels_note}` : ''}</li>}</ul>
                                {/* Without prices (the stores and the floor, 29 Oct 2026) the bill shows its number only — its values are for accounts. */}
                                {bill && (bill.total === undefined
                                    ? <p className="mt-1 text-xs"><b>Valuation bill {bill.bill_no}</b> <span className="text-slate-500">· values with accounts</span></p>
                                    : <p className="mt-1 text-xs"><b>Valuation bill {bill.bill_no}</b> · {money(bill.total)}{bill.unpriced ? <span className="text-amber-700"> · some items without a rate (valued at 0)</span> : ''} · <button type="button" className="font-bold text-indigo-700 hover:underline" onClick={async () => exportKitBill(k, bill, await loadLetterhead())}>PDF</button></p>)}
                            </div>
                        );
                    })}
                    <p className="text-xs text-slate-500 mt-2">Trims not used come back on a trim return slip — the line loader drafts it, the trim store receives it.</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">History</p>
                    <div className="divide-y divide-slate-100 text-sm max-h-[480px] overflow-y-auto">
                        {k.history.map(h => (
                            <div key={h.id} className="py-1.5">
                                <span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString('en-IN')}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                                {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {pick && (
                <Modal title={`Put in the kit — ${k.kit_no}`} onClose={() => setPick(null)}>
                    <div className="space-y-3 w-[min(900px,94vw)] max-h-[80vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">Enter what you <b>physically put in the kit</b>. Less than owed needs a reason — damaged and count short adjust the stock; the line waits in Pending to fulfil. The kit goes ready with what is in it.</p>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="px-2 py-1.5 text-left">Item</th><th className="px-2 py-1.5 text-right">Owed (order + over-cut)</th><th className="px-2 py-1.5 text-right">In stock</th><th className="px-2 py-1.5 text-right">Put in</th><th className="px-2 py-1.5 text-left">If less — why</th></tr></thead>
                                <tbody>{openRows.map(g => {
                                    const r = pick.rows.get(g.key);
                                    const sh = pickShort(g, r);
                                    const set = (patch) => setPick({ rows: new Map(pick.rows).set(g.key, { ...r, ...patch }) });
                                    const ov = g.lines.filter(isOver).reduce((a, l) => a + l.remaining, 0);
                                    return (
                                        <tr key={g.key} className={`border-t border-slate-100 align-top ${sh ? 'bg-amber-50/60' : ''}`}>
                                            <td className="px-2 py-1.5"><span className="font-semibold text-slate-800">{g.label}</span>{g.extra && <span className="block text-[11px] text-violet-700">extra line · free stock</span>}{ov > 0 && <span className="block text-[11px] text-sky-700">incl. over-cut {qty(ov, g.uom)} {g.uom} (free stock)</span>}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{g.in_units ? `${g.units_owed} ${g.purchase_uom}` : `${qty(g.remaining, g.uom)} ${g.uom}`}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-600">{qty(g.stock_on_hand, g.uom)} {g.uom}{g.stock_on_hand <= 0 && <span className="block text-[11px] font-bold text-rose-700">not in store</span>}</td>
                                            <td className="px-2 py-1.5 text-right"><input className="w-24 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" step={g.in_units || g.uom === 'pcs' ? 1 : 'any'} value={r.v} onChange={e => set({ v: e.target.value })} aria-label={`Put in ${g.label}`} /><span className="ml-1 text-xs text-slate-500">{g.in_units ? g.purchase_uom : g.uom}</span></td>
                                            <td className="px-2 py-1.5">{sh && (
                                                <div className="space-y-1 min-w-[220px]">
                                                    <select className={inputCls} value={r.reason} onChange={e => set({ reason: e.target.value })} aria-label={`Why short ${g.label}`}><option value="">— why —</option>{Object.entries(SHORT_REASON).map(([kk, lab]) => <option key={kk} value={kk}>{lab}</option>)}</select>
                                                    <input className={inputCls} placeholder={r.reason === 'OTHER' ? 'What happened *' : 'Note'} value={r.note} onChange={e => set({ note: e.target.value })} />
                                                </div>)}</td>
                                        </tr>
                                    );
                                })}
                                {LB && LB.remaining > 0 && (
                                    <tr className="border-t border-slate-100 align-top bg-indigo-50/40">
                                        <td className="px-2 py-1.5"><span className="font-semibold text-slate-800">Garment barcode labels</span><span className="block text-[11px] text-indigo-700">what is printed goes in — print the rest on the kit</span></td>
                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{LB.remaining} pcs</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-slate-600">{LB.printed} printed</td>
                                        <td className="px-2 py-1.5 text-right font-bold tabular-nums">{LB.available} <span className="text-xs font-normal text-slate-500">pcs</span></td>
                                        <td className="px-2 py-1.5 text-xs">{LB.available < LB.remaining ? <span className="text-amber-800">{LB.remaining - LB.available} not printed yet — they follow</span> : ''}</td>
                                    </tr>
                                )}
                                <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-2 py-1.5" colSpan={3}>{openRows.length + (LB && LB.remaining > 0 ? 1 : 0)} item(s)</td>
                                    <td className="px-2 py-1.5 text-right">{openRows.filter(g => Number(pick.rows.get(g.key).v || 0) > 0).length} going in</td>
                                    <td className="px-2 py-1.5 text-amber-800">{openRows.filter(g => pickShort(g, pick.rows.get(g.key))).length} short → pending to fulfil</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setPick(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !pickReady} onClick={() => run(() => trimKitsApi.ready(id, pickPayload()), () => setPick(null))}>
                                <PackageCheck size={14} /> {pickAny ? 'Mark ready with what is in the kit' : 'Save — nothing could go in'}</PrimaryButton></div>
                    </div>
                </Modal>
            )}

            {count && (
                <Modal title={`Count and sign — ${k.kit_no}`} onClose={() => setCount(null)}>
                    <div className="space-y-3 w-[min(900px,94vw)] max-h-[80vh] overflow-y-auto">
                        <Field label="Line it goes to *">
                            <select className={inputCls} value={count.line_id} onChange={e => setCount({ ...count, line_id: e.target.value })}>
                                <option value="">— pick —</option>
                                {count.lines.map(l => <option key={l.id} value={l.id}>{l.name}{l.stage ? ` (${l.stage})` : ''}</option>)}
                            </select>
                        </Field>
                        <p className="text-xs text-slate-500">Count each item (order and over-cut together). Less than picked = short, more = excess (only what was picked is signed — give the extra back). Wrong item or damaged: mark it — that line (or the damaged part) goes back to the store; the good lines are signed.</p>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="px-2 py-1.5 text-left">Item</th><th className="px-2 py-1.5 text-right">Picked</th><th className="px-2 py-1.5 text-right">Counted</th><th className="px-2 py-1.5 text-left">Problem</th><th className="px-2 py-1.5 text-left">Result</th></tr></thead>
                                <tbody>{countRows.map(g => {
                                    const r = count.rows.get(g.key);
                                    const set = (patch) => setCount({ ...count, rows: new Map(count.rows).set(g.key, { ...r, ...patch }) });
                                    const o = outcome(g, r);
                                    const l = g;   // amounts for the whole item
                                    return (
                                        <tr key={g.key} className={`border-t border-slate-100 align-top ${o.kind !== 'OK' ? 'bg-amber-50/60' : ''}`}>
                                            <td className="px-2 py-1.5 font-semibold text-slate-800">{g.label}{g.lines.some(isOver) && <span className="block text-[11px] font-normal text-sky-700">order + over-cut</span>}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{amount(l, pickedOfG(g))}</td>
                                            <td className="px-2 py-1.5 text-right"><input className="w-24 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" step={l.in_units || l.uom === 'pcs' ? 1 : 'any'} value={r.v} onChange={e => set({ v: e.target.value })} aria-label={`Counted ${g.label}`} /></td>
                                            <td className="px-2 py-1.5">{!count.legacy && (
                                                <div className="space-y-1 min-w-[200px]">
                                                    <select className={inputCls} value={r.issue} onChange={e => set({ issue: e.target.value })} aria-label={`Problem ${l.label}`}><option value="">—</option><option value="WRONG_ITEM">Wrong item</option><option value="DAMAGED">Damaged</option></select>
                                                    {r.issue === 'DAMAGED' && <input className={inputCls} type="number" min="1" step={l.in_units || l.uom === 'pcs' ? 1 : 'any'} placeholder={`How many damaged (${l.in_units ? l.purchase_uom : l.uom}) *`} value={r.damaged} onChange={e => set({ damaged: e.target.value })} />}
                                                    {r.issue && <input className={inputCls} placeholder={r.issue === 'WRONG_ITEM' ? 'What was in the kit instead *' : 'Note'} value={r.note} onChange={e => set({ note: e.target.value })} />}
                                                </div>)}</td>
                                            <td className="px-2 py-1.5 text-xs">{count.legacy ? `sign ${amount(l, Number(r.v || 0))}` : <><b className={o.kind === 'OK' ? 'text-emerald-700' : 'text-amber-800'}>{COUNT_ISSUE[o.kind]}</b> — sign {amount(l, o.signed)}{o.kind === 'WRONG_ITEM' ? ' (line back to the store)' : o.kind === 'DAMAGED' ? ' (damaged back)' : o.kind === 'SHORT' ? ' (rest back to the store)' : o.kind === 'EXCESS' ? ' (give the extra back)' : ''}</>}</td>
                                        </tr>
                                    );
                                })}
                                {count.labels && (
                                    <tr className="border-t border-slate-100 align-top bg-indigo-50/40">
                                        <td className="px-2 py-1.5 font-semibold text-slate-800">Garment barcode labels</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{LB.picked} pcs</td>
                                        <td className="px-2 py-1.5 text-right"><input className="w-24 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" step="1" value={count.labels.v} onChange={e => setCount({ ...count, labels: { ...count.labels, v: e.target.value } })} aria-label="Counted garment labels" /></td>
                                        <td className="px-2 py-1.5"><input className={inputCls} placeholder="Note (e.g. torn)" value={count.labels.note} onChange={e => setCount({ ...count, labels: { ...count.labels, note: e.target.value } })} /></td>
                                        <td className="px-2 py-1.5 text-xs">{Number(count.labels.v || 0) < LB.picked ? <><b className="text-amber-800">Short</b> — sign {Number(count.labels.v || 0)} (rest back to the store)</> : <><b className="text-emerald-700">As picked</b> — sign {LB.picked}</>}</td>
                                    </tr>
                                )}
                                <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-2 py-1.5" colSpan={4}>{countRows.length + (count.labels ? 1 : 0)} item(s)</td>
                                    <td className="px-2 py-1.5">{count.legacy ? '' : `${countRows.filter(g => outcome(g, count.rows.get(g.key)).signed > 0).length} signed · ${countRows.filter(g => outcome(g, count.rows.get(g.key)).kind !== 'OK').length} with a problem`}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <Field label="Note"><input className={inputCls} value={count.note} onChange={e => setCount({ ...count, note: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCount(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !countReady}
                                onClick={() => run(() => trimKitsApi.sign(id, {
                                    production_line_id: count.line_id, note: count.note || null,
                                    lines: countPayload(),
                                    ...(count.labels ? { labels: { counted: Number(count.labels.v || 0), note: count.labels.note || undefined } } : {}),
                                }), () => setCount(null))}><PenLine size={14} /> Sign — I received the good lines</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {extra && (
                <Modal title={`Extra line for ${extra.line.label}`} onClose={() => setExtra(null)}>
                    <div className="space-y-3 w-[min(620px,92vw)] max-h-[80vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">{handout(extra.line, extra.line.remaining)} still owed. Propose another item from <b>free stock</b>; the merchandiser approves — then this line is closed as replaced and the extra line is picked like any other.</p>
                        <div className="flex gap-2"><input className={inputCls} placeholder="Search trim items…" value={extra.search} onChange={e => setExtra({ ...extra, search: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') searchItems(extra.search); }} /><SecondaryButton onClick={() => searchItems(extra.search)}>Search</SecondaryButton></div>
                        {!extra.items ? <Loading /> : (
                            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">{extra.items.slice(0, 60).map(i => (
                                <label key={i.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${String(i.id) === extra.item_id ? 'bg-violet-50' : ''}`}>
                                    <input type="radio" checked={String(i.id) === extra.item_id} onChange={() => setExtra({ ...extra, item_id: String(i.id) })} />
                                    <span className="flex-1"><b>{i.brand} · {i.code}</b>{i.description ? <span className="text-slate-500"> — {i.description}</span> : null}</span><span className="text-xs text-slate-500">{qty(i.on_hand, i.usage_uom)} {i.usage_uom} in stock</span>
                                </label>
                            ))}{extra.items.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">No items.</p>}</div>
                        )}
                        <div className="grid sm:grid-cols-2 gap-2">
                            <Field label={`Quantity${extra.item_id && extra.items ? ` (${extra.items.find(i => String(i.id) === extra.item_id)?.usage_uom || ''})` : ''} *`}><input className={inputCls} type="number" min="0" step="any" value={extra.qty} onChange={e => setExtra({ ...extra, qty: e.target.value })} /></Field>
                            <Field label="Why *"><input className={inputCls} value={extra.reason} onChange={e => setExtra({ ...extra, reason: e.target.value })} placeholder="e.g. B18 out of stock — snaps agreed" /></Field>
                        </div>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setExtra(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !extra.item_id || !(Number(extra.qty) > 0) || !extra.reason.trim()} onClick={() => run(() => trimKitsApi.requestExtra(id, { replaces_line_id: extra.line.id, trim_item_id: extra.item_id, qty: Number(extra.qty), reason: extra.reason.trim() }), () => setExtra(null))}>Ask the merchandiser</PrimaryButton></div>
                    </div>
                </Modal>
            )}

            {labelsOpen && (
                <Modal title={`Garment labels — ${k.kit_no}`} onClose={() => { setLabelsOpen(false); load(); }}>
                    <KitLabelsPanel kitId={id} onClose={() => { setLabelsOpen(false); load(); }} onChanged={load} />
                </Modal>
            )}

            {basis && (
                <Modal title={`${basis.label} — how much`} onClose={() => setBasis(null)}>
                    <div className="space-y-2 w-[min(620px,92vw)]">
                        <table className="w-full text-sm"><thead className="text-xs text-slate-500 text-right"><tr><th className="text-left py-1">For</th><th className="text-left py-1">Colour</th><th className="text-left py-1">Size</th><th className="py-1">Garments</th><th className="py-1">× per garment</th><th className="py-1">= {basis.uom}</th></tr></thead>
                            <tbody>{basis.lines.flatMap(l => (l.basis?.cells || []).map((c, i) => (
                                <tr key={`${l.id}-${i}`} className="border-t border-slate-100 text-right tabular-nums"><td className="text-left py-1 text-xs">{PART_LABEL[l.part] || l.part}</td><td className="text-left py-1">{c.colour}</td><td className="text-left py-1">{c.size}</td><td>{c.garments}</td><td>{c.rate}</td><td className="font-semibold">{qty(c.qty, basis.uom)}</td></tr>)))}
                                <tr className="border-t-2 border-slate-200 text-right font-bold"><td className="text-left py-1" colSpan={5}>Needed (Order BOM rate — wastage on the order's garments, none on over-cut)</td><td>{qty(basis.lines.reduce((a, l) => a + Number(l.basis?.need || 0), 0), basis.uom)}</td></tr></tbody></table>
                        <p className="text-xs text-slate-500">In the kit: {basis.lines.map(l => `${PART_LABEL[l.part] || l.part} ${handout(l)}`).join(' + ')}{basis.lines.length > 1 ? ` = ${handout(basis, basis.qty)}` : ''}{(basis.in_units || basis.uom === 'pcs') ? ` — rounded up once for the batch to whole ${basis.in_units ? `${basis.purchase_uom}s` : 'pieces'}${basis.lines.length > 1 ? '; the order’s share is its own need rounded up, over-cut gets the rest' : ''}` : ''}.</p>
                        <div className="flex justify-end"><SecondaryButton onClick={() => setBasis(null)}>Close</SecondaryButton></div>
                    </div>
                </Modal>
            )}

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        <Field label={ask.label ? `${ask.label}${ask.optional ? '' : ' *'}` : 'Reason *'}><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => ask.run(askText.trim()), () => setAsk(null))} busy={busy} disabled={busy || (!ask.optional && !askText.trim())}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

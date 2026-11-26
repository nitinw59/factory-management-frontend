// One trim order and its kits — /v3/trim-orders/:id (26 Nov 2026, "Trim orders and kits", migration 90; was the trim kit
// page). A cut batch's trim order (TO3/…) is made when the batch is finalised: Order BOM rate × garments cut per colour ×
// size (threads in whole cones) — the store can't change it. The trim store prepares it in kits (TK3/…/####-n): any number,
// half kits, stage by stage, several ready at once (owner, 26 Nov 2026). Each kit is a bag — the store writes the kit number
// on it with a marker (no bag label yet), its pick list prints the number large. Any line loader counts and signs a kit (one
// TI slip + one TB valuation bill) or sends it back. The store chooses which kit carries the garment barcode labels.
// Kept from the kit page:
//   20 / 27 Oct 2026: over-cut garments on their own lines (free stock), one row per item — Order · Over-cut · Total.
//   21 Oct 2026: less than can go in needs a reason (not in stock / damaged / count short / other; damaged and count short
//   adjust the stock); what can't go in waits in Pending to fulfil; an extra line (another item, free stock) for a line the
//   store can't hand — the merchandiser approves. Count: as picked, short, excess, wrong item or damaged; the good lines are
//   signed, the bad ones stay owed on the trim order.
//   25 Oct 2026: the order's BOM changed after the store started → a notice to deal with (kitRefresh.js).
//   26 Nov 2026: never a 0 line; skip by tick box, by item or a whole issue stage; more than can go in → back to the most.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, PackagePlus, Undo2, Ban, PenLine, RotateCcw, FileDown, Replace, Tag, Pencil, Save, HandHelping, ListPlus } from 'lucide-react';
import Modal from '../../shared/Modal';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError, mastersApi } from '../api/mastersApi';
import { useV3Live } from '../live';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { loadLetterhead } from '../components/letterhead';
import { ORDER_STATUS, KIT_STATE, ACTION, SHORT_REASON, COUNT_ISSUE, qty, handout, groupKitLines, spread, isOver, byStage, stageKey, stageName, pickCaps, WAIT_CAUSE } from './trimKitShared';
import { exportPickList, exportKitBill } from './kitPrint';
import KitLabelsPanel from './KitLabelsPanel';
import KitReturns from './KitReturns';
import ItemFilter, { itemMatcher } from './ItemFilter';

const money = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const OPEN = ['OPEN', 'PARTLY_ISSUED'];
const KIT_OPEN = ['PREPARING', 'READY'];

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
    const status = !oc || oc.status === 'WITHIN' ? null : oc.status === 'PENDING' ? 'waiting for the merchandiser — the kits do not wait'
        : oc.status === 'APPROVED' ? `approved${oc.decided_by_name ? ` by ${oc.decided_by_name}` : ''}` : `refused${oc.decided_by_name ? ` by ${oc.decided_by_name}` : ''} — those garments are written off${oc.decision_note ? ` (${oc.decision_note})` : ''}`;
    const TH = 'px-2 py-1 text-[10px] font-bold uppercase tracking-wider';
    return (
        <div className="bg-white border border-slate-200 border-l-4 border-l-sky-500 rounded-xl overflow-hidden mb-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 bg-sky-50 border-b border-sky-100">
                <span className="text-xs font-black uppercase tracking-wider text-sky-900">What this trim order is for</span>
                <span className="text-xs text-slate-600"><b>{t.cut}</b> garments cut = <b>{t.within}</b> for the order{t.free + t.approval > 0 ? <> + <b className="text-sky-800">{t.free + t.approval}</b> over-cut ({t.free} within the {oc?.free_pct ?? 0}% free limit, {t.approval} above it)</> : ''} — all on the trim order</span>
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

export default function TrimOrderPage() {
    const { id } = useParams();
    return <OrderView key={id} id={id} />;
}

function OrderView({ id }) {
    const [params, setParams] = useSearchParams();
    const focusKit = params.get('kit');
    const navigate = useNavigate();
    const [k, setK] = useState(null);
    const [perm, setPerm] = useState({ prepare: false, sign: false });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [basis, setBasis] = useState(null);       // item row whose calculation is open
    const [edit, setEdit] = useState(null);         // kit editor: { kit, base, groups, waiting, rows: Map(key → { v, reason, note, on, capped }), line_id, lines, labelsOn, labels, notes }
    const [extra, setExtra] = useState(null);       // { line, search, items, item_id, qty, reason }
    const [ask, setAsk] = useState(null);           // { title, confirm, hint, label, optional, run(reason) }
    const [askText, setAskText] = useState('');
    const [formError, setFormError] = useState('');
    const [labelsOpen, setLabelsOpen] = useState(false);
    const [showCut, setShowCut] = useState(false);
    const [showCancelled, setShowCancelled] = useState(false);
    const [prodLines, setProdLines] = useState(null);
    const [handOver, setHandOver] = useState(null);   // a sample's kit to sampling (26 Nov 2026): { kit, name, note }
    const [change, setChange] = useState(null);       // a sample's lines: { rows: Map(line id → qty), add: [{ item, qty }], search, items, reason }
    // Tables collapsed by default, each to its summary line (26 Nov 2026, owner: "by default collapse tables with summary";
    // asked about the kit being prepared: "no fold that too") — every kit, the linked one (?kit=) and a new one included;
    // the linked kit is still highlighted and scrolled to.
    const [shown, setShown] = useState(() => new Set());
    const [fq, setFq] = useState('');           // item search (26 Nov 2026)
    const [ftype, setFtype] = useState('');     // trim type filter
    const filtering = Boolean(fq.trim() || ftype);
    // a search or a trim type opens the tables, so what matches is in front
    const isShown = (key) => shown.has(key) || (filtering && ['lines', 'missing'].includes(key));
    const toggle = (key) => setShown(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    const kitRefs = useRef({});
    const load = useCallback(() => trimKitsApi.get(id).then(res => setK(res.data)).catch(err => setError(apiError(err, 'Failed to load the trim order.'))), [id]);
    useEffect(() => { load(); trimKitsApi.permissions().then(res => setPerm(res.data)).catch(() => {}); }, [load]);
    useV3Live(() => { if (!edit && !extra && !labelsOpen && !handOver && !change) load(); });
    const loaded = Boolean(k);
    useEffect(() => { if (loaded && focusKit && kitRefs.current[focusKit]) kitRefs.current[focusKit].scrollIntoView({ block: 'center' }); }, [loaded, focusKit]);
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try {
            const d = (await fn()).data; setK(d); if (close) close();
            if (d && d.kit_id) setParams({ kit: d.kit_id }, { replace: true });
        } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const needLines = () => (prodLines ? Promise.resolve(prodLines) : trimKitsApi.lines().then(r => { setProdLines(r.data); return r.data; }));
    if (!k) return error ? <ErrorBox text={error} /> : <Loading />;

    const S = k.status; const isOpen = OPEN.includes(S);
    // Samples (26 Nov 2026, migration 91): a sample's trim order — from free stock, no batch; the store hands each kit to
    // sampling (typing who took it) and may change the lines with a reason, while the sample request is open.
    const isSample = k.kind === 'SAMPLE';
    const waitCause = (c) => (isSample && c === 'free' ? 'no free stock' : WAIT_CAUSE[c]);
    const lineOf = new Map(k.lines.map(l => [l.id, l]));
    const LB = k.labels;   // garment labels line: qty, issued, picked (in open kits), remaining, printed, available, available_for_kit — no stock
    const kits = [...(k.kits || [])].sort((a, b) => a.kit_seq - b.kit_seq);
    const liveKits = kits.filter(t => t.status !== 'CANCELLED');
    const cancelledKits = kits.filter(t => t.status === 'CANCELLED');
    const openKits = kits.filter(t => KIT_OPEN.includes(t.status));
    const nKits = (st) => kits.filter(t => t.status === st).length;
    const kitNoOf = (kid) => kits.find(t => t.id === kid)?.kit_no;
    const pendingExtra = (k.extra_requests || []).filter(r => r.status === 'PENDING');
    // One row per item; all in the pick list's order — issue stage (route order), trim type, line no. (26 Nov 2026).
    const rows = byStage(groupKitLines(k.lines));
    const match = itemMatcher(fq, ftype);
    const itemTypes = [...new Set(rows.map(g => g.type_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const toKitRows = byStage(groupKitLines(k.lines.filter(l => l.to_kit > 0 && !l.held)));   // owed and in no open kit
    const BC = k.bom_change;   // the order's BOM changed after the store started (25 Oct 2026)
    const remadeAt = k.history.find(h => h.action === 'REMADE')?.created_at;
    // Reserved for the order (phase 0): the notice and the column.
    const orderOwed = (g) => Math.max(0, g.remaining - g.over_remaining);
    const reservedOf = (g) => Number(g.order_allocated || 0);
    const resGap = (g, orderQty) => { const gap = r3(orderQty - reservedOf(g)); return gap > 1e-9 && !(g.in_units && gap < g.factor - 1e-9) ? gap : 0; };
    const notReserved = (g) => !g.extra && g.remaining > 0 && resGap(g, orderOwed(g)) > 0;
    const unreserved = k.kind === 'SAMPLE' ? [] : rows.filter(notReserved);   // a sample comes from free stock — no reservation
    const bomLink = `/v3/planning/orders/${k.order_id}?tab=TRIM`;
    // what can go in a kit now (the server's can_now — net of every open kit) and what waits, with its cause
    const canNow = toKitRows.filter(g => pickCaps(g).total > 0);
    const waitKeys = new Set(toKitRows.filter(g => !(pickCaps(g).total > 0) && !(g.issued > 0) && !(g.in_kits > 0)).map(g => g.key));
    const missing = toKitRows.map(g => ({ g, cp: pickCaps(g) }))
        .map(x => ({ ...x, waitQty: x.g.in_units ? x.g.units_to_kit - x.cp.total : r3(x.g.to_kit - x.cp.total) })).filter(x => x.waitQty > 1e-9);
    const causeText = (list) => [['stock', 'not in store'], ['res', 'not reserved'], ['free', k.kind === 'SAMPLE' ? 'no free stock' : 'no free stock for the over-cut']]
        .map(([c, t]) => { const n = list.filter(x => (x.cp.cause || 'stock') === c).length; return n ? `${n} ${t}` : ''; }).filter(Boolean).join(' · ');
    const missingText = causeText(missing);
    // The reservation notice by what the store has to do (26 Nov 2026, owner: "this banner is confusing" — 20 items "go in the
    // next kit" while 13 were in a kit already and 7 not in the store): in an open kit (it can't be marked ready or signed
    // until reserved) · not in the store either · only waiting for the reservation.
    const kitsHolding = (g) => kits.filter(t => KIT_OPEN.includes(t.status) && t.lines.some(kl => g.lines.some(l => l.id === kl.order_line_id)));
    const resInKit = unreserved.filter(g => kitsHolding(g).length > 0);
    const resNoStock = unreserved.filter(g => !resInKit.includes(g) && g.stock_on_hand <= 0);
    const resWaiting = unreserved.filter(g => !resInKit.includes(g) && !resNoStock.includes(g));
    const unresOfKit = (t) => unreserved.filter(g => t.lines.some(kl => g.lines.some(l => l.id === kl.order_line_id)));
    const canKit = perm.prepare && isOpen && (canNow.length > 0 || Boolean(LB && LB.available_for_kit > 0));
    const searchChangeItems = async (q) => {
        try { const x = await mastersApi.trimItems({ search: q || undefined, active: 'true' }); setChange(c => c && { ...c, items: x.data }); } catch (err) { setFormError(apiError(err, 'Failed.')); }
    };
    const openChange = () => { setFormError(''); setChange({ rows: new Map(), add: [], search: '', items: null, reason: '' }); searchChangeItems(''); };
    const changePayload = () => change && [
        ...[...change.rows.entries()].filter(([lid, v]) => v !== '' && Number(v) !== lineOf.get(lid)?.qty).map(([lid, v]) => ({ id: lid, qty: Number(v), reason: change.reason.trim() })),
        ...change.add.filter(a => Number(a.qty) > 0).map(a => ({ trim_item_id: a.item.id, qty: Number(a.qty), reason: change.reason.trim() })),
    ];
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const searchItems = async (q) => {
        try { const r = await mastersApi.trimItems({ search: q || undefined, active: 'true' }); setExtra(x => x && { ...x, items: r.data.filter(i => String(i.id) !== x.line.item_id) }); } catch (err) { setFormError(apiError(err, 'Failed.')); }
    };
    const extraFor = (g) => g.lines.find(l => l.part === 'ORDER' && l.remaining > 0 && !(l.in_kits > 0)) || g.lines.find(l => l.remaining > 0 && l.part !== 'EXTRA' && !(l.in_kits > 0));
    const openExtra = (head) => { setFormError(''); setExtra({ line: head, search: '', items: null, item_id: '', qty: '', reason: head.pick?.reason ? SHORT_REASON[head.pick.reason] : '' }); searchItems(''); };

    // ── kit editor (store): new kit, or change one being prepared. Rows = what can go in now (the order read with this
    // kit not there, so its own quantities count as free to put back); each row starts at what is in the kit (or, new, at
    // what can go in). Untick an item or a whole stage to leave it for another kit — no reason; less than can go in → a reason.
    const openEditor = async (kit = null) => {
        setFormError(''); setError('');
        try {
            const [base, pls] = await Promise.all([kit ? trimKitsApi.get(id, { except_kit: kit.id }).then(r => r.data) : Promise.resolve(k), needLines()]);
            const inKit = new Map((kit?.lines || []).map(kl => [kl.order_line_id, kl]));
            const all = byStage(groupKitLines(base.lines.filter(l => (l.to_kit > 0 && !l.held) || inKit.has(l.id))));
            const groups = all.filter(g => pickCaps(g).total > 0 || g.lines.some(l => inKit.has(l.id)));
            const was = (g) => { const ls = g.lines.filter(l => inKit.has(l.id)); if (!ls.length) return null; return g.in_units ? ls.reduce((a, l) => a + (inKit.get(l.id).units || 0), 0) : r3(ls.reduce((a, l) => a + inKit.get(l.id).qty, 0)); };
            const goes = kit ? (kit.production_line_id || '') : (base.batch_lines?.length === 1 ? base.batch_lines[0].id : '');
            setEdit({ kit, base, groups, waiting: all.filter(g => !groups.includes(g)), line_id: goes, lines: pls, notes: kit?.notes || '',
                rows: new Map(groups.map(g => { const w = was(g); return [g.key, { v: String(w ?? pickCaps(g).total), reason: '', note: '', on: kit ? w != null : true }]; })),
                labelsOn: Boolean(kit?.labels_qty), labels: String(kit?.labels_qty || base.labels?.available_for_kit || 0) });
        } catch (err) { setError(apiError(err, 'Failed to open the kit.')); }
    };
    const E = edit;
    const eRow = (g) => E.rows.get(g.key);
    const setRow = (g, patch) => setEdit(e => ({ ...e, rows: new Map(e.rows).set(g.key, { ...e.rows.get(g.key), ...patch }) }));
    const setStage = (key, on) => setEdit(e => { const m = new Map(e.rows); for (const g of e.groups) if (stageKey(g) === key) m.set(g.key, { ...m.get(g.key), on }); return { ...e, rows: m }; });
    const eStages = E ? (() => { const m = new Map(); for (const g of E.groups) { const key = stageKey(g); if (!m.has(key)) m.set(key, { key, name: stageName(g), rows: [] }); m.get(key).rows.push(g); } return [...m.values()]; })() : [];
    const isOn = (g) => Boolean(E?.rows.get(g.key)?.on);
    // search + trim type in the kit editor (26 Nov 2026, owner: "add search and trim type filter in … Change TK3/…"): only
    // narrows what is listed — hidden items keep their tick and amount; a stage's tick box acts on the items listed
    const [ef, setEf] = [E ? { q: E.fq || '', type: E.ftype || '' } : { q: '', type: '' }, (patch) => setEdit(e => ({ ...e, ...patch }))];
    const eFiltering = Boolean(ef.q.trim() || ef.type);
    const eMatch = itemMatcher(ef.q, ef.type);
    const setRowsOn = (list, on) => setEdit(e => { const m = new Map(e.rows); for (const g of list) m.set(g.key, { ...m.get(g.key), on }); return { ...e, rows: m }; });
    const eShort = (g, r) => r.on && Number(r.v || 0) > 0 && Number(r.v || 0) + 1e-9 < pickCaps(g).total;
    const eOver = (g, r) => r.on && Number(r.v || 0) > pickCaps(g).total + 1e-9;
    const eZero = E ? E.groups.filter(g => { const r = eRow(g); return r.on && !(Number(r.v || 0) > 0); }) : [];
    const eBlocked = E ? E.groups.filter(g => eOver(g, eRow(g))) : [];
    const eGoing = E ? E.groups.filter(g => { const r = eRow(g); return r.on && Number(r.v || 0) > 0; }).length : 0;
    const eSkipped = E ? E.groups.filter(g => !eRow(g).on).length : 0;
    const eLabAvail = E ? (E.base.labels?.available_for_kit || 0) : 0;
    const eLabels = E && E.labelsOn ? Number(E.labels || 0) : 0;
    const eLabBad = Boolean(E && E.labelsOn && (!Number.isInteger(eLabels) || eLabels <= 0 || eLabels > eLabAvail));
    const eReady = Boolean(E) && !eBlocked.length && !eZero.length && !eLabBad && (eGoing > 0 || eLabels > 0)
        && E.groups.every(g => { const r = eRow(g); return !eShort(g, r) || (r.reason && (r.reason !== 'OTHER' || r.note.trim())); });
    const eGoingStages = E ? eStages.filter(st => st.rows.some(isOn)).map(st => st.name) : [];
    // one number per item, spread over its lines by what each can take (order first); a line with nothing is left out
    const ePayload = (ready) => ({
        lines: E.groups.filter(isOn).flatMap(g => {
            const r = eRow(g); const caps = pickCaps(g).caps.map(c => (g.in_units ? c.units || 0 : c.qty));
            return spread(r.v, caps).map((v, i) => ({ l: g.lines[i], v, cap: caps[i] })).filter(x => x.v > 0)
                .map(x => ({ order_line_id: x.l.id, [x.l.in_units ? 'units' : 'qty']: x.v, ...(x.v + 1e-9 < x.cap ? { reason: r.reason, note: r.note || undefined } : {}) }));
        }),
        labels_qty: eLabels, production_line_id: E.line_id || null, notes: E.notes.trim() || null, ready,
    });
    const saveKit = (ready) => run(() => (E.kit ? trimKitsApi.updateKit(E.kit.id, ePayload(ready)) : trimKitsApi.createKit(id, ePayload(ready))), () => setEdit(null));

    // a kit's items in the pick list's order (counting and signing: the loader's kit page, /v3/trim-kits/:kitId — 26 Nov 2026)
    const kitGroups = (kit) => byStage(groupKitLines(kit.lines.map(kl => ({ ...lineOf.get(kl.order_line_id), picked: kl.qty, picked_units: kl.units }))));
    const closeOrder = () => {
        if (openKits.length) { setError(`${openKits.map(t => t.kit_no).join(', ')} ${openKits.length === 1 ? 'is' : 'are'} still being prepared or ready — have ${openKits.length === 1 ? 'it' : 'them'} signed, or cancel ${openKits.length === 1 ? 'it' : 'them'}, first.`); return; }
        const none = k.handovers.length === 0;
        askReason({ title: none ? `Cancel ${k.trim_order_no}` : `Close ${k.trim_order_no}`, confirm: none ? 'Cancel trim order' : 'Close trim order',
            hint: none ? 'Nothing was handed over. Say why the batch\'s trims are not needed.' : 'What was handed stays issued; the rest will not be handed. Say why (it shows in the trim reconciliation).',
            run: (r) => trimKitsApi.close(id, r) });
    };

    const KitCard = (t) => {
        const allGroups = kitGroups(t); const groups = filtering ? allGroups.filter(match) : allGroups;
        const st = KIT_STATE[t.status] || KIT_STATE.PREPARING; const focused = focusKit === t.id;
        const h = k.handovers.find(x => x.id === t.handover_id);
        const open = isShown(`kit-${t.id}`) || (filtering && groups.length > 0);
        return (
            <div key={t.id} ref={el => { kitRefs.current[t.id] = el; }} className={`bg-white rounded-xl overflow-hidden ${t.status === 'PREPARING' ? `border-2 border-slate-800${focused ? ' ring-2 ring-indigo-300' : ''}` /* being prepared: dark border (owner, 26 Nov 2026) */
                : `border ${focused ? 'border-indigo-400 ring-2 ring-indigo-200' : t.status === 'READY' ? 'border-emerald-300' : 'border-slate-200'}`}`}>
                <div role="button" tabIndex={0} aria-expanded={open} title={open ? 'Hide the items' : 'Show the items'} onClick={() => toggle(`kit-${t.id}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(`kit-${t.id}`); } }}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100/70 ${t.status === 'READY' ? 'bg-emerald-50/60' : 'bg-slate-50'}`}>
                    <span className="text-slate-500 text-sm w-3">{open ? '▾' : '▸'}</span>
                    <span className="text-xl font-black tracking-tight text-slate-900">{t.kit_no}</span>
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                    <span className="text-sm text-slate-700">{t.stages?.length ? t.stages.join(', ') : 'no stage'} → <b>{isSample ? 'sampling' : t.goes_to || 'any line'}</b></span>
                    <span className="text-xs text-slate-500">{filtering ? <><b className={groups.length ? 'text-indigo-700' : ''}>{groups.length} of {allGroups.length}</b> items match</> : `${groups.length} item${groups.length === 1 ? '' : 's'}`}{t.labels_qty ? ` + ${t.labels_qty} garment labels` : ''}</span>
                    <span className="ml-auto text-xs text-slate-500">{t.status === 'READY' ? `ready ${when(t.ready_at)}${t.ready_by_name ? ` · ${t.ready_by_name}` : ''}`
                        : t.status === 'SIGNED' ? `signed ${when(t.signed_at)}${h?.signed_by_name ? ` · ${h.signed_by_name}` : ''}${h?.production_line_name ? ` · ${h.production_line_name}` : ''}`
                            : t.status === 'CANCELLED' ? `cancelled ${when(t.cancelled_at)}${t.cancelled_by_name ? ` · ${t.cancelled_by_name}` : ''}` : `made ${when(t.created_at)}${t.created_by_name ? ` · ${t.created_by_name}` : ''}`}</span>
                </div>
                {t.status === 'PREPARING' && t.sent_back_at && <div className="px-4 py-2 text-sm bg-rose-50 border-b border-rose-200 text-rose-900"><b>Sent back {when(t.sent_back_at)}:</b> {t.sent_back_reason} — correct the kit and mark it ready again.</div>}
                {t.status === 'CANCELLED' && <p className="px-4 py-2 text-sm text-slate-600">Cancelled: {t.cancelled_reason} — what was in it went back to the shelf; the items stay owed on the trim order.</p>}
                {t.notes && <p className="px-4 pt-2 text-xs text-slate-600"><b>Note:</b> {t.notes}</p>}
                {KIT_OPEN.includes(t.status) && !isSample && unresOfKit(t).length > 0 && <p className="px-4 py-2 text-sm bg-rose-50 border-b border-rose-200 text-rose-900"><b>{unresOfKit(t).length} item{unresOfKit(t).length === 1 ? '' : 's'} not reserved for {k.order_no}</b> — reserve {unresOfKit(t).length === 1 ? 'it' : 'them'} on the <Link to={bomLink} className="font-bold underline">Order BOM</Link> before {t.status === 'READY' ? 'the line loader signs' : 'marking this kit ready'}.</p>}
                {t.status !== 'CANCELLED' && open && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left"><tr><th className="px-4 py-1.5 w-10">#</th><th className="px-3 py-1.5">Stage</th><th className="px-3 py-1.5">Trim type</th><th className="px-3 py-1.5">Item</th><th className="px-3 py-1.5 text-right">In the kit</th></tr></thead>
                            <tbody>
                                {groups.map(g => (
                                    <tr key={g.key} className="border-t border-slate-100">
                                        <td className="px-4 py-1.5 tabular-nums text-slate-500">{g.line_no}</td>
                                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">{stageName(g)}</td>
                                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">{g.type_name || '—'}</td>
                                        <td className="px-3 py-1.5"><span className="font-semibold text-slate-800">{g.label}</span>{g.extra && <span className="ml-1 text-[11px] text-violet-700">extra line · free stock</span>}{g.lines.some(isOver) && <span className="ml-1 text-[11px] text-sky-700">order + over-cut</span>}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums font-bold whitespace-nowrap">{g.in_units ? `${g.picked_units} ${g.purchase_uom} = ${qty(g.picked, g.uom)} ${g.uom}` : `${qty(g.picked, g.uom)} ${g.uom}`}</td>
                                    </tr>
                                ))}
                                {t.labels_qty > 0 && !filtering && <tr className="border-t border-slate-100 bg-indigo-50/30"><td className="px-4 py-1.5 text-slate-500">L</td><td className="px-3 py-1.5 text-xs text-slate-500">—</td><td className="px-3 py-1.5 text-xs">Labels</td><td className="px-3 py-1.5 font-semibold text-slate-800">Garment barcode labels</td><td className="px-3 py-1.5 text-right tabular-nums font-bold">{t.labels_qty} pcs</td></tr>}
                                <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"><td className="px-4 py-1.5" colSpan={4}>Total · {groups.length} item{groups.length === 1 ? '' : 's'}{t.labels_qty > 0 ? ' + garment labels' : ''} · {new Set(groups.map(stageKey)).size} stage(s)</td><td className="px-3 py-1.5 text-right">{groups.length + (t.labels_qty > 0 ? 1 : 0)} line(s)</td></tr>
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100">
                    {isSample && KIT_OPEN.includes(t.status) && perm.prepare && isOpen && <PrimaryButton onClick={() => { setFormError(''); setHandOver({ kit: t, name: '', note: '' }); }}><HandHelping size={14} /> Hand over to sampling…</PrimaryButton>}
                    {!isSample && t.status === 'READY' && perm.sign && <PrimaryButton onClick={() => navigate(`/v3/trim-kits/${t.id}`)}><PenLine size={14} /> Check &amp; sign</PrimaryButton>}
                    {!isSample && t.status === 'READY' && perm.sign && <SecondaryButton onClick={() => askReason({ title: `Send ${t.kit_no} back to the store`, confirm: 'Send back', hint: 'The whole kit goes back (for a wrong or damaged item, count and mark that item instead — the good ones are signed).', run: (r) => trimKitsApi.kitSendBack(t.id, r) })}><RotateCcw size={14} /> Send back</SecondaryButton>}
                    {!isSample && t.status === 'PREPARING' && perm.prepare && isOpen && <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => trimKitsApi.kitReady(t.id))}><PackageCheck size={14} /> Mark ready</PrimaryButton>}
                    {t.status === 'PREPARING' && perm.prepare && isOpen && <SecondaryButton onClick={() => openEditor(t)}><Pencil size={14} /> Change…</SecondaryButton>}
                    {KIT_OPEN.includes(t.status) && <SecondaryButton onClick={async () => exportPickList(k, await loadLetterhead(), t)}><FileDown size={14} /> Pick list</SecondaryButton>}
                    {t.status === 'READY' && perm.prepare && <SecondaryButton onClick={() => run(() => trimKitsApi.kitUnready(t.id))}><Undo2 size={14} /> Pull back</SecondaryButton>}
                    {KIT_OPEN.includes(t.status) && perm.prepare && <SecondaryButton onClick={() => askReason({ title: `Cancel ${t.kit_no}`, confirm: 'Cancel kit', hint: 'What is in the bag goes back on the shelf; the items stay owed on the trim order for another kit.', run: (r) => trimKitsApi.kitCancel(t.id, r) })}><Ban size={14} /> Cancel kit</SecondaryButton>}
                    {t.status === 'SIGNED' && h && <span className="text-sm">{h.issue_id ? <Link to={`/v3/trim-orders/slips/${h.issue_id}`} className="font-bold text-indigo-700 hover:underline">{h.issue_no}</Link> : <b>garment labels only</b>}{h.store_override ? <span className="text-slate-600"> · to {h.received_by_name} (sampling) · recorded by the store</span> : null}{t.bill_no ? <span className="text-slate-600"> · valuation bill {t.bill_no}</span> : null}{h.partial ? <span className="text-slate-500"> · the rest of the trim order stays with the store</span> : null}</span>}
                    {!isSample && t.status === 'READY' && !perm.sign && <span className="text-xs text-slate-500">Waiting for a line loader — the store writes {t.kit_no} on the bag.</span>}
                </div>
            </div>
        );
    };

    return (
        <div>
            {isSample ? <Link to={`/v3/samples/${k.sample_request_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Sample {k.sample_request_no}</Link>
                : <Link to="/v3/trim-orders" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Trim orders &amp; kits</Link>}
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{k.trim_order_no}</h1>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Trim order</span>
                {isSample && <Link to={`/v3/samples/${k.sample_request_id}`} className="text-[11px] font-black px-2 py-0.5 rounded border bg-violet-50 text-violet-800 border-violet-300 hover:underline">Sample · {k.sample_type}{k.sample_round > 1 ? ` round ${k.sample_round}` : ''} · {k.sample_request_no}</Link>}
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${(ORDER_STATUS[S] || ORDER_STATUS.OPEN).cls}`}>{(ORDER_STATUS[S] || ORDER_STATUS.OPEN).label}</span>
                {pendingExtra.length > 0 && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">extra line waiting for the merchandiser</span>}
                {BC && !BC.seen_at && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">BOM changed</span>}
            </div>
            <p className="text-sm text-slate-600 mb-1"><Link to={`/v3/orders/${k.order_id}`} className="font-semibold text-indigo-700 hover:underline">{k.order_no}</Link> · {k.customer_name}{k.batch_code ? <> · batch <b>#{k.floor_no}</b> {k.batch_code}</> : ''}</p>
            {k.auto && <p className="text-xs text-slate-500 mb-1">Made when the batch was finalised: Order BOM × the garments cut, per colour × size — wastage on the order's garments, none on over-cut garments. The quantities can't be changed; the store hands them in kits — one or many, stage by stage.</p>}
            {isSample ? <p className="text-sm mb-3 text-slate-600">For sampling — Order BOM × the sample garments, <b>from free stock</b> (never the order's reservation). The store prepares a kit and hands it to sampling, typing who took it; lines can be changed with a reason.</p>
            : <p className="text-sm mb-3">{k.batch_lines?.length ? <>Batch is on: {k.batch_lines.map(l => <b key={l.id} className="mr-2 text-slate-800">{l.name} <span className="font-normal text-slate-500">({l.stage})</span></b>)}</> : <span className="text-slate-500">The batch is not on a sewing line yet — any line loader may sign for a kit.</span>}</p>}
            {remadeAt && !BC && <p className="mb-2 text-xs text-sky-800">Remade from the order's BOM on {new Date(remadeAt).toLocaleString('en-IN')} — the BOM changed before any kit was made (see History).</p>}
            {BC && (BC.seen_at ? (
                <p className="mb-3 text-xs text-slate-600"><b>Order BOM changed</b> on {new Date(BC.at).toLocaleString('en-IN')} after this trim order was started — dealt with{k.bom_change_seen_by_name ? ` by ${k.bom_change_seen_by_name}` : ''} on {new Date(BC.seen_at).toLocaleString('en-IN')}{BC.seen_note ? `: ${BC.seen_note}` : ''}.</p>
            ) : (
                <div className="mb-3 text-sm bg-amber-50 border border-amber-300 text-amber-950 rounded-lg px-3 py-2">
                    <p className="font-bold">The order's BOM changed on {new Date(BC.at).toLocaleString('en-IN')}{BC.reason ? ` (${BC.reason})` : ''} after this trim order was started — nothing on it was changed.</p>
                    <p className="text-xs mb-1.5">For what is now missing, ask for an extra line (the merchandiser approves); tell the line about items no longer on the BOM. Then mark it dealt with.</p>
                    <button type="button" onClick={() => toggle('bom')} className="text-xs font-bold text-amber-900 hover:underline">{isShown('bom') ? '▾' : '▸'} {BC.diffs.length} change{BC.diffs.length === 1 ? '' : 's'} — {BC.diffs.filter(d => d.kind === 'NEW').length} new · {BC.diffs.filter(d => d.kind === 'GONE').length} no longer on the BOM · {BC.diffs.filter(d => d.kind !== 'NEW' && d.kind !== 'GONE').length} quantity changed</button>
                    {isShown('bom') && <table className="w-full text-xs bg-white/60 rounded mt-1">
                        <thead className="text-left font-bold text-amber-900/70 uppercase tracking-wider"><tr><th className="px-2 py-1">Item</th><th className="px-2 py-1 text-right">On the trim order</th><th className="px-2 py-1 text-right">BOM now</th><th className="px-2 py-1 text-right">Change</th></tr></thead>
                        <tbody>{BC.diffs.map((d, i) => (
                            <tr key={i} className="border-t border-amber-200">
                                <td className="px-2 py-1">{d.label}{d.part !== 'ORDER' ? <span className="text-amber-800"> · over-cut</span> : null}{d.kind === 'NEW' ? <b className="ml-1 text-emerald-700">new</b> : d.kind === 'GONE' ? <b className="ml-1 text-rose-700">no longer on the BOM</b> : null}</td>
                                <td className="px-2 py-1 text-right tabular-nums">{qty(d.kit_qty, d.uom)} {d.uom}</td>
                                <td className="px-2 py-1 text-right tabular-nums">{qty(d.bom_qty, d.uom)} {d.uom}</td>
                                <td className={`px-2 py-1 text-right tabular-nums font-bold ${d.change > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{d.change > 0 ? '+' : ''}{qty(d.change, d.uom)} {d.uom}</td>
                            </tr>
                        ))}</tbody>
                    </table>}
                    {perm.prepare && <div className="mt-2"><SecondaryButton onClick={() => askReason({ title: 'BOM change dealt with', confirm: 'Mark as dealt with', label: 'Note', optional: true, hint: 'Say what was done (extra line asked, nothing needed …). The notice stays on the trim order as a record.', run: (t) => trimKitsApi.bomChangeSeen(id, t || undefined) })}>Mark as dealt with</SecondaryButton></div>}
                </div>
            ))}
            {(S === 'CLOSED' || S === 'CANCELLED') && <p className="mb-3 text-sm text-slate-600"><b>{ORDER_STATUS[S].label}</b>{k.closed_by_name ? ` by ${k.closed_by_name}` : ''}: {k.close_reason}</p>}

            <div className="flex flex-wrap gap-2 mb-3">
                {canKit && <PrimaryButton onClick={() => openEditor(null)}><PackagePlus size={14} /> New kit…</PrimaryButton>}
                {perm.prepare && isOpen && canNow.length > 0 && <SecondaryButton onClick={async () => exportPickList(k, await loadLetterhead())}><FileDown size={14} /> What can go in now (PDF)</SecondaryButton>}
                {LB && <SecondaryButton onClick={() => setLabelsOpen(true)}><Tag size={14} /> Garment labels {LB.printed}/{LB.qty}</SecondaryButton>}
                {isSample && perm.prepare && (isOpen || S === 'ISSUED') && <SecondaryButton onClick={openChange}><ListPlus size={14} /> Change lines…</SecondaryButton>}
                {!isSample && perm.prepare && isOpen && <SecondaryButton onClick={closeOrder}><Ban size={14} /> {k.handovers.length ? 'Close trim order' : 'Cancel trim order'}</SecondaryButton>}
            </div>
            <ErrorBox text={error} />
            <ItemFilter q={fq} setQ={setFq} type={ftype} setType={setFtype} types={itemTypes} shown={rows.filter(match).length} total={rows.length} />

            {/* Kits (26 Nov 2026): the bags the store prepares on this trim order — several can be ready at once */}
            <div className="mb-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <h2 className="text-lg font-black text-slate-900">Kits</h2>
                    <span className="text-sm text-slate-600">{liveKits.length ? [[nKits('READY'), 'ready for pickup'], [nKits('PREPARING'), 'being prepared'], [nKits('SIGNED'), 'signed']].filter(([n]) => n).map(([n, t]) => `${n} ${t}`).join(' · ') : 'No kit made yet.'}</span>
                    {isOpen && perm.prepare && !canKit && toKitRows.length > 0 && <span className="text-xs text-rose-700 font-semibold">Nothing can go in a new kit now — {causeText(missing) || 'waiting for stock'}.</span>}
                </div>
                {liveKits.length > 0 ? <div className="space-y-3">{liveKits.map(KitCard)}</div>
                    : isOpen && <p className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-xl p-4">{canKit ? <>Make the first kit: <b>New kit…</b> — tick what goes in this bag (one stage, or all that can go in), save, print its pick list and write the kit number on the bag.</> : 'Nothing can go in a kit yet — see "Not in a kit yet" below.'}</p>}
                {cancelledKits.length > 0 && (
                    <div className="mt-2">
                        <button type="button" onClick={() => setShowCancelled(v => !v)} className="text-xs font-bold text-slate-500 hover:text-indigo-700">{showCancelled ? '▾' : '▸'} {cancelledKits.length} cancelled kit{cancelledKits.length === 1 ? '' : 's'}</button>
                        {showCancelled && <div className="mt-2 space-y-2">{cancelledKits.map(KitCard)}</div>}
                    </div>
                )}
            </div>

            {unreserved.length > 0 && isOpen && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-950 overflow-hidden">
                    <div className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                            <b className="text-base">Reserve on {k.order_no} — {unreserved.length} item{unreserved.length === 1 ? '' : 's'}</b>
                            <span className="text-xs text-rose-800">the line loader can sign only what the order has reserved</span>
                            <Link to={bomLink} className="ml-auto font-bold text-rose-800 underline whitespace-nowrap">Order BOM — reserve →</Link>
                        </div>
                        <ul className="space-y-1">
                            {resInKit.length > 0 && <li>● <b>{resInKit.length} in kit {[...new Set(resInKit.flatMap(g => kitsHolding(g).map(t => t.kit_no)))].join(', ')}</b> — {resInKit.length === 1 ? 'it blocks' : 'they block'} the kit: it can't be marked ready or signed until {resInKit.length === 1 ? 'it is' : 'they are'} reserved.{resInKit.every(g => g.stock_on_hand > 0) ? ` Stock is in the store for ${resInKit.length === 1 ? 'it' : `all ${resInKit.length}`}.` : ''}</li>}
                            {resNoStock.length > 0 && <li>● <b>{resNoStock.length} not in the store either</b> — reserve {resNoStock.length === 1 ? 'it' : 'them'} when {resNoStock.length === 1 ? 'it arrives' : 'they arrive'} (see Not in a kit yet).</li>}
                            {resWaiting.length > 0 && <li>● <b>{resWaiting.length} in the store, waiting only for the reservation</b> — reserve {resWaiting.length === 1 ? 'it' : 'them'} and {resWaiting.length === 1 ? 'it goes' : 'they go'} in the next kit.</li>}
                        </ul>
                        <button type="button" onClick={() => toggle('unres')} className="mt-1.5 text-xs font-bold text-rose-800 hover:underline">{isShown('unres') ? '▾ Hide' : '▸ Show'} the {unreserved.length} item{unreserved.length === 1 ? '' : 's'}</button>
                    </div>
                    {isShown('unres') && (
                        <div className="overflow-x-auto bg-white border-t border-rose-200">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right"><tr>
                                    <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">Owed for the order</th><th className="px-3 py-2">Reserved</th><th className="px-3 py-2">Short by</th><th className="px-3 py-2">In store</th><th className="px-3 py-2 text-left">Where it is</th>
                                </tr></thead>
                                <tbody>{[...resInKit, ...resNoStock, ...resWaiting].map(g => {
                                    const kh = kitsHolding(g);
                                    return (
                                        <tr key={g.key} className="border-t border-slate-100 text-right tabular-nums whitespace-nowrap">
                                            <td className="px-3 py-1.5 text-left text-slate-500">{g.line_no}</td>
                                            <td className="px-3 py-1.5 text-left whitespace-normal"><span className="font-semibold text-slate-800">{g.label}</span><span className="block text-xs text-slate-500">{g.type_name}</span></td>
                                            <td className="px-3 py-1.5">{qty(orderOwed(g), g.uom)} {g.uom}</td>
                                            <td className="px-3 py-1.5">{qty(reservedOf(g), g.uom)} {g.uom}</td>
                                            <td className="px-3 py-1.5 font-bold text-rose-700">{qty(resGap(g, orderOwed(g)), g.uom)} {g.uom}</td>
                                            <td className={`px-3 py-1.5 ${g.stock_on_hand > 0 ? '' : 'font-bold text-rose-700'}`}>{qty(g.stock_on_hand, g.uom)} {g.uom}</td>
                                            <td className="px-3 py-1.5 text-left text-xs">{kh.length ? <b className="text-slate-800">in {kh.map(t => t.kit_no).join(', ')}</b> : g.stock_on_hand > 0 ? 'in the store — next kit' : <span className="text-rose-700 font-semibold">not in store</span>}</td>
                                        </tr>
                                    );
                                })}</tbody>
                                <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-bold"><tr>
                                    <td className="px-3 py-2" colSpan={7}>Total · {unreserved.length} item(s) to reserve — {[[resInKit.length, 'in a kit'], [resNoStock.length, 'not in store'], [resWaiting.length, 'in the store, for the next kit']].filter(([n]) => n).map(([n, t]) => `${n} ${t}`).join(' · ')}</td>
                                </tr></tfoot>
                            </table>
                        </div>
                    )}
                </div>
            )}
            <button type="button" aria-expanded={isShown('lines')} onClick={() => toggle('lines')} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2 text-left group">
                <h2 className="text-lg font-black text-slate-900 group-hover:text-indigo-700">{isShown('lines') ? '▾' : '▸'} Trim order lines</h2>
                <span className="text-sm text-slate-600">{[
                    `${rows.length + (LB ? 1 : 0)} item(s)`,
                    rows.some(g => g.over_qty > 0) ? `${rows.filter(g => g.over_qty > 0).length} with over-cut` : '',
                    `${rows.filter(g => g.issued > 0).length + (LB && LB.issued > 0 ? 1 : 0)} handed`,
                    `${rows.filter(g => g.in_kits > 0).length + (LB && LB.picked > 0 ? 1 : 0)} in kits`,
                    `${toKitRows.length + (LB && LB.remaining - LB.picked > 0 ? 1 : 0)} not in a kit yet`,
                ].filter(Boolean).join(' · ')}{(() => { const t = [rows.filter(g => g.stock_on_hand <= 0 && g.to_kit > 0).length ? `${rows.filter(g => g.stock_on_hand <= 0 && g.to_kit > 0).length} not in store` : '', unreserved.length ? `${unreserved.length} not reserved` : ''].filter(Boolean).join(' · '); return t ? <> · <b className="text-rose-700">{t}</b></> : null; })()}</span>
            </button>
            {isShown('lines') && <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[1180px]">
                    <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right">
                        <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">For the order</th><th className="px-3 py-2">Over-cut</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Handed over</th><th className="px-3 py-2" title="In kits being prepared or ready">In kits</th><th className="px-3 py-2">Not in a kit yet</th><th className="px-3 py-2">In store</th><th className="px-3 py-2" title="What the order has reserved for this item — the line loader's signing needs it">Reserved for the order</th><th className="px-3 py-2 text-left">Last pick / count</th><th className="px-3 py-2" /></tr>
                    </thead>
                    <tbody>
                        {rows.filter(g => !waitKeys.has(g.key) && match(g)).flatMap((g, i, arr) => (i === 0 || stageKey(arr[i - 1]) !== stageKey(g)
                            ? [{ key: `__st-${stageKey(g)}`, stageHead: stageName(g), n: arr.filter(x => stageKey(x) === stageKey(g)).length }, g] : [g]))
                            .map(g => {
                                if (g.stageHead) return (
                                    <tr key={g.key} className="border-t-2 border-slate-200 bg-slate-100/70">
                                        <td className="px-3 py-1.5 text-left text-xs font-black uppercase tracking-wider text-slate-700" colSpan={12}>{g.stageHead} <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">{g.n} item{g.n === 1 ? '' : 's'}</span></td>
                                    </tr>
                                );
                                const req = pendingExtra.find(r => g.lines.some(l => l.id === r.replaces_line_id));
                                const head = extraFor(g);
                                const replaced = g.lines.find(l => l.replaced_by_line_id);
                                const notes = g.lines.filter(l => (l.pick && l.pick.short > 0 && l.to_kit > 0) || (l.count && l.count.issue !== 'OK'));
                                const cp = pickCaps(g);
                                const shortFree = g.over_remaining > 0 && g.stock_free + 1e-9 < g.over_remaining;
                                const kitsOf = kits.filter(t => KIT_OPEN.includes(t.status) && t.lines.some(kl => g.lines.some(l => l.id === kl.order_line_id)));
                                return (
                                    <tr key={g.key} className={`border-t border-slate-100 text-right tabular-nums align-top ${replaced && g.remaining === 0 ? 'bg-slate-50 text-slate-500' : ''}`}>
                                        <td className="px-3 py-2 text-left">{g.line_no}</td>
                                        <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">{g.label}</span>
                                            {g.extra && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-violet-50 text-violet-800 border-violet-300">extra line · free stock{g.lines[0].replaces_line_id ? ` · replaces line ${lineOf.get(g.lines[0].replaces_line_id)?.line_no}` : ''}</span>}
                                            {replaced && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-300">closed — replaced by line {lineOf.get(replaced.replaced_by_line_id)?.line_no}</span>}
                                            {g.lines.filter(l => l.changed_reason).map(l => <span key={l.id} className="block text-[11px] text-violet-700">changed by the store: {l.changed_reason}</span>)}
                                            <span className="block text-xs text-slate-500">{g.type_name}{g.lines.some(l => l.basis?.cells?.length) ? <> · <button type="button" className="text-indigo-700 hover:underline" onClick={() => setBasis(g)}>how it's worked out</button></> : null}</span></td>
                                        <td className="px-3 py-2">{g.order_qty > 0 ? handout(g, g.order_qty) : '—'}</td>
                                        <td className={`px-3 py-2 ${g.over_qty > 0 ? 'text-sky-800' : 'text-slate-300'}`}>{g.over_qty > 0 ? handout(g, g.over_qty) : '—'}
                                            {g.over_qty > 0 && <span className="block text-[11px] text-slate-500">{g.over_free_qty > 0 ? `free limit ${qty(g.over_free_qty, g.uom)}` : ''}{g.over_free_qty > 0 && g.over_limit_qty > 0 ? ' · ' : ''}{g.over_limit_qty > 0 ? `above it ${qty(g.over_limit_qty, g.uom)}` : ''}</span>}</td>
                                        <td className="px-3 py-2 font-bold">{handout(g, g.qty)}{g.closed > 0 && <span className="block text-[11px] font-normal text-slate-500">closed {qty(g.closed, g.uom)}</span>}</td>
                                        <td className="px-3 py-2">{g.issued ? `${qty(g.issued, g.uom)} ${g.uom}` : '—'}</td>
                                        <td className={`px-3 py-2 ${g.in_kits > 0 ? 'text-emerald-800 font-semibold' : 'text-slate-300'}`}>{g.in_kits > 0 ? handout(g, g.in_kits) : '—'}
                                            {kitsOf.length > 0 && <span className="block text-[11px] font-normal text-slate-500">{kitsOf.map(t => `-${t.kit_seq}`).join(', ')}</span>}</td>
                                        <td className={`px-3 py-2 ${g.to_kit > 0 ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>{g.to_kit > 0 ? handout(g, g.to_kit) : '—'}
                                            {g.to_kit > 0 && (cp.total > 0
                                                ? <span className="block text-[11px] font-bold text-emerald-700">can go in now: {g.in_units ? `${cp.total} ${g.purchase_uom}` : `${qty(cp.total, g.uom)} ${g.uom}`}</span>
                                                : <span className="block text-[11px] font-bold text-rose-700">waits — {waitCause(cp.cause || 'stock')}</span>)}</td>
                                        <td className="px-3 py-2 text-xs">{qty(g.stock_on_hand, g.uom)} {g.uom}
                                            {g.stock_on_hand <= 0 && g.to_kit > 0 && <span className="block font-black text-rose-700">not in store</span>}
                                            {shortFree && <span className="block text-amber-800" title="over-cut is handed from free stock (not allocated to any order)">free stock {qty(Math.max(0, g.stock_free), g.uom)} — over-cut short</span>}
                                            {g.on_order && g.to_kit > 0 && cp.total + 1e-9 < (g.in_units ? g.units_to_kit : g.to_kit) && <span className="block text-slate-600">on order {qty(g.on_order.qty, g.on_order.uom)} {g.on_order.uom} · {g.on_order.pos}{g.on_order.due ? ` · due ${new Date(g.on_order.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}</span>}</td>
                                        <td className="px-3 py-2 text-xs">{g.extra ? <span className="text-slate-400">free stock</span> : <>{qty(reservedOf(g), g.uom)} {g.uom}
                                            {notReserved(g) && <span className="block font-black text-rose-700">{reservedOf(g) > 0 ? `short ${qty(resGap(g, orderOwed(g)), g.uom)} ${g.uom}` : 'not reserved'}</span>}</>}</td>
                                        <td className="px-3 py-2 text-left text-xs">
                                            {notes.map(l => (
                                                <span key={l.id} className="block">
                                                    {g.lines.length > 1 && <span className="text-slate-400">{isOver(l) ? 'over-cut: ' : 'order: '}</span>}
                                                    {l.pick && l.pick.short > 0 && l.to_kit > 0 && <span className="text-amber-800"><b>{qty(l.pick.short, l.uom)} short</b> — {SHORT_REASON[l.pick.reason]}{l.pick.note ? ` (${l.pick.note})` : ''}{l.pick.adjusted ? ` · stock −${qty(l.pick.adjusted, l.uom)}` : ''} </span>}
                                                    {l.count && l.count.issue !== 'OK' && <span className={['WRONG_ITEM', 'DAMAGED', 'SHORT', 'OTHER'].includes(l.count.issue) ? 'text-rose-700' : 'text-slate-600'}>loader: <b>{COUNT_ISSUE[l.count.issue]}</b>{l.count.issue === 'SHORT' ? ` (${qty(l.count.counted, l.uom)} of ${qty(l.count.picked, l.uom)})` : l.count.issue === 'DAMAGED' ? ` (${qty(l.count.damaged, l.uom)})` : ''}{l.count.note ? ` — ${l.count.note}` : ''}</span>}
                                                </span>
                                            ))}
                                            {req && <span className="block text-violet-800">extra line asked: {req.label} {qty(req.qty, req.uom)} {req.uom}</span>}
                                        </td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">{!isSample && perm.prepare && isOpen && head && !req && (
                                            <button type="button" className="text-xs font-bold text-violet-700 hover:underline inline-flex items-center gap-1" onClick={() => openExtra(head)}><Replace size={12} /> Extra line…</button>)}</td>
                                    </tr>
                                );
                            })}
                        {LB && !filtering && (
                            <tr className="border-t border-slate-100 text-right tabular-nums align-top bg-indigo-50/30">
                                <td className="px-3 py-2 text-left">L</td>
                                <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">Garment barcode labels</span>
                                    <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">printed by the store · no stock</span>
                                    <span className="block text-xs text-slate-500">One per garment · the store chooses the kit they go in · <button type="button" className="text-indigo-700 hover:underline" onClick={() => setLabelsOpen(true)}>{perm.prepare ? 'print / reprint…' : 'see the labels'}</button></span></td>
                                <td className="px-3 py-2">{LB.qty} pcs</td>
                                <td className="px-3 py-2 text-slate-300">—</td>
                                <td className="px-3 py-2 font-bold">{LB.qty} pcs</td>
                                <td className="px-3 py-2">{LB.issued ? `${LB.issued} pcs` : '—'}</td>
                                <td className={`px-3 py-2 ${LB.picked > 0 ? 'text-emerald-800 font-semibold' : 'text-slate-300'}`}>{LB.picked > 0 ? `${LB.picked} pcs` : '—'}</td>
                                <td className={`px-3 py-2 ${LB.remaining - LB.picked > 0 ? 'text-amber-800 font-semibold' : 'text-slate-400'}`}>{LB.remaining - LB.picked > 0 ? `${LB.remaining - LB.picked} pcs` : '—'}
                                    {LB.available_for_kit > 0 && <span className="block text-[11px] font-bold text-emerald-700">can go in now: {LB.available_for_kit}</span>}</td>
                                <td className="px-3 py-2 text-xs">{LB.printed} printed</td>
                                <td className="px-3 py-2 text-left text-xs" colSpan={2}>{LB.remaining - LB.picked > LB.available_for_kit ? <span className="text-amber-800">{LB.remaining - LB.picked - LB.available_for_kit} not printed yet</span> : null}</td>
                                <td className="px-3 py-2" />
                            </tr>
                        )}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 text-right">
                            <td className="px-3 py-2 text-left" colSpan={2}>{filtering ? <span className="text-indigo-700">Showing {rows.filter(g => !waitKeys.has(g.key) && match(g)).length} matching · </span> : null}Total · {rows.length - waitKeys.size + (LB ? 1 : 0)} item(s){rows.some(g => g.over_qty > 0) ? ` · ${rows.filter(g => g.over_qty > 0).length} with over-cut` : ''}{waitKeys.size ? ` · ${waitKeys.size} more below, not in a kit yet` : ''}</td>
                            <td className="px-3 py-2" colSpan={4}>{rows.filter(g => g.issued > 0).length} handed (fully or in part)</td>
                            <td className="px-3 py-2 text-emerald-800">{rows.filter(g => g.in_kits > 0).length + (LB && LB.picked > 0 ? 1 : 0)} in kits</td>
                            <td className="px-3 py-2 text-amber-800">{toKitRows.length + (LB && LB.remaining - LB.picked > 0 ? 1 : 0)} not in a kit yet</td>
                            <td className="px-3 py-2 text-rose-700" colSpan={4}>{[rows.filter(g => g.stock_on_hand <= 0 && g.to_kit > 0).length ? `${rows.filter(g => g.stock_on_hand <= 0 && g.to_kit > 0).length} not in store` : '', unreserved.length ? `${unreserved.length} not reserved` : ''].filter(Boolean).join(' · ')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>}
            {!isShown('lines') && <div className="mb-4" />}

            {missing.length > 0 && (
                // Not in a kit yet (26 Nov 2026, owner: "also add list of items not in store in pdf as well as kit page"): every
                // item — or the part of it — that can't go in a kit now, with why and what is on order; the store chases it here.
                <div className="bg-white border border-rose-200 rounded-xl overflow-x-auto mb-4">
                    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 bg-rose-50/60 ${isShown('missing') ? 'border-b border-rose-100' : ''}`}>
                        <button type="button" aria-expanded={isShown('missing')} onClick={() => toggle('missing')} className="font-bold text-slate-800 hover:text-indigo-700 text-left">{isShown('missing') ? '▾' : '▸'} Not in a kit yet — {missing.length} item{missing.length === 1 ? '' : 's'}</button>
                        <span className="text-xs text-slate-600">can't go in a kit now · still owed on the trim order · {missingText} · {missing.filter(x => x.g.on_order).length} on order · {missing.filter(x => !x.g.on_order && (x.cp.cause || 'stock') !== 'res').length} not on any PO</span>
                        {missing.some(x => (x.cp.cause || 'stock') === 'res') && <Link to={bomLink} className="ml-auto text-xs font-bold text-indigo-700 hover:underline">Order BOM — reserve →</Link>}
                    </div>
                    {isShown('missing') && <table className="w-full text-sm min-w-[1000px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 text-right"><tr>
                            <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Stage</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">Not in a kit</th><th className="px-3 py-2">Waits</th>
                            <th className="px-3 py-2 text-left">Why</th><th className="px-3 py-2">In store</th><th className="px-3 py-2">Reserved</th><th className="px-3 py-2 text-left">On order</th><th className="px-3 py-2" /></tr></thead>
                        <tbody>{filtering && !missing.some(x => match(x.g)) && <tr><td colSpan={10} className="px-4 py-4 text-center text-sm text-slate-400">No item here matches.</td></tr>}
                            {missing.filter(x => match(x.g)).map(({ g, cp, waitQty }) => {
                            const req = pendingExtra.find(r => g.lines.some(l => l.id === r.replaces_line_id));
                            const head = extraFor(g);
                            const unit = g.in_units ? g.purchase_uom : g.uom; const cause = cp.cause || 'stock';
                            return (
                                <tr key={g.key} className="border-t border-slate-100 text-right tabular-nums align-top">
                                    <td className="px-3 py-2 text-left">{g.line_no}</td>
                                    <td className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{stageName(g)}</td>
                                    <td className="px-3 py-2 text-left"><span className="font-semibold text-slate-800">{g.label}</span><span className="block text-xs text-slate-500">{g.type_name}</span></td>
                                    <td className="px-3 py-2 whitespace-nowrap">{g.in_units ? `${g.units_to_kit} ${g.purchase_uom}` : `${qty(g.to_kit, g.uom)} ${g.uom}`}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-bold text-rose-700">{qty(waitQty, unit)} {unit}{cp.total > 0 && <span className="block text-[11px] font-normal text-slate-500">{qty(cp.total, unit)} {unit} can go in</span>}</td>
                                    <td className="px-3 py-2 text-left text-xs font-bold text-rose-700">{waitCause(cause)}</td>
                                    <td className="px-3 py-2 text-xs whitespace-nowrap">{qty(g.stock_on_hand, g.uom)} {g.uom}</td>
                                    <td className="px-3 py-2 text-xs whitespace-nowrap">{g.extra ? 'free stock' : `${qty(reservedOf(g), g.uom)} ${g.uom}`}</td>
                                    <td className="px-3 py-2 text-left text-xs">{g.on_order ? <span className="text-slate-700">{qty(g.on_order.qty, g.on_order.uom)} {g.on_order.uom} · {g.on_order.pos}{g.on_order.due ? ` · due ${new Date(g.on_order.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}</span> : cause === 'res' ? <span className="text-slate-400">—</span> : <span className="font-bold text-rose-700">not on any open PO</span>}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">{req ? <span className="text-xs text-violet-800">extra line asked</span> : !isSample && perm.prepare && isOpen && head && (
                                        <button type="button" className="text-xs font-bold text-violet-700 hover:underline inline-flex items-center gap-1" onClick={() => openExtra(head)}><Replace size={12} /> Extra line…</button>)}</td>
                                </tr>
                            );
                        })}
                            <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                                <td className="px-3 py-2" colSpan={5}>Total · {missing.length} item(s) not in a kit yet</td>
                                <td className="px-3 py-2 text-rose-700" colSpan={3}>{missingText}</td>
                                <td className="px-3 py-2" colSpan={2}>{missing.filter(x => x.g.on_order).length} on order · {missing.filter(x => !x.g.on_order && (x.cp.cause || 'stock') !== 'res').length} not on any PO</td>
                            </tr>
                        </tbody>
                    </table>}
                </div>
            )}

            {(k.returns || []).length > 0 && (
                // Rejected by the line (26 Nov 2026, migration 92): what the loaders did not take from a kit — back to the store
                <div className="bg-white border border-rose-200 rounded-xl mb-4 overflow-hidden">
                    <button type="button" aria-expanded={isShown('returns')} onClick={() => toggle('returns')} className={`w-full flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 bg-rose-50/60 text-left ${isShown('returns') ? 'border-b border-rose-100' : ''}`}>
                        <span className="font-bold text-slate-800">{isShown('returns') ? '▾' : '▸'} Rejected by the line — {k.returns.length} line(s)</span>
                        <span className="text-xs text-slate-600">{[[k.returns.filter(r => r.status === 'PENDING').length, 'to confirm'], [k.returns.filter(r => r.status === 'RECEIVED').length, 'back on the shelf'], [k.returns.filter(r => r.status === 'WRITTEN_OFF').length, 'written off']].filter(([n]) => n).map(([n, t]) => `${n} ${t}`).join(' · ')} · still owed on the trim order</span>
                    </button>
                    {isShown('returns') && <KitReturns rows={k.returns} canConfirm={perm.prepare} onDone={load} showOrder />}
                </div>
            )}

            {(k.extra_requests || []).length > 0 && (
                <div className="bg-white border border-violet-200 rounded-xl p-4 mb-4">
                    <p className="font-bold text-slate-800 mb-2">Extra lines (from free stock — the merchandiser approves)</p>
                    {k.extra_requests.map(r => (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 py-1.5 border-t border-slate-100 first:border-0 text-sm">
                            <b>{r.label}</b><span>{qty(r.qty, r.uom)} {r.uom}</span><span className="text-slate-500">for line {lineOf.get(r.replaces_line_id)?.line_no} — {r.reason}</span>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${r.status === 'PENDING' ? 'bg-amber-50 text-amber-800 border-amber-300' : r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-slate-50 text-slate-500 border-slate-300'}`}>{r.status.toLowerCase()}</span>
                            <span className="text-xs text-slate-500">{r.requested_by_name}{r.decided_by_name ? ` · ${r.decided_by_name}` : ''}{r.decision_note ? ` — ${r.decision_note}` : ''}</span>
                            {r.status === 'PENDING' && <span className="ml-auto flex gap-2">
                                {perm.approve_extra && <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => trimKitsApi.approveExtra(r.id))}>Approve</PrimaryButton>}
                                {perm.approve_extra && <SecondaryButton onClick={() => askReason({ title: 'Refuse the extra line', confirm: 'Refuse', hint: 'The trim order stays as it is.', run: (t) => trimKitsApi.refuseExtra(r.id, t) })}>Refuse</SecondaryButton>}
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
                                {h.kit_id && <b className="mr-1 text-slate-900">{kitNoOf(h.kit_id)}</b>}
                                {!h.issue_id ? <b className="text-slate-800">Garment labels</b> : <Link to={`/v3/trim-orders/slips/${h.issue_id}`} className="font-bold text-indigo-700 hover:underline">{h.issue_no}</Link>}
                                <span className="text-slate-600"> · {h.store_override ? `to ${h.received_by_name} (sampling) · recorded by ${h.signed_by_name || 'the store'}` : `${h.production_line_name} · ${h.signed_by_name || '—'}`} · {new Date(h.signed_at).toLocaleString('en-IN')}</span>
                                {h.note && <span className="block text-xs text-slate-500">{h.note}</span>}
                                <ul className="ml-5 list-disc text-xs text-slate-600">{h.lines.map(x => <li key={x.order_line_id}>{x.label}: {x.units ? `${x.units} ${lineOf.get(x.order_line_id)?.purchase_uom} = ` : ''}{qty(x.qty, x.uom)} {x.uom}</li>)}
                                    {h.labels_qty > 0 && <li>Garment labels: {h.labels_qty} pcs{h.labels_counted != null && h.labels_counted !== h.labels_qty ? ` (counted ${h.labels_counted})` : ''}{h.labels_note ? ` — ${h.labels_note}` : ''}</li>}</ul>
                                {/* Without prices (the stores and the floor, 29 Oct 2026) the bill shows its number only — its values are for accounts. */}
                                {bill && (bill.total === undefined
                                    ? <p className="mt-1 text-xs"><b>Valuation bill {bill.bill_no}</b> <span className="text-slate-500">· values with accounts</span></p>
                                    : <p className="mt-1 text-xs"><b>Valuation bill {bill.bill_no}</b> · {money(bill.total)}{bill.unpriced ? <span className="text-amber-700"> · some items without a rate (valued at 0)</span> : ''} · <button type="button" className="font-bold text-indigo-700 hover:underline" onClick={async () => exportKitBill(k, bill, await loadLetterhead())}>PDF</button></p>)}
                            </div>
                        );
                    })}
                    <p className="text-xs text-slate-500 mt-2">{isSample ? 'Trims sampling did not use: the trim store records them on the sample request (back to free stock).' : 'Trims not used come back on a trim return slip — the line loader drafts it, the trim store receives it.'}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">History</p>
                    <div className="divide-y divide-slate-100 text-sm max-h-[480px] overflow-y-auto">
                        {k.history.map(h => (
                            <div key={h.id} className="py-1.5">
                                <span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString('en-IN')}</span>{h.kit_no && <span className="mr-1 text-[11px] font-black px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-700">{h.kit_no}</span>}<b>{ACTION[h.action] || h.action}</b>{h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                                {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 26 Nov 2026 (owner: "no need of What this kit is for table or at least collapse it at the bottom") */}
            {!isSample && <div className="mt-4 mb-2">
                <button type="button" onClick={() => setShowCut(v => !v)} className="text-sm font-bold text-slate-600 hover:text-indigo-700">{showCut ? '▾' : '▸'} What this trim order is for — garments cut per colour × size</button>
                {showCut && <div className="mt-2"><CutSummary k={k} rows={rows} /></div>}
            </div>}

            {handOver && (
                <Modal title={`Hand ${handOver.kit.kit_no} to sampling`} onClose={() => setHandOver(null)}>
                    <div className="space-y-3 w-[min(480px,90vw)]">
                        <p className="text-sm text-slate-600">Everything in the kit goes out as it is — one trim slip (marked sample) and a valuation bill. Sampling does not sign in 3.0 yet: you record the handover, with the name of who took it.</p>
                        <Field label="Taken by (sampling) *"><input className={inputCls} value={handOver.name} onChange={e => setHandOver({ ...handOver, name: e.target.value })} autoFocus placeholder="Name of the person in sampling" /></Field>
                        <Field label="Note"><input className={inputCls} value={handOver.note} onChange={e => setHandOver({ ...handOver, note: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setHandOver(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !handOver.name.trim()} onClick={() => run(() => trimKitsApi.handOver(handOver.kit.id, { received_by_name: handOver.name.trim(), note: handOver.note.trim() || undefined }), () => setHandOver(null))}><HandHelping size={14} /> Hand over</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {change && (
                <Modal title={`Change the sample's trims — ${k.trim_order_no}`} onClose={() => setChange(null)}>
                    <div className="space-y-3 w-[min(860px,94vw)] max-h-[80vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">Change a quantity (0 takes the item off — never below what is handed or in a kit), or add a stand-in item. One reason for this change.</p>
                        <table className="w-full text-sm">
                            <thead className="text-xs font-bold text-slate-500 text-left"><tr><th className="py-1">#</th><th className="py-1">Item</th><th className="py-1 text-right">On the order</th><th className="py-1 text-right">Handed / in kits</th><th className="py-1 text-right">New quantity</th></tr></thead>
                            <tbody>{k.lines.filter(l => l.remaining > 0 || l.issued > 0).map(l => {
                                const v = change.rows.has(l.id) ? change.rows.get(l.id) : String(l.closed >= l.qty - l.issued - 1e-9 && l.closed > 0 ? l.issued : l.qty);
                                return (
                                    <tr key={l.id} className="border-t border-slate-100"><td className="py-1">{l.line_no}</td><td className="py-1">{l.label}{l.closed > 0 && <span className="block text-[11px] text-slate-500">taken off {qty(l.closed, l.uom)} {l.uom}</span>}</td>
                                        <td className="py-1 text-right tabular-nums">{qty(l.qty, l.uom)} {l.uom}</td><td className="py-1 text-right tabular-nums">{qty(l.issued + l.in_kits, l.uom)} {l.uom}</td>
                                        <td className="py-1 text-right"><input className="w-24 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" step={l.uom === 'pcs' ? 1 : 'any'} value={v} onChange={e => setChange({ ...change, rows: new Map(change.rows).set(l.id, e.target.value) })} aria-label={`New quantity ${l.label}`} /> <span className="text-xs text-slate-500">{l.uom}</span></td></tr>
                                );
                            })}
                                {change.add.map((a, i) => (
                                    <tr key={`a${a.item.id}`} className="border-t border-slate-100 bg-violet-50/40"><td className="py-1 text-violet-700">new</td><td className="py-1">{a.item.brand} · {a.item.code}</td><td /><td />
                                        <td className="py-1 text-right"><input className="w-24 px-2 py-1 text-right border border-slate-300 rounded" type="number" min="0" value={a.qty} onChange={e => setChange({ ...change, add: change.add.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} /> <span className="text-xs text-slate-500">{a.item.usage_uom}</span></td></tr>
                                ))}</tbody>
                        </table>
                        <div className="flex gap-2"><input className={inputCls} placeholder="Add an item — search trim items…" value={change.search} onChange={e => setChange({ ...change, search: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') searchChangeItems(change.search); }} /><SecondaryButton onClick={() => searchChangeItems(change.search)}>Search</SecondaryButton></div>
                        {change.items && <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">{change.items.filter(i => !k.lines.some(l => l.item_id === String(i.id) && l.remaining > 0) && !change.add.some(a => a.item.id === i.id)).slice(0, 40).map(i => (
                            <button key={i.id} type="button" className="w-full text-left px-3 py-1.5 text-sm hover:bg-violet-50" onClick={() => setChange({ ...change, add: [...change.add, { item: i, qty: '' }] })}><b>{i.brand} · {i.code}</b>{i.description ? <span className="text-slate-500"> — {i.description}</span> : null}<span className="float-right text-xs text-slate-500">{qty(i.on_hand, i.usage_uom)} {i.usage_uom} in stock</span></button>))}</div>}
                        <Field label="Reason *"><input className={inputCls} value={change.reason} onChange={e => setChange({ ...change, reason: e.target.value })} placeholder="e.g. temporary label until the buyer's arrive" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setChange(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !change.reason.trim() || !changePayload().length} onClick={() => run(() => trimKitsApi.sampleLines(id, changePayload()), () => setChange(null))}>Save {changePayload().length} change(s)</PrimaryButton></div>
                    </div>
                </Modal>
            )}

            {E && (
                <Modal fullScreen title={E.kit ? `Change ${E.kit.kit_no}` : `New kit — ${k.trim_order_no}`} onClose={() => setEdit(null)}>
                    {/* full screen (26 Nov 2026): every column on the store's PC — no clipping, one scroll */}
                    <div className="space-y-3 max-w-[1400px] mx-auto">
                        <p className="text-sm text-slate-600">Tick what goes in <b>this bag</b> and enter what you physically put in. Only what can go in now is listed, each at what can go in (net of the other kits). Untick an item — or a whole stage — to leave it for another kit: it stays owed on the trim order, no reason needed. Less than can go in needs a reason (damaged and count short adjust the stock). {E.kit ? '' : 'The kit number is given when you save — write it on the bag.'}</p>
                        <div className="grid md:grid-cols-3 gap-3">
                            <Field label="Goes to (line)">
                                <select className={inputCls} value={E.line_id} onChange={e => setEdit({ ...E, line_id: e.target.value })}>
                                    <option value="">— any line —</option>
                                    {(() => { const mine = new Set((k.batch_lines || []).map(l => l.id)); return [...E.lines.filter(l => mine.has(l.id)), ...E.lines.filter(l => !mine.has(l.id))]; })()
                                        .map(l => <option key={`${l.id}-${l.stage || ''}`} value={l.id}>{l.name}{l.stage ? ` (${l.stage})` : ''}{(k.batch_lines || []).some(b => b.id === l.id) ? ' — batch is here' : ''}</option>)}
                                </select>
                            </Field>
                            <Field label={`Garment barcode labels${eLabAvail ? ` (${eLabAvail} printed, in no kit)` : ''}`}>
                                {eLabAvail > 0 || E.labelsOn ? (
                                    <div className="flex items-center gap-2">
                                        <label className="inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={E.labelsOn} onChange={e => setEdit({ ...E, labelsOn: e.target.checked })} /> In this kit</label>
                                        {E.labelsOn && <input className={`w-24 px-2 py-1.5 text-right border rounded ${eLabBad ? 'border-rose-400' : 'border-slate-300'}`} type="number" min="1" max={eLabAvail} step="1" value={E.labels} onChange={e => setEdit({ ...E, labels: Number(e.target.value) > eLabAvail ? String(eLabAvail) : e.target.value })} aria-label="Garment labels in this kit" />}
                                        {E.labelsOn && <span className="text-xs text-slate-500">pcs</span>}
                                    </div>
                                ) : <p className="text-sm text-slate-400 py-1.5">{LB ? (LB.remaining - LB.picked > 0 ? 'none printed yet — print them on the trim order' : 'all in kits or handed') : 'no labels on this trim order'}</p>}
                            </Field>
                            <Field label="Note"><input className={inputCls} value={E.notes} onChange={e => setEdit({ ...E, notes: e.target.value })} placeholder="e.g. sewing trims only" /></Field>
                        </div>
                        {E.waiting.length > 0 && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                <b>{E.waiting.length} item{E.waiting.length === 1 ? '' : 's'} can't go in now</b> ({causeText(E.waiting.map(g => ({ cp: pickCaps(g) })))}) — not listed; {E.waiting.length === 1 ? 'it stays' : 'they stay'} owed on the trim order and in Pending to fulfil.
                                {E.waiting.some(g => pickCaps(g).cause === 'res') && <> Reserve on the <a href={bomLink} target="_blank" rel="noreferrer" className="font-bold text-indigo-700 underline">Order BOM</a> (new tab) to bring them in.</>}
                            </div>
                        )}
                        {E.groups.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-500">Stages in this kit</span>
                                {eStages.map(st => {
                                    const n = st.rows.filter(isOn).length; const all = n === st.rows.length;
                                    return (
                                        <button key={st.key} type="button" onClick={() => setStage(st.key, !all)}
                                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-bold ${n ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-400 line-through'}`}>
                                            <input type="checkbox" readOnly checked={all} ref={el => { if (el) el.indeterminate = n > 0 && !all; }} className="pointer-events-none" />
                                            {st.name} <span className="font-normal tabular-nums">{n}/{st.rows.length}</span>
                                        </button>
                                    );
                                })}
                                <button type="button" onClick={() => eStages.forEach(st => setStage(st.key, true))} className="text-xs font-bold text-indigo-700 hover:underline">all</button>
                                <button type="button" onClick={() => eStages.forEach(st => setStage(st.key, false))} className="text-xs font-bold text-indigo-700 hover:underline">none</button>
                            </div>
                        )}
                        {E.groups.length > 0 && (
                            <div>
                                <ItemFilter q={ef.q} setQ={(v) => setEf({ fq: v })} type={ef.type} setType={(v) => setEf({ ftype: v })}
                                    types={[...new Set(E.groups.map(g => g.type_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))} shown={E.groups.filter(eMatch).length} total={E.groups.length} />
                                {eFiltering && <p className="-mt-2 text-xs text-slate-500">Only the list is narrowed — the items not shown keep their tick and amount and are saved as they are.</p>}
                            </div>
                        )}
                        {E.groups.length > 0 ? (
                            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="px-2 py-1.5 w-8" title="In this kit" /><th className="px-2 py-1.5 text-center w-8">#</th><th className="px-2 py-1.5 text-left">Trim type</th><th className="px-2 py-1.5 text-left">Item</th><th className="px-2 py-1.5 text-right">Not in a kit</th><th className="px-2 py-1.5 text-right">In stock</th><th className="px-2 py-1.5 text-right">Reserved</th><th className="px-2 py-1.5 text-right">Can go in now</th><th className="px-2 py-1.5 text-right">Put in</th><th className="px-2 py-1.5 text-left">If less — why</th></tr></thead>
                                    <tbody>{eFiltering && !E.groups.some(eMatch) && <tr><td colSpan={10} className="px-3 py-4 text-center text-sm text-slate-400">No item matches.</td></tr>}
                                    {eStages.map(st => {
                                        const vis = st.rows.filter(eMatch); if (!vis.length) return null;
                                        const n = vis.filter(isOn).length; const all = n === vis.length;
                                        const nAll = st.rows.filter(isOn).length;
                                        return [
                                            <tr key={`st-${st.key}`} className="border-t-2 border-slate-200 bg-slate-100/80">
                                                <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = n > 0 && !all; }} onChange={() => (eFiltering ? setRowsOn(vis, !all) : setStage(st.key, !all))} aria-label={`Put ${st.name} in this kit`} /></td>
                                                <td className="px-2 py-1.5 text-xs font-black uppercase tracking-wider text-slate-700" colSpan={9}>{st.name} <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">{nAll} of {st.rows.length} item{st.rows.length === 1 ? '' : 's'} in this kit{nAll < st.rows.length ? ` · ${st.rows.length - nAll} for another kit` : ''}{eFiltering ? ` · ${vis.length} shown` : ''}</span></td>
                                            </tr>,
                                            ...vis.map(g => {
                                                const r = eRow(g);
                                                const cp = pickCaps(g);
                                                const sh = eShort(g, r); const over = eOver(g, r); const zero = r.on && !(Number(r.v || 0) > 0);
                                                const ov = g.lines.filter(isOver).reduce((a, l) => a + l.to_kit, 0);
                                                const unit = g.in_units ? g.purchase_uom : g.uom;
                                                return (
                                                    <tr key={g.key} className={`border-t border-slate-100 align-top ${!r.on ? 'bg-slate-50 text-slate-400' : over || zero ? 'bg-rose-50/70' : sh ? 'bg-amber-50/60' : ''}`}>
                                                        <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.on} onChange={() => setRow(g, { on: !r.on })} aria-label={`${g.label} in this kit`} /></td>
                                                        <td className="px-2 py-1.5 text-center text-xs tabular-nums">{g.line_no}</td>
                                                        <td className="px-2 py-1.5 text-xs font-semibold whitespace-nowrap">{g.type_name || '—'}</td>
                                                        <td className="px-2 py-1.5"><span className={`font-semibold ${r.on ? 'text-slate-800' : ''}`}>{g.label}</span>{g.extra && <span className="block text-[11px] text-violet-700">extra line · free stock</span>}{ov > 0 && <span className="block text-[11px] text-sky-700">incl. over-cut {qty(ov, g.uom)} {g.uom} (free stock)</span>}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{g.in_units ? `${g.units_to_kit} ${g.purchase_uom}` : `${qty(g.to_kit, g.uom)} ${g.uom}`}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{qty(g.stock_on_hand, g.uom)} {g.uom}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{g.extra ? <span className="text-xs">free stock</span> : <>{qty(reservedOf(g), g.uom)} {g.uom}</>}</td>
                                                        <td className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-bold ${r.on ? 'text-emerald-700' : ''}`}>{qty(cp.total, unit)} {unit}
                                                            {cp.cause && <span className="block text-[11px] font-normal text-slate-500">rest waits — {waitCause(cp.cause)}</span>}</td>
                                                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{r.on ? (<>
                                                            <input className={`w-24 px-2 py-1 text-right border rounded ${over || zero ? 'border-rose-400' : r.capped ? 'border-amber-400' : 'border-slate-300'}`} type="number" min="0" max={cp.total} step={g.in_units || g.uom === 'pcs' ? 1 : 'any'} value={r.v}
                                                                // more than can go in → back to the most that can (26 Nov 2026)
                                                                onChange={e => { const v = e.target.value; setRow(g, Number(v) > cp.total + 1e-9 ? { v: String(cp.total), capped: true } : { v, capped: false }); }} aria-label={`Put in ${g.label}`} /><span className="ml-1 text-xs text-slate-500">{unit}</span>
                                                            {over && <span className="block text-[11px] font-bold text-rose-700 mt-0.5">more than can go in now</span>}
                                                            {r.capped && !over && <span className="block text-[11px] font-bold text-amber-700 mt-0.5">set to the most that can go in</span>}
                                                            {zero && <span className="block text-[11px] font-bold text-rose-700 mt-0.5">untick to leave it out</span>}
                                                        </>) : <span className="text-xs font-bold">another kit</span>}</td>
                                                        <td className="px-2 py-1.5">{sh && (
                                                            <div className="space-y-1 min-w-[200px]">
                                                                <select className={inputCls} value={r.reason} onChange={e => setRow(g, { reason: e.target.value })} aria-label={`Why less ${g.label}`}><option value="">— why less —</option>{Object.entries(SHORT_REASON).map(([kk, lab]) => <option key={kk} value={kk}>{lab}</option>)}</select>
                                                                <input className={inputCls} placeholder={r.reason === 'OTHER' ? 'What happened *' : 'Note'} value={r.note} onChange={e => setRow(g, { note: e.target.value })} />
                                                            </div>)}</td>
                                                    </tr>
                                                );
                                            }),
                                        ];
                                    })}
                                    <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-2 py-1.5" colSpan={8}>{eFiltering ? <span className="text-indigo-700">Showing {E.groups.filter(eMatch).length} · </span> : null}Total · {E.groups.length} item(s) can go in now · {eSkipped} for another kit{E.waiting.length ? ` · ${E.waiting.length} waiting (not listed)` : ''}</td>
                                        <td className="px-2 py-1.5 text-right text-emerald-700">{eGoing + (eLabels > 0 ? 1 : 0)} in this kit</td>
                                        <td className="px-2 py-1.5 text-amber-800">{E.groups.filter(g => eShort(g, eRow(g))).length ? `${E.groups.filter(g => eShort(g, eRow(g))).length} less than could go in` : ''}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No item can go in a kit now{eLabAvail ? ' — only the garment labels' : ''}.</p>
                        )}
                        {(eBlocked.length > 0 || eZero.length > 0 || eLabBad) && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                                {eBlocked.length > 0 && <p><b>{eBlocked.length} item{eBlocked.length === 1 ? '' : 's'} more than can go in now</b> — the stock or {k.order_no}'s reservation moved since this kit was made. Put in at most what can go in.</p>}
                                {eZero.length > 0 && <p><b>{eZero.length} ticked item{eZero.length === 1 ? '' : 's'} at 0</b> — untick {eZero.length === 1 ? 'it' : 'them'} to leave for another kit, or enter what went in.</p>}
                                {eLabBad && <p><b>Garment labels:</b> 1 to {eLabAvail} — or untick them.</p>}
                            </div>
                        )}
                        <ErrorBox text={formError} />
                        <div className="flex flex-wrap justify-end gap-2"><SecondaryButton onClick={() => setEdit(null)}>Back</SecondaryButton>
                            <SecondaryButton disabled={busy || !eReady} onClick={() => saveKit(false)}><Save size={14} /> {E.kit ? 'Save changes' : 'Save kit — being prepared'}</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !eReady} onClick={() => saveKit(true)}>
                                <PackageCheck size={14} /> {`Save and mark ready — ${eGoing + (eLabels > 0 ? 1 : 0)} item(s)${eGoingStages.length ? ` · ${eGoingStages.join(', ')}` : ''}`}</PrimaryButton></div>
                    </div>
                </Modal>
            )}

            {extra && (
                <Modal title={`Extra line for ${extra.line.label}`} onClose={() => setExtra(null)}>
                    <div className="space-y-3 w-[min(620px,92vw)] max-h-[80vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">{handout(extra.line, extra.line.remaining)} still owed. Propose another item from <b>free stock</b>; the merchandiser approves — then this line is closed as replaced and the extra line goes in a kit like any other.</p>
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
                <Modal title={`Garment labels — ${k.trim_order_no}`} onClose={() => { setLabelsOpen(false); load(); }}>
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
                        <p className="text-xs text-slate-500">On the trim order: {basis.lines.map(l => `${PART_LABEL[l.part] || l.part} ${handout(l)}`).join(' + ')}{basis.lines.length > 1 ? ` = ${handout(basis, basis.qty)}` : ''}{(basis.in_units || basis.uom === 'pcs') ? ` — rounded up once for the batch to whole ${basis.in_units ? `${basis.purchase_uom}s` : 'pieces'}${basis.lines.length > 1 ? '; the order’s share is its own need rounded up, over-cut gets the rest' : ''}` : ''}.</p>
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

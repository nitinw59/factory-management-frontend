// One purchase requisition: lines (item, quantity in purchase units, on PO,
// received, still to order, needed-by / late; per line the orders it covers —
// each order's whole position on the item — and its spare (MOQ / pack surplus that
// covers future orders — item-level netting)), actions by
// status and role, history, PDF / Excel. Merchandisers edit and submit;
// the purchase manager approves or rejects. Store requisitions (purpose STORE:
// spares, general items) have no orders behind them; the store edits them.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Undo2, CheckCircle2, XCircle, Ban, Pencil, Trash2, FileDown, FileSpreadsheet, Info, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { adminApi } from '../../api/adminApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { PR_STATUS, exportPrPdf, exportPrExcel } from './prShared';
import StoreItemPicker from '../store/StoreItemPicker';

const EDITABLE = ['DRAFT', 'REJECTED'];
const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const ACTION = { CREATED: 'Created', EDITED: 'Edited', SUBMITTED: 'Submitted', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled', LINE_CLOSED: 'Line closed', NOTED: 'Marked handled' };
const LINE_STATUS = { REJECTED: ['Rejected', 'bg-rose-100 text-rose-800 border-rose-200'], CLOSED: ['Closed', 'bg-slate-200 text-slate-700 border-slate-300'] };

export default function PurchaseRequisitionPage() {
    const { id } = useParams();
    const [pr, setPr] = useState(null);
    const [perms, setPerms] = useState({ plan: false, prApprove: false, storeRequisition: false });
    const [adding, setAdding] = useState(null);    // store: { item, qty }
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null); // line edit form
    const [ask, setAsk] = useState(null);         // reason prompt
    const [askText, setAskText] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [deciding, setDeciding] = useState(null);   // approval with a decision per line: { [lineId]: { decision, qty, reason } }
    const [chip, setChip] = useState('');           // lines filter (17 Oct 2026): '' | TO_ORDER | LATE | ON_PO | NOT_NEEDED | SURPLUS | CLOSED
    const [openLines, setOpenLines] = useState(() => new Set());   // lines showing who they're for (29 Oct 2026)
    const [q, setQ] = useState('');

    const load = useCallback(() => planningApi.pr(id).then(res => setPr(res.data)).catch(err => setError(apiError(err, 'Failed to load the requisition.'))), [id]);
    useEffect(() => {
        load();
        planningApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, [load]);

    if (!pr) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const store = pr.purpose === 'STORE';
    // Production: the merchandiser, or a store when every line is its own kind (decided 6 Oct 2026).
    const myKinds = perms.plan_kinds || (perms.plan ? ['FABRIC', 'TRIM'] : []);
    const canEdit = store ? perms.storeRequisition : (perms.plan || (myKinds.length > 0 && pr.lines.every(l => myKinds.includes(l.kind))));
    const editable = canEdit && EDITABLE.includes(pr.status);
    const canCancel = (canEdit && ['DRAFT', 'SUBMITTED', 'REJECTED'].includes(pr.status)) || (perms.prApprove && pr.status !== 'CANCELLED');

    const act = async (fn) => {
        setBusy(true); setError('');
        try { setPr((await fn()).data); } catch (err) { setError(apiError(err, 'Action failed.')); } finally { setBusy(false); }
    };
    const runForm = async (fn, close) => {
        setBusy(true); setFormError('');
        try { setPr((await fn()).data); close(); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const exportPdf = async () => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* letterhead is optional */ }
        exportPrPdf(pr, company);
    };

    return (
        <div>
            <Link to={store ? '/v3/store/requisitions' : '/v3/planning/purchase-requisitions'} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> {store ? 'Store requisitions' : 'Purchase requisitions'}</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{pr.pr_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PR_STATUS[pr.status].cls}`}>{PR_STATUS[pr.status].label}</span>
                {store && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-300">Store</span>}
                <span className="text-sm text-slate-500">raised by {pr.created_by_name || '—'} on {new Date(pr.created_at).toLocaleDateString('en-IN')}</span>
            </div>
            {pr.status === 'REJECTED' && pr.rejected_reason && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2"><b>Rejected:</b> {pr.rejected_reason}. Fix it, then submit again.</div>}
            {pr.status === 'CANCELLED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{pr.cancelled_by_name ? ` by ${pr.cancelled_by_name}` : ''}: {pr.cancelled_reason}</div>}
            {pr.status === 'APPROVED' && <p className="text-sm text-emerald-700 mb-3">Approved {new Date(pr.approved_at).toLocaleString()}{pr.approved_by_name ? ` by ${pr.approved_by_name}` : ''}. {store ? 'Purchasing will order it on a purchase order.' : 'Counts as on order for planning; purchasing will turn it into purchase orders.'}</p>}
            {pr.uncommitted_lines > 0 && pr.status !== 'CANCELLED' && (
                <div className="mb-3 text-sm bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-3 py-2 flex items-start gap-2"><Info size={15} className="mt-0.5 shrink-0" />
                    {pr.uncommitted_lines} line(s) bring more than today's orders need (minimum order, pack size, or an order that shrank). The extra is not lost: planning counts it as incoming and uses it for the next orders before anything is raised again.</div>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
                {editable && <PrimaryButton onClick={() => act(() => planningApi.prAction(id, 'submit'))} busy={busy} disabled={busy || !pr.lines.length}><Send size={14} /> Submit for approval</PrimaryButton>}
                {canEdit && pr.status === 'SUBMITTED' && <SecondaryButton onClick={() => act(() => planningApi.prAction(id, 'withdraw'))} disabled={busy}><Undo2 size={14} /> Withdraw</SecondaryButton>}
                {perms.prApprove && pr.status === 'SUBMITTED' && <>
                    <PrimaryButton onClick={() => { setFormError(''); setDeciding(Object.fromEntries(pr.lines.map(l => [l.id, { decision: 'APPROVE', qty: String(l.purchase_qty), reason: '' }]))); }} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Approve…</PrimaryButton>
                    <SecondaryButton onClick={() => askReason({ title: `Reject ${pr.pr_no}`, confirm: 'Reject', run: (r) => planningApi.prAction(id, 'reject', r) })} disabled={busy}><XCircle size={14} /> Reject</SecondaryButton>
                </>}
                {editable && store && <SecondaryButton onClick={() => { setFormError(''); setAdding({ item: null, qty: '1' }); }}><Plus size={14} /> Add item</SecondaryButton>}
                {editable && !store && <Link to="/v3/planning/buy-list" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"><Plus size={14} /> Add from buy list</Link>}
                {canCancel && <SecondaryButton onClick={() => askReason({ title: `Cancel ${pr.pr_no}`, confirm: 'Cancel requisition', run: (r) => planningApi.prAction(id, 'cancel', r) })} disabled={busy}><Ban size={14} /> Cancel</SecondaryButton>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={exportPdf}><FileDown size={14} /> PDF</SecondaryButton>
                    <SecondaryButton onClick={() => exportPrExcel(pr)}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </span>
            </div>
            <ErrorBox text={error} />
            {pr.sent_back_lines > 0 && (
                <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2">
                    <b>{pr.sent_back_lines} line(s) sent back by purchasing</b> — they no longer count as on order; their need is back {store ? 'on the reorder list' : 'on the buy list'}.
                    <ul className="list-disc ml-5 mt-1 text-xs">{pr.lines.filter(l => l.line_status !== 'OPEN' && !l.noted_at).map(l => <li key={l.id}>Line {l.line_no} {l.label}: <b>{l.line_status.toLowerCase()}</b> — {l.decision_reason}</li>)}</ul>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <Link to={store ? '/v3/store/reorder' : '/v3/planning/buy-list'} className="px-3 py-1 rounded-lg text-xs font-bold bg-white border border-rose-300 text-rose-800 hover:bg-rose-100">{store ? 'Open the reorder list' : 'Open the buy list'} to raise again</Link>
                        {canEdit && <button type="button" onClick={() => act(() => planningApi.notedPr(id))} className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-800" disabled={busy}>Mark handled</button>}
                    </div>
                </div>
            )}
            {pr.notes && <p className="text-sm text-slate-600 mb-3 whitespace-pre-line"><b>Notes:</b> {pr.notes}</p>}

            {/* Lines (17 Oct 2026): filter chips, search, grouped by type. Columns (29 Oct 2026, owner: the line "is very bad
                UI"): requested · on PO · received · still to order · needed by (late), a totals row per unit, and per line
                "who it's for" — each order's whole position on the item, so the line's share reads against it. */}
            {(() => {
                const today = todayLocal();
                const live = pr.status === 'APPROVED';   // only an approved requisition has something to order, and can be late
                const lateDays = (l) => (live && l.line_status === 'OPEN' && l.needed_by && l.needed_by < today && l.received + l.short_closed + 0.0005 < l.usage_qty
                    ? Math.round((new Date(today) - new Date(l.needed_by)) / 86400000) : 0);
                const CHIPS = [
                    ['TO_ORDER', 'Still to order', (l) => live && l.to_order > 0, 'bg-amber-50 text-amber-800 border-amber-200'],
                    ['LATE', 'Late', (l) => lateDays(l) > 0, 'bg-rose-50 text-rose-700 border-rose-200'],
                    ['ON_PO', 'On PO', (l) => l.on_po > 0, 'bg-indigo-50 text-indigo-700 border-indigo-200'],
                    ['NOT_NEEDED', 'Not needed', (l) => l.line_status === 'OPEN' && l.not_needed_qty > 0, 'bg-rose-50 text-rose-700 border-rose-200'],
                    ['SURPLUS', 'With spare', (l) => l.uncommitted > 0, 'bg-sky-50 text-sky-800 border-sky-200'],
                    ['CLOSED', 'Closed / rejected', (l) => l.line_status !== 'OPEN', 'bg-slate-100 text-slate-700 border-slate-300'],
                ];
                const test = Object.fromEntries(CHIPS.map(c => [c[0], c[2]]));
                const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
                const shown = pr.lines.filter(l => (!chip || test[chip](l)) && (!words.length || words.every(w => `${l.label} ${l.type_name || ''} ${l.notes || ''}`.toLowerCase().includes(w))));
                const groups = new Map();
                for (const l of shown) { const g = l.type_name || 'Other'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(l); }
                const stateOf = (l) => (!live || l.line_status !== 'OPEN' ? null
                    : l.to_order > 0.0005 ? (l.on_po > 0 ? ['Partly on PO', 'bg-amber-50 text-amber-800 border-amber-200'] : ['Not on PO', 'bg-amber-50 text-amber-800 border-amber-200'])
                    : l.received + l.short_closed + 0.0005 >= l.usage_qty ? ['Received', 'bg-emerald-50 text-emerald-700 border-emerald-200'] : ['On PO', 'bg-indigo-50 text-indigo-700 border-indigo-200']);
                const poLinks = (l) => (l.purchase_orders || []).map((p, i) => <span key={p.po_id}>{i ? ', ' : ''}<Link to={`/v3/purchasing/orders/${p.po_id}`} className="underline">{p.po_no}</Link>{p.status === 'DRAFT' ? ' (draft)' : p.status === 'SHORT_CLOSED' ? ' (short-closed)' : ''}</span>);
                const hasSplit = (l) => !store && (l.orders.length > 0 || l.uncommitted > 0);
                const toggle = (lid) => setOpenLines(s => { const n = new Set(s); if (n.has(lid)) n.delete(lid); else n.add(lid); return n; });
                const splitLines = shown.filter(hasSplit);
                const allOpen = splitLines.length > 0 && splitLines.every(l => openLines.has(l.id));
                // totals per unit (lines can be in yd, m, pcs …): open lines only
                const totals = (f, unit = (l) => l.uom) => {
                    const m = new Map();
                    for (const l of shown) if (l.line_status === 'OPEN' && f(l) > 0) m.set(unit(l), (m.get(unit(l)) || 0) + f(l));
                    return [...m].map(([u, v]) => `${fmt(v, u)} ${u}`);
                };
                const openCount = shown.filter(l => l.line_status === 'OPEN').length;
                const TotalCell = ({ vals, cls = '' }) => <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${cls}`}>{vals.length ? vals.map(v => <span key={v} className="block">{v}</span>) : '—'}</td>;
                const cols = 7;
                const num = (v, uom, cls = '') => (v > 0.0005 ? <span className={cls}><b>{fmt(v, uom)}</b> <span className="text-xs font-normal text-slate-500">{uom}</span></span> : <span className="text-slate-300">—</span>);
                return (
                    <>
                        {pr.lines.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                {CHIPS.map(([k, label, f, cls]) => {
                                    const n = pr.lines.filter(f).length;
                                    if (!n && chip !== k) return null;
                                    return <button key={k} type="button" onClick={() => setChip(chip === k ? '' : k)} title={chip === k ? 'Show all lines' : `Show only: ${label.toLowerCase()}`}
                                        className={`text-xs font-bold px-2 py-0.5 rounded border ${cls} ${chip === k ? 'ring-2 ring-offset-1 ring-indigo-500' : chip ? 'opacity-50 hover:opacity-100' : ''}`}>{n} {label.toLowerCase()}</button>;
                                })}
                                {splitLines.length > 0 && <button type="button" onClick={() => setOpenLines(allOpen ? new Set() : new Set(splitLines.map(l => l.id)))}
                                    className="text-xs font-semibold text-indigo-700 hover:underline">{allOpen ? 'Hide orders' : 'Show orders for every line'}</button>}
                                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item, type, notes…" aria-label="Search lines" className="ml-auto px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white w-56" />
                                {(chip || q) && <span className="text-xs text-slate-500">{shown.length} of {pr.lines.length} lines</span>}
                            </div>
                        )}
                        <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[75vh] mb-4">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead className="sticky top-0 z-[1] bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    <tr className="text-left"><th className="px-3 py-2.5 w-10">#</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Requested</th>
                                        <th className="px-3 py-2.5 text-right">On PO</th><th className="px-3 py-2.5 text-right">Received</th>
                                        <th className="px-3 py-2.5 text-right" title="Approved but not on any purchase order yet">Still to order</th><th className="px-3 py-2.5">Needed by</th>{editable && <th className="px-3 py-2.5 w-16" />}</tr>
                                </thead>
                                <tbody>
                                    {pr.lines.length === 0 && <tr><td colSpan={cols + 1} className="px-4 py-6 text-center text-slate-400">No lines. Add items {store ? 'with “Add item”' : 'from the buy list'}.</td></tr>}
                                    {pr.lines.length > 0 && shown.length === 0 && <tr><td colSpan={cols + 1} className="px-4 py-6 text-center text-slate-400">No line matches.</td></tr>}
                                    {[...groups.entries()].map(([g, ls]) => (
                                        <Fragment key={g}>
                                            <tr className="bg-slate-50 border-t border-slate-200"><td colSpan={cols + 1} className="px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-600">{g} <span className="font-semibold normal-case tracking-normal text-slate-400">({ls.length})</span></td></tr>
                                            {ls.map(l => {
                                                const st = stateOf(l);
                                                const late = lateDays(l);
                                                const isOpen = openLines.has(l.id);
                                                return (
                                                <Fragment key={l.id}>
                                                <tr className="border-t border-slate-100 align-top">
                                                    <td className="px-3 py-2.5">{l.line_no}</td>
                                                    <td className={`px-3 py-2.5 ${l.line_status !== 'OPEN' ? 'opacity-70' : ''}`}><Link to={store ? `/v3/store/items/${l.item_id}` : `/v3/planning/position/${l.kind}/${l.item_id}`} className={`font-semibold text-indigo-700 hover:underline ${l.line_status !== 'OPEN' ? 'line-through' : ''}`}>{l.label}</Link>
                                                        {st && <span className={`ml-2 text-[10px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap ${st[1]}`}>{st[0]}</span>}
                                                        {l.notes && <span className="block text-xs text-slate-500">{l.notes}</span>}
                                                        {LINE_STATUS[l.line_status] && <span className="block mt-1 text-xs"><span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${LINE_STATUS[l.line_status][1]}`}>{LINE_STATUS[l.line_status][0]}</span> <span className="text-slate-600">{l.decision_reason}</span>{l.decided_by_name ? <span className="text-slate-400"> · {l.decided_by_name}</span> : null}{l.noted_at ? <span className="text-slate-400"> · handled</span> : null}</span>}
                                                        {/* (16 Oct 2026) its orders are covered by a firm PO's free quantity: not needed — close it rather than order it twice */}
                                                        {l.line_status === 'OPEN' && l.not_needed_qty > 0 && pr.status !== 'CANCELLED' && (
                                                            <span className="block mt-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                                                Not needed{l.not_needed_qty + 1e-9 < l.usage_qty ? ` for ${fmt(l.not_needed_qty, l.uom)} ${l.uom}` : ''}: its order is covered by {l.covered_by_po.map((p, i) => <span key={p.po_id}>{i ? ', ' : ''}<Link to={`/v3/purchasing/orders/${p.po_id}`} className="underline">{p.po_no}</Link></span>)} — close the line so it isn’t ordered twice.
                                                            </span>
                                                        )}
                                                        {l.requested_qty != null && <span className="block mt-1 text-xs text-amber-800"><b>Reduced</b> from {fmt(l.requested_qty, 'pcs')} {l.purchase_uom} — {l.decision_reason}{l.decided_by_name ? <span className="text-slate-400"> · {l.decided_by_name}</span> : null}</span>}
                                                        {hasSplit(l) && (
                                                            <button type="button" onClick={() => toggle(l.id)} aria-expanded={isOpen}
                                                                className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700">
                                                                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                                For {l.orders.length} order{l.orders.length === 1 ? '' : 's'}{l.orders.some(o => o.from_surplus) ? ` (${l.orders.filter(o => o.from_surplus).length} not in the request)` : ''}
                                                                {l.uncommitted > 0 && <span className="text-sky-700">· {fmt(l.uncommitted, l.uom)} {l.uom} spare</span>}
                                                            </button>
                                                        )}
                                                        {perms.prApprove && pr.status === 'APPROVED' && l.line_status === 'OPEN' && !(l.on_po > 0) && !(l.purchase_orders || []).length && (
                                                            <button type="button" className="mt-1 block text-[11px] font-bold text-rose-700 hover:underline"
                                                                onClick={() => askReason({ title: `Close line ${l.line_no} — ${l.label}`, confirm: 'Close line', run: (r) => planningApi.closePrLine(id, l.id, r) })}>Close line</button>
                                                        )}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"><b>{fmt(l.purchase_qty, 'pcs')}</b> <span className="text-xs text-slate-500">{l.purchase_uom}</span>
                                                        {(l.purchase_uom !== l.uom || Number(l.factor) !== 1) && <span className="block text-[11px] text-slate-500">= {fmt(l.usage_qty, l.uom)} {l.uom}</span>}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{num(l.on_po, l.uom, 'text-indigo-700')}
                                                        {l.purchase_orders.length > 0 && <span className="block text-[11px] text-indigo-700">{poLinks(l)}</span>}
                                                        {l.short_closed > 0 && <span className="block text-[11px] font-semibold text-rose-700">{fmt(l.short_closed, l.uom)} short-closed — not coming</span>}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{num(l.received, l.uom, l.on_po > 0 && l.received + 0.0005 >= l.on_po ? 'text-emerald-700' : '')}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{num(l.to_order, l.uom, live ? 'text-amber-700' : '')}</td>
                                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(l.needed_by)}{late > 0 && <span className="block text-xs font-bold text-rose-700">{late} day{late === 1 ? '' : 's'} late</span>}</td>
                                                    {editable && (
                                                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                            <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit line ${l.line_no}`}
                                                                onClick={() => { setFormError(''); setEditing({ line: l, purchase_qty: String(l.purchase_qty), needed_by: l.needed_by || '', notes: l.notes || '' }); }}><Pencil size={14} /></button>
                                                            <button type="button" className="p-1 rounded text-rose-500 hover:bg-rose-50" aria-label={`Remove line ${l.line_no}`}
                                                                onClick={() => { if (window.confirm(store ? `Remove line ${l.line_no}?` : `Remove line ${l.line_no}? Its need goes back on the buy list.`)) act(() => planningApi.removePrLine(id, l.id)); }}><Trash2 size={14} /></button>
                                                        </td>
                                                    )}
                                                </tr>
                                                {isOpen && <tr><td /><td colSpan={cols - 1 + (editable ? 1 : 0)} className="px-3 pb-3"><OrderSplit l={l} live={live} /></td></tr>}
                                                </Fragment>
                                                );
                                            })}
                                        </Fragment>
                                    ))}
                                </tbody>
                                {openCount > 0 && (
                                    <tfoot className="sticky bottom-0 bg-slate-50 border-t-2 border-slate-200 font-bold">
                                        <tr><td /><td className="px-3 py-2.5">Total · {openCount} open line{openCount === 1 ? '' : 's'}</td>
                                            <TotalCell vals={totals(l => l.purchase_qty, l => l.purchase_uom)} />
                                            <TotalCell vals={totals(l => l.on_po)} cls="text-indigo-700" />
                                            <TotalCell vals={totals(l => l.received)} />
                                            <TotalCell vals={totals(l => l.to_order)} cls={live ? 'text-amber-700' : ''} />
                                            <td colSpan={editable ? 2 : 1} /></tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </>
                );
            })()}

            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                <div className="divide-y divide-slate-100 text-sm">
                    {pr.history.map(h => (
                        <div key={h.id} className="py-1.5">
                            <span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>
                            {h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                            {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                        </div>
                    ))}
                </div>
            </div>

            {deciding && (
                <Modal title={`Approve ${pr.pr_no} — decide each line`} onClose={() => setDeciding(null)}>
                    <div className="space-y-3 w-[min(820px,94vw)]">
                        <p className="text-sm text-slate-600">Approve a line as asked, approve a lower quantity, or reject it — with the reason. Rejected lines (and the cut quantity) go back {store ? 'on the reorder list' : 'on the buy list'}, and {pr.created_by_name || 'the person who raised it'} sees them on My work.</p>
                        <div className="max-h-[55vh] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                            {pr.lines.map(l => {
                                const d = deciding[l.id];
                                const set = (patch) => setDeciding({ ...deciding, [l.id]: { ...d, ...patch } });
                                return (
                                    <div key={l.id} className={`p-3 ${d.decision === 'REJECT' ? 'bg-rose-50/60' : d.decision === 'REDUCE' ? 'bg-amber-50/60' : ''}`}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <b className="text-slate-800">{l.line_no}. {l.label}</b>
                                            <span className="text-sm text-slate-600 tabular-nums">{fmt(l.purchase_qty, 'pcs')} {l.purchase_uom} (= {fmt(l.usage_qty, l.uom)} {l.uom})</span>
                                            <span className="ml-auto inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold">
                                                {[['APPROVE', 'Approve'], ['REDUCE', 'Reduce'], ['REJECT', 'Reject']].map(([k, label]) => (
                                                    <button key={k} type="button" onClick={() => set({ decision: k })}
                                                        className={`px-3 py-1.5 ${d.decision === k ? (k === 'REJECT' ? 'bg-rose-600 text-white' : k === 'REDUCE' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>
                                                ))}
                                            </span>
                                        </div>
                                        {d.decision !== 'APPROVE' && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {d.decision === 'REDUCE' && <input className={`${inputCls} !w-36 !py-1`} type="number" min="0" step="any" value={d.qty} onChange={e => set({ qty: e.target.value })} aria-label={`Approved quantity, line ${l.line_no}`} placeholder={`below ${l.purchase_qty}`} />}
                                                <input className={`${inputCls} flex-1 min-w-[220px] !py-1`} value={d.reason} maxLength={1000} onChange={e => set({ reason: e.target.value })} placeholder={d.decision === 'REJECT' ? 'Why rejected * (e.g. not needed yet, wrong item)' : 'Why reduced * (e.g. stock in hand, MOQ)'} aria-label={`Reason, line ${l.line_no}`} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <ErrorBox text={formError} />
                        {(() => {
                            const ds = Object.values(deciding);
                            const rej = ds.filter(d => d.decision === 'REJECT').length;
                            const red = ds.filter(d => d.decision === 'REDUCE').length;
                            const incomplete = Object.entries(deciding).some(([lid, d]) => d.decision !== 'APPROVE' && (!d.reason.trim() || (d.decision === 'REDUCE' && !(Number(d.qty) > 0 && Number(d.qty) < pr.lines.find(l => l.id === lid).purchase_qty))));
                            return (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <span className="text-xs text-slate-500 mr-auto">{ds.length - rej - red} as asked · {red} reduced · {rej} rejected</span>
                                    <SecondaryButton onClick={() => setDeciding(null)}>Cancel</SecondaryButton>
                                    <PrimaryButton busy={busy} disabled={busy || incomplete || rej === ds.length}
                                        onClick={() => runForm(() => planningApi.approvePr(id, Object.entries(deciding).filter(([, d]) => d.decision !== 'APPROVE').map(([lid, d]) => ({ line_id: lid, decision: d.decision, qty: d.decision === 'REDUCE' ? Number(d.qty) : undefined, reason: d.reason.trim() }))), () => setDeciding(null))}>
                                        {rej === ds.length ? 'Every line rejected — use Reject' : `Approve ${ds.length - rej} line(s)`}
                                    </PrimaryButton>
                                </div>
                            );
                        })()}
                    </div>
                </Modal>
            )}

            {editing && (
                <Modal title={`Line ${editing.line.line_no} — ${editing.line.label}`} onClose={() => setEditing(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        <Field label={`Quantity (${editing.line.purchase_uom}) *`} hint={store ? `Whole ${editing.line.purchase_uom} (= ${editing.line.factor} ${editing.line.uom} each).` : `At least ${editing.line.min_purchase_qty} ${editing.line.purchase_uom} — what the orders it was raised for still need. Raise it for a minimum order or pack size; the extra stays counted as incoming and covers the next orders.`}>
                            <input className={inputCls} type="number" min={editing.line.min_purchase_qty} step="1" value={editing.purchase_qty} onChange={e => setEditing({ ...editing, purchase_qty: e.target.value })} autoFocus />
                        </Field>
                        <Field label="Needed by"><input className={inputCls} type="date" value={editing.needed_by} onChange={e => setEditing({ ...editing, needed_by: e.target.value })} /></Field>
                        <Field label="Notes"><input className={inputCls} value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => runForm(() => planningApi.updatePrLine(id, editing.line.id, { purchase_qty: Number(editing.purchase_qty), needed_by: editing.needed_by || null, notes: editing.notes }), () => setEditing(null))}
                                busy={busy} disabled={busy || !(Number(editing.purchase_qty) > 0)}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adding && (
                <Modal title={`Add a store item to ${pr.pr_no}`} onClose={() => setAdding(null)}>
                    <div className="space-y-3 w-[min(520px,90vw)]">
                        {adding.item ? <p className="text-sm"><b>{adding.item.label}</b> <button type="button" className="ml-2 text-indigo-700 font-semibold" onClick={() => setAdding({ ...adding, item: null })}>change</button></p>
                            : <StoreItemPicker exclude={pr.lines.map(l => String(l.item_id))} onPick={(item) => setAdding({ ...adding, item })} />}
                        {adding.item && <Field label={`Quantity (${adding.item.purchase_uom}) *`}><input className={inputCls} type="number" min="1" step="1" value={adding.qty} onChange={e => setAdding({ ...adding, qty: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdding(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => runForm(() => planningApi.addPrLines(id, [{ store_item_id: adding.item.id, purchase_qty: Number(adding.qty) }]), () => setAdding(null))}
                                busy={busy} disabled={busy || !adding.item || !(Number(adding.qty) > 0)}>Add</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => runForm(() => ask.run(askText.trim()), () => setAsk(null))} busy={busy} disabled={busy || !askText.trim()}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// (29 Oct 2026) Who a line is for: each order's whole position on the item — needs = already has (issued + allocated +
// free stock) + on open POs + this line + other requisitions + still short — then the line's spare, and a total.
// "This line" is its part not on a PO yet; its PO part counts under "On open POs" until received, then under "Already has".
function OrderSplit({ l, live }) {
    const u = l.uom;
    const v = (x, cls = '') => (x > 0.0005 ? <span className={cls}>{fmt(x, u)}</span> : <span className="text-slate-300">—</span>);
    const sum = (f) => l.orders.reduce((s, o) => s + (f(o) || 0), 0);
    const TD = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap';
    return (
        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-slate-50/50">
            <table className="w-full text-xs">
                <thead className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100">
                    <tr className="text-left"><th className="px-2 py-1.5">Order ({u})</th><th className={TD}>Raised for</th><th className={TD}>Needs</th><th className={TD}>Already has</th>
                        <th className={TD}>On open POs</th><th className={TD}>Other requisitions</th><th className={`${TD} bg-amber-50`}>This line{live ? ', to order' : ''}</th><th className={TD}>Still short</th></tr>
                </thead>
                <tbody>
                    {l.orders.map(o => {
                        const p = o.position;
                        const has = p ? [p.issued > 0 && `${fmt(p.issued, u)} issued`, p.allocated > 0 && `${fmt(p.allocated, u)} allocated`, p.from_stock > 0 && `${fmt(p.from_stock, u)} free stock — allocate it`].filter(Boolean) : [];
                        const note = [
                            o.order_status === 'CANCELLED' && <span key="c" className="font-bold text-rose-600">order cancelled</span>,
                            o.from_surplus && <span key="s" className="text-sky-700">not in the request — uses this line’s spare</span>,
                            !o.from_surplus && p?.only_line && Math.abs(p.needs - o.raised_for) >= 1   /* below a unit is rounding */ && <span key="g" className="text-slate-600">need {p.needs > o.raised_for ? 'grew' : 'dropped'} {fmt(Math.abs(p.needs - o.raised_for), u)} since raised</span>,
                        ].filter(Boolean);
                        return (
                            <tr key={o.order_id} className="border-t border-slate-200 align-top">
                                <td className="px-2 py-1.5"><Link to={`/v3/planning/orders/${o.order_id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{o.order_no}</Link>
                                    {note.length > 0 && <span className="block text-[10px] leading-tight max-w-[14rem]">{note.map((x, i) => <span key={i} className="block">{x}</span>)}</span>}</td>
                                <td className={`${TD} text-slate-500`}>{o.from_surplus ? '—' : fmt(o.raised_for, u)}</td>
                                <td className={`${TD} font-semibold`}>{p ? fmt(p.needs, u) : '—'}</td>
                                <td className={TD}>{p ? v(p.has) : '—'}{has.length > 0 && <span className="block text-[10px] text-slate-500">{has.join(' · ')}</span>}</td>
                                <td className={TD}>{p ? v(p.on_po, 'text-indigo-700') : '—'}</td>
                                <td className={TD}>{p ? v(p.other_prs) : '—'}</td>
                                <td className={`${TD} bg-amber-50/60 font-bold`}>{v(o.covers, live ? 'text-amber-700' : '')}</td>
                                <td className={TD}>{p ? v(p.short, 'font-bold text-rose-700') : '—'}</td>
                            </tr>
                        );
                    })}
                    {l.uncommitted > 0 && (
                        <tr className="border-t border-slate-200">
                            <td className="px-2 py-1.5 font-semibold text-sky-700" colSpan={6}>Spare — no order needs it yet (minimum order, pack size, rounding or a need that dropped); planning uses it for the next order</td>
                            <td className={`${TD} bg-amber-50/60 font-bold text-sky-700`}>{fmt(l.uncommitted, u)}</td><td />
                        </tr>
                    )}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 font-bold bg-slate-100">
                    <tr><td className="px-2 py-1.5">Total</td><td className={`${TD} text-slate-500`}>{fmt(sum(o => o.raised_for), u)}</td>
                        <td className={TD}>{fmt(sum(o => o.position?.needs), u)}</td><td className={TD}>{fmt(sum(o => o.position?.has), u)}</td>
                        <td className={TD}>{fmt(sum(o => o.position?.on_po), u)}</td><td className={TD}>{fmt(sum(o => o.position?.other_prs), u)}</td>
                        <td className={`${TD} bg-amber-50`}>{fmt(sum(o => o.covers) + (l.uncommitted || 0), u)}</td>
                        <td className={`${TD} ${sum(o => o.position?.short) > 0.0005 ? 'text-rose-700' : ''}`}>{fmt(sum(o => o.position?.short), u)}</td></tr>
                </tfoot>
            </table>
        </div>
    );
}

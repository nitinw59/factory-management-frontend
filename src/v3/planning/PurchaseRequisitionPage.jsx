// One purchase requisition: lines (item, quantity in purchase units, needed-by,
// what it covers now per order and what is uncommitted (MOQ / pack surplus that
// covers future orders — item-level netting), actions by
// status and role, history, PDF / Excel. Merchandisers edit and submit;
// the purchase manager approves or rejects. Store requisitions (purpose STORE:
// spares, general items) have no orders behind them; the store edits them.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Undo2, CheckCircle2, XCircle, Ban, Pencil, Trash2, FileDown, FileSpreadsheet, Info, Plus } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { adminApi } from '../../api/adminApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PR_STATUS, exportPrPdf, exportPrExcel } from './prShared';
import StoreItemPicker from '../store/StoreItemPicker';

const EDITABLE = ['DRAFT', 'REJECTED'];
const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const ACTION = { CREATED: 'Created', EDITED: 'Edited', SUBMITTED: 'Submitted', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };

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
                    <PrimaryButton onClick={() => { if (window.confirm(`Approve ${pr.pr_no}? Purchasing can then order it.`)) act(() => planningApi.prAction(id, 'approve')); }} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Approve</PrimaryButton>
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
            {pr.notes && <p className="text-sm text-slate-600 mb-3 whitespace-pre-line"><b>Notes:</b> {pr.notes}</p>}

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr className="text-left"><th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Quantity</th><th className="px-3 py-2.5 text-right">= Usage</th>
                            {!store && <th className="px-3 py-2.5 text-right">Covers orders</th>}<th className="px-3 py-2.5">Needed by</th>{!store && <th className="px-3 py-2.5">Orders it covers</th>}{store && <th className="px-3 py-2.5">On PO</th>}{editable && <th className="px-3 py-2.5 w-20" />}</tr>
                    </thead>
                    <tbody>
                        {pr.lines.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No lines. Add items {store ? 'with “Add item”' : 'from the buy list'}.</td></tr>}
                        {pr.lines.map(l => (
                            <Fragment key={l.id}>
                                <tr className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-2.5">{l.line_no}</td>
                                    <td className="px-3 py-2.5"><Link to={store ? `/v3/store/items/${l.item_id}` : `/v3/planning/position/${l.kind}/${l.item_id}`} className="font-semibold text-indigo-700 hover:underline">{l.label}</Link>
                                        <span className="block text-xs text-slate-500">{l.type_name}{l.notes ? ` · ${l.notes}` : ''}</span></td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-black whitespace-nowrap">{fmt(l.purchase_qty, 'pcs')} <span className="text-xs font-normal text-slate-500">{l.purchase_uom}</span></td>
                                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(l.usage_qty, l.uom)} <span className="text-xs text-slate-500">{l.uom}</span></td>
                                    {!store && <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmt(l.covers, l.uom)}
                                        {l.uncommitted > 0 && <span className="block text-[11px] font-semibold text-sky-700">+ {fmt(l.uncommitted, l.uom)} uncommitted</span>}
                                        {l.on_po > 0 && <span className="block text-[11px] font-semibold text-indigo-700">{fmt(l.on_po, l.uom)} on {l.purchase_orders.map(p => <Link key={p.po_id} to={`/v3/purchasing/orders/${p.po_id}`} className="underline mr-1">{p.po_no}</Link>)}</span>}</td>}
                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(l.needed_by)}</td>
                                    {store && <td className="px-3 py-2.5 text-xs">{l.purchase_orders.length ? l.purchase_orders.map(p => <Link key={p.po_id} to={`/v3/purchasing/orders/${p.po_id}`} className="font-semibold text-indigo-700 hover:underline mr-1">{p.po_no}</Link>) : '—'}</td>}
                                    {!store && <td className="px-3 py-2.5 text-xs">
                                        {l.orders.map(o => (
                                            <p key={o.order_id}><Link to={`/v3/planning/orders/${o.order_id}`} className="font-semibold text-indigo-700 hover:underline">{o.order_no}</Link> {fmt(o.covers, l.uom)}
                                                {o.from_surplus && <span className="ml-1 text-sky-700">from the surplus</span>}
                                                {!o.from_surplus && Math.abs(o.covers - o.raised_for) > 0.0005 && <span className="ml-1 text-slate-500">(raised for {fmt(o.raised_for, l.uom)})</span>}
                                                {o.order_status === 'CANCELLED' && <span className="ml-1 font-bold text-rose-600">order cancelled</span>}</p>
                                        ))}
                                    </td>}
                                    {editable && (
                                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                            <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit line ${l.line_no}`}
                                                onClick={() => { setFormError(''); setEditing({ line: l, purchase_qty: String(l.purchase_qty), needed_by: l.needed_by || '', notes: l.notes || '' }); }}><Pencil size={14} /></button>
                                            <button type="button" className="p-1 rounded text-rose-500 hover:bg-rose-50" aria-label={`Remove line ${l.line_no}`}
                                                onClick={() => { if (window.confirm(store ? `Remove line ${l.line_no}?` : `Remove line ${l.line_no}? Its need goes back on the buy list.`)) act(() => planningApi.removePrLine(id, l.id)); }}><Trash2 size={14} /></button>
                                        </td>
                                    )}
                                </tr>
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

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

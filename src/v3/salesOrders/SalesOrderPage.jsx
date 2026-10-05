// One sales order: header (customer, buyer PO, dates), lines with colour ×
// size grids, and history. Accounts edit while DRAFT / REJECTED and submit;
// merchandisers approve or reject. After approval accounts still change the
// order, but each save needs a reason and becomes a numbered revision.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Send, Undo2, CheckCircle2, XCircle, Ban, FileDown, FileSpreadsheet } from 'lucide-react';
import Modal from '../../shared/Modal';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { adminApi } from '../../api/adminApi';
import { exportOrderPdf, exportOrderExcel } from './orderSheetExport';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import SalesOrderStatusBadge, { fmtDate } from './SalesOrderStatusBadge';
import OrderLineCard from './OrderLineCard';

const EDITABLE = ['DRAFT', 'REJECTED'];
const ACTION_LABEL = {
    CREATED: 'Created', SUBMITTED: 'Submitted', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', REJECTED: 'Rejected',
    REVISED: 'Revised', CANCELLED: 'Cancelled', BOM_CHANGED: 'BOM changed',
};
// Remount a line card when its saved data changes, so it starts from the server copy.
const lineKey = (l) => `${l.id}:${l.bom_id}:${l.ship_date}:${l.notes}:${l.status}:${JSON.stringify(l.qty)}`;

export default function SalesOrderPage() {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const [perms, setPerms] = useState({ edit: false, approve: false, cancelApproved: false });
    const [customers, setCustomers] = useState([]);
    const [styleOptions, setStyleOptions] = useState(null);
    const [tab, setTab] = useState('lines');
    const [error, setError] = useState('');
    const [problems, setProblems] = useState([]);   // from a refused submit / approve
    const [header, setHeader] = useState(null);     // header edit form
    const [adding, setAdding] = useState(null);     // add line form
    const [ask, setAsk] = useState(null);           // reason prompt { title, hint, label, run(reason) }
    const [askText, setAskText] = useState('');
    const [approving, setApproving] = useState(false);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => salesOrdersApi.order(id).then(res => setOrder(res.data))
        .catch(err => setError(apiError(err, 'Failed to load the order.'))), [id]);
    useEffect(() => {
        load();
        salesOrdersApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, [load]);

    if (!order) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const revising = order.status === 'APPROVED';
    const editable = perms.edit && (EDITABLE.includes(order.status) || revising);
    const neverApproved = !order.approved_at && order.revision_no === 0;
    const canMoveBom = perms.approve && ['SUBMITTED', 'APPROVED'].includes(order.status);
    const canCancel = (perms.edit && ['DRAFT', 'REJECTED', 'SUBMITTED'].includes(order.status)) || (perms.cancelApproved && order.status === 'APPROVED');
    const activeLines = order.lines.filter(l => l.status === 'ACTIVE');

    // Run a flow action; a refused submit / approve lists every problem.
    const act = async (fn, after) => {
        setBusy(true); setError(''); setProblems([]);
        try {
            const res = await fn();
            setOrder(res.data);
            if (after) after();
            return true;
        } catch (err) {
            setError(apiError(err, 'Action failed.'));
            setProblems(err?.response?.data?.problems || []);
            return false;
        } finally {
            setBusy(false);
        }
    };
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const runAsk = async () => {
        setBusy(true); setFormError('');
        try {
            setOrder((await ask.run(askText.trim())).data);
            setAsk(null);
        } catch (err) {
            setFormError(apiError(err, 'Action failed.'));
        } finally {
            setBusy(false);
        }
    };

    const openHeader = () => {
        setFormError('');
        if (!customers.length) salesOrdersApi.customers().then(res => setCustomers(res.data)).catch(() => {});
        setHeader({ customer_id: String(order.customer_id), buyer_po_no: order.buyer_po_no || '', order_date: order.order_date, notes: order.notes || '', reason: '' });
    };
    const openAdd = () => {
        setFormError('');
        salesOrdersApi.styleOptions().then(res => setStyleOptions(res.data)).catch(err => setFormError(apiError(err, 'Failed to load styles.')));
        setAdding({ style_id: '', ship_date: '', reason: '' });
    };
    const submitForm = async (fn, close) => {
        setBusy(true); setFormError('');
        try {
            setOrder((await fn()).data);
            close();
        } catch (err) {
            setFormError(apiError(err, 'Save failed.'));
        } finally {
            setBusy(false);
        }
    };
    // Order sheet with the company letterhead when a profile exists.
    const exportPdf = async () => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* letterhead is optional */ }
        exportOrderPdf(order, company);
    };
    const saveLine = async (lineId, data) => setOrder((await salesOrdersApi.updateLine(id, lineId, data)).data);
    const deleteLine = async (l) => {
        if (!window.confirm(`Delete line ${l.line_no} (${l.style_code})?`)) return;
        await act(() => salesOrdersApi.deleteLine(id, l.id));
    };

    return (
        <div>
            <Link to="/v3/sales-orders" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Sales orders</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{order.order_no}</h1>
                <SalesOrderStatusBadge status={order.status} />
                {order.revision_no > 0 && <span className="text-xs font-bold text-slate-500">revision {order.revision_no}</span>}
            </div>
            {order.status === 'REJECTED' && order.rejected_reason && (
                <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2"><b>Rejected:</b> {order.rejected_reason}. Fix it, then submit again.</div>
            )}
            {order.status === 'CANCELLED' && (
                <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{order.cancelled_by_name ? ` by ${order.cancelled_by_name}` : ''}: {order.cancelled_reason}</div>
            )}
            {order.status === 'SUBMITTED' && <p className="text-sm text-amber-700 mb-3">Waiting for a merchandiser to approve. {perms.edit ? 'Withdraw it to make changes.' : ''}</p>}
            {revising && <p className="text-sm text-emerald-700 mb-3"><Link to={`/v3/planning/orders/${order.id}`} className="font-bold text-indigo-700 hover:underline mr-2">Material requirements →</Link>Approved {order.approved_at ? new Date(order.approved_at).toLocaleString() : ''}{order.approved_by_name ? ` by ${order.approved_by_name}` : ''}. BOM versions are locked.{perms.edit ? ' Changes need a reason and are saved as revisions.' : ''}</p>}

            {/* Actions for this status and the signed-in user's rights */}
            <div className="flex flex-wrap gap-2 mb-3">
                {perms.edit && EDITABLE.includes(order.status) && <PrimaryButton onClick={() => act(() => salesOrdersApi.submit(id))} busy={busy} disabled={busy}><Send size={14} /> Submit for approval</PrimaryButton>}
                {perms.edit && order.status === 'SUBMITTED' && <SecondaryButton onClick={() => act(() => salesOrdersApi.withdraw(id))} disabled={busy}><Undo2 size={14} /> Withdraw</SecondaryButton>}
                {perms.approve && order.status === 'SUBMITTED' && <>
                    <PrimaryButton onClick={() => { setProblems([]); setError(''); setApproving(true); }} disabled={busy}><CheckCircle2 size={14} /> Approve…</PrimaryButton>
                    <SecondaryButton onClick={() => askReason({ title: 'Reject order', label: 'Reason *', hint: 'Accounts see this and fix the order.', confirm: 'Reject', run: (r) => salesOrdersApi.reject(id, r) })} disabled={busy}><XCircle size={14} /> Reject</SecondaryButton>
                </>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={exportPdf} disabled={busy}><FileDown size={14} /> PDF</SecondaryButton>
                    <SecondaryButton onClick={() => exportOrderExcel(order)}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </span>
                {canCancel && <SecondaryButton onClick={() => askReason({ title: `Cancel ${order.order_no}`, label: 'Reason *', hint: 'The order and its number stay on record; nothing can be changed afterwards.', confirm: 'Cancel order', danger: true, run: (r) => salesOrdersApi.cancel(id, r) })} disabled={busy}><Ban size={14} /> Cancel order</SecondaryButton>}
            </div>
            <ErrorBox text={error} />
            {problems.length > 0 && (
                <ul className="mb-3 text-xs text-rose-800 list-disc pl-5 space-y-0.5 bg-rose-50 border border-rose-200 rounded-lg py-2 pr-3">
                    {problems.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
            )}

            {/* Header */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-x-8 gap-y-3 items-start">
                <div><p className="text-xs font-bold text-slate-500">Customer</p><p className="font-bold text-slate-800">{order.customer_name}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Buyer PO no.</p><p className="font-semibold text-slate-800">{order.buyer_po_no || '—'}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Order date</p><p className="font-semibold text-slate-800">{fmtDate(order.order_date)}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Lines</p><p className="font-semibold text-slate-800">{activeLines.length}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Pieces</p><p className="font-black text-slate-900">{order.total_qty.toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Created by</p><p className="text-sm text-slate-700">{order.created_by_name || '—'}</p></div>
                {order.submitted_by_name && <div><p className="text-xs font-bold text-slate-500">Submitted by</p><p className="text-sm text-slate-700">{order.submitted_by_name}</p></div>}
                {order.notes && <div className="basis-full"><p className="text-xs font-bold text-slate-500">Notes</p><p className="text-sm text-slate-700 whitespace-pre-line">{order.notes}</p></div>}
                {editable && <div className="ml-auto"><SecondaryButton onClick={openHeader}><Pencil size={14} /> Edit</SecondaryButton></div>}
            </div>

            <div className="flex gap-1 border-b border-slate-200 mb-4">
                {[{ key: 'lines', label: `Lines (${activeLines.length})` }, { key: 'history', label: `History (${order.history.length})` }].map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'lines' && (
                <div className="space-y-3">
                    {order.lines.map(l => (
                        <OrderLineCard key={lineKey(l)} line={l} editable={editable && l.status === 'ACTIVE'} canDelete={neverApproved} needsReason={revising}
                            onSave={(data) => saveLine(l.id, data)} onDelete={() => deleteLine(l)}
                            onCancelLine={editable && revising && l.status === 'ACTIVE' && activeLines.length > 1
                                ? () => askReason({ title: `Cancel line ${l.line_no} (${l.style_code})`, label: 'Reason *', hint: 'The line stays on the order, marked cancelled. This is saved as a revision.', confirm: 'Cancel line', danger: true, run: (r) => salesOrdersApi.cancelLine(id, l.id, r) })
                                : null}
                            onMoveBom={canMoveBom && l.status === 'ACTIVE' && l.bom_outdated
                                ? () => askReason({ title: `Move line ${l.line_no} to BOM v${l.current_bom_version}`, label: 'Reason *', hint: `The line now uses v${l.bom_version}. v${l.current_bom_version} must cover all its colours and resolve fully.`, confirm: 'Move line', run: (r) => salesOrdersApi.moveLineBom(id, l.id, r) })
                                : null} />
                    ))}
                    {order.lines.length === 0 && <p className="text-sm text-slate-400">No lines yet.{editable ? ' Add a style to start.' : ''}</p>}
                    {editable && <SecondaryButton onClick={openAdd}><Plus size={14} /> Add style line</SecondaryButton>}
                </div>
            )}

            {tab === 'history' && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 divide-y divide-slate-100">
                    {order.history.map(h => (
                        <div key={h.id} className="py-2 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-slate-400 w-40">{new Date(h.created_at).toLocaleString()}</span>
                                <b className="text-slate-800">{ACTION_LABEL[h.action] || h.action}</b>
                                {h.revision_no > 0 && <span className="text-xs font-bold text-slate-500">rev {h.revision_no}</span>}
                                <span className="text-slate-600">{h.user_name || ''}</span>
                                {h.reason && <span className="text-slate-500">— {h.reason}</span>}
                            </div>
                            {h.changes?.summary?.length > 0 && (
                                <ul className="mt-1 ml-[10.5rem] text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                                    {h.changes.summary.map((x, i) => <li key={i}>{x}</li>)}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {header && (
                <Modal title={`Edit ${order.order_no}`} onClose={() => setHeader(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <Field label="Customer *">
                            <select className={inputCls} value={header.customer_id} onChange={e => setHeader({ ...header, customer_id: e.target.value })}>
                                {!customers.length && <option value={header.customer_id}>{order.customer_name}</option>}
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Buyer PO no."><input className={inputCls} value={header.buyer_po_no} onChange={e => setHeader({ ...header, buyer_po_no: e.target.value })} /></Field>
                            <Field label="Order date *"><input className={inputCls} type="date" value={header.order_date} onChange={e => setHeader({ ...header, order_date: e.target.value })} /></Field>
                        </div>
                        <Field label="Notes"><textarea className={`${inputCls} min-h-[60px]`} value={header.notes} onChange={e => setHeader({ ...header, notes: e.target.value })} /></Field>
                        {revising && <Field label="Reason for the change *" hint="The order is approved; this is saved as a revision."><input className={inputCls} value={header.reason} onChange={e => setHeader({ ...header, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setHeader(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => submitForm(() => salesOrdersApi.updateOrder(id, header), () => setHeader(null))} busy={busy}
                                disabled={busy || !header.customer_id || !header.order_date || (revising && !header.reason.trim())}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adding && (
                <Modal title="Add style line" onClose={() => setAdding(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <Field label="Style *" hint="Only styles with an approved BOM can be ordered.">
                            <select className={inputCls} value={adding.style_id} onChange={e => setAdding({ ...adding, style_id: e.target.value })} autoFocus>
                                <option value="">{styleOptions ? '— pick —' : 'Loading…'}</option>
                                {(styleOptions || []).map(s => <option key={s.id} value={s.id}>{s.style_code} — {s.name} (BOM v{s.bom_version}, {s.colour_count} colours, {s.size_count} sizes)</option>)}
                            </select>
                        </Field>
                        {styleOptions && styleOptions.length === 0 && <p className="text-xs text-amber-700">No style has an approved BOM yet.</p>}
                        <Field label={revising ? 'Ship date *' : 'Ship date'}><input className={inputCls} type="date" value={adding.ship_date} onChange={e => setAdding({ ...adding, ship_date: e.target.value })} /></Field>
                        {revising && <Field label="Reason *" hint="The order is approved; adding a line is saved as a revision, and the line's BOM is locked now."><input className={inputCls} value={adding.reason} onChange={e => setAdding({ ...adding, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdding(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => submitForm(() => salesOrdersApi.addLine(id, adding), () => setAdding(null))} busy={busy}
                                disabled={busy || !adding.style_id || (revising && (!adding.ship_date || !adding.reason.trim()))}>Add line</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {approving && (
                <Modal title={`Approve ${order.order_no}`} onClose={() => setApproving(false)}>
                    <div className="space-y-3 w-[min(620px,90vw)]">
                        <p className="text-sm text-slate-600"><b>{order.customer_name}</b>{order.buyer_po_no ? ` · PO ${order.buyer_po_no}` : ''} · {order.total_qty.toLocaleString('en-IN')} pcs</p>
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Line</th><th className="py-1">Style</th><th className="py-1">BOM</th><th className="py-1">Ship</th><th className="py-1 text-right">Pieces</th></tr></thead>
                            <tbody>
                                {activeLines.map(l => (
                                    <tr key={l.id} className="border-t border-slate-100">
                                        <td className="py-1.5">{l.line_no}</td>
                                        <td className="py-1.5 font-semibold">{l.style_code}</td>
                                        <td className="py-1.5">v{l.bom_version}{l.bom_outdated && <span className="ml-1 text-xs font-bold text-amber-700">(v{l.current_bom_version} approved since)</span>}</td>
                                        <td className="py-1.5">{fmtDate(l.ship_date)}</td>
                                        <td className="py-1.5 text-right tabular-nums">{l.total_qty.toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-xs text-slate-500">Approving checks each line's BOM is approved and fully resolved, then locks these BOM versions on the order.</p>
                        <ErrorBox text={error} />
                        {problems.length > 0 && <ul className="text-xs text-rose-800 list-disc pl-5 space-y-0.5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setApproving(false)}>Close</SecondaryButton>
                            <PrimaryButton onClick={() => act(() => salesOrdersApi.approve(id), () => setApproving(false))} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Approve</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        <Field label={ask.label} hint={ask.hint}>
                            <textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus />
                        </Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={runAsk} busy={busy} disabled={busy || !askText.trim()}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

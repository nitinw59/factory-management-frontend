// One sales order: header (customer, buyer PO, dates), lines with colour ×
// size grids, and history. Accounts edit while DRAFT / REJECTED and submit;
// merchandisers approve or reject. After approval accounts' changes (and a request
// to cancel) go to the merchandiser as a change request; approved = a numbered revision.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Pencil, Send, Undo2, CheckCircle2, XCircle, Ban, FileDown, FileSpreadsheet } from 'lucide-react';
import Modal from '../../shared/Modal';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { adminApi } from '../../api/adminApi';
import { exportOrderPdf, exportOrderExcel } from './orderSheetExport';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from './SalesOrderStatusBadge';
import OrderLineCard from './OrderLineCard';
import StylePicker from './StylePicker';
import OrderTabs from '../orders/OrderTabs';
import OrderDocumentsTab from './OrderDocumentsTab';
import { exportPpmTemplate } from './ppmTemplatePdf';
import { exportPpmTemplateXlsx } from './ppmTemplateXlsx';
import { planningApi } from '../api/planningApi';
import { downloadMaterialSheet } from '../planning/materialSheetPdf';
import { downloadOrderBomV2 } from '../boms/bomV2';

const ORDER_TYPES = ['FOB', 'CMT', 'CM', 'DOMESTIC'];   // sales order type (13 Oct 2026)

const EDITABLE = ['DRAFT', 'REJECTED'];
const ACTION_LABEL = {
    CREATED: 'Created', SUBMITTED: 'Submitted', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', REJECTED: 'Rejected',
    REVISED: 'Revised', CANCELLED: 'Cancelled', BOM_CHANGED: 'BOM changed', DOCUMENT: 'Document uploaded', DOCUMENT_REMOVED: 'Document removed',
    CHANGE_SENT: 'Changes sent for approval', CHANGE_APPROVED: 'Changes approved', CHANGE_REJECTED: 'Changes sent back', CHANGE_WITHDRAWN: 'Changes taken back',
};
// Remount a line card when its saved data changes, so it starts from the server copy.
const lineKey = (l) => `${l.id}:${l.bom_id}:${l.ship_date}:${l.notes}:${l.status}:${JSON.stringify(l.qty)}`;

export default function SalesOrderPage() {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const [perms, setPerms] = useState({ edit: false, approve: false, cancelApproved: false, documents: false });
    const [customers, setCustomers] = useState([]);
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
    // Approved order: edits are collected in its change request (15 Oct 2026); locked while it waits for the merchandiser.
    const cr = order.change_request;
    const crWaiting = cr?.status === 'SUBMITTED';
    const editable = perms.edit && (EDITABLE.includes(order.status) || (revising && !crWaiting));
    const neverApproved = !order.approved_at && order.revision_no === 0;
    const canMoveBom = perms.approve && ['SUBMITTED', 'APPROVED'].includes(order.status);
    const canCancel = (perms.edit && ['DRAFT', 'REJECTED', 'SUBMITTED'].includes(order.status)) || (perms.cancelApproved && order.status === 'APPROVED');
    // Accounts on an approved order: the cancellation goes to the merchandiser with the order's change request.
    const canRequestCancel = !perms.cancelApproved && perms.edit && revising && !crWaiting && !cr?.cancel_order;
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
        const ph = order.change_request?.proposed_header;   // an approved order shows its proposed header if there is one
        setHeader({ customer_id: String(ph?.customer_id || order.customer_id), buyer_po_no: (ph ? ph.buyer_po_no : order.buyer_po_no) || '', order_type: ph?.order_type || order.order_type || 'FOB', order_date: ph?.order_date || order.order_date, notes: (ph ? ph.notes : order.notes) || '', reason: '' });
    };
    const openAdd = () => {
        setFormError('');
        setAdding({ style_id: '', style: null, ship_date: '', reason: '' });
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
    // PPM template for one line (PDF or Excel), with the company name when a profile exists.
    const ppmTemplate = async (l, format = 'pdf') => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* name is optional */ }
        if (format === 'xlsx') await exportPpmTemplateXlsx(order, l, company).catch(err => setError(err.message || 'Failed to make the Excel file.'));
        else exportPpmTemplate(order, l, company);
    };
    const saveLine = async (lineId, data) => setOrder((await salesOrdersApi.updateLine(id, lineId, data)).data);
    const deleteLine = async (l) => {
        if (!window.confirm(l.proposed_new ? `Remove the proposed new line ${l.style_code}?` : `Delete line ${l.line_no} (${l.style_code})?`)) return;
        await act(() => salesOrdersApi.deleteLine(id, l.id));
    };

    return (
        <div>
            <OrderTabs orderId={id} active="order" />
            {order.status === 'REJECTED' && order.rejected_reason && (
                <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2"><b>Rejected:</b> {order.rejected_reason}. Fix it, then submit again.</div>
            )}
            {order.status === 'CANCELLED' && (
                <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{order.cancelled_by_name ? ` by ${order.cancelled_by_name}` : ''}: {order.cancelled_reason}</div>
            )}
            {order.status === 'SUBMITTED' && <p className="text-sm text-amber-700 mb-3">Waiting for a merchandiser to approve. {perms.edit ? 'Withdraw it to make changes.' : ''}</p>}
            {revising && <p className="text-sm text-emerald-700 mb-3"><Link to={`/v3/planning/orders/${order.id}`} className="font-bold text-indigo-700 hover:underline mr-2">Order BOM →</Link>Approved {order.approved_at ? new Date(order.approved_at).toLocaleString() : ''}{order.approved_by_name ? ` by ${order.approved_by_name}` : ''}. Each line keeps its Style BOM version unless a change moves it.{perms.edit ? ' Changes go to the merchandiser for approval.' : ''}</p>}

            {revising && (cr ? (
                <div className={`mb-3 rounded-xl border p-4 ${crWaiting ? 'bg-sky-50 border-sky-200' : cr.sent_back_reason ? 'bg-amber-50 border-amber-300' : 'bg-indigo-50/60 border-indigo-200'}`}>
                    <div className="flex flex-wrap items-start gap-2">
                        <div className="flex-1 min-w-[240px]">
                            <p className="font-bold text-slate-800">{crWaiting ? `Changes waiting for the merchandiser${cr.submitted_by_name ? ` — sent by ${cr.submitted_by_name}` : ''}` : 'Changes to this approved order — not sent yet'}</p>
                            {crWaiting && cr.reason && <p className="text-sm text-slate-700">Reason: {cr.reason}</p>}
                            {!crWaiting && cr.sent_back_reason && <p className="text-sm font-semibold text-amber-800">Sent back{cr.decided_by_name ? ` by ${cr.decided_by_name}` : ''}: {cr.sent_back_reason}</p>}
                            <p className="text-xs text-slate-500 mt-0.5">The order, its Order BOM and planning stay as approved until the merchandiser approves these changes.</p>
                        </div>
                        {perms.edit && !crWaiting && <>
                            <PrimaryButton disabled={busy || cr.problems.length > 0 || !cr.summary.length} onClick={() => askReason({ title: `Send changes of ${order.order_no} to the merchandiser`, label: 'Why does the order change? *', hint: 'e.g. "Buyer revised PO 31 → 32, +300 pcs navy". The merchandiser sees this with the changes.', confirm: 'Send for approval', run: (r) => salesOrdersApi.submitChange(id, r) })}><Send size={14} /> Send for approval</PrimaryButton>
                            <SecondaryButton disabled={busy} onClick={() => { if (window.confirm('Discard all these changes? The approved order stays as it is.')) act(() => salesOrdersApi.discardChange(id)); }}><XCircle size={14} /> Discard changes</SecondaryButton>
                        </>}
                        {perms.edit && crWaiting && <SecondaryButton disabled={busy} onClick={() => act(() => salesOrdersApi.withdrawChange(id))}><Undo2 size={14} /> Take back to change</SecondaryButton>}
                        {perms.approve && crWaiting && <>
                            <PrimaryButton disabled={busy} onClick={() => { if (window.confirm(`Approve these changes? ${order.order_no} becomes revision ${order.revision_no + 1} and its material requirements are recalculated.`)) act(() => salesOrdersApi.approveChange(id)); }}><CheckCircle2 size={14} /> Approve changes</PrimaryButton>
                            <SecondaryButton disabled={busy} onClick={() => askReason({ title: 'Send the changes back', label: 'Reason *', hint: 'Accounts see this; the order stays as approved.', confirm: 'Send back', run: (r) => salesOrdersApi.rejectChange(id, r) })}><Ban size={14} /> Send back</SecondaryButton>
                        </>}
                    </div>
                    {cr.cancel_order && <p className="mt-2 text-sm font-bold text-rose-700">Cancel the whole order: {cr.cancel_order.reason}. When approved, its requirements close and allocated material goes back to stock.</p>}
                    {cr.summary.length > 0 && <ul className="mt-2 ml-5 list-disc text-sm text-slate-700">{cr.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                    {cr.problems.length > 0 && <ul className="mt-2 ml-5 list-disc text-sm font-semibold text-rose-700">{cr.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                    {perms.edit && !crWaiting && cr.changes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">{cr.changes.map(ch => {
                            const ln = ch.line_id ? order.lines.find(l => String(l.id) === ch.line_id) : null;
                            const label = ch.type === 'ORDER_CANCEL' ? 'Cancel order' : ch.type === 'HEADER' ? 'Order details' : ch.type === 'LINE_ADD' ? `New line ${ch.style_code || ''}` : ch.type === 'LINE_CANCEL' ? `Cancel line ${ln?.line_no ?? ''}` : `Line ${ln?.line_no ?? ''}`;
                            return <button key={ch.id} type="button" onClick={() => act(() => salesOrdersApi.removeChange(id, ch.id))} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-xs text-slate-700 hover:border-rose-400" title="Remove this change">{label} ×</button>;
                        })}</div>
                    )}
                </div>
            ) : perms.edit ? (
                <p className="mb-3 text-xs text-slate-500">This order is approved. Changes you make below are collected and sent to the merchandiser for approval; production and planning keep the approved order until then.</p>
            ) : null)}

            {/* Actions for this status and the signed-in user's rights */}
            <div className="flex flex-wrap gap-2 mb-3">
                {perms.edit && EDITABLE.includes(order.status) && <PrimaryButton onClick={() => act(() => salesOrdersApi.submit(id))} busy={busy} disabled={busy}><Send size={14} /> Submit for approval</PrimaryButton>}
                {perms.edit && order.status === 'SUBMITTED' && <SecondaryButton onClick={() => act(() => salesOrdersApi.withdraw(id))} disabled={busy}><Undo2 size={14} /> Withdraw</SecondaryButton>}
                {perms.approve && order.status === 'SUBMITTED' && <>
                    <PrimaryButton onClick={() => { setProblems([]); setError(''); setApproving(true); }} disabled={busy}><CheckCircle2 size={14} /> Approve…</PrimaryButton>
                    <SecondaryButton onClick={() => askReason({ title: 'Reject order', label: 'Reason *', hint: 'Accounts see this and fix the order.', confirm: 'Reject', run: (r) => salesOrdersApi.reject(id, r) })} disabled={busy}><XCircle size={14} /> Reject</SecondaryButton>
                </>}
                <span className="ml-auto flex gap-2">
                    {order.status !== 'CANCELLED' && activeLines.length > 0 && (
                        <SecondaryButton disabled={busy} title={revising ? 'Fabric and trims per line and colour (the planned requirement)' : 'Estimate of fabric and trims from the BOMs — final once the order is approved'}
                            onClick={() => { setError(''); downloadMaterialSheet(planningApi, adminApi, order.id).catch(err => setError(apiError(err, 'Failed to make the material PDF.'))); }}>
                            <FileDown size={14} /> Order BOM PDF (v1){revising ? '' : ' (estimate)'}
                        </SecondaryButton>
                    )}
                    {order.status !== 'CANCELLED' && activeLines.length > 0 && <>
                        <SecondaryButton disabled={busy} title="Layout v2: the factory's order BOM layout (one page per style line)"
                            onClick={() => { setError(''); downloadOrderBomV2(planningApi, order.id, 'pdf').catch(err => setError(apiError(err, err.message || 'Failed to make the Order BOM.'))); }}>
                            <FileDown size={14} /> Order BOM v2 PDF{revising ? '' : ' (estimate)'}
                        </SecondaryButton>
                        <SecondaryButton disabled={busy} title="Layout v2 as Excel (one sheet per style line)"
                            onClick={() => { setError(''); downloadOrderBomV2(planningApi, order.id, 'xlsx').catch(err => setError(apiError(err, err.message || 'Failed to make the Order BOM.'))); }}>
                            <FileSpreadsheet size={14} /> v2 Excel
                        </SecondaryButton>
                    </>}
                    <SecondaryButton onClick={exportPdf} disabled={busy}><FileDown size={14} /> PDF</SecondaryButton>
                    <SecondaryButton onClick={() => exportOrderExcel(order)}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </span>
                {canCancel && <SecondaryButton onClick={() => askReason({ title: `Cancel ${order.order_no}`, label: 'Reason *', hint: revising ? 'The order and its number stay on record; its material requirements close and allocated material goes back to stock. Material already issued and cut batches stay on record.' : 'The order and its number stay on record; nothing can be changed afterwards.', confirm: 'Cancel order', danger: true, run: (r) => salesOrdersApi.cancel(id, r) })} disabled={busy}><Ban size={14} /> Cancel order</SecondaryButton>}
                {canRequestCancel && <SecondaryButton onClick={() => askReason({ title: `Request cancellation of ${order.order_no}`, label: 'Reason *', hint: `Goes to the merchandiser for approval${cr?.changes.length ? ' and replaces the other changes not sent yet' : ''}. The order stays approved until then.`, confirm: 'Propose cancellation', danger: true, run: (r) => salesOrdersApi.cancel(id, r) })} disabled={busy}><Ban size={14} /> Request cancellation</SecondaryButton>}
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
                <div><p className="text-xs font-bold text-slate-500">Order type</p><p className="font-semibold text-slate-800">{order.order_type === 'DOMESTIC' ? 'Domestic' : order.order_type || 'FOB'}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Order date</p><p className="font-semibold text-slate-800">{fmtDate(order.order_date)}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Lines</p><p className="font-semibold text-slate-800">{activeLines.length}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Pieces</p><p className="font-black text-slate-900">{order.total_qty.toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Created by</p><p className="text-sm text-slate-700">{order.created_by_name || '—'}</p></div>
                {order.submitted_by_name && <div><p className="text-xs font-bold text-slate-500">Submitted by</p><p className="text-sm text-slate-700">{order.submitted_by_name}</p></div>}
                {order.notes && <div className="basis-full"><p className="text-xs font-bold text-slate-500">Notes</p><p className="text-sm text-slate-700 whitespace-pre-line">{order.notes}</p></div>}
                {editable && <div className="ml-auto"><SecondaryButton onClick={openHeader}><Pencil size={14} /> Edit</SecondaryButton></div>}
            </div>

            <div className="flex gap-1 border-b border-slate-200 mb-4">
                {[{ key: 'lines', label: `Lines (${activeLines.length})` }, { key: 'documents', label: `Documents (${(order.documents || []).length})` }, { key: 'history', label: `History (${order.history.length})` }].map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'lines' && (
                <div className="space-y-3">
                    {order.lines.map(l => (
                        <OrderLineCard key={lineKey(l)} line={l} orderId={id} onPpm={(format) => ppmTemplate(l, format)} ppmCount={(order.documents || []).filter(d => d.doc_type === 'PPM' && d.line_id === String(l.id)).length} onDocuments={() => setTab('documents')} editable={editable && l.status === 'ACTIVE'} canDelete={neverApproved} needsReason={false} proposing={revising}
                            onUndoCancel={l.cancel_requested && editable ? () => act(() => salesOrdersApi.removeChange(id, l.cancel_requested.op_id)) : null}
                            onSave={(data) => saveLine(l.id, data)} onDelete={() => deleteLine(l)}
                            onCancelLine={editable && revising && l.status === 'ACTIVE' && activeLines.length > 1 && !l.cancel_requested
                                ? () => askReason({ title: `Cancel line ${l.line_no} (${l.style_code})`, label: 'Reason *', hint: 'Proposed with the other changes; the line is cancelled when the merchandiser approves them.', confirm: 'Cancel line', danger: true, run: (r) => salesOrdersApi.cancelLine(id, l.id, r) })
                                : null}
                            onMoveBom={canMoveBom && l.status === 'ACTIVE' && l.bom_outdated
                                ? () => askReason({ title: `Move line ${l.line_no} to BOM v${l.current_bom_version}`, label: 'Reason *', hint: `The line now uses v${l.bom_version}. v${l.current_bom_version} must cover all its colours and resolve fully.`, confirm: 'Move line', run: (r) => salesOrdersApi.moveLineBom(id, l.id, r) })
                                : null} />
                    ))}
                    {(order.proposed_lines || []).map(l => (
                        <OrderLineCard key={l.id} line={l} orderId={id} editable={editable} canDelete={editable} needsReason={false} proposing
                            onSave={(data) => saveLine(l.id, data)} onDelete={() => deleteLine(l)} />
                    ))}
                    {order.lines.length === 0 && <p className="text-sm text-slate-400">No lines yet.{editable ? ' Add a style to start.' : ''}</p>}
                    {editable && <SecondaryButton onClick={openAdd}><Plus size={14} /> Add style line</SecondaryButton>}
                </div>
            )}

            {tab === 'documents' && (
                <OrderDocumentsTab order={order} canUpload={perms.documents} onPpmTemplate={ppmTemplate} onChanged={setOrder} askReason={askReason} />
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
                            <Field label="Order type *" hint="FOB: we buy all material · CMT: buyer gives fabric · CM: buyer gives fabric and trims.">
                                <select className={inputCls} value={header.order_type} onChange={e => setHeader({ ...header, order_type: e.target.value })}>
                                    {ORDER_TYPES.map(t => <option key={t} value={t}>{t === 'DOMESTIC' ? 'Domestic' : t}</option>)}
                                </select>
                            </Field>
                            <Field label="Order date *"><input className={inputCls} type="date" value={header.order_date} onChange={e => setHeader({ ...header, order_date: e.target.value })} /></Field>
                        </div>
                        <Field label="Notes"><textarea className={`${inputCls} min-h-[60px]`} value={header.notes} onChange={e => setHeader({ ...header, notes: e.target.value })} /></Field>
                        {revising && <p className="text-xs text-slate-500">The order is approved: this is proposed with the other changes and applies when the merchandiser approves them.</p>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setHeader(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => submitForm(() => salesOrdersApi.updateOrder(id, header), () => setHeader(null))} busy={busy}
                                disabled={busy || !header.customer_id || !header.order_date}>{revising ? 'Save as proposed change' : 'Save'}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adding && (
                <Modal title="Add style line" onClose={() => setAdding(null)}>
                    <div className="space-y-3 w-[min(640px,90vw)]">
                        <Field label="Style *" hint={revising ? 'An approved order only takes styles with an approved Style BOM.' : 'A style without an approved Style BOM goes on as "BOM pending" — the order can be submitted once its BOM is approved.'}>
                            <StylePicker customerId={order.customer_id} value={adding.style} autoFocus allowPending={!revising}
                                onChange={(st) => setAdding({ ...adding, style: st, style_id: st ? String(st.id) : '', bom_id: st?.approved_versions?.[0]?.id || '' })} />
                        </Field>
                        {adding.style?.approved_versions?.length > 0 && (
                            <Field label="Style BOM version *" hint="Several versions can be approved at once (e.g. per buyer's colours). The line's colours come from the version picked.">
                                <select className={inputCls} value={adding.bom_id} onChange={e => setAdding({ ...adding, bom_id: e.target.value })}>
                                    {adding.style.approved_versions.map((v, i) => <option key={v.id} value={v.id}>v{v.version_no}{i === 0 ? ' (latest)' : ''} — {v.colour_count} colour{v.colour_count === 1 ? '' : 's'}: {v.colours || '—'}</option>)}
                                </select>
                            </Field>
                        )}
                        <Field label={revising ? 'Ship date *' : 'Ship date'}><input className={inputCls} type="date" value={adding.ship_date} onChange={e => setAdding({ ...adding, ship_date: e.target.value })} /></Field>
                        {revising && <p className="text-xs text-slate-500">The order is approved: the new line is proposed with the other changes — enter its quantities on the card, then send the changes to the merchandiser.</p>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdding(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => submitForm(() => salesOrdersApi.addLine(id, { style_id: adding.style_id, bom_id: adding.bom_id || undefined, ship_date: adding.ship_date }), () => setAdding(null))} busy={busy}
                                disabled={busy || !adding.style_id || (revising && !adding.ship_date)}>{revising ? 'Propose line' : 'Add line'}</PrimaryButton>
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

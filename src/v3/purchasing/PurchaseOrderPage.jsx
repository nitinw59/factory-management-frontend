// One purchase order: supplier and terms, lines (qty, rate, GST, delivery,
// what each covers), totals with CGST + SGST or IGST, issue / revise / cancel,
// documents, history, PDF / Excel. Draft: free editing. Issued: every change
// needs a reason and becomes a revision.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Ban, Pencil, Trash2, Plus, FileDown, FileSpreadsheet, Upload, Info, PackageOpen, PackageX } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { adminApi } from '../../api/adminApi';
import { API_BASE_URL } from '../../utils/api';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PO_STATUS, inr, amountInWords, exportPoPdf, exportPoExcel } from './poShared';
import RequisitionLinePicker from './RequisitionLinePicker';
import { GRN_STATUS } from './grnShared';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const ACTION = { CREATED: 'Created', EDITED: 'Edited', ISSUED: 'Issued', REVISED: 'Revised', CANCELLED: 'Cancelled', SHORT_CLOSED: 'Short-closed', DOCUMENT: 'Document', RECEIPT: 'Goods received', RETURNED: 'Returned to supplier' };

export default function PurchaseOrderPage() {
    const { id } = useParams();
    const [po, setPo] = useState(null);
    const [canManage, setCanManage] = useState(false);
    const [canReceive, setCanReceive] = useState(false);
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [lineEdit, setLineEdit] = useState(null);
    const [headerEdit, setHeaderEdit] = useState(null);
    const [adding, setAdding] = useState(null);     // { lines, picks, reason }
    const [ask, setAsk] = useState(null);           // { title, confirm, run(reason) }
    const [askText, setAskText] = useState('');
    const [docForm, setDocForm] = useState({ file: null, name: '' });
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => purchasingApi.order(id).then(res => setPo(res.data)).catch(err => setError(apiError(err, 'Failed to load the purchase order.'))), [id]);
    useEffect(() => { load(); purchasingApi.permissions().then(res => { setCanManage(res.data.manage); setCanReceive(res.data.receive); }).catch(() => {}); }, [load]);

    if (!po) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const editable = canManage && ['DRAFT', 'ISSUED'].includes(po.status);
    const issued = po.status === 'ISSUED';
    const intra = po.tax_mode === 'INTRA';
    const receivable = ['ISSUED', 'PARTLY_RECEIVED'].includes(po.status);
    const anyReceived = po.lines.some(l => l.received_qty > 0 || l.pending_qty > 0);

    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setPo((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const exportPdf = async () => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* letterhead is optional */ }
        exportPoPdf(po, company);
    };
    const openAdd = () => {
        setFormError('');
        setAdding({ lines: null, picks: new Map(), reason: '' });
        purchasingApi.openRequisitionLines().then(res => setAdding(a => (a ? { ...a, lines: res.data } : a))).catch(err => setFormError(apiError(err, 'Failed to load.')));
    };
    const upload = () => run(() => purchasingApi.uploadDocument(id, docForm.file, docForm.name), () => setDocForm({ file: null, name: '' }));

    return (
        <div>
            <Link to="/v3/purchasing/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Purchase orders</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{po.po_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${PO_STATUS[po.status].cls}`}>{PO_STATUS[po.status].label}</span>
                {po.revision_no > 0 && <span className="text-xs font-bold text-slate-500">revision {po.revision_no}</span>}
                <span className="text-sm text-slate-500">{fmtDate(po.po_date)} · {intra ? 'CGST + SGST' : 'IGST'}</span>
            </div>
            {po.status === 'CANCELLED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{po.cancelled_by_name ? ` by ${po.cancelled_by_name}` : ''}: {po.cancelled_reason}</div>}
            {po.status === 'SHORT_CLOSED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Short-closed</b> — the rest of this PO is no longer expected.</div>}
            {issued && <p className="text-sm text-indigo-700 mb-3">Issued {new Date(po.issued_at).toLocaleString()}{po.issued_by_name ? ` by ${po.issued_by_name}` : ''}. Changes need a reason and become revisions.</p>}

            <div className="flex flex-wrap gap-2 mb-3">
                {canManage && po.status === 'DRAFT' && <PrimaryButton onClick={() => { if (window.confirm(`Issue ${po.po_no} to ${po.supplier_name}?`)) run(() => purchasingApi.issue(id)); }} busy={busy} disabled={busy}><Send size={14} /> Issue to supplier</PrimaryButton>}
                {editable && <SecondaryButton onClick={openAdd}><Plus size={14} /> Add requisition lines</SecondaryButton>}
                {editable && <SecondaryButton onClick={() => { setFormError(''); setHeaderEdit({ delivery_date: po.delivery_date || '', terms: po.terms || '', notes: po.notes || '', reason: '' }); }}><Pencil size={14} /> Delivery / terms</SecondaryButton>}
                {canReceive && receivable && <PrimaryButton onClick={() => navigate(`/v3/purchasing/receive/${id}`)}><PackageOpen size={14} /> Receive goods</PrimaryButton>}
                {canManage && po.status === 'PARTLY_RECEIVED' && <SecondaryButton onClick={() => askReason({ title: `Short-close ${po.po_no}`, confirm: 'Short-close', hint: 'The rest is no longer expected from the supplier. Planning stops counting it as incoming; the open requisition quantity can go on a new PO.', run: (r) => purchasingApi.shortClose(id, r) })}><PackageX size={14} /> Short-close</SecondaryButton>}
                {editable && !anyReceived && <SecondaryButton onClick={() => askReason({ title: `Cancel ${po.po_no}`, confirm: 'Cancel purchase order', run: (r) => purchasingApi.cancel(id, r) })}><Ban size={14} /> Cancel</SecondaryButton>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={exportPdf}><FileDown size={14} /> PDF</SecondaryButton>
                    <SecondaryButton onClick={() => exportPoExcel(po)}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </span>
            </div>
            <ErrorBox text={error} />

            <div className="grid md:grid-cols-2 gap-3 mb-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm">
                    <p className="text-xs font-bold text-slate-500 mb-1">Supplier</p>
                    <p className="font-bold text-slate-900">{po.supplier_name}</p>
                    <p className="text-slate-600 whitespace-pre-line">{[po.supplier_address, [po.supplier_city, po.supplier_pincode].filter(Boolean).join(' ')].filter(Boolean).join('\n')}</p>
                    <p className="text-slate-600">GSTIN {po.supplier_gstin || 'unregistered'} · {po.supplier_state_name} ({po.supplier_state_code})</p>
                    {(po.supplier_contact || po.supplier_phone || po.supplier_email) && <p className="text-slate-500 text-xs">{[po.supplier_contact, po.supplier_phone, po.supplier_email].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm grid grid-cols-2 gap-2">
                    <div><p className="text-xs font-bold text-slate-500">Delivery</p><p className="font-semibold">{po.delivery_date ? fmtDate(po.delivery_date) : 'per line'}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Payment terms</p><p className="font-semibold">{po.payment_terms_days} days</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Tax</p><p className="font-semibold">{intra ? `CGST + SGST (both in ${po.company_state_name})` : `IGST (${po.supplier_state_name} → ${po.company_state_name})`}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Raised by</p><p>{po.created_by_name || '—'}</p></div>
                    {po.terms && <div className="col-span-2"><p className="text-xs font-bold text-slate-500">Terms</p><p className="whitespace-pre-line text-slate-700">{po.terms}</p></div>}
                    {po.notes && <div className="col-span-2"><p className="text-xs font-bold text-slate-500">Notes</p><p className="text-slate-700">{po.notes}</p></div>}
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
                <table className="w-full text-sm min-w-[1050px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr className="text-right"><th className="px-3 py-2.5 text-left">#</th><th className="px-3 py-2.5 text-left">Item</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Rate (₹)</th><th className="px-3 py-2.5">Taxable</th><th className="px-3 py-2.5">GST</th><th className="px-3 py-2.5">Amount</th><th className="px-3 py-2.5 text-left">Delivery</th><th className="px-3 py-2.5 text-left">Covers</th>{editable && <th className="px-3 py-2.5 w-16" />}</tr>
                    </thead>
                    <tbody>
                        {po.lines.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">No lines. Add approved requisition lines.</td></tr>}
                        {po.lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 align-top text-right tabular-nums">
                                <td className="px-3 py-2.5 text-left">{l.line_no}</td>
                                <td className="px-3 py-2.5 text-left"><span className="font-semibold text-slate-800">{l.label}</span>
                                    <span className="block text-xs text-slate-500">{l.type_name}{l.hsn_code ? ` · HSN ${l.hsn_code}` : ' · no HSN'}{l.notes ? ` · ${l.notes}` : ''}</span>
                                    <span className="block text-[11px] text-slate-400">{l.requisitions.map(r => `${r.pr_no}/${r.pr_line_no}`).join(', ')}</span></td>
                                <td className="px-3 py-2.5 whitespace-nowrap"><b>{fmt(l.qty, 'm')}</b> {l.purchase_uom}<span className="block text-[11px] text-slate-500">= {fmt(l.usage_qty, l.uom)} {l.uom}</span>
                                    {(l.received_qty > 0 || l.pending_qty > 0) && <span className={`block text-[11px] font-semibold ${l.received_qty + 0.0005 >= l.qty ? 'text-emerald-700' : 'text-amber-700'}`}>received {fmt(l.received_qty, 'm')}{l.pending_qty > 0 ? ` · ${fmt(l.pending_qty, 'm')} awaiting approval` : ''}</span>}</td>
                                <td className={`px-3 py-2.5 ${l.rate > 0 ? '' : 'text-rose-700 font-bold'}`}>{l.rate > 0 ? inr(l.rate) : 'set rate'}</td>
                                <td className="px-3 py-2.5">{inr(l.value)}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap">{l.gst_pct}%<span className="block text-[11px] text-slate-500">{intra ? `${inr(l.cgst)} + ${inr(l.sgst)}` : inr(l.igst)}</span></td>
                                <td className="px-3 py-2.5 font-bold">{inr(l.total)}</td>
                                <td className="px-3 py-2.5 text-left whitespace-nowrap">{fmtDate(l.delivery_date || po.delivery_date)}</td>
                                <td className="px-3 py-2.5 text-left text-xs">
                                    {l.covers.map(c => <p key={c.order_id}><Link to={`/v3/planning/orders/${c.order_id}`} className="text-indigo-700 hover:underline">{c.order_no}</Link> {fmt(c.qty, l.uom)}</p>)}
                                    {l.uncommitted > 0 && <p className="text-sky-700">+{fmt(l.uncommitted, l.uom)} uncommitted</p>}
                                </td>
                                {editable && (
                                    <td className="px-3 py-2.5 whitespace-nowrap">
                                        <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit line ${l.line_no}`}
                                            onClick={() => { setFormError(''); setLineEdit({ line: l, qty: String(l.qty), rate: String(l.rate), gst_pct: String(l.gst_pct), delivery_date: l.delivery_date || '', notes: l.notes || '', reason: '' }); }}><Pencil size={14} /></button>
                                        <button type="button" className="p-1 rounded text-rose-500 hover:bg-rose-50" aria-label={`Remove line ${l.line_no}`}
                                            onClick={() => (issued
                                                ? askReason({ title: `Remove line ${l.line_no}`, confirm: 'Remove line', run: (r) => purchasingApi.removeLine(id, l.id, r) })
                                                : window.confirm(`Remove line ${l.line_no}? Its requisition quantity becomes open again.`) && run(() => purchasingApi.removeLine(id, l.id)))}><Trash2 size={14} /></button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 text-right tabular-nums font-bold">
                        <tr><td colSpan={4} className="px-3 py-2 text-left">Total</td><td className="px-3 py-2">{inr(po.totals.taxable)}</td><td className="px-3 py-2">{inr(po.totals.gst)}</td><td className="px-3 py-2 text-base">₹ {inr(po.totals.total)}</td><td colSpan={editable ? 3 : 2} /></tr>
                    </tfoot>
                </table>
            </div>
            <p className="text-xs text-slate-600 mb-4">{intra ? `CGST ₹${inr(po.totals.cgst)} + SGST ₹${inr(po.totals.sgst)}` : `IGST ₹${inr(po.totals.igst)}`} · {amountInWords(po.totals.total)}</p>
            {po.lines.some(l => l.uncommitted > 0) && (
                <p className="mb-4 text-xs text-sky-800 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" />Uncommitted quantity (minimum order, pack rounding) is counted by planning as incoming and covers the next orders before anything is raised again.</p>
            )}

            {po.grns.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Goods receipts</p>
                    <div className="divide-y divide-slate-100 text-sm">
                        {po.grns.map(g => (
                            <div key={g.id} className="py-1.5 flex flex-wrap items-center gap-2">
                                <Link to={`/v3/purchasing/grns/${g.id}`} className="font-semibold text-indigo-700 hover:underline">{g.grn_no}</Link>
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${GRN_STATUS[g.status].cls}`}>{GRN_STATUS[g.status].label}</span>
                                <span className="text-slate-500">{fmtDate(g.received_date)} · challan {g.challan_no}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {po.return_notes?.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Returned to supplier</p>
                    {po.return_notes.map(r => <p key={r.id} className="text-sm py-0.5"><Link to={`/v3/purchasing/return-notes/${r.id}`} className="font-semibold text-indigo-700 hover:underline">{r.rn_no}</Link> <span className="text-slate-500">{fmtDate(r.return_date)} · from {r.grn_no} · {r.reason}{r.replacement_expected ? ' · replacement expected' : ''}</span></p>)}
                </div>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Documents</p>
                    {po.documents.length === 0 ? <p className="text-sm text-slate-400 mb-2">None yet (signed PO, quotation, supplier confirmation…).</p> : (
                        <ul className="text-sm mb-3 space-y-1">
                            {po.documents.map(d => <li key={d.id}><a href={`${API_BASE_URL}${d.file_url}`} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">{d.display_name} v{d.version}</a>
                                <span className="text-xs text-slate-500"> · {d.original_filename} · {new Date(d.created_at).toLocaleDateString('en-IN')}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</span></li>)}
                        </ul>
                    )}
                    {canManage && po.status !== 'CANCELLED' && (
                        <div className="flex flex-wrap items-end gap-2">
                            <input className={`${inputCls} flex-1 min-w-[160px]`} placeholder="Document name (same name = new version)" value={docForm.name} onChange={e => setDocForm({ ...docForm, name: e.target.value })} />
                            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setDocForm({ ...docForm, file: e.target.files?.[0] || null })} className="text-xs" aria-label="Document file" />
                            <SecondaryButton onClick={upload} disabled={busy || !docForm.file}><Upload size={14} /> Upload</SecondaryButton>
                        </div>
                    )}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                    <div className="divide-y divide-slate-100 text-sm">
                        {po.history.map(h => (
                            <div key={h.id} className="py-1.5">
                                <span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>
                                {h.revision_no > 0 && <span className="text-xs text-slate-500"> · rev {h.revision_no}</span>}{h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                                {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {lineEdit && (
                <Modal title={`Line ${lineEdit.line.line_no} — ${lineEdit.line.label}`} onClose={() => setLineEdit(null)}>
                    <div className="space-y-3 w-[min(520px,90vw)]">
                        <div className="grid grid-cols-3 gap-3">
                            <Field label={`Quantity (${lineEdit.line.purchase_uom})`} hint={`At least ${lineEdit.line.min_qty}`}><input className={inputCls} type="number" min={lineEdit.line.min_qty} step="any" value={lineEdit.qty} onChange={e => setLineEdit({ ...lineEdit, qty: e.target.value })} autoFocus /></Field>
                            <Field label={`Rate ₹ / ${lineEdit.line.purchase_uom}`} hint="Before GST"><input className={inputCls} type="number" min="0" step="any" value={lineEdit.rate} onChange={e => setLineEdit({ ...lineEdit, rate: e.target.value })} /></Field>
                            <Field label="GST %"><input className={inputCls} type="number" min="0" max="40" step="0.01" value={lineEdit.gst_pct} onChange={e => setLineEdit({ ...lineEdit, gst_pct: e.target.value })} /></Field>
                        </div>
                        <p className="text-xs text-slate-500">= {fmt(Number(lineEdit.qty || 0) * lineEdit.line.factor, lineEdit.line.uom)} {lineEdit.line.uom} · taxable ₹{inr(Number(lineEdit.qty || 0) * Number(lineEdit.rate || 0))} · requisitions need {fmt(lineEdit.line.covered, lineEdit.line.uom)} {lineEdit.line.uom}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Delivery date"><input className={inputCls} type="date" value={lineEdit.delivery_date} onChange={e => setLineEdit({ ...lineEdit, delivery_date: e.target.value })} /></Field>
                            <Field label="Notes"><input className={inputCls} value={lineEdit.notes} onChange={e => setLineEdit({ ...lineEdit, notes: e.target.value })} /></Field>
                        </div>
                        {issued && <Field label="Reason *" hint="The PO is issued; this becomes a revision."><input className={inputCls} value={lineEdit.reason} onChange={e => setLineEdit({ ...lineEdit, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setLineEdit(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (issued && !lineEdit.reason.trim())}
                                onClick={() => run(() => purchasingApi.updateLine(id, lineEdit.line.id, { qty: Number(lineEdit.qty), rate: Number(lineEdit.rate), gst_pct: Number(lineEdit.gst_pct), delivery_date: lineEdit.delivery_date || null, notes: lineEdit.notes, reason: lineEdit.reason }), () => setLineEdit(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {headerEdit && (
                <Modal title="Delivery and terms" onClose={() => setHeaderEdit(null)}>
                    <div className="space-y-3 w-[min(520px,90vw)]">
                        <Field label="Delivery date (whole PO)" hint="Empty = each line's own date."><input className={inputCls} type="date" value={headerEdit.delivery_date} onChange={e => setHeaderEdit({ ...headerEdit, delivery_date: e.target.value })} /></Field>
                        <Field label="Terms" hint="Printed on the PO (packing, inspection, delivery address…)."><textarea className={`${inputCls} min-h-[90px]`} value={headerEdit.terms} onChange={e => setHeaderEdit({ ...headerEdit, terms: e.target.value })} /></Field>
                        <Field label="Notes (internal)"><input className={inputCls} value={headerEdit.notes} onChange={e => setHeaderEdit({ ...headerEdit, notes: e.target.value })} /></Field>
                        {issued && <Field label="Reason *"><input className={inputCls} value={headerEdit.reason} onChange={e => setHeaderEdit({ ...headerEdit, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setHeaderEdit(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (issued && !headerEdit.reason.trim())} onClick={() => run(() => purchasingApi.updateOrder(id, { ...headerEdit, delivery_date: headerEdit.delivery_date || null }), () => setHeaderEdit(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adding && (
                <Modal title={`Add requisition lines to ${po.po_no}`} onClose={() => setAdding(null)}>
                    <div className="space-y-3 w-[min(980px,94vw)] max-h-[75vh] overflow-y-auto">
                        {!adding.lines ? <Loading /> : <RequisitionLinePicker lines={adding.lines} picks={adding.picks} setPicks={(p) => setAdding({ ...adding, picks: p })} />}
                        {issued && <Field label="Reason *"><input className={inputCls} value={adding.reason} onChange={e => setAdding({ ...adding, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdding(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !adding.picks.size || (issued && !adding.reason.trim())}
                                onClick={() => run(() => purchasingApi.addLines(id, [...adding.picks].map(([pr_line_id, qty]) => ({ pr_line_id, qty: Number(qty) })), adding.reason), () => setAdding(null))}>Add to PO</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => ask.run(askText.trim()), () => setAsk(null))} busy={busy} disabled={busy || !askText.trim()}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

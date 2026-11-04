// One supplier invoice: where it is (draft, waiting for approval, on hold, approved), printed amounts with the GST split, match
// status and report (per line: GRN, PO, quantity trail, rate vs PO, GST, HSN), charges, override note, scans behind login, GRN
// receipts, debit notes, history. Invoices booked before 4 Nov 2026 kept no quantity trail in their report: those cells show —.
// Approving is for the purchase manager / factory admin, and not the person who entered it (the server says so too).
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, FileDown, FileMinus, Pause, Pencil, Play, Undo2, Upload } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';
import { INVOICE_STATUS, APPROVAL_STATUS, CHARGE_KINDS, DEBIT_STATUS } from './returnShared';
import { downloadGrnReceipts } from './grnPrint';
import DocumentLink from './DocumentLink';
import { useAuth } from '../../context/AuthContext';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const trail = (v) => (v == null ? '—' : v ? fmt(v) : '—');
const ACTION = { CREATED: 'Entered', EDITED: 'Edited', SUBMITTED: 'Submitted for approval', ON_HOLD: 'Put on hold', RELEASED: 'Off hold', SENT_BACK: 'Sent back', APPROVED: 'Approved', OVERRIDDEN: 'Approved despite a mismatch', CANCELLED: 'Cancelled', DOCUMENT: 'Scan' };

export default function InvoicePage() {
    const { id } = useParams();
    const { user } = useAuth();
    const [making, setMaking] = useState(false);
    const [inv, setInv] = useState(null);
    const [perms, setPerms] = useState({});
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);   // { title, hint, label, required, confirm, run(text) }
    const [askText, setAskText] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const load = useCallback(() => purchasingApi.invoice(id).then(res => setInv(res.data)).catch(err => setError(apiError(err, 'Failed to load the invoice.'))), [id]);
    useEffect(() => { load(); purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {}); }, [load]);
    if (!inv) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setInv((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const open = (a) => { setAskText(''); setFormError(''); setAsk(a); };
    const m = inv.match_report;
    const grnIds = [...new Set(m.lines.map(l => l.grn_id))];
    const units = [...new Set(m.lines.map(l => l.purchase_uom))];
    const getReceipts = async () => {
        setMaking(true); setError('');
        try { await downloadGrnReceipts(grnIds, user?.name || user?.email || ''); } catch (err) { setError(apiError(err, 'Failed to make the GRN receipt.')); } finally { setMaking(false); }
    };
    const cancelled = inv.status === 'CANCELLED';
    const stage = cancelled ? 'CANCELLED' : inv.approval_status;
    const waiting = ['SUBMITTED', 'ON_HOLD'].includes(stage);
    const mine = [inv.created_by_user_id, inv.submitted_by_user_id].filter(Boolean).map(String).includes(String(user?.id));
    const stillMismatch = inv.status === 'MISMATCH';
    const overBilled = inv.lines.filter(l => l.over_billed > 0.0005);
    const tax = inv.tax_type === 'INTER' ? [['IGST', inv.igst_amount]] : [['CGST', inv.cgst_amount], ['SGST', inv.sgst_amount]];
    const hsnOf = (l, i) => l.hsn_code || inv.lines[i]?.hsn_code || '—';
    const approve = () => open(stillMismatch
        ? { title: `Approve ${inv.invoice_no} despite the mismatch`, hint: 'The questions are listed on the page. This is kept with the invoice.', label: 'Override note *', required: true, confirm: 'Approve with override', run: (t) => purchasingApi.invoiceAction(id, 'approve', { override_note: t }) }
        : { title: `Approve ${inv.invoice_no}`, hint: `₹${inr(inv.total_amount)} to ${inv.supplier_name}. The match runs again when you approve.`, confirm: 'Approve', run: () => purchasingApi.invoiceAction(id, 'approve', {}) });

    return (
        <div>
            <Link to="/v3/purchasing/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Supplier invoices</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{inv.invoice_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${APPROVAL_STATUS[stage].cls}`}>{APPROVAL_STATUS[stage].label}</span>
                {!cancelled && inv.status !== 'NOT_CHECKED' && <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${INVOICE_STATUS[inv.status].cls}`}>{INVOICE_STATUS[inv.status].label}</span>}
                <span className="text-sm text-slate-500">{inv.supplier_name}{inv.supplier_gstin ? ` · ${inv.supplier_gstin}` : ''} · {fmtDate(inv.invoice_date)} · entered by {inv.created_by_name || '—'}{inv.approved_at ? ` · approved by ${inv.approved_by_name || '—'} ${fmtDate(inv.approved_at)}` : stage === 'APPROVED' ? ' · booked before approvals began' : ''}</span>
            </div>
            {cancelled && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{inv.cancelled_by_name ? ` by ${inv.cancelled_by_name}` : ''}: {inv.cancelled_reason}</div>}
            {stage === 'ON_HOLD' && <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><b>On hold</b>{inv.held_by_name ? ` by ${inv.held_by_name}` : ''}: {inv.hold_reason}</div>}
            {stage === 'DRAFT' && inv.sent_back_reason && <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><b>Sent back to correct:</b> {inv.sent_back_reason}</div>}
            {inv.documents.length === 0 && !cancelled && stage !== 'DRAFT' && <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><b>No scan on this invoice.</b> Booked before scans became mandatory: attach it below.</div>}
            {inv.override_note && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2"><b>Approved despite a mismatch</b>{inv.override_by_name ? ` by ${inv.override_by_name}` : ''}: {inv.override_note}</div>}
            {overBilled.length > 0 && !cancelled && <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><b>{overBilled.length} line(s) bill goods since returned to the supplier.</b> {stage === 'APPROVED' && perms.invoice ? <Link to={`/v3/purchasing/debit-notes/new?invoice=${id}&reason=RETURN`} className="underline font-semibold">Raise the debit note</Link> : 'A debit note can be raised once it is approved.'}</div>}
            {[...m.blocking, ...m.warnings].length > 0 && <ul className="mb-3 text-sm list-disc pl-5 text-slate-700">{m.blocking.map((x, i) => <li key={`b${i}`} className="text-rose-700 font-semibold">{x}</li>)}{m.warnings.map((x, i) => <li key={`w${i}`} className="text-amber-800">{x}</li>)}</ul>}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
                {[['Taxable', inv.taxable_amount, m.totals.lines.taxable], ...tax.map(([k, v]) => [k, v, null]), ...(inv.tcs_amount ? [['TCS', inv.tcs_amount, null]] : []), ['Total', inv.total_amount, m.totals.lines.total]].map(([k, printed, lines]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className="font-black">₹{inr(printed)}</p>{lines != null && <p className="text-xs text-slate-500">lines ₹{inr(lines)}</p>}</div>
                ))}
                {inv.round_off_amount ? <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Round-off</p><p className="font-black">₹{inr(inv.round_off_amount)}</p></div> : null}
                {inv.debited_amount > 0 && <div className="bg-white border border-indigo-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">After debit notes</p><p className="font-black">₹{inr(inv.net_amount)}</p><p className="text-xs text-slate-500">debited ₹{inr(inv.debited_amount)}</p></div>}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
                {stage === 'DRAFT' && perms.invoice && <Link to={`/v3/purchasing/invoices/${id}/edit`}><PrimaryButton><Pencil size={14} /> Carry on with this draft</PrimaryButton></Link>}
                {waiting && perms.manage && (mine
                    ? <span className="text-sm text-slate-600 self-center">You entered this invoice, so someone else must approve it.</span>
                    : <PrimaryButton onClick={approve} busy={busy} disabled={busy}><CheckCircle2 size={14} /> {stillMismatch ? 'Approve with override' : 'Approve'}</PrimaryButton>)}
                {stage === 'SUBMITTED' && perms.invoice && <SecondaryButton onClick={() => open({ title: `Put ${inv.invoice_no} on hold`, hint: 'It keeps its quantities and stays on record.', label: 'Why? *', required: true, confirm: 'Put on hold', run: (t) => purchasingApi.invoiceAction(id, 'hold', { reason: t }) })}><Pause size={14} /> Put on hold</SecondaryButton>}
                {stage === 'ON_HOLD' && perms.manage && !stillMismatch && <SecondaryButton disabled={busy} onClick={() => run(() => purchasingApi.invoiceAction(id, 'release', {}))}><Play size={14} /> Take off hold</SecondaryButton>}
                {waiting && perms.invoice && <SecondaryButton onClick={() => open({ title: `Send ${inv.invoice_no} back to correct`, hint: 'It returns to draft and its quantities are free again.', label: 'What needs correcting? *', required: true, confirm: 'Send back', run: (t) => purchasingApi.invoiceAction(id, 'send-back', { reason: t }) })}><Undo2 size={14} /> Send back</SecondaryButton>}
                {stage === 'APPROVED' && perms.invoice && <Link to={`/v3/purchasing/debit-notes/new?invoice=${id}`}><SecondaryButton><FileMinus size={14} /> Debit note</SecondaryButton></Link>}
                {grnIds.length > 0 && <SecondaryButton onClick={getReceipts} disabled={making}><FileDown size={14} /> {making ? 'Making PDF…' : `GRN receipt${grnIds.length > 1 ? `s (${grnIds.length})` : ''}`}</SecondaryButton>}
                {!cancelled && (stage === 'APPROVED' ? perms.manage : perms.invoice) && <SecondaryButton onClick={() => open({ title: `Cancel ${inv.invoice_no}`, hint: 'Its quantities become billable again.', label: 'Reason *', required: true, confirm: 'Cancel invoice', run: (t) => purchasingApi.cancelInvoice(id, t) })}><Ban size={14} /> Cancel invoice</SecondaryButton>}
            </div>
            <ErrorBox text={error} />
            {stage === 'DRAFT' && m.lines.length === 0 && <p className="text-sm text-slate-500 mb-4">A draft holds no quantity and is not checked yet. {inv.lines.length} line(s) saved so far.</p>}
            {m.lines.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <table className="w-full text-sm min-w-[1160px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2.5">GRN / PO</th><th className="px-3 py-2.5">Item</th><th className="px-2 py-2.5">HSN</th><th className="px-2 py-2.5 text-right">PO qty</th><th className="px-2 py-2.5 text-right">Received</th><th className="px-2 py-2.5 text-right">Rejected</th><th className="px-2 py-2.5 text-right">Returned</th><th className="px-2 py-2.5 text-right">Earlier billed</th><th className="px-3 py-2.5 text-right">Qty billed</th><th className="px-3 py-2.5 text-right">Rate ₹ (PO)</th><th className="px-3 py-2.5 text-right">GST %</th><th className="px-3 py-2.5 text-right">Taxable ₹</th><th className="px-3 py-2.5">Check</th></tr>
                        </thead>
                        <tbody>
                            {m.lines.map((l, i) => (
                                <tr key={l.grn_line_id} className="border-t border-slate-100">
                                    <td className="px-3 py-2 text-xs"><Link to={`/v3/purchasing/grns/${l.grn_id}`} className="font-semibold text-indigo-700 hover:underline">{l.grn_no}</Link> line {l.grn_line_no}<span className="block"><Link to={`/v3/purchasing/orders/${l.po_id}`} className="text-indigo-700 hover:underline">{l.po_no}</Link> line {l.po_line_no}</span></td>
                                    <td className="px-3 py-2">{l.label}{l.over_po > 0.0005 && <span className="block text-xs font-semibold text-amber-800" title={l.approval_reason || ''}>{fmt(l.over_po)} {l.purchase_uom} over PO{l.approved_by_name ? ` · approved by ${l.approved_by_name}` : ''}</span>}</td>
                                    <td className="px-2 py-2 text-xs">{hsnOf(l, i)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{trail(l.po_qty)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{trail(l.received_on_po)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{trail(l.rejected)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{trail(l.returned)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{trail(l.billed)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(l.qty)} {l.purchase_uom}<span className="block text-[11px] text-slate-500">billable {fmt(l.billable)}</span></td>
                                    <td className="px-3 py-2 text-right tabular-nums">{inr(l.rate)}<span className="block text-[11px] text-slate-500">PO {inr(l.po_rate)}{l.rate_variance_pct ? ` (${l.rate_variance_pct > 0 ? '+' : ''}${l.rate_variance_pct}%)` : ''}</span></td>
                                    <td className="px-3 py-2 text-right tabular-nums">{l.gst_pct}{l.gst_pct !== l.po_gst_pct && <span className="block text-[11px] text-rose-700">PO {l.po_gst_pct}</span>}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{inr(l.taxable)}</td>
                                    <td className="px-3 py-2">{l.ok ? <span className="text-emerald-700 font-semibold">ok</span> : <span className="text-rose-700 font-semibold">mismatch</span>}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                <td className="px-3 py-2" colSpan={3}>Total · {m.lines.length} line(s)</td><td colSpan={5} />
                                <td className="px-3 py-2 text-right tabular-nums">{units.length === 1 ? `${fmt(m.lines.reduce((s, l) => s + l.qty, 0))} ${units[0]}` : '—'}</td><td colSpan={2} />
                                <td className="px-3 py-2 text-right tabular-nums">{inr(m.lines.reduce((s, l) => s + l.taxable, 0))}</td><td />
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
            {inv.charges.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <table className="w-full text-sm min-w-[560px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Charge</th><th className="px-3 py-2.5">Description</th><th className="px-3 py-2.5 text-right">Amount ₹</th><th className="px-3 py-2.5 text-right">GST %</th></tr></thead>
                        <tbody>
                            {inv.charges.map((c, i) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2">{CHARGE_KINDS[c.kind] || c.kind}</td><td className="px-3 py-2 text-slate-600">{c.description || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{c.kind === 'DISCOUNT' ? '−' : ''}{inr(c.amount)}</td><td className="px-3 py-2 text-right tabular-nums">{c.gst_pct}</td></tr>)}
                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td className="px-3 py-2" colSpan={2}>Total · {inv.charges.length} charge(s)</td><td className="px-3 py-2 text-right tabular-nums">{inr(inv.charges.reduce((s, c) => s + (c.kind === 'DISCOUNT' ? -c.amount : c.amount), 0))}</td><td /></tr>
                        </tbody>
                    </table>
                </div>
            )}
            {inv.debit_notes.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <table className="w-full text-sm min-w-[560px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Debit note</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Total ₹</th></tr></thead>
                        <tbody>
                            {inv.debit_notes.map(d => <tr key={d.id} className={`border-t border-slate-100 ${d.status === 'CANCELLED' ? 'opacity-60' : ''}`}><td className="px-3 py-2"><Link to={`/v3/purchasing/debit-notes/${d.id}`} className="font-semibold text-indigo-700 hover:underline">{d.debit_no}</Link></td><td className="px-3 py-2">{fmtDate(d.note_date)}</td><td className="px-3 py-2"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${DEBIT_STATUS[d.status].cls}`}>{DEBIT_STATUS[d.status].label}</span></td><td className="px-3 py-2 text-right tabular-nums">{inr(d.total_amount)}</td></tr>)}
                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td className="px-3 py-2" colSpan={3}>Total approved</td><td className="px-3 py-2 text-right tabular-nums">{inr(inv.debited_amount)}</td></tr>
                        </tbody>
                    </table>
                </div>
            )}
            <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Scans</p>
                    {inv.documents.length === 0 ? <p className="text-sm text-slate-400 mb-2">None yet.</p> : <ul className="text-sm mb-3 space-y-1">{inv.documents.map(d => <li key={d.id}><DocumentLink path={`/v3/purchasing/invoices/${id}/documents/${d.id}`} name={d.original_filename} /><span className="text-xs text-slate-500"> · {new Date(d.created_at).toLocaleDateString('en-IN')}</span></li>)}</ul>}
                    {perms.invoice && <div className="flex flex-wrap items-center gap-2"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" aria-label="Scan file" /><SecondaryButton onClick={() => run(() => purchasingApi.uploadInvoiceDocument(id, file), () => setFile(null))} disabled={busy || !file}><Upload size={14} /> Upload</SecondaryButton></div>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                    {inv.history.map(h => <div key={h.id} className="py-1 text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}</div>)}
                </div>
            </div>
            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        {ask.label && <Field label={ask.label}><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => ask.run(askText.trim()), () => setAsk(null))} busy={busy} disabled={busy || (ask.required && !askText.trim())}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

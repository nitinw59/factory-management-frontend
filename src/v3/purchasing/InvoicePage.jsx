// One supplier invoice: printed amounts, match status and report (per line:
// GRN, PO, billable, rate vs PO, GST), override note, scans, history, cancel.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Upload } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { API_BASE_URL } from '../../utils/api';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';
import { INVOICE_STATUS } from './returnShared';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const ACTION = { CREATED: 'Booked', OVERRIDDEN: 'Mismatch overridden', CANCELLED: 'Cancelled', DOCUMENT: 'Scan' };

export default function InvoicePage() {
    const { id } = useParams();
    const [inv, setInv] = useState(null);
    const [perms, setPerms] = useState({});
    const [error, setError] = useState('');
    const [cancel, setCancel] = useState(null);
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
    const m = inv.match_report;

    return (
        <div>
            <Link to="/v3/purchasing/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Supplier invoices</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{inv.invoice_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${INVOICE_STATUS[inv.status].cls}`}>{INVOICE_STATUS[inv.status].label}</span>
                <span className="text-sm text-slate-500">{inv.supplier_name} · {fmtDate(inv.invoice_date)} · entered by {inv.created_by_name || '—'}</span>
            </div>
            {inv.status === 'CANCELLED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{inv.cancelled_by_name ? ` by ${inv.cancelled_by_name}` : ''}: {inv.cancelled_reason}</div>}
            {inv.override_note && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2"><b>Booked despite a mismatch</b>{inv.override_by_name ? ` by ${inv.override_by_name}` : ''}: {inv.override_note}</div>}
            {[...m.blocking, ...m.warnings].length > 0 && <ul className="mb-3 text-sm list-disc pl-5 text-slate-700">{m.blocking.map((x, i) => <li key={`b${i}`} className="text-rose-700 font-semibold">{x}</li>)}{m.warnings.map((x, i) => <li key={`w${i}`} className="text-amber-800">{x}</li>)}</ul>}
            <div className="grid sm:grid-cols-3 gap-3 mb-4">
                {[['Taxable', inv.taxable_amount, m.totals.lines.taxable], ['GST', inv.gst_amount, m.totals.lines.gst], ['Total', inv.total_amount, m.totals.lines.total]].map(([k, printed, lines]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className="font-black">₹{inr(printed)}</p><p className="text-xs text-slate-500">lines ₹{inr(lines)}</p></div>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
                {perms.invoice && inv.status !== 'CANCELLED' && <SecondaryButton onClick={() => { setFormError(''); setCancel(''); }}><Ban size={14} /> Cancel invoice</SecondaryButton>}
            </div>
            <ErrorBox text={error} />
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-3 py-2.5">GRN / PO</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Rate ₹ (PO)</th><th className="px-3 py-2.5 text-right">GST %</th><th className="px-3 py-2.5 text-right">Taxable ₹</th><th className="px-3 py-2.5">Check</th></tr>
                    </thead>
                    <tbody>
                        {m.lines.map(l => (
                            <tr key={l.grn_line_id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-xs"><Link to={`/v3/purchasing/grns/${l.grn_id}`} className="font-semibold text-indigo-700 hover:underline">{l.grn_no}</Link> line {l.grn_line_no}<span className="block"><Link to={`/v3/purchasing/orders/${l.po_id}`} className="text-indigo-700 hover:underline">{l.po_no}</Link> line {l.po_line_no}</span></td>
                                <td className="px-3 py-2">{l.label}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(l.qty)} {l.purchase_uom}<span className="block text-[11px] text-slate-500">billable {fmt(l.billable)}</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.rate)}<span className="block text-[11px] text-slate-500">PO {inr(l.po_rate)}{l.rate_variance_pct ? ` (${l.rate_variance_pct > 0 ? '+' : ''}${l.rate_variance_pct}%)` : ''}</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.gst_pct}{l.gst_pct !== l.po_gst_pct && <span className="block text-[11px] text-rose-700">PO {l.po_gst_pct}</span>}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.taxable)}</td>
                                <td className="px-3 py-2">{l.ok ? <span className="text-emerald-700 font-semibold">ok</span> : <span className="text-rose-700 font-semibold">mismatch</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Scans</p>
                    {inv.documents.length === 0 ? <p className="text-sm text-slate-400 mb-2">None yet.</p> : <ul className="text-sm mb-3 space-y-1">{inv.documents.map(d => <li key={d.id}><a href={`${API_BASE_URL}${d.file_url}`} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">{d.original_filename}</a><span className="text-xs text-slate-500"> · {new Date(d.created_at).toLocaleDateString('en-IN')}</span></li>)}</ul>}
                    {perms.invoice && <div className="flex flex-wrap items-center gap-2"><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" aria-label="Scan file" /><SecondaryButton onClick={() => run(() => purchasingApi.uploadInvoiceDocument(id, file), () => setFile(null))} disabled={busy || !file}><Upload size={14} /> Upload</SecondaryButton></div>}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                    {inv.history.map(h => <div key={h.id} className="py-1 text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}</div>)}
                </div>
            </div>
            {cancel !== null && (
                <Modal title={`Cancel ${inv.invoice_no}`} onClose={() => setCancel(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <p className="text-sm text-slate-600">Its quantities become billable again.</p>
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={cancel} onChange={e => setCancel(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCancel(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => purchasingApi.cancelInvoice(id, cancel.trim()), () => setCancel(null))} busy={busy} disabled={busy || !cancel.trim()}>Cancel invoice</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

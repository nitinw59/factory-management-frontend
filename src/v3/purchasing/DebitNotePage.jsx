// One debit note (4 Nov 2026): lines, GST split, approve (someone other than who entered it), cancel, PDF, history.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, FileDown } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { inr } from './poShared';
import { DEBIT_STATUS } from './returnShared';
import { exportDebitNotePdf } from './debitNotePrint';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const ACTION = { CREATED: 'Entered', APPROVED: 'Approved', CANCELLED: 'Cancelled' };

export default function DebitNotePage() {
    const { id } = useParams();
    const { user } = useAuth();
    const [d, setD] = useState(null);
    const [perms, setPerms] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [cancel, setCancel] = useState(null);
    useEffect(() => {
        purchasingApi.debitNote(id).then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load the debit note.')));
        purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, [id]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const act = async (action, data, close) => {
        setBusy(true); setError('');
        try { setD((await purchasingApi.debitNoteAction(id, action, data)).data); if (close) close(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const mine = String(d.created_by_user_id) === String(user?.id);
    return (
        <div>
            <Link to="/v3/purchasing/debit-notes" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Debit notes</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{d.debit_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${DEBIT_STATUS[d.status].cls}`}>{DEBIT_STATUS[d.status].label}</span>
                <span className="text-sm text-slate-500">{d.supplier_name} · {fmtDate(d.note_date)} · on <Link to={`/v3/purchasing/invoices/${d.invoice_id}`} className="text-indigo-700 hover:underline">{d.invoice_no}</Link> · entered by {d.created_by_name || '—'}{d.approved_by_name ? ` · approved by ${d.approved_by_name}` : ''}</span>
            </div>
            <p className="text-sm text-slate-700 mb-3"><b>{d.reason_label}:</b> {d.reason}{d.supplier_credit_no ? ` · supplier's credit note ${d.supplier_credit_no}` : ''}</p>
            {d.status === 'CANCELLED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{d.cancelled_by_name ? ` by ${d.cancelled_by_name}` : ''}: {d.cancelled_reason}</div>}
            <div className="flex flex-wrap gap-2 mb-3">
                {d.status === 'SUBMITTED' && perms.manage && (mine
                    ? <span className="text-sm text-slate-600 self-center">You entered this debit note, so someone else must approve it.</span>
                    : <PrimaryButton onClick={() => act('approve', {})} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Approve</PrimaryButton>)}
                <SecondaryButton onClick={() => exportDebitNotePdf(d, user?.name || user?.email || '').catch(err => setError(err?.message || 'Failed to make the PDF.'))}><FileDown size={14} /> PDF</SecondaryButton>
                {d.status !== 'CANCELLED' && (d.status === 'APPROVED' ? perms.manage : perms.invoice) && <SecondaryButton onClick={() => setCancel('')}><Ban size={14} /> Cancel</SecondaryButton>}
            </div>
            <ErrorBox text={error} />
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">HSN</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Rate ₹</th><th className="px-3 py-2.5 text-right">GST %</th><th className="px-3 py-2.5 text-right">Taxable ₹</th><th className="px-3 py-2.5 text-right">GST ₹</th></tr></thead>
                    <tbody>
                        {d.lines.map(l => <tr key={l.id} className="border-t border-slate-100"><td className="px-3 py-2">{l.label}<span className="block text-xs text-slate-500">{l.grn_no}</span></td><td className="px-3 py-2 text-xs">{l.hsn_code || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(l.qty)} {l.purchase_uom}</td><td className="px-3 py-2 text-right tabular-nums">{inr(l.rate)}</td><td className="px-3 py-2 text-right tabular-nums">{l.gst_pct}</td><td className="px-3 py-2 text-right tabular-nums">{inr(l.taxable)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(l.gst)}</td></tr>)}
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td className="px-3 py-2" colSpan={5}>Total ₹{inr(d.total_amount)} · {d.tax_type === 'INTER' ? `IGST ${inr(d.igst_amount)}` : `CGST ${inr(d.cgst_amount)} + SGST ${inr(d.sgst_amount)}`}</td><td className="px-3 py-2 text-right tabular-nums">{inr(d.taxable_amount)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(d.cgst_amount + d.sgst_amount + d.igst_amount)}</td></tr>
                    </tbody>
                </table>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                {d.history.map(h => <div key={h.id} className="py-1 text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}</div>)}
            </div>
            {cancel !== null && (
                <Modal title={`Cancel ${d.debit_no}`} onClose={() => setCancel(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={cancel} onChange={e => setCancel(e.target.value)} autoFocus /></Field>
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setCancel(null)}>Back</SecondaryButton><PrimaryButton busy={busy} disabled={busy || !cancel.trim()} onClick={() => act('cancel', { reason: cancel.trim() }, () => setCancel(null))}>Cancel debit note</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

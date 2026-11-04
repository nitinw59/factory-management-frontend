// Raise a debit note on an approved invoice (4 Nov 2026): what it is for, then per invoice line the quantity and rate to claim.
// Goods returned: the quantity billed for goods since returned, at the billed rate. Rate difference: the difference per unit on
// the quantity. Someone else approves it.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileMinus } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';
import { DEBIT_REASONS } from './returnShared';

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function NewDebitNotePage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const invoiceId = params.get('invoice');
    const [inv, setInv] = useState(null);
    const [code, setCode] = useState(params.get('reason') === 'RETURN' ? 'RETURN' : 'RATE');
    const [reason, setReason] = useState('');
    const [noteDate, setNoteDate] = useState(todayLocal());
    const [creditNo, setCreditNo] = useState('');
    const [rows, setRows] = useState({});   // invoice line id → { on, qty, rate }
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!invoiceId) { setError('Open an approved invoice and choose Debit note.'); return; }
        purchasingApi.invoice(invoiceId).then(res => setInv(res.data)).catch(err => setError(apiError(err, 'Failed to load the invoice.')));
    }, [invoiceId]);
    const lines = useMemo(() => (inv ? inv.lines.map((l, i) => ({ ...l, ...(inv.match_report.lines[i] ? { label: inv.match_report.lines[i].label, grn_no: inv.match_report.lines[i].grn_no, purchase_uom: inv.match_report.lines[i].purchase_uom } : {}) })) : []), [inv]);
    useEffect(() => {
        if (!inv) return;
        setRows(Object.fromEntries(lines.map(l => [l.id, code === 'RETURN'
            ? { on: l.over_billed > 0.0005, qty: l.over_billed > 0 ? String(l.over_billed) : '', rate: String(l.rate) }
            : { on: false, qty: String(l.qty), rate: '' }])));
    }, [inv, lines, code]);
    if (!inv) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const chosen = lines.filter(l => rows[l.id]?.on).map(l => ({ l, qty: Number(rows[l.id].qty), rate: Number(rows[l.id].rate) }));
    const taxable = r2(chosen.reduce((s, x) => s + r2(x.qty * x.rate), 0));
    const gst = r2(chosen.reduce((s, x) => s + r2(r2(x.qty * x.rate) * x.l.gst_pct / 100), 0));
    const setRow = (id, patch) => setRows(r => ({ ...r, [id]: { ...r[id], ...patch } }));
    const needed = [!reason.trim() && 'the reason', !chosen.length && 'a line', chosen.some(x => !(x.qty > 0) || !(x.rate > 0)) && 'quantity and rate on every ticked line'].filter(Boolean);
    const save = async () => {
        setBusy(true); setError('');
        try {
            const res = await purchasingApi.createDebitNote({ invoice_id: invoiceId, reason_code: code, reason, note_date: noteDate, supplier_credit_no: creditNo, lines: chosen.map(x => ({ invoice_line_id: x.l.id, qty: x.qty, rate: x.rate })) });
            navigate(`/v3/purchasing/debit-notes/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to save the debit note.')); setBusy(false); }
    };
    return (
        <div>
            <Link to={`/v3/purchasing/invoices/${invoiceId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> {inv.invoice_no}</Link>
            <PageHeader title="Raise a debit note" subtitle={`On ${inv.supplier_name}'s invoice ${inv.invoice_no}, ₹${inr(inv.total_amount)}. Someone else approves it.`} />
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                <Field label="For *"><select className={inputCls} value={code} onChange={e => setCode(e.target.value)}>{Object.entries(DEBIT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Date *"><input className={inputCls} type="date" max={todayLocal()} value={noteDate} onChange={e => setNoteDate(e.target.value)} /></Field>
                <Field label="Supplier's credit note no."><input className={inputCls} value={creditNo} onChange={e => setCreditNo(e.target.value)} /></Field>
                <Field label="Reason *"><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} /></Field>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5 w-8" /><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Billed</th><th className="px-3 py-2.5 text-right">For goods returned</th><th className="px-3 py-2.5 text-right">Debited ₹</th><th className="px-3 py-2.5 w-28">Qty</th><th className="px-3 py-2.5 w-28">{code === 'RATE' ? 'Difference ₹' : 'Rate ₹'}</th><th className="px-3 py-2.5 text-right">Taxable ₹</th><th className="px-3 py-2.5 text-right">GST ₹</th></tr></thead>
                    <tbody>
                        {lines.map(l => {
                            const r = rows[l.id] || {};
                            const t = r.on ? r2(Number(r.qty) * Number(r.rate)) : 0;
                            return <tr key={l.id} className={`border-t border-slate-100 ${r.on ? 'bg-indigo-50/40' : ''}`}>
                                <td className="px-3 py-2"><input type="checkbox" checked={Boolean(r.on)} onChange={e => setRow(l.id, { on: e.target.checked })} aria-label={`Debit ${l.label}`} /></td>
                                <td className="px-3 py-2">{l.label}<span className="block text-xs text-slate-500">{l.grn_no} · HSN {l.hsn_code || '—'} · GST {l.gst_pct}%</span></td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(l.qty)} {l.purchase_uom} @ ₹{inr(l.rate)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.over_billed > 0 ? fmt(l.over_billed) : '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.debited_value ? inr(l.debited_value) : '—'}</td>
                                <td className="px-3 py-2">{r.on && <input className={`${inputCls} !py-1 !px-2 text-right`} type="number" min="0" step="any" value={r.qty} onChange={e => setRow(l.id, { qty: e.target.value })} aria-label="Quantity" />}</td>
                                <td className="px-3 py-2">{r.on && <input className={`${inputCls} !py-1 !px-2 text-right`} type="number" min="0" step="any" value={r.rate} onChange={e => setRow(l.id, { rate: e.target.value })} aria-label="Rate" />}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.on ? inr(t) : ''}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.on ? inr(t * l.gst_pct / 100) : ''}</td>
                            </tr>;
                        })}
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td /><td className="px-3 py-2" colSpan={6}>Total · {chosen.length} line(s) · ₹{inr(r2(taxable + gst))} with GST</td><td className="px-3 py-2 text-right tabular-nums">{inr(taxable)}</td><td className="px-3 py-2 text-right tabular-nums">{inr(gst)}</td></tr>
                    </tbody>
                </table>
            </div>
            <ErrorBox text={error} />
            <div className="flex flex-wrap items-center gap-3">
                <PrimaryButton onClick={save} busy={busy} disabled={busy || needed.length > 0}><FileMinus size={15} /> Send for approval</PrimaryButton>
                {needed.length > 0 && <p className="text-sm text-slate-600">Still needed: {needed.join(', ')}.</p>}
            </div>
        </div>
    );
}

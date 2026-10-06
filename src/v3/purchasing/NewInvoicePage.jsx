// Enter a supplier invoice: supplier → its received GRN lines not yet billed;
// tick lines, quantity / rate / GST as billed (pre-filled from the PO), the
// amounts as printed; the three-way match runs live. A mismatch can only be
// booked by the purchase manager / factory admin with an override note.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';
import { INVOICE_STATUS } from './returnShared';

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function NewInvoicePage() {
    const navigate = useNavigate();
    const [perms, setPerms] = useState({});
    const [suppliers, setSuppliers] = useState([]);
    const [supplierId, setSupplierId] = useState('');
    const [lines, setLines] = useState(null);
    const [picks, setPicks] = useState({});   // grn line id → { qty, rate, gst_pct }
    const [head, setHead] = useState({ invoice_no: '', invoice_date: todayLocal(), taxable_amount: '', gst_amount: '', total_amount: '', notes: '' });
    const [report, setReport] = useState(null);
    const [override, setOverride] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {});
        purchasingApi.suppliers().then(res => setSuppliers(res.data)).catch(err => setError(apiError(err, 'Failed to load suppliers.')));
    }, []);
    useEffect(() => {
        setLines(null); setPicks({}); setReport(null);
        if (supplierId) purchasingApi.billable(supplierId).then(res => setLines(res.data)).catch(err => setError(apiError(err, 'Failed to load GRN lines.')));
    }, [supplierId]);
    const chosen = Object.entries(picks).map(([id, p]) => ({ grn_line_id: id, qty: Number(p.qty), rate: Number(p.rate), gst_pct: Number(p.gst_pct) }));
    const body = { supplier_id: supplierId, ...head, lines: chosen };
    const key = JSON.stringify(body);
    useEffect(() => {
        if (!chosen.length || head.taxable_amount === '' || head.gst_amount === '' || head.total_amount === '') { setReport(null); return undefined; }
        const t = setTimeout(() => purchasingApi.checkInvoice(JSON.parse(key)).then(res => { setReport(res.data); setError(''); }).catch(err => { setReport(null); setError(apiError(err, 'Check failed.')); }), 400);
        return () => clearTimeout(t);
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = (l) => setPicks(p => { const n = { ...p }; if (n[l.id]) delete n[l.id]; else n[l.id] = { qty: String(l.billable), rate: String(l.po_rate), gst_pct: String(l.po_gst_pct) }; return n; });
    const fromLines = () => {
        const taxable = r2(chosen.reduce((s, l) => s + r2(l.qty * l.rate), 0));
        const gst = r2(chosen.reduce((s, l) => s + r2(r2(l.qty * l.rate) * l.gst_pct / 100), 0));
        setHead({ ...head, taxable_amount: String(taxable), gst_amount: String(gst), total_amount: String(r2(taxable + gst)) });
    };
    const mismatch = report?.status === 'MISMATCH';
    const save = async () => {
        setBusy(true); setError('');
        try { const res = await purchasingApi.createInvoice({ ...body, override_note: mismatch ? override : undefined }); navigate(`/v3/purchasing/invoices/${res.data.id}`); } catch (err) { setError(apiError(err, 'Failed to save the invoice.')); setBusy(false); }
    };

    return (
        <div>
            <Link to="/v3/purchasing/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Supplier invoices</Link>
            <PageHeader title="Enter supplier invoice" subtitle="Bill against goods received. Quantity is checked against what was received (less returns and earlier invoices), rate against the PO, GST against the PO." />
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2"><Field label="Supplier *"><select className={inputCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Choose…</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
                <Field label="Invoice no. *"><input className={inputCls} value={head.invoice_no} onChange={e => setHead({ ...head, invoice_no: e.target.value })} /></Field>
                <Field label="Invoice date *"><input className={inputCls} type="date" max={todayLocal()} value={head.invoice_date} onChange={e => setHead({ ...head, invoice_date: e.target.value })} /></Field>
            </div>
            {supplierId && (!lines ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <table className="w-full text-sm min-w-[980px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2.5 w-8" /><th className="px-3 py-2.5">GRN / PO</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Billable</th><th className="px-3 py-2.5 w-28">Qty billed</th><th className="px-3 py-2.5 w-28">Rate ₹</th><th className="px-3 py-2.5 w-24">GST %</th><th className="px-3 py-2.5 text-right">Value ₹</th></tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nothing received from this supplier is waiting to be billed.</td></tr>}
                            {lines.map(l => {
                                const p = picks[l.id];
                                return (
                                    <tr key={l.id} className={`border-t border-slate-100 ${p ? 'bg-indigo-50/40' : ''}`}>
                                        <td className="px-3 py-2"><input type="checkbox" checked={Boolean(p)} onChange={() => toggle(l)} aria-label={`Bill ${l.grn_no} line ${l.line_no}`} /></td>
                                        <td className="px-3 py-2 text-xs"><b>{l.grn_no}</b> · {fmtDate(l.received_date)}<span className="block text-slate-500">{l.po_no} line {l.po_line_no} · challan {l.challan_no}</span></td>
                                        <td className="px-3 py-2">{l.label}<span className="block text-xs text-slate-500">PO ₹{l.po_rate} / {l.purchase_uom} · GST {l.po_gst_pct}%</span></td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmt(l.billable)} {l.purchase_uom}{l.returned ? <span className="block text-[11px] text-slate-500">{fmt(l.returned)} returned</span> : null}</td>
                                        {p ? <>
                                            <td className="px-3 py-2"><input className={`${inputCls} !py-1`} type="number" min="0" step="any" value={p.qty} onChange={e => setPicks({ ...picks, [l.id]: { ...p, qty: e.target.value } })} aria-label="Quantity billed" /></td>
                                            <td className="px-3 py-2"><input className={`${inputCls} !py-1`} type="number" min="0" step="any" value={p.rate} onChange={e => setPicks({ ...picks, [l.id]: { ...p, rate: e.target.value } })} aria-label="Rate billed" /></td>
                                            <td className="px-3 py-2"><input className={`${inputCls} !py-1`} type="number" min="0" max="40" step="0.01" value={p.gst_pct} onChange={e => setPicks({ ...picks, [l.id]: { ...p, gst_pct: e.target.value } })} aria-label="GST %" /></td>
                                            <td className="px-3 py-2 text-right tabular-nums">{inr(Number(p.qty) * Number(p.rate))}</td>
                                        </> : <td colSpan={4} />}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ))}
            {chosen.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                    <div className="grid sm:grid-cols-4 gap-3 items-end">
                        <Field label="Taxable value as printed (₹) *"><input className={inputCls} type="number" min="0" step="0.01" value={head.taxable_amount} onChange={e => setHead({ ...head, taxable_amount: e.target.value })} /></Field>
                        <Field label="GST as printed (₹) *"><input className={inputCls} type="number" min="0" step="0.01" value={head.gst_amount} onChange={e => setHead({ ...head, gst_amount: e.target.value })} /></Field>
                        <Field label="Invoice total (₹) *"><input className={inputCls} type="number" min="0" step="0.01" value={head.total_amount} onChange={e => setHead({ ...head, total_amount: e.target.value })} /></Field>
                        <SecondaryButton onClick={fromLines}>Fill from lines</SecondaryButton>
                    </div>
                    <Field label="Notes"><input className={inputCls} value={head.notes} onChange={e => setHead({ ...head, notes: e.target.value })} /></Field>
                    {report && (
                        <div className={`rounded-lg border px-3 py-2 text-sm ${report.status === 'MATCHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : report.status === 'MATCHED_WITH_WARNING' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                            <p className="font-bold flex items-center gap-1.5">{report.status === 'MISMATCH' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                                {report.status === 'MISMATCH' ? 'Does not match' : INVOICE_STATUS[report.status].label} — lines ₹{inr(report.totals.lines.total)} vs invoice ₹{inr(report.totals.printed.total)} (tolerance {report.tolerance_pct}%)</p>
                            {[...report.blocking, ...report.warnings].length > 0 && <ul className="list-disc pl-5 text-xs mt-1">{report.blocking.map((x, i) => <li key={`b${i}`} className="font-semibold">{x}</li>)}{report.warnings.map((x, i) => <li key={`w${i}`}>{x}</li>)}</ul>}
                        </div>
                    )}
                    {mismatch && (perms.manage
                        ? <Field label="Override note * (purchase manager)" hint="Why this invoice is booked although it doesn't match — kept with the invoice."><input className={inputCls} value={override} onChange={e => setOverride(e.target.value)} /></Field>
                        : <p className="text-sm text-rose-800">Fix the entry, or ask the purchase manager to book it with an override note.</p>)}
                </div>
            )}
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !report || !head.invoice_no.trim() || !head.invoice_date || (mismatch && (!perms.manage || !override.trim()))}><Receipt size={15} /> {mismatch ? 'Book with override' : 'Book invoice'}</PrimaryButton>
        </div>
    );
}

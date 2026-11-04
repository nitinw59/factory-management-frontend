// Enter a supplier invoice, or carry on with a draft (/invoices/:id/edit). The accountant works from the paper, top to bottom:
// first what is printed (supplier, number, date, taxable, CGST + SGST or IGST, total, typed, never copied from the lines) and
// its scan; then the GRN lines of that supplier, grouped by GRN, each with its quantity trail, a warning when goods came above
// the PO, and its HSN; then freight and other charges. Quantity, rate and GST start from the rate frozen when the goods came.
// The three-way match runs live and marks the lines it questions.
// Phase 2 (4 Nov 2026, owner: "build next phase"): Save draft holds nothing. Submit sends it for approval by someone else; one
// that doesn't match goes on hold with the reason instead. An unsaved invoice is also kept on this device (not its scan).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Receipt, AlertTriangle, CheckCircle2, FileDown, Paperclip, Plus, Save, X } from 'lucide-react';
import SearchableSelect from '../../shared/SearchableSelect';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, SearchInput, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { inr } from './poShared';
import { INVOICE_STATUS, CHARGE_KINDS } from './returnShared';
import { downloadGrnReceipts } from './grnPrint';

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const GST_RATES = [0, 5, 12, 18, 28, 40];
const MAX_SCAN = 15 * 1024 * 1024;
const DRAFT_KEY = 'v3.invoiceDraft';
const EMPTY_HEAD = { invoice_no: '', invoice_date: '', taxable_amount: '', cgst_amount: '', sgst_amount: '', igst_amount: '', total_amount: '', notes: '' };
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } };
const writeDraft = (v) => { try { if (v) localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); else localStorage.removeItem(DRAFT_KEY); } catch { /* per-device convenience only */ } };
const num = 'px-1.5 py-2 text-right tabular-nums whitespace-nowrap';
const head = 'px-1.5 py-2.5 text-right';
// A column total in its unit; different units are never added.
const sumByUnit = (list, field) => {
    const units = [...new Set(list.map(l => l.purchase_uom))];
    return units.length === 1 ? fmt(list.reduce((s, l) => s + (Number(l[field]) || 0), 0)) : '—';
};
const chargeSums = (c) => {
    const amount = Number(c.amount) || 0;
    const taxable = c.kind === 'TCS' ? 0 : c.kind === 'DISCOUNT' ? -amount : amount;
    return { taxable, gst: r2(taxable * (Number(c.gst_pct) || 0) / 100), tcs: c.kind === 'TCS' ? amount : 0 };
};

export default function NewInvoicePage() {
    const navigate = useNavigate();
    const { id: editId } = useParams();
    const { user } = useAuth();
    const [draft] = useState(() => (editId ? null : readDraft()));
    const [restored, setRestored] = useState(Boolean(draft));
    const [saved, setSaved] = useState(null);   // the draft on the server, when editing one
    const [perms, setPerms] = useState({});
    const [suppliers, setSuppliers] = useState([]);
    const [supplierId, setSupplierId] = useState(draft?.supplierId || '');
    const [lines, setLines] = useState(null);
    const [picks, setPicks] = useState(draft?.picks || {});   // grn line id → { qty, rate, gst_pct, hsn_code }
    const [charges, setCharges] = useState(draft?.charges || []);
    const [form, setForm] = useState(draft?.form ? { ...EMPTY_HEAD, ...draft.form } : EMPTY_HEAD);
    const [scan, setScan] = useState(null);
    const [q, setQ] = useState('');
    const [report, setReport] = useState(null);
    const [holdReason, setHoldReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [receipts, setReceipts] = useState(null);   // what is being made: a GRN id, or 'ticked'
    const lastCheck = useRef(0);
    const setHead = (patch) => setForm(f => ({ ...f, ...patch }));

    useEffect(() => {
        purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {});
        purchasingApi.suppliers().then(res => setSuppliers(res.data)).catch(err => setError(apiError(err, 'Failed to load suppliers.')));
    }, []);
    useEffect(() => {
        if (!editId) return;
        purchasingApi.invoice(editId).then(({ data: inv }) => {
            if (inv.approval_status !== 'DRAFT' || inv.status === 'CANCELLED') { navigate(`/v3/purchasing/invoices/${editId}`, { replace: true }); return; }
            const str = (v) => (Number(v) ? String(v) : '');
            setSaved(inv);
            setSupplierId(String(inv.supplier_id));
            setForm({ invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, taxable_amount: str(inv.taxable_amount), cgst_amount: str(inv.cgst_amount), sgst_amount: str(inv.sgst_amount), igst_amount: str(inv.igst_amount), total_amount: str(inv.total_amount), notes: inv.notes || '' });
            setPicks(Object.fromEntries(inv.lines.map(l => [l.grn_line_id, { qty: String(l.qty), rate: String(l.rate), gst_pct: String(l.gst_pct), hsn_code: l.hsn_code || '' }])));
            setCharges(inv.charges.map(c => ({ kind: c.kind, description: c.description || '', amount: String(c.amount), gst_pct: String(c.gst_pct) })));
        }).catch(err => setError(apiError(err, 'Failed to load the draft.')));
    }, [editId, navigate]);
    useEffect(() => {
        setLines(null); setReport(null);
        if (!supplierId) return;
        purchasingApi.billable(supplierId).then(res => {
            setLines(res.data);
            setPicks(p => Object.fromEntries(Object.entries(p).filter(([id]) => res.data.some(l => l.id === id))));   // lines since billed drop out
        }).catch(err => setError(apiError(err, 'Failed to load GRN lines.')));
    }, [supplierId]);

    const chosen = Object.entries(picks).map(([id, p]) => ({ grn_line_id: id, qty: Number(p.qty), rate: Number(p.rate), gst_pct: Number(p.gst_pct), hsn_code: p.hsn_code || '' }));
    const picksFilled = Object.values(picks).every(p => p.qty !== '' && p.rate !== '');
    const liveCharges = charges.filter(c => Number(c.amount) > 0).map(c => ({ kind: c.kind, description: c.description, amount: Number(c.amount), gst_pct: Number(c.gst_pct) || 0 }));
    const amountsIn = form.taxable_amount !== '' && form.total_amount !== '';
    const body = { supplier_id: supplierId, ...form, cgst_amount: form.cgst_amount || 0, sgst_amount: form.sgst_amount || 0, igst_amount: form.igst_amount || 0, lines: chosen, charges: liveCharges };
    const key = JSON.stringify(body);
    useEffect(() => {
        if (!chosen.length || !amountsIn || !picksFilled) { setReport(null); return undefined; }
        const t = setTimeout(() => {
            const mine = ++lastCheck.current;   // a slow answer must not overwrite a newer one
            purchasingApi.checkInvoice({ ...JSON.parse(key), invoice_id: editId || undefined })
                .then(res => { if (mine === lastCheck.current) { setReport(res.data); setError(''); } })
                .catch(err => { if (mine === lastCheck.current) { setReport(null); setError(apiError(err, 'Check failed.')); } });
        }, 400);
        return () => clearTimeout(t);
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    const dirty = Boolean(supplierId || chosen.length || form.invoice_no || form.total_amount);
    useEffect(() => { if (!editId) writeDraft(dirty ? { supplierId, picks, form, charges } : null); }, [editId, supplierId, picks, form, charges, dirty]);
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const changeSupplier = (v) => {
        if (String(v) === String(supplierId)) return;
        if (chosen.length && !window.confirm(`Changing the supplier clears the ${chosen.length} ticked line(s). Continue?`)) return;
        setPicks({}); setSupplierId(String(v || ''));
    };
    const startPick = (l) => ({ qty: String(l.billable), rate: String(l.po_rate), gst_pct: String(l.po_gst_pct), hsn_code: l.hsn_default || '' });
    const toggle = (l) => setPicks(p => { const n = { ...p }; if (n[l.id]) delete n[l.id]; else n[l.id] = startPick(l); return n; });
    const setPick = (id, patch) => setPicks(p => ({ ...p, [id]: { ...p[id], ...patch } }));
    const toggleGrn = (group, on) => setPicks(p => {
        const n = { ...p };
        for (const l of group) { if (on) n[l.id] = n[l.id] || startPick(l); else delete n[l.id]; }
        return n;
    });
    const setCharge = (i, patch) => setCharges(list => list.map((c, k) => (k === i ? { ...c, ...patch } : c)));

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (lines || []).filter(l => !s || [l.grn_no, l.po_no, l.challan_no, l.label].some(x => String(x || '').toLowerCase().includes(s)));
    }, [lines, q]);
    const groups = useMemo(() => {
        const m = new Map();
        for (const l of shown) { if (!m.has(l.grn_id)) m.set(l.grn_id, []); m.get(l.grn_id).push(l); }
        return [...m.entries()];
    }, [shown]);
    const tickedLines = (lines || []).filter(l => picks[l.id]);
    const tickedGrns = [...new Set(tickedLines.map(l => l.grn_id))];
    const taxMode = (tickedLines[0] || (lines || [])[0])?.tax_mode;
    const lineReport = new Map((report?.lines || []).map(l => [l.grn_line_id, l]));
    const fromLines = {
        taxable: r2(chosen.reduce((s, l) => s + r2(l.qty * l.rate), 0) + liveCharges.reduce((s, c) => s + chargeSums(c).taxable, 0)),
        gst: r2(chosen.reduce((s, l) => s + r2(r2(l.qty * l.rate) * l.gst_pct / 100), 0) + liveCharges.reduce((s, c) => s + chargeSums(c).gst, 0)),
        tcs: r2(liveCharges.reduce((s, c) => s + chargeSums(c).tcs, 0)),
    };
    fromLines.total = r2(fromLines.taxable + fromLines.gst + fromLines.tcs);
    const printedGst = r2((Number(form.cgst_amount) || 0) + (Number(form.sgst_amount) || 0) + (Number(form.igst_amount) || 0));
    const getReceipts = async (ids, tag) => {
        setReceipts(tag); setError('');
        try { await downloadGrnReceipts(ids, user?.name || user?.email || ''); } catch (err) { setError(apiError(err, 'Failed to make the GRN receipt.')); } finally { setReceipts(null); }
    };
    const pickScan = (file) => {
        if (!file) return;
        if (file.size > MAX_SCAN) { setError('The scan is over 15 MB.'); return; }
        setError(''); setScan(file); setRestored(false);
    };

    const mismatch = report?.status === 'MISMATCH';
    const duplicate = report?.duplicate;
    const invoiceLevel = report ? [...report.blocking.map(text => ({ text, hard: true })), ...report.warnings.map(text => ({ text, hard: false }))].filter(x => !report.lines.some(l => x.text.startsWith(`${l.grn_no} line ${l.grn_line_no} `))) : [];
    const hasScan = Boolean(scan) || (saved?.documents || []).length > 0;
    const missingHsn = tickedLines.filter(l => l.supplier_gstin && !l.is_cash_purchase && !/^\d{4,8}$/.test(picks[l.id].hsn_code || ''));
    const canDraft = Boolean(supplierId && form.invoice_no.trim() && form.invoice_date && picksFilled);
    const needed = [
        !supplierId && 'the supplier',
        !form.invoice_no.trim() && 'the invoice number',
        !form.invoice_date && 'the invoice date',
        !amountsIn && 'taxable and total as printed',
        !hasScan && 'the scan of the invoice',
        !chosen.length && 'the lines billed',
        chosen.length > 0 && !picksFilled && 'quantity and rate on every ticked line',
        missingHsn.length > 0 && `HSN on ${missingHsn.length} line(s)`,
        mismatch && !holdReason.trim() && 'why it is on hold',
    ].filter(Boolean);
    const blocked = needed.length > 0 || !report || Boolean(duplicate);
    const save = async (submit) => {
        setBusy(true); setError('');
        const data = { ...body, submit, hold_reason: submit && mismatch ? holdReason : undefined };
        try {
            const res = editId ? await purchasingApi.updateInvoice(editId, data, scan) : await purchasingApi.createInvoice(data, scan);
            writeDraft(null);
            navigate(`/v3/purchasing/invoices/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to save the invoice.')); setBusy(false); }
    };
    const clearDraft = () => { if (!window.confirm('Clear everything on this invoice?')) return; setSupplierId(''); setPicks({}); setForm(EMPTY_HEAD); setCharges([]); setScan(null); setHoldReason(''); setRestored(false); };
    const taxCls = (on) => (taxMode && !on ? 'bg-slate-50' : '');

    return (
        <div>
            <Link to="/v3/purchasing/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Supplier invoices</Link>
            <PageHeader title={editId ? `Draft invoice ${saved?.invoice_no || ''}` : 'Enter supplier invoice'} subtitle="Type what is printed on the invoice, attach its scan, then tick the goods it bills. Someone else approves it." actions={dirty && !editId ? <SecondaryButton onClick={clearDraft}>Clear</SecondaryButton> : null} />
            {restored && dirty && <p className="mb-3 text-sm rounded-lg bg-sky-50 border border-sky-200 text-sky-900 px-3 py-2">Your unfinished invoice was restored. Attach the scan again.</p>}
            {saved?.sent_back_reason && <p className="mb-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2"><b>Sent back to correct:</b> {saved.sent_back_reason}</p>}

            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">1. From the invoice</p>
                <div className="grid sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2"><Field label="Supplier *"><SearchableSelect value={supplierId} onChange={changeSupplier} placeholder="Search supplier…" accentColor="indigo" options={suppliers.map(s => ({ value: String(s.id), label: s.name }))} /></Field></div>
                    <Field label="Invoice no. *"><input className={inputCls} value={form.invoice_no} onChange={e => setHead({ invoice_no: e.target.value })} /></Field>
                    <Field label="Invoice date *"><input className={inputCls} type="date" max={todayLocal()} value={form.invoice_date} onChange={e => setHead({ invoice_date: e.target.value })} /></Field>
                </div>
                {duplicate && <p className="text-sm font-semibold rounded-lg bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2"><Link to={`/v3/purchasing/invoices/${duplicate.id}`} className="underline">{duplicate.invoice_no}</Link> of {fmtDate(duplicate.invoice_date)} is already booked for this supplier this financial year. It can't be booked twice.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <Field label="Taxable as printed (₹) *"><input className={inputCls} type="number" min="0" step="0.01" value={form.taxable_amount} onChange={e => setHead({ taxable_amount: e.target.value })} /></Field>
                    <Field label="CGST (₹)"><input className={`${inputCls} ${taxCls(taxMode === 'INTRA')}`} type="number" min="0" step="0.01" value={form.cgst_amount} onChange={e => setHead({ cgst_amount: e.target.value })} /></Field>
                    <Field label="SGST (₹)"><input className={`${inputCls} ${taxCls(taxMode === 'INTRA')}`} type="number" min="0" step="0.01" value={form.sgst_amount} onChange={e => setHead({ sgst_amount: e.target.value })} /></Field>
                    <Field label="IGST (₹)"><input className={`${inputCls} ${taxCls(taxMode === 'INTER')}`} type="number" min="0" step="0.01" value={form.igst_amount} onChange={e => setHead({ igst_amount: e.target.value })} /></Field>
                    <Field label="Invoice total (₹) *"><input className={inputCls} type="number" min="0" step="0.01" value={form.total_amount} onChange={e => setHead({ total_amount: e.target.value })} /></Field>
                </div>
                {taxMode && <p className="text-xs text-slate-500">The PO for these goods is {taxMode === 'INTRA' ? 'CGST + SGST (same state)' : 'IGST (other state)'}. Enter what is printed.</p>}
                <div className="grid sm:grid-cols-4 gap-3">
                    <Field label="Invoice scan *">
                        {scan
                            ? <span className="flex items-center gap-2 px-3 py-2 text-sm border border-emerald-300 bg-emerald-50 rounded-lg"><Paperclip size={14} className="shrink-0 text-emerald-700" /><span className="truncate" title={scan.name}>{scan.name}</span><button type="button" onClick={() => setScan(null)} className="ml-auto text-slate-500 hover:text-rose-700" aria-label="Remove the scan"><X size={14} /></button></span>
                            : <label className="flex items-center gap-2 px-3 py-2 text-sm font-semibold border border-dashed border-slate-400 rounded-lg cursor-pointer text-slate-600 hover:border-indigo-500 hover:text-indigo-700"><Paperclip size={14} /> {hasScan ? `Add another (${saved.documents.length} on file)` : 'Attach PDF or photo'}<input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => pickScan(e.target.files?.[0])} /></label>}
                    </Field>
                    <div className="sm:col-span-3"><Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setHead({ notes: e.target.value })} /></Field></div>
                </div>
            </div>

            {supplierId && (!lines ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl mb-4">
                    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mr-2">2. Goods billed</p>
                        {lines.length > 0 && <div className="w-64"><SearchInput value={q} onChange={setQ} placeholder="GRN, PO, challan or item…" /></div>}
                        {tickedGrns.length > 0 && <span className="ml-auto"><SecondaryButton disabled={Boolean(receipts)} onClick={() => getReceipts(tickedGrns, 'ticked')}><FileDown size={14} /> {receipts === 'ticked' ? 'Making PDF…' : `GRN receipts of ticked lines (${tickedGrns.length})`}</SecondaryButton></span>}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1100px]">
                            <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-3 py-2.5 w-8" /><th className="px-2 py-2.5">Item</th><th className={head}>PO qty</th><th className={head}>Received</th><th className={head}>Rejected</th><th className={head}>Returned</th><th className={head}>Billed</th><th className={head}>Billable</th>
                                    <th className="px-1 py-2.5 w-[76px]">Qty billed</th><th className="px-1 py-2.5 w-[68px]">Rate ₹</th><th className="px-1 py-2.5 w-[70px]">GST %</th><th className="px-1 py-2.5 w-[72px]">HSN</th><th className={head}>Taxable ₹</th><th className={head}>GST ₹</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length === 0 && <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-400">Nothing received from this supplier is waiting to be billed.</td></tr>}
                                {lines.length > 0 && shown.length === 0 && <tr><td colSpan={14} className="px-4 py-8 text-center text-slate-400">No line matches the search.</td></tr>}
                                {groups.map(([grnId, group]) => {
                                    const g = group[0];
                                    const allOn = group.every(l => picks[l.id]);
                                    return [
                                        <tr key={`g${grnId}`} className="border-t-2 border-slate-200 bg-slate-50/70">
                                            <td className="px-3 py-1.5"><input type="checkbox" checked={allOn} onChange={e => toggleGrn(group, e.target.checked)} aria-label={`Bill all of ${g.grn_no}`} title="Tick the whole GRN" /></td>
                                            <td colSpan={13} className="px-2 py-1.5 text-xs">
                                                <span className="flex flex-wrap items-center gap-x-2"><b className="text-slate-800">{g.grn_no}</b><span className="text-slate-500">received {fmtDate(g.received_date)} · {g.po_no} · challan {g.challan_no || '—'}</span>
                                                    <button type="button" disabled={Boolean(receipts)} onClick={() => getReceipts([grnId], grnId)} className="ml-auto inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline disabled:opacity-50"><FileDown size={12} /> {receipts === grnId ? 'Making PDF…' : 'GRN receipt'}</button></span>
                                            </td>
                                        </tr>,
                                        ...group.map(l => {
                                            const p = picks[l.id];
                                            const m = lineReport.get(l.id);
                                            const rates = p && !GST_RATES.includes(Number(p.gst_pct)) && p.gst_pct !== '' ? [...GST_RATES, Number(p.gst_pct)].sort((a, b) => a - b) : GST_RATES;
                                            const over = l.over_po > 0.0005;
                                            return [
                                                <tr key={l.id} className={`border-t border-slate-100 ${m && !m.ok ? 'bg-rose-50/70' : p ? 'bg-indigo-50/40' : ''}`}>
                                                    <td className="px-3 py-2"><input type="checkbox" checked={Boolean(p)} onChange={() => toggle(l)} aria-label={`Bill ${l.grn_no} line ${l.line_no}`} /></td>
                                                    <td className="px-2 py-2 min-w-[190px]">{l.label}
                                                        <span className="block text-xs text-slate-500">PO line {l.po_line_no} · ₹{l.po_rate} / {l.purchase_uom} · GST {l.po_gst_pct}%</span>
                                                        {over && !(m && m.issues.length) && <span className="block text-xs font-semibold text-amber-800" title={l.approval_reason || ''}>{fmt(l.over_po)} {l.purchase_uom} over PO (+{l.po_qty > 0 ? fmt(Math.round((l.over_po / l.po_qty) * 1000) / 10) : 100}%){l.approved_by_name ? ` · approved by ${l.approved_by_name}${l.approved_at ? `, ${fmtDate(l.approved_at)}` : ''}` : ' · no approver'}</span>}
                                                    </td>
                                                    <td className={num}>{fmt(l.po_qty)}</td>
                                                    <td className={`${num} ${over ? 'font-bold text-amber-800' : ''}`}>{fmt(l.received_on_po)}</td>
                                                    <td className={num}>{l.rejected ? fmt(l.rejected) : '—'}</td>
                                                    <td className={num}>{l.returned ? fmt(l.returned) : '—'}</td>
                                                    <td className={num}>{l.billed ? fmt(l.billed) : '—'}</td>
                                                    <td className={`${num} font-bold`}>{fmt(l.billable)} <span className="font-normal text-xs text-slate-500">{l.purchase_uom}</span></td>
                                                    {p ? <>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5 text-right`} type="number" min="0" step="any" value={p.qty} onChange={e => setPick(l.id, { qty: e.target.value })} aria-label="Quantity billed" /></td>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5 text-right`} type="number" min="0" step="any" value={p.rate} onChange={e => setPick(l.id, { rate: e.target.value })} aria-label="Rate billed" /></td>
                                                        <td className="px-1 py-2"><select className={`${inputCls} !py-1 !pl-1 !pr-0 text-xs`} value={Number(p.gst_pct)} onChange={e => setPick(l.id, { gst_pct: e.target.value })} aria-label="GST %">{rates.map(x => <option key={x} value={x}>{x}%</option>)}</select></td>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5`} inputMode="numeric" maxLength={8} value={p.hsn_code} onChange={e => setPick(l.id, { hsn_code: e.target.value.replace(/\D/g, '') })} aria-label="HSN" /></td>
                                                        <td className={num}>{inr(Number(p.qty) * Number(p.rate))}</td>
                                                        <td className={num}>{inr(r2(Number(p.qty) * Number(p.rate)) * Number(p.gst_pct) / 100)}</td>
                                                    </> : <td colSpan={6} />}
                                                </tr>,
                                                m && m.issues.length > 0 ? <tr key={`i${l.id}`} className={m.ok ? '' : 'bg-rose-50/70'}><td /><td colSpan={13} className={`px-2 pb-2 text-xs font-semibold ${m.ok ? 'text-amber-800' : 'text-rose-800'}`}>{m.issues.map((x, i) => <span key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {x}</span>)}</td></tr> : null,
                                            ];
                                        }),
                                    ];
                                })}
                                {shown.length > 0 && (
                                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                        <td /><td className="px-2 py-2">Total · {shown.length} line(s) shown · {tickedLines.length} ticked</td>
                                        <td className={num}>{sumByUnit(shown, 'po_qty')}</td><td className={num}>{sumByUnit(shown, 'received_on_po')}</td><td className={num}>{sumByUnit(shown, 'rejected')}</td><td className={num}>{sumByUnit(shown, 'returned')}</td><td className={num}>{sumByUnit(shown, 'billed')}</td><td className={num}>{sumByUnit(shown, 'billable')}</td>
                                        <td className={num}>{tickedLines.length ? (new Set(tickedLines.map(l => l.purchase_uom)).size === 1 ? fmt(chosen.reduce((s, l) => s + l.qty, 0)) : '—') : ''}</td><td /><td /><td /><td className={num}>{chosen.length ? inr(chosen.reduce((s, l) => s + r2(l.qty * l.rate), 0)) : ''}</td><td className={num}>{chosen.length ? inr(chosen.reduce((s, l) => s + r2(r2(l.qty * l.rate) * l.gst_pct / 100), 0)) : ''}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {chosen.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2"><p className="text-xs font-black uppercase tracking-wider text-slate-500">3. Freight and other charges on the invoice</p>
                        <span className="ml-auto"><SecondaryButton onClick={() => setCharges(list => [...list, { kind: 'FREIGHT', description: '', amount: '', gst_pct: '0' }])}><Plus size={14} /> Add a charge</SecondaryButton></span></div>
                    {charges.length === 0 ? <p className="text-sm text-slate-400">None. Add one if the invoice has freight, packing, insurance, a discount or TCS.</p> : (
                        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
                            <thead className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider"><tr><th className="pr-2 py-1 w-40">Charge</th><th className="pr-2 py-1">Description</th><th className="pr-2 py-1 w-28 text-right">Amount ₹</th><th className="pr-2 py-1 w-24">GST %</th><th className="pr-2 py-1 w-28 text-right">GST ₹</th><th className="w-8" /></tr></thead>
                            <tbody>
                                {charges.map((c, i) => (
                                    <tr key={i} className="border-t border-slate-100">
                                        <td className="pr-2 py-1.5"><select className={`${inputCls} !py-1`} value={c.kind} onChange={e => setCharge(i, { kind: e.target.value, gst_pct: e.target.value === 'TCS' ? '0' : c.gst_pct })} aria-label="Charge">{Object.entries(CHARGE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                                        <td className="pr-2 py-1.5"><input className={`${inputCls} !py-1`} value={c.description} onChange={e => setCharge(i, { description: e.target.value })} placeholder={c.kind === 'OTHER' ? 'Say what it is *' : ''} aria-label="Description" /></td>
                                        <td className="pr-2 py-1.5"><input className={`${inputCls} !py-1 text-right`} type="number" min="0" step="0.01" value={c.amount} onChange={e => setCharge(i, { amount: e.target.value })} aria-label="Amount" /></td>
                                        <td className="pr-2 py-1.5"><select className={`${inputCls} !py-1 !px-1`} disabled={c.kind === 'TCS'} value={Number(c.gst_pct) || 0} onChange={e => setCharge(i, { gst_pct: e.target.value })} aria-label="GST %">{GST_RATES.map(x => <option key={x} value={x}>{x}%</option>)}</select></td>
                                        <td className="pr-2 py-1.5 text-right tabular-nums">{inr(chargeSums(c).gst)}</td>
                                        <td className="py-1.5"><button type="button" onClick={() => setCharges(list => list.filter((_, k) => k !== i))} className="text-slate-400 hover:text-rose-700" aria-label="Remove the charge"><X size={15} /></button></td>
                                    </tr>
                                ))}
                                <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td className="px-1 py-1.5" colSpan={2}>Total · {liveCharges.length} charge(s)</td><td className="pr-2 py-1.5 text-right tabular-nums">{inr(liveCharges.reduce((s, c) => s + chargeSums(c).taxable + chargeSums(c).tcs, 0))}</td><td /><td className="pr-2 py-1.5 text-right tabular-nums">{inr(liveCharges.reduce((s, c) => s + chargeSums(c).gst, 0))}</td><td /></tr>
                            </tbody>
                        </table></div>
                    )}
                </div>
            )}

            {chosen.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500">4. Invoice against the lines</p>
                    <div className="overflow-x-auto"><table className="text-sm min-w-[420px]">
                        <thead className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider"><tr><th className="pr-6 py-1" /><th className="pr-6 py-1 text-right">On the invoice ₹</th><th className="pr-6 py-1 text-right">Lines and charges ₹</th><th className="py-1 text-right">Difference ₹</th></tr></thead>
                        <tbody>
                            {[['Taxable', form.taxable_amount, fromLines.taxable], ['GST', printedGst, fromLines.gst], ...(fromLines.tcs ? [['TCS', fromLines.tcs, fromLines.tcs]] : []), ['Total', form.total_amount, fromLines.total]].map(([k, printed, sum]) => {
                                const diff = printed === '' ? null : r2(Number(printed) - sum);
                                return <tr key={k} className={`border-t border-slate-100 ${k === 'Total' ? 'font-black' : ''}`}><td className="pr-6 py-1">{k}</td><td className="pr-6 py-1 text-right tabular-nums">{printed === '' ? '—' : inr(Number(printed))}</td><td className="pr-6 py-1 text-right tabular-nums">{inr(sum)}</td><td className={`py-1 text-right tabular-nums ${diff && Math.abs(diff) > 1 ? 'text-rose-700 font-bold' : ''}`}>{diff == null ? '—' : inr(diff)}</td></tr>;
                            })}
                        </tbody>
                    </table></div>
                    {report?.totals?.printed?.round_off ? <p className="text-xs text-slate-500">Round-off on the invoice: ₹{inr(report.totals.printed.round_off)}</p> : null}
                    {report && (
                        <div className={`rounded-lg border px-3 py-2 text-sm ${report.status === 'MATCHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : report.status === 'MATCHED_WITH_WARNING' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                            <p className="font-bold flex items-center gap-1.5">{report.status === 'MISMATCH' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                                {report.status === 'MISMATCH' ? 'Does not match' : INVOICE_STATUS[report.status].label} (tolerance {report.tolerance_pct}%)</p>
                            {invoiceLevel.length > 0 && <ul className="list-disc pl-5 text-xs mt-1">{invoiceLevel.map((x, i) => <li key={i} className={x.hard ? 'font-semibold' : ''}>{x.text}</li>)}</ul>}
                            {report.lines.some(l => l.issues.length) && <p className="text-xs mt-1">Lines with a question are marked in the table above.</p>}
                        </div>
                    )}
                    {mismatch && <Field label="Why is it on hold? *" hint="Fix the entry if you typed it wrong. If that is what the invoice says, put it on hold: it stays on record, keeps its quantities, and the purchase manager decides."><input className={inputCls} value={holdReason} onChange={e => setHoldReason(e.target.value)} /></Field>}
                </div>
            )}
            <ErrorBox text={error} />
            <div className="flex flex-wrap items-center gap-3">
                <PrimaryButton onClick={() => save(true)} busy={busy} disabled={busy || blocked || !perms.invoice}><Receipt size={15} /> {mismatch ? 'Put on hold' : 'Submit for approval'}</PrimaryButton>
                <SecondaryButton onClick={() => save(false)} disabled={busy || !canDraft || !perms.invoice}><Save size={14} /> Save draft</SecondaryButton>
                {needed.length > 0 && <p className="text-sm text-slate-600">Still needed to submit: {needed.join(', ')}.</p>}
            </div>
        </div>
    );
}

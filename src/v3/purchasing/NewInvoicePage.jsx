// Enter a supplier invoice, or carry on with a draft (/invoices/:id/edit). The accountant works from the paper: the supplier,
// number, date and scan (optional since 6 Nov 2026, owner: "do not mandate challan or invoice upload"); then the GRN lines of
// that supplier, grouped by GRN, each with its quantity trail, a warning when goods came above the PO, and its HSN; then freight
// and other charges; then the totals. Quantity, rate and GST start from the rate frozen when the goods came.
// The three-way match runs live and marks the lines it questions.
// Phase 2 (4 Nov 2026, owner: "build next phase"): Save draft holds nothing. Submit sends it for approval by someone else; one
// that doesn't match goes on hold with the reason instead. An unsaved invoice is also kept on this device (not its scan).
// Totals at the end (20 Nov 2026, owner: "bring it down after section 3 … taxes and invoice total must auto calculate with
// option to edit … discount option for overall discount … build invoice against the lines more detailed"): taxable, GST and
// total are worked out from the lines, charges and an overall discount (% or ₹, spread over the lines by value before GST, as
// the server does it); each can be changed to what is printed, and the difference shows. Then the tax summary by GST rate,
// and the value billed against the value at the PO rate, per PO.
// Same day: a discount % on each line after its rate (owner: "add discount to item line also after rate"); the overall
// discount is on what is left. Goods billed kept short (owner: "long list of columns … hide few less important and show only
// when needed"): the quantity trail is a line under the item (rejected / returned / billed only when there are any), the full
// columns behind a "Quantity trail" switch remembered on this device; GST ₹ under the value.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const GST_RATES = [0, 5, 12, 18, 28, 40];
const MAX_SCAN = 15 * 1024 * 1024;
const DRAFT_KEY = 'v3.invoiceDraft';
const TRAIL_KEY = 'v3.invoiceTrail';
const readTrail = () => { try { return localStorage.getItem(TRAIL_KEY) === '1'; } catch { return false; } };
const EMPTY_HEAD = { invoice_no: '', invoice_date: '', notes: '' };
const NO_DISCOUNT = { mode: 'pct', value: '' };
// Amounts as printed, by key on this page → field sent to the server.
const AMOUNT_FIELD = { taxable: 'taxable_amount', cgst: 'cgst_amount', sgst: 'sgst_amount', igst: 'igst_amount', total: 'total_amount' };
const readDraft = () => {
    try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY)) || null;
        if (d && d.form && !d.over) {   // kept before 20 Nov 2026: the amounts were typed at the top
            d.over = Object.fromEntries(Object.entries(AMOUNT_FIELD).filter(([, f]) => d.form[f] !== '' && d.form[f] != null).map(([k, f]) => [k, String(d.form[f])]));
            d.reconcile = true;
        }
        return d;
    } catch { return null; }
};
const writeDraft = (v) => { try { if (v) localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); else localStorage.removeItem(DRAFT_KEY); } catch { /* per-device convenience only */ } };
const num = 'px-1.5 py-2 text-right tabular-nums whitespace-nowrap';
const head = 'px-1.5 py-2.5 text-right';
const th = 'px-2 py-2 text-right';
const td = 'px-2 py-1.5 text-right tabular-nums whitespace-nowrap';
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
// An amount spread over values in proportion; the last takes the rounding (as the server does).
const spread = (amount, values) => {
    const total = values.reduce((s, v) => s + v, 0);
    if (!amount || total <= 0) return values.map(() => 0);
    let left = amount;
    return values.map((v, i) => {
        if (i === values.length - 1) return r2(left);
        const part = r2(amount * v / total);
        left = r2(left - part);
        return part;
    });
};
// Goods, the overall discount spread over them, GST on what is left, charges; and by GST rate.
const workOut = (chosen, charges, disc) => {
    const values = chosen.map(l => r2(l.qty * l.rate));
    const lineDisc = chosen.map((l, i) => r2(values[i] * (l.discount_pct || 0) / 100));
    const after = values.map((v, i) => r2(v - lineDisc[i]));   // after the line's own discount
    const goods = r2(sum(values, v => v));
    const lineDiscount = r2(sum(lineDisc, v => v));
    const base = r2(goods - lineDiscount);
    const pct = disc.mode === 'pct' && Number(disc.value) > 0 ? Number(disc.value) : null;
    const discount = pct != null ? r2(base * pct / 100) : disc.mode === 'amt' ? r2(Number(disc.value) || 0) : 0;
    const shares = spread(discount, after);
    const lines = chosen.map((l, i) => { const net = r2(after[i] - shares[i]); return { ...l, value: values[i], line_discount: lineDisc[i], taxable: after[i], discount: shares[i], net, gst: r2(net * l.gst_pct / 100) }; });
    const ch = charges.map(c => ({ ...c, ...chargeSums(c) }));
    const rates = new Map();
    const at = (p) => { if (!rates.has(p)) rates.set(p, { gst_pct: p, goods: 0, discount: 0, charges: 0, taxable: 0, gst: 0, hsn: [] }); return rates.get(p); };
    for (const l of lines) { const r = at(l.gst_pct); r.goods = r2(r.goods + l.value); r.discount = r2(r.discount + l.line_discount + l.discount); r.taxable = r2(r.taxable + l.net); r.gst = r2(r.gst + l.gst); if (l.hsn_code && !r.hsn.includes(l.hsn_code)) r.hsn.push(l.hsn_code); }
    for (const c of ch.filter(x => x.kind !== 'TCS')) { const r = at(c.gst_pct); r.charges = r2(r.charges + c.taxable); r.taxable = r2(r.taxable + c.taxable); r.gst = r2(r.gst + c.gst); }
    return {
        goods, lineDiscount, base, discount, pct, lines, byRate: [...rates.values()].sort((a, b) => a.gst_pct - b.gst_pct),
        charges: r2(sum(ch, c => c.taxable)), taxable: r2(sum(lines, l => l.net) + sum(ch, c => c.taxable)), gst: r2(sum(lines, l => l.gst) + sum(ch, c => c.gst)), tcs: r2(sum(ch, c => c.tcs)),
    };
};
const splitTax = (gst, mode) => {
    if (mode === 'INTER') return { cgst: 0, sgst: 0, igst: gst };
    const cgst = r2(gst / 2);
    return { cgst, sgst: r2(gst - cgst), igst: 0 };
};

export default function NewInvoicePage() {
    const navigate = useNavigate();
    const { id: editId } = useParams();
    const { user } = useAuth();
    // From Waiting for invoice (20 Nov 2026): ?supplier=&lines= — that supplier, those GRN lines ticked; no device draft restored.
    const [search] = useSearchParams();
    const preSupplier = editId ? '' : (search.get('supplier') || '');
    const preLines = useRef(preSupplier ? (search.get('lines') || '').split(',').filter(Boolean) : null);
    const [draft] = useState(() => (editId || preSupplier ? null : readDraft()));
    const [restored, setRestored] = useState(Boolean(draft));
    const [saved, setSaved] = useState(null);   // the draft on the server, when editing one
    const [perms, setPerms] = useState({});
    const [suppliers, setSuppliers] = useState([]);
    const [supplierId, setSupplierId] = useState(preSupplier || draft?.supplierId || '');
    const [lines, setLines] = useState(null);
    const [picks, setPicks] = useState(draft?.picks || {});   // grn line id → { qty, rate, gst_pct, hsn_code }
    const [charges, setCharges] = useState(draft?.charges || []);
    const [form, setForm] = useState(draft?.form ? { invoice_no: draft.form.invoice_no || '', invoice_date: draft.form.invoice_date || '', notes: draft.form.notes || '' } : EMPTY_HEAD);
    const [over, setOver] = useState(draft?.over || {});   // amounts changed to what is printed: taxable / cgst / sgst / igst / total
    const [disc, setDisc] = useState(draft?.disc || NO_DISCOUNT);
    const [showOtherTax, setShowOtherTax] = useState(false);
    const [trail, setTrail] = useState(readTrail);   // the quantity trail as columns
    const [scan, setScan] = useState(null);
    const [q, setQ] = useState('');
    const [report, setReport] = useState(null);
    const [holdReason, setHoldReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [receipts, setReceipts] = useState(null);   // what is being made: a GRN id, or 'ticked'
    const lastCheck = useRef(0);
    const reconcile = useRef(Boolean(draft?.reconcile));   // amounts loaded from a saved draft: keep only those that differ from the worked-out ones
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
            setForm({ invoice_no: inv.invoice_no, invoice_date: inv.invoice_date, notes: inv.notes || '' });
            setOver(Object.fromEntries(Object.entries(AMOUNT_FIELD).map(([k, f]) => [k, str(inv[f])]).filter(([, v]) => v !== '')));
            setDisc(inv.discount_pct ? { mode: 'pct', value: String(inv.discount_pct) } : inv.discount_amount ? { mode: 'amt', value: String(inv.discount_amount) } : NO_DISCOUNT);
            reconcile.current = true;
            setPicks(Object.fromEntries(inv.lines.map(l => [l.grn_line_id, { qty: String(l.qty), rate: String(l.rate), discount_pct: l.discount_pct ? String(l.discount_pct) : '', gst_pct: String(l.gst_pct), hsn_code: l.hsn_code || '' }])));
            setCharges(inv.charges.map(c => ({ kind: c.kind, description: c.description || '', amount: String(c.amount), gst_pct: String(c.gst_pct) })));
        }).catch(err => setError(apiError(err, 'Failed to load the draft.')));
    }, [editId, navigate]);
    useEffect(() => {
        setLines(null); setReport(null);
        if (!supplierId) return;
        purchasingApi.billable(supplierId).then(res => {
            setLines(res.data);
            setPicks(p => Object.fromEntries(Object.entries(p).filter(([id]) => res.data.some(l => l.id === id))));   // lines since billed drop out
            if (preLines.current) {   // once: tick the GRN lines it was opened for, as a tick by hand would
                const want = new Set(preLines.current); preLines.current = null;
                setPicks(Object.fromEntries(res.data.filter(l => want.has(l.id)).map(l => [l.id, { qty: String(l.billable), rate: String(l.po_rate), discount_pct: '', gst_pct: String(l.po_gst_pct), hsn_code: l.hsn_default || '' }])));
            }
        }).catch(err => setError(apiError(err, 'Failed to load GRN lines.')));
    }, [supplierId]);

    const chosen = Object.entries(picks).map(([id, p]) => ({ grn_line_id: id, qty: Number(p.qty), rate: Number(p.rate), discount_pct: Number(p.discount_pct) || 0, gst_pct: Number(p.gst_pct), hsn_code: p.hsn_code || '' }));
    const lineDiscBad = Object.values(picks).some(p => p.discount_pct !== '' && p.discount_pct != null && !(Number(p.discount_pct) >= 0 && Number(p.discount_pct) <= 100));
    const picksFilled = Object.values(picks).every(p => p.qty !== '' && p.rate !== '');
    const liveCharges = charges.filter(c => Number(c.amount) > 0).map(c => ({ kind: c.kind, description: c.description, amount: Number(c.amount), gst_pct: Number(c.gst_pct) || 0 }));
    const tickedLines = (lines || []).filter(l => picks[l.id]);
    const tickedGrns = [...new Set(tickedLines.map(l => l.grn_id))];
    const taxMode = (tickedLines[0] || (lines || [])[0])?.tax_mode;

    // The totals: worked out, or as changed to what is printed.
    const calc = workOut(chosen, liveCharges, disc);
    const auto = { taxable: calc.taxable, ...splitTax(calc.gst, taxMode) };
    const has = (k) => over[k] !== undefined;
    const eff = Object.fromEntries(['taxable', 'cgst', 'sgst', 'igst'].map(k => [k, has(k) ? r2(Number(over[k]) || 0) : auto[k]]));
    eff.gst = r2(eff.cgst + eff.sgst + eff.igst);
    const exact = r2(eff.taxable + eff.gst + calc.tcs);
    eff.total = has('total') ? r2(Number(over.total) || 0) : Math.round(exact);
    const roundOff = r2(eff.total - exact);
    const fromLinesTotal = r2(calc.taxable + calc.gst + calc.tcs);
    const discValue = disc.value === '' ? null : Number(disc.value);
    const discError = discValue == null ? ''
        : !Number.isFinite(discValue) || discValue < 0 ? 'Enter the discount as a number.'
        : disc.mode === 'pct' && discValue > 100 ? 'A discount can\'t be over 100%.'
        : disc.mode === 'amt' && discValue > calc.base + 0.005 ? `The discount is more than the goods (₹${inr(calc.base)}).` : '';
    const discBody = disc.mode === 'pct' ? { discount_pct: discValue || null, discount_amount: 0 } : { discount_pct: null, discount_amount: discValue || 0 };

    const body = { supplier_id: supplierId, ...form, ...Object.fromEntries(Object.entries(AMOUNT_FIELD).map(([k, f]) => [f, eff[k]])), ...discBody, lines: chosen, charges: liveCharges };
    const key = JSON.stringify(body);
    useEffect(() => {
        if (!chosen.length || !picksFilled || discError || lineDiscBad) { setReport(null); return undefined; }
        const t = setTimeout(() => {
            const mine = ++lastCheck.current;   // a slow answer must not overwrite a newer one
            purchasingApi.checkInvoice({ ...JSON.parse(key), invoice_id: editId || undefined })
                .then(res => { if (mine === lastCheck.current) { setReport(res.data); setError(''); } })
                .catch(err => { if (mine === lastCheck.current) { setReport(null); setError(apiError(err, 'Check failed.')); } });
        }, 400);
        return () => clearTimeout(t);
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    // A saved draft's amounts: those equal to the worked-out figures go back to following the lines.
    useEffect(() => {
        if (!reconcile.current || !lines || !chosen.length) return;
        reconcile.current = false;
        setOver(o => {
            const n = { ...o };
            for (const k of ['taxable', 'cgst', 'sgst', 'igst']) if (n[k] !== undefined && Math.abs(Number(n[k]) - auto[k]) < 0.005) delete n[k];
            const g = ['cgst', 'sgst', 'igst'].reduce((s, k) => s + (n[k] !== undefined ? Number(n[k]) : auto[k]), 0);
            const t = (n.taxable !== undefined ? Number(n.taxable) : auto.taxable) + g + calc.tcs;
            if (n.total !== undefined && Math.abs(Number(n.total) - Math.round(r2(t))) < 0.005) delete n.total;
            return n;
        });
    }, [lines, chosen.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const dirty = Boolean(supplierId || chosen.length || form.invoice_no || Object.keys(over).length || disc.value);
    useEffect(() => { if (!editId) writeDraft(dirty ? { supplierId, picks, form, charges, over, disc } : null); }, [editId, supplierId, picks, form, charges, over, disc, dirty]);
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
    const startPick = (l) => ({ qty: String(l.billable), rate: String(l.po_rate), discount_pct: '', gst_pct: String(l.po_gst_pct), hsn_code: l.hsn_default || '' });
    const flipTrail = () => setTrail(t => { try { localStorage.setItem(TRAIL_KEY, t ? '0' : '1'); } catch { /* per-device convenience only */ } return !t; });
    const toggle = (l) => setPicks(p => { const n = { ...p }; if (n[l.id]) delete n[l.id]; else n[l.id] = startPick(l); return n; });
    const setPick = (id, patch) => setPicks(p => ({ ...p, [id]: { ...p[id], ...patch } }));
    const toggleGrn = (group, on) => setPicks(p => {
        const n = { ...p };
        for (const l of group) { if (on) n[l.id] = n[l.id] || startPick(l); else delete n[l.id]; }
        return n;
    });
    const setCharge = (i, patch) => setCharges(list => list.map((c, k) => (k === i ? { ...c, ...patch } : c)));
    const setAmount = (k, v) => setOver(o => ({ ...o, [k]: v }));
    const resetAmount = (k) => setOver(o => { const n = { ...o }; delete n[k]; return n; });

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return (lines || []).filter(l => !s || [l.grn_no, l.po_no, l.challan_no, l.label].some(x => String(x || '').toLowerCase().includes(s)));
    }, [lines, q]);
    const groups = useMemo(() => {
        const m = new Map();
        for (const l of shown) { if (!m.has(l.grn_id)) m.set(l.grn_id, []); m.get(l.grn_id).push(l); }
        return [...m.entries()];
    }, [shown]);
    const lineReport = new Map((report?.lines || []).map(l => [l.grn_line_id, l]));
    const cols = trail ? 14 : 9;
    const calcLine = new Map(calc.lines.map(l => [l.grn_line_id, l]));
    // Value billed against the value at the rate agreed when the goods came, per PO.
    const byPo = [...tickedLines.reduce((m, l) => {
        const p = picks[l.id];
        if (!m.has(l.po_no)) m.set(l.po_no, { po_no: l.po_no, lines: 0, units: new Set(), qty: 0, atPo: 0, billed: 0 });
        const x = m.get(l.po_no);
        x.lines += 1; x.units.add(l.purchase_uom); x.qty += Number(p.qty) || 0;
        x.atPo = r2(x.atPo + r2((Number(p.qty) || 0) * l.po_rate)); x.billed = r2(x.billed + (calcLine.get(l.id)?.taxable || 0));
        return m;
    }, new Map()).values()];
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
    const canDraft = Boolean(supplierId && form.invoice_no.trim() && form.invoice_date && picksFilled && !discError && !lineDiscBad);
    const needed = [
        !supplierId && 'the supplier',
        !form.invoice_no.trim() && 'the invoice number',
        !form.invoice_date && 'the invoice date',
        !chosen.length && 'the lines billed',
        chosen.length > 0 && !picksFilled && 'quantity and rate on every ticked line',
        missingHsn.length > 0 && `HSN on ${missingHsn.length} line(s)`,
        chosen.length > 0 && eff.total <= 0 && 'the invoice total',
        discError && 'a valid discount',
        lineDiscBad && 'a line discount between 0 and 100%',
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
    const clearDraft = () => { if (!window.confirm('Clear everything on this invoice?')) return; setSupplierId(''); setPicks({}); setForm(EMPTY_HEAD); setOver({}); setDisc(NO_DISCOUNT); setCharges([]); setScan(null); setHoldReason(''); setRestored(false); };

    // The GST rows: the PO's type first; the other only when asked for or already entered.
    const mainTax = taxMode === 'INTER' ? ['igst'] : ['cgst', 'sgst'];
    const otherTax = taxMode === 'INTER' ? ['cgst', 'sgst'] : ['igst'];
    const otherOpen = showOtherTax || otherTax.some(k => has(k) && Number(over[k]));
    const TAX_LABEL = { cgst: 'CGST', sgst: 'SGST', igst: 'IGST' };
    const diffCell = (printed, worked) => {
        const d = r2(printed - worked);
        return <td className={`${td} ${Math.abs(d) > 1 ? 'text-rose-700 font-bold' : Math.abs(d) > 0.004 ? 'text-amber-800' : 'text-slate-400'}`}>{Math.abs(d) > 0.004 ? `${d > 0 ? '+' : ''}${inr(d)}` : '—'}</td>;
    };
    const amountCell = (k, label) => (
        <td className="px-2 py-1">
            <div className="flex items-center justify-end gap-2">
                {has(k)
                    ? <button type="button" onClick={() => resetAmount(k)} className="text-[11px] font-semibold text-amber-800 hover:underline whitespace-nowrap" title="Use the worked-out figure again">changed · undo</button>
                    : <span className="text-[11px] text-slate-400">auto</span>}
                <input className={`${inputCls} !py-1 !w-36 text-right tabular-nums ${has(k) ? '!border-amber-400 !bg-amber-50' : ''}`} type="number" min="0" step="0.01"
                    value={has(k) ? over[k] : eff[k].toFixed(2)} onChange={e => setAmount(k, e.target.value)} aria-label={`${label} as printed`} />
            </div>
        </td>
    );
    const rateTax = (r) => (taxMode === 'INTER' ? [r.gst] : [r2(r.gst / 2), r2(r.gst - r2(r.gst / 2))]);

    return (
        <div>
            <Link to="/v3/purchasing/invoices" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Supplier invoices</Link>
            <PageHeader title={editId ? `Draft invoice ${saved?.invoice_no || ''}` : 'Enter supplier invoice'} subtitle="Enter the invoice number and date, tick the goods it bills and add any charges. The totals work themselves out at the end: check them against the printed invoice. Someone else approves it." actions={dirty && !editId ? <SecondaryButton onClick={clearDraft}>Clear</SecondaryButton> : null} />
            {restored && dirty && <p className="mb-3 text-sm rounded-lg bg-sky-50 border border-sky-200 text-sky-900 px-3 py-2">Your unfinished invoice was restored. If it had a scan, attach it again.</p>}
            {saved?.sent_back_reason && <p className="mb-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2"><b>Sent back to correct:</b> {saved.sent_back_reason}</p>}

            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">1. From the invoice</p>
                <div className="grid sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2"><Field label="Supplier *"><SearchableSelect value={supplierId} onChange={changeSupplier} placeholder="Search supplier…" accentColor="indigo" options={suppliers.map(s => ({ value: String(s.id), label: s.name }))} /></Field></div>
                    <Field label="Invoice no. *"><input className={inputCls} value={form.invoice_no} onChange={e => setHead({ invoice_no: e.target.value })} /></Field>
                    <Field label="Invoice date *"><input className={inputCls} type="date" max={todayLocal()} value={form.invoice_date} onChange={e => setHead({ invoice_date: e.target.value })} /></Field>
                </div>
                {duplicate && <p className="text-sm font-semibold rounded-lg bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2"><Link to={`/v3/purchasing/invoices/${duplicate.id}`} className="underline">{duplicate.invoice_no}</Link> of {fmtDate(duplicate.invoice_date)} is already booked for this supplier this financial year. It can't be booked twice.</p>}
                <div className="grid sm:grid-cols-4 gap-3">
                    <Field label="Invoice scan (optional)">
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
                        {lines.length > 0 && <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none" title="PO qty, received, rejected, returned and billed as columns"><input type="checkbox" checked={trail} onChange={flipTrail} /> Quantity trail</label>}
                        {tickedGrns.length > 0 && <span className="ml-auto"><SecondaryButton disabled={Boolean(receipts)} onClick={() => getReceipts(tickedGrns, 'ticked')}><FileDown size={14} /> {receipts === 'ticked' ? 'Making PDF…' : `GRN receipts of ticked lines (${tickedGrns.length})`}</SecondaryButton></span>}
                    </div>
                    <div className="overflow-x-auto">
                        <table className={`w-full text-sm ${trail ? 'min-w-[1160px]' : 'min-w-[900px]'}`}>
                            <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-3 py-2.5 w-8" /><th className="px-2 py-2.5">Item</th>
                                    {trail && <><th className={head}>PO qty</th><th className={head}>Received</th><th className={head}>Rejected</th><th className={head}>Returned</th><th className={head}>Billed</th></>}
                                    <th className={head}>Billable</th>
                                    <th className="px-1 py-2.5 w-[84px]">Qty billed</th><th className="px-1 py-2.5 w-[76px]">Rate ₹</th><th className="px-1 py-2.5 w-[60px]" title="Discount on this line as printed">Disc %</th><th className="px-1 py-2.5 w-[70px]">GST %</th><th className="px-1 py-2.5 w-[80px]">HSN</th><th className={head}>Value ₹</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length === 0 && <tr><td colSpan={cols} className="px-4 py-8 text-center text-slate-400">Nothing received from this supplier is waiting to be billed.</td></tr>}
                                {lines.length > 0 && shown.length === 0 && <tr><td colSpan={cols} className="px-4 py-8 text-center text-slate-400">No line matches the search.</td></tr>}
                                {groups.map(([grnId, group]) => {
                                    const g = group[0];
                                    const allOn = group.every(l => picks[l.id]);
                                    return [
                                        <tr key={`g${grnId}`} className="border-t-2 border-slate-200 bg-slate-50/70">
                                            <td className="px-3 py-1.5"><input type="checkbox" checked={allOn} onChange={e => toggleGrn(group, e.target.checked)} aria-label={`Bill all of ${g.grn_no}`} title="Tick the whole GRN" /></td>
                                            <td colSpan={cols - 1} className="px-2 py-1.5 text-xs">
                                                <span className="flex flex-wrap items-center gap-x-2"><b className="text-slate-800">{g.grn_no}</b><span className="text-slate-500">received {fmtDate(g.received_date)} · {g.po_no} · challan {g.challan_no || '—'}</span>
                                                    <button type="button" disabled={Boolean(receipts)} onClick={() => getReceipts([grnId], grnId)} className="ml-auto inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline disabled:opacity-50"><FileDown size={12} /> {receipts === grnId ? 'Making PDF…' : 'GRN receipt'}</button></span>
                                            </td>
                                        </tr>,
                                        ...group.map(l => {
                                            const p = picks[l.id];
                                            const m = lineReport.get(l.id);
                                            const cl = calcLine.get(l.id);
                                            const rates = p && !GST_RATES.includes(Number(p.gst_pct)) && p.gst_pct !== '' ? [...GST_RATES, Number(p.gst_pct)].sort((a, b) => a - b) : GST_RATES;
                                            const over_ = l.over_po > 0.0005;
                                            const u = l.purchase_uom;
                                            return [
                                                <tr key={l.id} className={`border-t border-slate-100 ${m && !m.ok ? 'bg-rose-50/70' : p ? 'bg-indigo-50/40' : ''}`}>
                                                    <td className="px-3 py-2"><input type="checkbox" checked={Boolean(p)} onChange={() => toggle(l)} aria-label={`Bill ${l.grn_no} line ${l.line_no}`} /></td>
                                                    <td className="px-2 py-2 min-w-[220px]">{l.label}
                                                        <span className="block text-xs text-slate-500">PO line {l.po_line_no} · ₹{l.po_rate} / {u} · GST {l.po_gst_pct}%</span>
                                                        {!trail && <span className="block text-xs text-slate-500">Ordered {fmt(l.po_qty)} · <span className={over_ ? 'font-semibold text-amber-800' : ''}>received {fmt(l.received_on_po)}</span>{l.rejected ? ` · rejected ${fmt(l.rejected)}` : ''}{l.returned ? ` · returned ${fmt(l.returned)}` : ''}{l.billed ? ` · billed ${fmt(l.billed)}` : ''} {u}</span>}
                                                        {over_ && !(m && m.issues.length) && <span className="block text-xs font-semibold text-amber-800" title={l.approval_reason || ''}>{fmt(l.over_po)} {u} over PO (+{l.po_qty > 0 ? fmt(Math.round((l.over_po / l.po_qty) * 1000) / 10) : 100}%){l.approved_by_name ? ` · approved by ${l.approved_by_name}${l.approved_at ? `, ${fmtDate(l.approved_at)}` : ''}` : ' · no approver'}</span>}
                                                    </td>
                                                    {trail && <>
                                                        <td className={num}>{fmt(l.po_qty)}</td>
                                                        <td className={`${num} ${over_ ? 'font-bold text-amber-800' : ''}`}>{fmt(l.received_on_po)}</td>
                                                        <td className={num}>{l.rejected ? fmt(l.rejected) : '—'}</td>
                                                        <td className={num}>{l.returned ? fmt(l.returned) : '—'}</td>
                                                        <td className={num}>{l.billed ? fmt(l.billed) : '—'}</td>
                                                    </>}
                                                    <td className={`${num} font-bold`}>{fmt(l.billable)} <span className="font-normal text-xs text-slate-500">{u}</span></td>
                                                    {p ? <>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5 text-right`} type="number" min="0" step="any" value={p.qty} onChange={e => setPick(l.id, { qty: e.target.value })} aria-label="Quantity billed" /></td>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5 text-right`} type="number" min="0" step="any" value={p.rate} onChange={e => setPick(l.id, { rate: e.target.value })} aria-label="Rate billed" /></td>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5 text-right ${p.discount_pct !== '' && !(Number(p.discount_pct) >= 0 && Number(p.discount_pct) <= 100) ? '!border-rose-400' : ''}`} type="number" min="0" max="100" step="any" value={p.discount_pct ?? ''} onChange={e => setPick(l.id, { discount_pct: e.target.value })} placeholder="0" aria-label="Line discount %" /></td>
                                                        <td className="px-1 py-2"><select className={`${inputCls} !py-1 !pl-1 !pr-0 text-xs`} value={Number(p.gst_pct)} onChange={e => setPick(l.id, { gst_pct: e.target.value })} aria-label="GST %">{rates.map(x => <option key={x} value={x}>{x}%</option>)}</select></td>
                                                        <td className="px-1 py-2"><input className={`${inputCls} !py-1 !px-1.5`} inputMode="numeric" maxLength={8} value={p.hsn_code} onChange={e => setPick(l.id, { hsn_code: e.target.value.replace(/\D/g, '') })} aria-label="HSN" /></td>
                                                        <td className={num}>{inr(cl?.taxable)}
                                                            {cl?.line_discount ? <span className="block text-[11px] font-normal text-slate-500">₹{inr(cl.value)} − {inr(cl.line_discount)}</span> : null}
                                                            {cl?.discount ? <span className="block text-[11px] font-normal text-slate-500">−{inr(cl.discount)} overall</span> : null}
                                                            <span className="block text-[11px] font-normal text-slate-500">GST {inr(cl?.gst)}</span></td>
                                                    </> : <td colSpan={6} />}
                                                </tr>,
                                                m && m.issues.length > 0 ? <tr key={`i${l.id}`} className={m.ok ? '' : 'bg-rose-50/70'}><td /><td colSpan={cols - 1} className={`px-2 pb-2 text-xs font-semibold ${m.ok ? 'text-amber-800' : 'text-rose-800'}`}>{m.issues.map((x, i) => <span key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {x}</span>)}</td></tr> : null,
                                            ];
                                        }),
                                    ];
                                })}
                                {shown.length > 0 && (
                                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                        <td /><td className="px-2 py-2">Total · {shown.length} line(s) shown · {tickedLines.length} ticked</td>
                                        {trail && <><td className={num}>{sumByUnit(shown, 'po_qty')}</td><td className={num}>{sumByUnit(shown, 'received_on_po')}</td><td className={num}>{sumByUnit(shown, 'rejected')}</td><td className={num}>{sumByUnit(shown, 'returned')}</td><td className={num}>{sumByUnit(shown, 'billed')}</td></>}
                                        <td className={num}>{sumByUnit(shown, 'billable')}</td>
                                        <td className={num}>{tickedLines.length ? (new Set(tickedLines.map(l => l.purchase_uom)).size === 1 ? fmt(chosen.reduce((s, l) => s + l.qty, 0)) : '—') : ''}</td><td /><td className={num}>{calc.lineDiscount ? `−${inr(calc.lineDiscount)}` : ''}</td><td /><td />
                                        <td className={num}>{chosen.length ? <>{inr(sum(calc.lines, l => l.taxable))}<span className="block text-[11px] font-semibold text-slate-500">GST {inr(sum(calc.lines, l => l.gst))}</span></> : ''}</td>
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
                    {charges.length === 0 ? <p className="text-sm text-slate-400">None. Add one if the invoice has freight, packing, insurance or TCS. A discount goes in the totals below.</p> : (
                        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
                            <thead className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider"><tr><th className="pr-2 py-1 w-40">Charge</th><th className="pr-2 py-1">Description</th><th className="pr-2 py-1 w-28 text-right">Amount ₹</th><th className="pr-2 py-1 w-24">GST %</th><th className="pr-2 py-1 w-28 text-right">GST ₹</th><th className="w-8" /></tr></thead>
                            <tbody>
                                {charges.map((c, i) => (
                                    <tr key={i} className="border-t border-slate-100">
                                        <td className="pr-2 py-1.5"><select className={`${inputCls} !py-1`} value={c.kind} onChange={e => setCharge(i, { kind: e.target.value, gst_pct: e.target.value === 'TCS' ? '0' : c.gst_pct })} aria-label="Charge">{Object.entries(CHARGE_KINDS).filter(([k]) => k !== 'DISCOUNT' || c.kind === 'DISCOUNT').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
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
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-5">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500">4. Invoice totals</p>
                        <p className="text-xs text-slate-500 mt-0.5">Worked out from the lines, the charges and the discount. Check each figure against the printed invoice and change any that differ.{taxMode ? ` The PO for these goods is ${taxMode === 'INTRA' ? 'CGST + SGST (same state)' : 'IGST (other state)'}.` : ''}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold text-slate-600">Overall discount</span>
                        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm font-bold" role="group" aria-label="Discount as">
                            {[['pct', '%'], ['amt', '₹']].map(([m, t]) => <button type="button" key={m} onClick={() => { if (disc.mode !== m) setDisc({ mode: m, value: '' }); }} aria-pressed={disc.mode === m} className={`px-3 py-1.5 ${disc.mode === m ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{t}</button>)}
                        </div>
                        <input className={`${inputCls} !py-1.5 !w-32 text-right`} type="number" min="0" step="any" value={disc.value} onChange={e => setDisc(d => ({ ...d, value: e.target.value }))} placeholder="0" aria-label={disc.mode === 'pct' ? 'Overall discount %' : 'Overall discount ₹'} />
                        {discError
                            ? <span className="text-sm font-semibold text-rose-700">{discError}</span>
                            : <span className="text-sm text-slate-600">{calc.discount > 0
                                ? <>₹{inr(calc.discount)} off goods of ₹{inr(calc.base)}{calc.lineDiscount ? ' (after line discounts)' : ''}{calc.pct == null && calc.base > 0 ? ` (${r2((calc.discount / calc.base) * 100)}%)` : ''}, spread over the {calc.lines.length} line(s) by value before GST. Charges are not discounted.</>
                                : 'None. Enter it as printed: a % of the goods, or the amount in ₹.'}</span>}
                    </div>

                    <div className="grid 2xl:grid-cols-2 gap-5 max-w-5xl 2xl:max-w-none">
                        <div>
                            <p className="text-xs font-bold text-slate-600 mb-1">Check against the printed invoice</p>
                            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                                <thead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200"><tr><th className="px-2 py-2 text-left" /><th className={th}>Worked out ₹</th><th className={th}>On the invoice ₹</th><th className={th}>Difference ₹</th></tr></thead>
                                <tbody>
                                    <tr className="border-t border-slate-100"><td className="px-2 py-1.5">Goods ({calc.lines.length} line{calc.lines.length === 1 ? '' : 's'})</td><td className={td}>{inr(calc.goods)}</td><td /><td /></tr>
                                    {calc.lineDiscount > 0 && <tr className="border-t border-slate-100"><td className="px-2 py-1.5">Less line discounts ({calc.lines.filter(l => l.line_discount > 0).length} line{calc.lines.filter(l => l.line_discount > 0).length === 1 ? '' : 's'})</td><td className={td}>−{inr(calc.lineDiscount)}</td><td /><td /></tr>}
                                    {calc.discount > 0 && <tr className="border-t border-slate-100"><td className="px-2 py-1.5">Less overall discount{calc.pct != null ? ` (${calc.pct}%)` : ''}</td><td className={td}>−{inr(calc.discount)}</td><td /><td /></tr>}
                                    {calc.charges !== 0 && <tr className="border-t border-slate-100"><td className="px-2 py-1.5">Freight and charges</td><td className={td}>{inr(calc.charges)}</td><td /><td /></tr>}
                                    <tr className="border-t border-slate-200 font-bold"><td className="px-2 py-1.5">Taxable value</td><td className={td}>{inr(calc.taxable)}</td>{amountCell('taxable', 'Taxable value')}{diffCell(eff.taxable, calc.taxable)}</tr>
                                    {mainTax.map(k => <tr key={k} className="border-t border-slate-100"><td className="px-2 py-1.5">{TAX_LABEL[k]}</td><td className={td}>{inr(auto[k])}</td>{amountCell(k, TAX_LABEL[k])}{diffCell(eff[k], auto[k])}</tr>)}
                                    {otherOpen
                                        ? otherTax.map(k => <tr key={k} className="border-t border-slate-100 bg-rose-50/40"><td className="px-2 py-1.5">{TAX_LABEL[k]} <span className="text-[11px] text-rose-700">not this PO's GST type</span></td><td className={td}>{inr(0)}</td>{amountCell(k, TAX_LABEL[k])}{diffCell(eff[k], 0)}</tr>)
                                        : <tr className="border-t border-slate-100"><td colSpan={4} className="px-2 py-1"><button type="button" onClick={() => setShowOtherTax(true)} className="text-[11px] font-semibold text-indigo-700 hover:underline">The invoice shows {otherTax.map(k => TAX_LABEL[k]).join(' + ')} instead?</button></td></tr>}
                                    {calc.tcs > 0 && <tr className="border-t border-slate-100"><td className="px-2 py-1.5">TCS</td><td className={td}>{inr(calc.tcs)}</td><td className={td}>{inr(calc.tcs)}</td><td /></tr>}
                                    <tr className="border-t border-slate-100"><td className="px-2 py-1.5">Round-off</td><td className={td}>—</td><td className={`${td} ${Math.abs(roundOff) > 1 ? 'text-rose-700 font-bold' : ''}`}>{roundOff ? `${roundOff > 0 ? '+' : ''}${inr(roundOff)}` : '—'}</td><td /></tr>
                                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-800"><td className="px-2 py-2">Invoice total</td><td className={td}>{inr(fromLinesTotal)}</td>{amountCell('total', 'Invoice total')}{diffCell(eff.total, fromLinesTotal)}</tr>
                                </tbody>
                            </table></div>
                            {Math.abs(roundOff) > 1 && <p className="text-xs font-semibold text-rose-700 mt-1">The total is not taxable + GST{calc.tcs ? ' + TCS' : ''} (₹{inr(exact)}). Check the figures typed.</p>}
                        </div>

                        <div className="space-y-5">
                            <div>
                                <p className="text-xs font-bold text-slate-600 mb-1">Tax summary by GST rate</p>
                                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
                                    <thead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200"><tr><th className="px-2 py-2 text-left">GST</th><th className="px-2 py-2 text-left">HSN</th><th className={th}>Goods ₹</th><th className={th}>Discount ₹</th><th className={th}>Charges ₹</th><th className={th}>Taxable ₹</th>{taxMode === 'INTER' ? <th className={th}>IGST ₹</th> : <><th className={th}>CGST ₹</th><th className={th}>SGST ₹</th></>}</tr></thead>
                                    <tbody>
                                        {calc.byRate.map(r => (
                                            <tr key={r.gst_pct} className="border-t border-slate-100">
                                                <td className="px-2 py-1.5 font-semibold">{r.gst_pct}%</td><td className="px-2 py-1.5 text-xs text-slate-600">{r.hsn.join(', ') || '—'}</td>
                                                <td className={td}>{r.goods ? inr(r.goods) : '—'}</td><td className={td}>{r.discount ? `−${inr(r.discount)}` : '—'}</td><td className={td}>{r.charges ? inr(r.charges) : '—'}</td><td className={`${td} font-semibold`}>{inr(r.taxable)}</td>
                                                {rateTax(r).map((v, i) => <td key={i} className={td}>{inr(v)}</td>)}
                                            </tr>
                                        ))}
                                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                            <td className="px-2 py-1.5" colSpan={2}>Total · {calc.byRate.length} rate(s)</td>
                                            <td className={td}>{inr(sum(calc.byRate, r => r.goods))}</td><td className={td}>{calc.lineDiscount + calc.discount ? `−${inr(r2(calc.lineDiscount + calc.discount))}` : '—'}</td><td className={td}>{calc.charges ? inr(calc.charges) : '—'}</td><td className={td}>{inr(sum(calc.byRate, r => r.taxable))}</td>
                                            {(taxMode === 'INTER' ? [sum(calc.byRate, r => r.gst)] : [sum(calc.byRate, r => rateTax(r)[0]), sum(calc.byRate, r => rateTax(r)[1])]).map((v, i) => <td key={i} className={td}>{inr(v)}</td>)}
                                        </tr>
                                    </tbody>
                                </table></div>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 mb-1">Billed against the PO <span className="font-normal text-slate-500">(at the rate agreed when the goods came; billed after line discounts, before the overall discount)</span></p>
                                <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                                    <thead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200"><tr><th className="px-2 py-2 text-left">PO</th><th className={th}>Lines</th><th className={th}>Qty billed</th><th className={th}>At PO rate ₹</th><th className={th}>Billed ₹</th><th className={th}>Difference ₹</th></tr></thead>
                                    <tbody>
                                        {byPo.map(x => { const d = r2(x.billed - x.atPo); return (
                                            <tr key={x.po_no} className="border-t border-slate-100">
                                                <td className="px-2 py-1.5">{x.po_no}</td><td className={td}>{x.lines}</td><td className={td}>{x.units.size === 1 ? `${fmt(x.qty)} ${[...x.units][0]}` : '—'}</td>
                                                <td className={td}>{inr(x.atPo)}</td><td className={td}>{inr(x.billed)}</td>
                                                <td className={`${td} ${Math.abs(d) > 0.004 ? (d > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold') : 'text-slate-400'}`}>{Math.abs(d) > 0.004 ? `${d > 0 ? '+' : ''}${inr(d)}${x.atPo ? ` (${d > 0 ? '+' : ''}${r2((d / x.atPo) * 100)}%)` : ''}` : '—'}</td>
                                            </tr>); })}
                                        {(() => { const a = r2(sum(byPo, x => x.atPo)); const b = r2(sum(byPo, x => x.billed)); const d = r2(b - a); const units = new Set(byPo.flatMap(x => [...x.units])); return (
                                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                                <td className="px-2 py-1.5">Total · {byPo.length} PO(s)</td><td className={td}>{sum(byPo, x => x.lines)}</td><td className={td}>{units.size === 1 ? `${fmt(sum(byPo, x => x.qty))} ${[...units][0]}` : '—'}</td>
                                                <td className={td}>{inr(a)}</td><td className={td}>{inr(b)}</td><td className={`${td} ${Math.abs(d) > 0.004 ? (d > 0 ? 'text-rose-700' : 'text-emerald-700') : 'text-slate-400'}`}>{Math.abs(d) > 0.004 ? `${d > 0 ? '+' : ''}${inr(d)}` : '—'}</td>
                                            </tr>); })()}
                                    </tbody>
                                </table></div>
                            </div>
                        </div>
                    </div>

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

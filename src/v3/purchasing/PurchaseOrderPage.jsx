// One purchase order: supplier and terms, lines (qty, rate, GST, delivery,
// what each covers), totals with CGST + SGST or IGST, issue / revise / cancel,
// documents, history, PDF / Excel. Draft: free editing. Issued: every change
// needs a reason and becomes a revision. Approval (15 Oct 2026): every PO is checked on its total (incl. GST)
// against Settings → Purchasing → PO approval limit — up to it the purchase manager issues, above it the factory
// admin approves (Send for approval → Approve & issue / Send back). Quantity with no requisition (direct items, or a line raised above
// its requisitions) needs a reason per line and factory admin approval: Send for approval → Approve & issue,
// or sent back to draft with the approver's reason.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Ban, Pencil, Trash2, Plus, FileDown, FileSpreadsheet, Upload, Info, PackageOpen, PackageX, ShieldCheck, Undo2, PackagePlus } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { settingsApi } from '../api/settingsApi';
import { loadImage, loadLetterhead } from '../components/letterhead';
import { adminApi } from '../../api/adminApi';
import { API_BASE_URL } from '../../utils/api';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PO_STATUS, EXTRA_REASONS, inr, amountInWords } from './poShared';
import { exportPoPdf, exportPoExcel } from './poPrint';
import RequisitionLinePicker from './RequisitionLinePicker';
import DirectItemsEditor, { directProblem, directPayload } from './DirectItemsEditor';
import { GRN_STATUS } from './grnShared';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const ACTION = { CREATED: 'Created', EDITED: 'Edited', ISSUED: 'Issued', REVISED: 'Revised', CANCELLED: 'Cancelled', SHORT_CLOSED: 'Short-closed', DOCUMENT: 'Document', RECEIPT: 'Goods received', RETURNED: 'Returned to supplier',
    SENT: 'Sent for approval', APPROVED: 'Approved', REJECTED: 'Sent back' };
// Whole purchase units the requisitions on a line need (the server's rule).
const needUnits = (l) => (l.covered > 0 ? Math.ceil(Math.round((l.covered / l.factor) * 1000) / 1000 - 1e-9) : 0);

export default function PurchaseOrderPage() {
    const { id } = useParams();
    const [po, setPo] = useState(null);
    const [canManage, setCanManage] = useState(false);
    const [canReceive, setCanReceive] = useState(false);
    const [canApprove, setCanApprove] = useState(false);
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [lineEdit, setLineEdit] = useState(null);
    const [headerEdit, setHeaderEdit] = useState(null);
    const [adding, setAdding] = useState(null);     // { mode: 'pr' | 'direct', lines, picks, direct, reason }
    const [ask, setAsk] = useState(null);           // { title, confirm, run(reason) }
    const [askText, setAskText] = useState('');
    const [docForm, setDocForm] = useState({ file: null, name: '' });
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [drafts, setDrafts] = useState({});   // lineId → { rate, gst_pct } typed in the lines table, not saved yet (16 Oct 2026)
    const [saveState, setSaveState] = useState('');   // draft PO auto-save: '' | 'saving' | 'saved' | error text
    const savingRef = useRef(false);

    // Draft PO: rates / GST typed in the table save by themselves ~1 s after the last change (asked 16 Oct 2026:
    // "why does the user have to press save — it must auto save"). An issued PO keeps the Save button: each save
    // there is a revision with a reason.
    useEffect(() => {
        if (!po || po.status !== 'DRAFT' || !canManage) return undefined;
        const valid = po.lines.filter(l => {
            const d = drafts[l.id];
            if (!d || (Number(d.rate) === l.rate && Number(d.gst_pct) === l.gst_pct)) return false;
            return d.rate !== '' && Number(d.rate) >= 0 && d.gst_pct !== '' && Number(d.gst_pct) >= 0 && Number(d.gst_pct) <= 40;
        });
        if (!valid.length) return undefined;
        const t = setTimeout(async () => {
            if (savingRef.current) return;   // a save is running; its result re-runs this for what's left
            savingRef.current = true; setSaveState('saving');
            const sent = valid.map(l => ({ id: l.id, rate: Number(drafts[l.id].rate), gst_pct: Number(drafts[l.id].gst_pct) }));
            try {
                const res = await purchasingApi.lineRates(id, sent);
                setPo(res.data);
                // keep anything typed while it was saving
                setDrafts(cur => { const n = { ...cur }; for (const x of sent) { const c = n[x.id]; if (c && Number(c.rate) === x.rate && Number(c.gst_pct) === x.gst_pct) delete n[x.id]; } return n; });
                setSaveState('saved');
            } catch (err) {
                setSaveState(apiError(err, 'Could not save the rates.'));
            } finally {
                savingRef.current = false;
            }
        }, 900);
        return () => clearTimeout(t);
    }, [drafts, po, canManage, id]);

    const load = useCallback(() => purchasingApi.order(id).then(res => setPo(res.data)).catch(err => setError(apiError(err, 'Failed to load the purchase order.'))), [id]);
    useEffect(() => { load(); purchasingApi.permissions().then(res => { setCanManage(res.data.manage); setCanReceive(res.data.receive); setCanApprove(!!res.data.approve); }).catch(() => {}); }, [load]);

    if (!po) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const editable = canManage && ['DRAFT', 'ISSUED'].includes(po.status);
    const issued = po.status === 'ISSUED';
    const intra = po.tax_mode === 'INTRA';
    const receivable = ['ISSUED', 'PARTLY_RECEIVED'].includes(po.status);
    const anyReceived = po.lines.some(l => l.received_qty > 0 || l.pending_qty > 0);
    const editLine = (l) => { setFormError(''); setLineEdit({ line: l, qty: String(l.qty), rate: String(l.rate), gst_pct: String(l.gst_pct), delivery_date: l.delivery_date || '', notes: l.notes || '', reason: '', extra_reason: l.extra_reason || '', extra_note: l.extra_note || '' }); };
    const pending = po.status === 'PENDING_APPROVAL';
    const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    const limitNote = Number(po.approval_limit) > 0 ? `${rupees(po.totals.total)} is above the ${rupees(po.approval_limit)} approval limit` : 'Every PO needs factory admin approval (no approval limit set)';

    // Rates typed in the table: what each line shows now, which changed, and "apply to the other shades".
    const draftOf = (l) => drafts[l.id] || { rate: String(l.rate), gst_pct: String(l.gst_pct) };
    const setDraft = (l, patch) => setDrafts(d => ({ ...d, [l.id]: { ...draftOf(l), ...d[l.id], ...patch } }));
    const changed = po.lines.filter(l => drafts[l.id] && (Number(drafts[l.id].rate) !== l.rate || Number(drafts[l.id].gst_pct) !== l.gst_pct));
    const badDraft = changed.some(l => !(Number(drafts[l.id].rate) >= 0) || drafts[l.id].rate === '' || !(Number(drafts[l.id].gst_pct) >= 0 && Number(drafts[l.id].gst_pct) <= 40) || drafts[l.id].gst_pct === '');
    const shadeTargets = (l) => {
        if (!l.rate_group) return [];
        const r = Number(draftOf(l).rate);
        const others = po.lines.filter(x => x.id !== l.id && x.rate_group?.key === l.rate_group.key);
        const empty = others.filter(x => !(Number(draftOf(x).rate) > 0));
        return r > 0 ? (empty.length ? empty : others.filter(x => Number(draftOf(x).rate) !== r)) : [];
    };
    const applyToShades = (l) => {
        const d = draftOf(l);
        setDrafts(cur => { const n = { ...cur }; for (const x of shadeTargets(l)) n[x.id] = { ...draftOf(x), ...cur[x.id], rate: d.rate, gst_pct: d.gst_pct }; return n; });
    };
    const saveRates = (reason) => purchasingApi.lineRates(id, changed.map(l => ({ id: l.id, rate: Number(drafts[l.id].rate), gst_pct: Number(drafts[l.id].gst_pct) })), reason)
        .then(res => { setDrafts({}); return res; });

    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setPo((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    // Company profile + the images Settings → Documents (PO) picks. The logo is compulsory on a PO (16 Oct 2026):
    // the brand or company logo, else the app's logo — "no logo" in Settings no longer applies to POs.
    const printAssets = async () => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* letterhead from the profile is optional */ }
        const ds = po.doc_settings || {};
        const [logo, signature, seal] = await Promise.all([
            loadImage(ds.logo === 'BRAND' ? (company?.brand_logo_url || company?.logo_url) : company?.logo_url),
            loadImage(ds.show_signature ? company?.signature_url : null),
            loadImage(ds.show_seal ? company?.seal_url : null),
        ]);
        return { company, assets: { logo: logo || (await loadLetterhead()).logo, signature, seal } };
    };
    const exportPdf = async () => { const { company, assets } = await printAssets(); exportPoPdf(po, company, assets); };
    const exportExcel = async () => {
        const { company, assets } = await printAssets();
        await exportPoExcel(po, company, assets).catch(err => setError(err.message || 'Failed to make the Excel file.'));
    };
    const openAdd = () => {
        setFormError('');
        setAdding({ mode: 'pr', lines: null, picks: new Map(), direct: [], reason: '' });
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
                {po.source === 'DIRECT' && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">DIRECT PURCHASE</span>}
                <span className="text-sm text-slate-500">{fmtDate(po.po_date)} · {intra ? 'CGST + SGST' : 'IGST'}</span>
            </div>
            {po.status === 'CANCELLED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Cancelled</b>{po.cancelled_by_name ? ` by ${po.cancelled_by_name}` : ''}: {po.cancelled_reason}</div>}
            {po.source === 'DIRECT' && <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><b>Direct purchase</b> — made by the store from {po.supplier_reference ? <b>{po.supplier_reference.replace(/^Bill /, 'bill ')}</b> : 'the bill'}{po.shop_name ? <> at <b>{po.shop_name}</b></> : ''}{po.created_by_name ? ` (${po.created_by_name})` : ''}; received on the same goods receipt. Spares / general items only.</div>}
            {po.status === 'SHORT_CLOSED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Short-closed</b> — the rest of this PO is no longer expected.</div>}
            {pending && (
                <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-900 rounded-lg px-3 py-2">
                    <b>Waiting for factory admin approval</b>{po.approval_requested_by_name ? ` — sent by ${po.approval_requested_by_name}` : ''}{po.approval_requested_at ? ` on ${new Date(po.approval_requested_at).toLocaleString()}` : ''}. {limitNote}. No changes until it is approved or taken back.
                </div>
            )}
            {po.status === 'DRAFT' && po.approval_rejected_reason && (
                <div className="mb-3 text-sm bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2">
                    <b>Sent back</b>{po.approval_rejected_by_name ? ` by ${po.approval_rejected_by_name}` : ''}: {po.approval_rejected_reason} — change it and send it again.
                </div>
            )}
            {po.status === 'DRAFT' && po.needs_approval && !po.approval_rejected_reason && (
                <p className="text-sm text-amber-800 mb-3">{limitNote} — {canApprove ? 'issuing it records your approval.' : 'it needs factory admin approval before it is issued.'}</p>
            )}
            {po.status === 'DRAFT' && !po.needs_approval && Number(po.approval_limit) > 0 && po.lines.length > 0 && (
                <p className="text-sm text-emerald-700 mb-3">{rupees(po.totals.total)} — within the {rupees(po.approval_limit)} approval limit: issued without approval.</p>
            )}
            {issued && po.approved_by_name && <p className="text-sm text-emerald-700 mb-1">Approved by {po.approved_by_name}{po.approved_at ? ` on ${new Date(po.approved_at).toLocaleString()}` : ''} {po.approved_total ? ` for ${rupees(po.approved_total)}` : ''}. Changes that take it above that need the factory admin again.</p>}
            {issued && <p className="text-sm text-indigo-700 mb-3">Issued {new Date(po.issued_at).toLocaleString()}{po.issued_by_name ? ` by ${po.issued_by_name}` : ''}. Changes need a reason and become revisions.</p>}

            <div className="flex flex-wrap gap-2 mb-3">
                {canManage && po.status === 'DRAFT' && (!po.needs_approval || canApprove) && <PrimaryButton onClick={() => { if (window.confirm(`${po.needs_approval ? 'Approve and issue' : 'Issue'} ${po.po_no} to ${po.supplier_name}?`)) run(() => purchasingApi.issue(id)); }} busy={busy} disabled={busy}>{po.needs_approval ? <ShieldCheck size={14} /> : <Send size={14} />} {po.needs_approval ? 'Approve & issue' : 'Issue to supplier'}</PrimaryButton>}
                {canManage && po.status === 'DRAFT' && po.needs_approval && !canApprove && <PrimaryButton onClick={() => { if (window.confirm(`Send ${po.po_no} to the factory admin for approval?`)) run(() => purchasingApi.sendForApproval(id)); }} busy={busy} disabled={busy}><Send size={14} /> Send for approval</PrimaryButton>}
                {canApprove && pending && <PrimaryButton onClick={() => { if (window.confirm(`Approve ${po.po_no} and issue it to ${po.supplier_name}?`)) run(() => purchasingApi.approve(id)); }} busy={busy} disabled={busy}><ShieldCheck size={14} /> Approve & issue</PrimaryButton>}
                {canApprove && pending && <SecondaryButton onClick={() => askReason({ title: `Send ${po.po_no} back`, confirm: 'Send back', hint: 'It goes back to draft; the purchase manager sees your reason.', run: (r) => purchasingApi.reject(id, r) })}><Ban size={14} /> Send back</SecondaryButton>}
                {canManage && pending && <SecondaryButton onClick={() => run(() => purchasingApi.recall(id))}><Undo2 size={14} /> Take back to change</SecondaryButton>}
                {editable && <SecondaryButton onClick={openAdd}><Plus size={14} /> Add requisition lines</SecondaryButton>}
                {editable && <SecondaryButton onClick={() => { setFormError(''); setAdding({ mode: 'direct', direct: [], reason: '' }); }}><PackagePlus size={14} /> Add item (no requisition)</SecondaryButton>}
                {editable && <SecondaryButton onClick={() => { setFormError(''); setHeaderEdit({ delivery_date: po.delivery_date || '', terms: po.terms || '', notes: po.notes || '', supplier_reference: po.supplier_reference || '', delivery_terms: po.delivery_terms || '', reason: '', delivery_address_id: po.delivery_address?.id || '', addresses: null }); settingsApi.addresses().then(res => setHeaderEdit(h => (h ? { ...h, addresses: res.data } : h))).catch(() => setHeaderEdit(h => (h ? { ...h, addresses: [] } : h))); }}><Pencil size={14} /> Delivery / terms</SecondaryButton>}
                {canReceive && receivable && <PrimaryButton onClick={() => navigate(`/v3/purchasing/receive/${id}`)}><PackageOpen size={14} /> Receive goods</PrimaryButton>}
                {canManage && po.status === 'PARTLY_RECEIVED' && <SecondaryButton onClick={() => askReason({ title: `Short-close ${po.po_no}`, confirm: 'Short-close', hint: 'The rest is no longer expected from the supplier. Planning stops counting it as incoming; the open requisition quantity can go on a new PO.', run: (r) => purchasingApi.shortClose(id, r) })}><PackageX size={14} /> Short-close</SecondaryButton>}
                {(editable || (canManage && pending)) && !anyReceived && <SecondaryButton onClick={() => askReason({ title: `Cancel ${po.po_no}`, confirm: 'Cancel purchase order', run: (r) => purchasingApi.cancel(id, r) })}><Ban size={14} /> Cancel</SecondaryButton>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={exportPdf}><FileDown size={14} /> PDF</SecondaryButton>
                    <SecondaryButton onClick={exportExcel}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
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
                    <div><p className="text-xs font-bold text-slate-500">Supplier reference</p><p className="font-semibold">{po.supplier_reference || '—'}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Delivery terms</p><p className="font-semibold">{po.delivery_terms || '—'}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Tax</p><p className="font-semibold">{intra ? `CGST + SGST (both in ${po.company_state_name})` : `IGST (${po.supplier_state_name} → ${po.company_state_name})`}</p></div>
                    <div><p className="text-xs font-bold text-slate-500">Raised by</p><p>{po.created_by_name || '—'}</p></div>
                    <div className="col-span-2"><p className="text-xs font-bold text-slate-500">Deliver to</p>
                        <p className="text-slate-700">{po.delivery_address ? <>{po.delivery_address.name} — {[po.delivery_address.address_line1, po.delivery_address.city, po.delivery_address.pin_code].filter(Boolean).join(', ')}{po.delivery_address.gstin ? <span className="text-xs text-slate-500"> · GSTIN {po.delivery_address.gstin}</span> : null}</> : 'Registered address'}</p></div>
                    {po.purchase_contact && <div className="col-span-2"><p className="text-xs font-bold text-slate-500">Our contact (printed)</p><p className="text-slate-700">{[po.purchase_contact.name, po.purchase_contact.phone, po.purchase_contact.email].filter(Boolean).join(' · ')}</p></div>}
                    {po.terms && <div className="col-span-2"><p className="text-xs font-bold text-slate-500">Terms</p><p className="whitespace-pre-line text-slate-700">{po.terms}</p></div>}
                    {po.notes && <div className="col-span-2"><p className="text-xs font-bold text-slate-500">Notes</p><p className="text-slate-700">{po.notes}</p></div>}
                </div>
            </div>

            {po.rate_warnings?.length > 0 && (
                <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
                    <p className="font-bold flex items-center gap-1.5"><Info size={14} /> Check before sending</p>
                    <ul className="ml-5 list-disc text-xs">{po.rate_warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
            )}
            {editable && !issued && (saveState || changed.length > 0) && (
                <p className={`mb-3 text-xs font-bold ${saveState && !['saving', 'saved'].includes(saveState) ? 'text-rose-700' : badDraft ? 'text-rose-700' : saveState === 'saved' && !changed.length ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {badDraft ? 'A rate or GST is empty or out of range (GST 0–40%) — it saves once it is valid.'
                        : saveState === 'saving' ? 'Saving rates…'
                            : saveState && saveState !== 'saved' ? <>Not saved: {saveState} <button type="button" className="ml-1 underline" onClick={() => setDrafts(d => ({ ...d }))}>Try again</button></>
                                : changed.length ? 'Saving rates…' : '✓ All rates saved'}
                </p>
            )}
            {editable && issued && changed.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
                    <b className="text-indigo-900">{changed.length} line{changed.length === 1 ? '' : 's'} with a new rate / GST — the PO is issued: save them as a revision (with a reason)</b>
                    <span className="ml-auto flex gap-2">
                        <SecondaryButton onClick={() => setDrafts({})} disabled={busy}>Discard</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || badDraft}
                            onClick={() => (issued ? askReason({ title: `Change rates on ${changed.length} line${changed.length === 1 ? '' : 's'}`, confirm: 'Save rates', run: (r) => saveRates(r) }) : run(() => saveRates()))}>Save rates</PrimaryButton>
                    </span>
                    {badDraft && <span className="basis-full text-xs font-bold text-rose-700">A rate or GST is empty or out of range (GST 0–40%).</span>}
                </div>
            )}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
                {/* Layout (16 Oct 2026): the item column takes the width; delivery and what the line covers sit under the
                    item; Edit / Remove are small icons stacked in one narrow column. */}
                <table className="w-full text-sm min-w-[780px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr className="text-right"><th className="px-3 py-2.5 text-left w-8">#</th><th className="px-3 py-2.5 text-left w-full min-w-[300px]">Item</th><th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Rate (₹)</th><th className="px-3 py-2.5">Taxable</th><th className="px-3 py-2.5">GST</th><th className="px-3 py-2.5">Amount</th>{editable && <th className="px-1 py-2.5 w-8" aria-label="Line actions" />}</tr>
                    </thead>
                    <tbody>
                        {po.lines.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">No lines. Add approved requisition lines.</td></tr>}
                        {po.lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 align-top text-right tabular-nums">
                                <td className="px-3 py-2.5 text-left">{l.line_no}</td>
                                <td className="px-3 py-2.5 text-left"><span className="font-semibold text-slate-800">{l.label}</span>
                                    <span className="block text-xs text-slate-500">{l.type_name}{l.hsn_code ? ` · HSN ${l.hsn_code}` : ' · no HSN'}{l.notes ? ` · ${l.notes}` : ''}</span>
                                    <span className="block text-[11px] text-slate-400">{l.requisitions.map(r => `${r.pr_no}/${r.pr_line_no}`).join(', ')}</span>
                                    {l.extra_qty > 0 && (
                                        <span className="mt-1 inline-block text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-800 rounded px-1.5 py-0.5">
                                            {l.direct ? 'No requisition' : `+${fmt(l.extra_qty, 'm')} ${l.purchase_uom} beyond requisitions`} · {l.extra_reason_label || 'reason needed'}{l.extra_note ? ` — ${l.extra_note}` : ''}
                                        </span>
                                    )}
                                    {/* delivery and covers, inline under the item */}
                                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                                        <span>Delivery <b className="text-slate-700">{fmtDate(l.delivery_date || po.delivery_date) || '—'}</b></span>
                                        {(l.covers.length > 0 || l.uncommitted > 0) && <span>Covers {l.covers.map((c, i) => <span key={c.order_id}>{i ? ', ' : ''}<Link to={`/v3/planning/orders/${c.order_id}`} className="font-semibold text-indigo-700 hover:underline">{c.order_no}</Link> {fmt(c.qty, l.uom)} {l.uom}</span>)}
                                            {l.uncommitted > 0 && <span className="text-sky-700">{l.covers.length ? ' · ' : ''}+{fmt(l.uncommitted, l.uom)} {l.uom} uncommitted</span>}</span>}
                                    </span></td>
                                <td className={`px-3 py-2.5 whitespace-nowrap ${editable ? 'cursor-pointer hover:bg-indigo-50' : ''}`} onClick={editable ? () => editLine(l) : undefined} title={editable ? 'Edit quantity, rate, GST, delivery' : undefined}><b>{fmt(l.qty, 'm')}</b> {l.purchase_uom}<span className="block text-[11px] text-slate-500">= {fmt(l.usage_qty, l.uom)} {l.uom}</span>
                                    {(l.received_qty > 0 || l.pending_qty > 0) && <span className={`block text-[11px] font-semibold ${l.received_qty + 0.0005 >= l.qty ? 'text-emerald-700' : 'text-amber-700'}`}>received {fmt(l.received_qty, 'm')}{l.pending_qty > 0 ? ` · ${fmt(l.pending_qty, 'm')} awaiting approval` : ''}</span>}</td>
                                {editable ? (
                                    <td className="px-3 py-2 min-w-[10rem]">
                                        <input className={`${inputCls} !px-2.5 !py-1.5 !w-36 min-w-[9rem] text-right text-base font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${Number(draftOf(l).rate) > 0 ? '' : 'border-rose-400 bg-rose-50'} ${drafts[l.id] && Number(drafts[l.id].rate) !== l.rate ? 'border-indigo-400' : ''}`}
                                            type="number" min="0" step="any" inputMode="decimal" value={draftOf(l).rate} placeholder="rate" aria-label={`Rate of line ${l.line_no} per ${l.purchase_uom}`}
                                            onChange={e => setDraft(l, { rate: e.target.value })} />
                                        <span className="block text-[11px] text-slate-400">per {l.purchase_uom}</span>
                                        {shadeTargets(l).length > 0 && (
                                            <button type="button" onClick={() => applyToShades(l)} className="block ml-auto mt-0.5 text-[11px] font-bold text-indigo-700 hover:underline" title={`${l.rate_group.name}: ${shadeTargets(l).map(x => `line ${x.line_no}`).join(', ')}`}>
                                                apply to {shadeTargets(l).length} other shade{shadeTargets(l).length === 1 ? '' : 's'}
                                            </button>
                                        )}
                                    </td>
                                ) : <td className={`px-3 py-2.5 ${l.rate > 0 ? '' : 'text-rose-700 font-bold'}`}>{l.rate > 0 ? inr(l.rate) : 'no rate'}</td>}
                                <td className="px-3 py-2.5">{inr(l.value)}</td>
                                <td className={`px-3 py-2.5 whitespace-nowrap ${editable ? 'min-w-[7rem]' : ''}`}>
                                    {editable ? <span className="inline-flex items-center gap-1"><input className={`${inputCls} !px-2 !py-1.5 !w-20 min-w-[5rem] text-right font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${drafts[l.id] && Number(drafts[l.id].gst_pct) !== l.gst_pct ? 'border-indigo-400' : ''}`} type="number" min="0" max="40" step="0.01" value={draftOf(l).gst_pct} aria-label={`GST % of line ${l.line_no}`} onChange={e => setDraft(l, { gst_pct: e.target.value })} />%</span> : `${l.gst_pct}%`}
                                    <span className="block text-[11px] text-slate-500">{intra ? `${inr(l.cgst)} + ${inr(l.sgst)}` : inr(l.igst)}</span></td>
                                <td className="px-3 py-2.5 font-bold whitespace-nowrap">{inr(l.total)}</td>
                                {editable && (
                                    <td className="px-1 py-2 align-top">
                                        <div className="flex flex-col items-center gap-1">
                                            <button type="button" className="p-1.5 rounded-md text-indigo-700 hover:bg-indigo-50" aria-label={`Edit line ${l.line_no}`} title="Edit quantity, rate, GST, delivery, notes"
                                                onClick={() => editLine(l)}><Pencil size={14} /></button>
                                            <button type="button" className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50" aria-label={`Remove line ${l.line_no}`} title="Remove line"
                                                onClick={() => (issued
                                                    ? askReason({ title: `Remove line ${l.line_no}`, confirm: 'Remove line', run: (r) => purchasingApi.removeLine(id, l.id, r) })
                                                    : window.confirm(`Remove line ${l.line_no}? Its requisition quantity becomes open again.`) && run(() => purchasingApi.removeLine(id, l.id)))}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 text-right tabular-nums font-bold">
                        <tr><td colSpan={4} className="px-3 py-2 text-left">Total</td><td className="px-3 py-2">{inr(po.totals.taxable)}</td><td className="px-3 py-2">{inr(po.totals.gst)}</td><td className="px-3 py-2 text-base whitespace-nowrap">₹ {inr(po.totals.total)}</td>{editable && <td />}</tr>
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
                        <p className="text-xs text-slate-500">= {fmt(Number(lineEdit.qty || 0) * lineEdit.line.factor, lineEdit.line.uom)} {lineEdit.line.uom} · taxable ₹{inr(Number(lineEdit.qty || 0) * Number(lineEdit.rate || 0))} · requisitions need {fmt(lineEdit.line.covered, lineEdit.line.uom)} {lineEdit.line.uom}{lineEdit.line.covered > 0 ? ` (${needUnits(lineEdit.line)} ${lineEdit.line.purchase_uom})` : ''}</p>
                        {Number(lineEdit.qty || 0) > needUnits(lineEdit.line) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                <p className="text-xs text-amber-900"><b>{fmt(Number(lineEdit.qty) - needUnits(lineEdit.line), 'm')} {lineEdit.line.purchase_uom} with no requisition</b> — give the reason. The PO still follows the approval limit on its total.</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <select className={inputCls} value={lineEdit.extra_reason} onChange={e => setLineEdit({ ...lineEdit, extra_reason: e.target.value })} aria-label="Why more than the requisitions">
                                        <option value="">— why? —</option>
                                        {EXTRA_REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                    </select>
                                    <input className={inputCls} value={lineEdit.extra_note} onChange={e => setLineEdit({ ...lineEdit, extra_note: e.target.value })} placeholder={lineEdit.extra_reason === 'OTHER' ? 'Describe the reason *' : 'Note (optional)'} aria-label="Reason note" />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Delivery date"><input className={inputCls} type="date" value={lineEdit.delivery_date} onChange={e => setLineEdit({ ...lineEdit, delivery_date: e.target.value })} /></Field>
                            <Field label="Notes"><input className={inputCls} value={lineEdit.notes} onChange={e => setLineEdit({ ...lineEdit, notes: e.target.value })} /></Field>
                        </div>
                        {issued && <Field label="Reason *" hint="The PO is issued; this becomes a revision."><input className={inputCls} value={lineEdit.reason} onChange={e => setLineEdit({ ...lineEdit, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setLineEdit(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (issued && !lineEdit.reason.trim()) || (Number(lineEdit.qty || 0) > needUnits(lineEdit.line) && (!lineEdit.extra_reason || (lineEdit.extra_reason === 'OTHER' && !lineEdit.extra_note.trim())))}
                                onClick={() => run(() => purchasingApi.updateLine(id, lineEdit.line.id, { qty: Number(lineEdit.qty), rate: Number(lineEdit.rate), gst_pct: Number(lineEdit.gst_pct), delivery_date: lineEdit.delivery_date || null, notes: lineEdit.notes, reason: lineEdit.reason,
                                    ...(Number(lineEdit.qty || 0) > needUnits(lineEdit.line) ? { extra_reason: lineEdit.extra_reason, extra_note: lineEdit.extra_note.trim() || null } : {}) }), () => setLineEdit(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {headerEdit && (
                <Modal title="Delivery and terms" onClose={() => setHeaderEdit(null)}>
                    <div className="space-y-3 w-[min(520px,90vw)]">
                        <Field label="Delivery date (whole PO)" hint="Empty = each line's own date."><input className={inputCls} type="date" value={headerEdit.delivery_date} onChange={e => setHeaderEdit({ ...headerEdit, delivery_date: e.target.value })} /></Field>
                        <Field label="Terms" hint="Printed on the PO (packing, inspection, delivery address…)."><textarea className={`${inputCls} min-h-[90px]`} value={headerEdit.terms} onChange={e => setHeaderEdit({ ...headerEdit, terms: e.target.value })} /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Supplier reference" hint="Their quotation / reference no. — printed as “Your ref.”"><input className={inputCls} maxLength={120} value={headerEdit.supplier_reference} onChange={e => setHeaderEdit({ ...headerEdit, supplier_reference: e.target.value })} /></Field>
                            <Field label="Delivery terms" hint="e.g. Ex-mill · Door delivery, freight paid"><input className={inputCls} maxLength={200} value={headerEdit.delivery_terms} onChange={e => setHeaderEdit({ ...headerEdit, delivery_terms: e.target.value })} /></Field>
                        </div>
                        <Field label="Notes (internal)"><input className={inputCls} value={headerEdit.notes} onChange={e => setHeaderEdit({ ...headerEdit, notes: e.target.value })} /></Field>
                        {headerEdit.addresses?.length > 0 && (
                            <Field label="Deliver to" hint="A unit with its own GSTIN is billed on it — the PO's GST (CGST + SGST or IGST) is worked out again.">
                                <select className={inputCls} value={headerEdit.delivery_address_id} onChange={e => setHeaderEdit({ ...headerEdit, delivery_address_id: e.target.value })}>
                                    <option value="">Registered address</option>
                                    {headerEdit.addresses.map(a => <option key={a.id} value={a.id}>{a.name}{a.gstin ? ` · GSTIN ${a.gstin}` : ''}</option>)}
                                </select>
                            </Field>
                        )}
                        {issued && <Field label="Reason *"><input className={inputCls} value={headerEdit.reason} onChange={e => setHeaderEdit({ ...headerEdit, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setHeaderEdit(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || (issued && !headerEdit.reason.trim())} onClick={() => run(() => purchasingApi.updateOrder(id, { delivery_date: headerEdit.delivery_date || null, terms: headerEdit.terms, notes: headerEdit.notes, supplier_reference: headerEdit.supplier_reference, delivery_terms: headerEdit.delivery_terms, reason: headerEdit.reason, ...(headerEdit.addresses ? { delivery_address_id: headerEdit.delivery_address_id || null } : {}) }), () => setHeaderEdit(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adding?.mode === 'direct' && (
                <Modal title={`Add items with no requisition to ${po.po_no}`} onClose={() => setAdding(null)}>
                    <div className="space-y-3 w-[min(860px,94vw)] max-h-[75vh] overflow-y-auto">
                        <p className="text-xs text-slate-500">Fabric, trims, spares or general items bought ahead of a requisition. An item already on this PO is added to its line. {canApprove ? '' : 'The PO then needs factory admin approval before it is issued.'}</p>
                        <DirectItemsEditor items={adding.direct} setItems={(d) => setAdding({ ...adding, direct: d })} supplierId={po.supplier_id} />
                        {issued && <Field label="Reason for the revision *"><input className={inputCls} value={adding.reason} onChange={e => setAdding({ ...adding, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError || (adding.direct.length ? directProblem(adding.direct) : '')} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdding(null)}>Cancel</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !adding.direct.length || !!directProblem(adding.direct) || (issued && !adding.reason.trim())}
                                onClick={() => run(() => purchasingApi.addLines(id, [], adding.reason, directPayload(adding.direct)), () => setAdding(null))}>Add to PO</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adding?.mode === 'pr' && (
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

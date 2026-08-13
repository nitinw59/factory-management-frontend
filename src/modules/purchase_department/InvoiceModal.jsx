import { useState, useEffect, useMemo } from 'react';
import {
    X, Loader2, AlertTriangle, Trash2, Upload, Receipt, Edit3, CheckSquare, Square,
    ChevronDown, ChevronRight, FileText, Package, Scissors, Tag, Scale, RefreshCw,
    ShieldCheck, CheckCircle2, XCircle, Download,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { adminApi } from '../../api/adminApi';
import { IMAGE_BASE_URL } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { generateInvoicePdf } from './invoicePdfGenerator';

const PAYMENT_OPTS = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];

const PAYMENT_CFG = {
    UNPAID:         { cls: 'bg-amber-100 text-amber-700 border-amber-200',     label: 'Unpaid'    },
    PARTIALLY_PAID: { cls: 'bg-blue-100 text-blue-700 border-blue-200',         label: 'Partial'   },
    PAID:           { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',label: 'Paid'      },
    OVERDUE:        { cls: 'bg-red-100 text-red-700 border-red-200',            label: 'Overdue'   },
};

export const PaymentPill = ({ status }) => {
    const cfg = PAYMENT_CFG[status] || { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: status || '—' };
    return (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

const MATCH_CFG = {
    MATCHED:              { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: '3-Way Matched' },
    MATCHED_WITH_WARNING: { cls: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Matched · Review' },
    UNMATCHED:            { cls: 'bg-red-100 text-red-700 border-red-200',             label: 'Unmatched'     },
    MISMATCH_OVERRIDDEN:  { cls: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Overridden'    },
};

export const MatchPill = ({ status }) => {
    if (!status) return null;
    const cfg = MATCH_CFG[status] || { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: status };
    return (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

const OVERRIDE_ROLES = ['factory_admin', 'purchase_manager'];

const itemLabel = (it) => {
    const t = it.item_type || it.type;
    if (t === 'fabric') return `${it.fabric_type_name || 'Fabric'}${it.fabric_color_name ? ` · ${it.fabric_color_name}` : ''}${it.fabric_color_number ? ` (${it.fabric_color_number})` : ''}`;
    if (t === 'other')  return it.general_item_name
        ? `${it.general_item_name}${it.general_item_code ? ` (${it.general_item_code})` : ''}`
        : (it.description || 'Other item');
    return `${it.trim_item_name || 'Trim'}${it.variant_color_name ? ` · ${it.variant_color_name}` : ''}${it.variant_color_number ? ` (${it.variant_color_number})` : ''}${it.variant_size ? ` · Sz ${it.variant_size}` : ''}`;
};

const num = (v, dp = 2) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: dp }) : '—';
};

const OkIcon = ({ ok, warn }) => ok === false
    ? <XCircle size={12} className="text-red-500 inline shrink-0" />
    : warn
        ? <AlertTriangle size={12} className="text-amber-500 inline shrink-0" />
        : ok === true
            ? <CheckCircle2 size={12} className="text-emerald-500 inline shrink-0" />
            : null;

// Renders a match_report / match_snapshot: { reasons[], warnings[], lines[], totals{} }
// reasons block the invoice; warnings are variance within tolerance that still booked —
// informational only, never a reason booking was refused.
export function MatchReportPanel({ report, tolerance }) {
    if (!report) return null;
    const reasons  = report.reasons  || [];
    const warnings = report.warnings || [];
    const lines    = report.lines    || [];
    const totals   = report.totals   || null;
    return (
        <div className="space-y-2">
            {reasons.length > 0 && (
                <ul className="space-y-1">
                    {reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-red-700">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span className="break-words">{String(r)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {warnings.length > 0 && (
                <ul className="space-y-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    {warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span className="break-words">{String(w)}</span>
                        </li>
                    ))}
                </ul>
            )}
            {lines.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-[10px]">
                        <thead>
                            <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider">
                                <th className="text-left  font-bold px-2 py-1.5">Line</th>
                                <th className="text-right font-bold px-2 py-1.5">Inv Qty</th>
                                <th className="text-right font-bold px-2 py-1.5">GRN Qty</th>
                                <th className="text-right font-bold px-2 py-1.5">Qty Δ%</th>
                                <th className="text-right font-bold px-2 py-1.5">Inv Rate</th>
                                <th className="text-right font-bold px-2 py-1.5">GRN Rate</th>
                                <th className="text-right font-bold px-2 py-1.5">PO Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {lines.map((l, i) => (
                                <tr key={i} className={
                                    (l.qty_ok === false || l.rate_ok === false) ? 'bg-red-50/50'
                                        : l.warn ? 'bg-amber-50/50' : ''
                                }>
                                    <td className="px-2 py-1.5 text-slate-600 max-w-[140px] truncate">
                                        {l.label || l.item_name || l.description || `Line ${i + 1}`}
                                    </td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${l.qty_ok === false ? 'text-red-600 font-bold' : l.qty_warn ? 'text-amber-700 font-bold' : 'text-slate-700'}`}>
                                        {num(l.inv_qty)} <OkIcon ok={l.qty_ok} warn={l.qty_warn} />
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{num(l.grn_qty)}</td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${l.qty_ok === false ? 'text-red-600 font-bold' : l.qty_warn ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>
                                        {l.qty_variance_pct != null ? `${num(l.qty_variance_pct)}%` : '—'}
                                    </td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${l.rate_ok === false ? 'text-red-600 font-bold' : l.rate_warn ? 'text-amber-700 font-bold' : 'text-slate-700'}`}>
                                        {num(l.inv_rate, 5)} <OkIcon ok={l.rate_ok} warn={l.rate_warn} />
                                    </td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{num(l.grn_rate, 5)}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{num(l.po_rate, 5)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {totals && (
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[10px] text-slate-600">
                    {Object.entries(totals).map(([k, v]) => (
                        <span key={k} className="tabular-nums">
                            <span className="text-slate-400 uppercase tracking-wider font-bold">{k.replace(/_/g, ' ')}:</span>{' '}
                            {typeof v === 'boolean' ? (v ? '✓' : '✗') : num(v)}
                        </span>
                    ))}
                </div>
            )}
            {tolerance != null && (
                <p className="text-[10px] text-slate-400">Block threshold: variance up to ±{tolerance}% books with a warning; beyond it is blocked.</p>
            )}
        </div>
    );
}

export default function InvoiceModal({
    inwards = [],            // all inwards on this PO
    poItems = [],            // PO line items for ordered-qty context
    invoice = null,
    po = null,                // { po_code, supplier_name, supplier_gstin, ... } — for the PDF header, optional
    initialMode = 'view',
    defaultSelectedIds = new Set(),
    onClose,
    onSaved,
    onDeleted,
}) {
    const isCreate = !invoice;
    const { user } = useAuth();
    const canOverride = OVERRIDE_ROLES.includes(user?.role);

    const [mode, setMode] = useState(isCreate ? 'create' : initialMode);
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false); // review-all-details step before Create Invoice actually saves
    const [createdResult, setCreatedResult] = useState(null); // POST /invoices response — set on success, swaps the overlay to a success/PDF screen
    const [pdfBusy,  setPdfBusy]  = useState(false);
    const [pdfError, setPdfError] = useState(null);

    const [invNumber,   setInvNumber]   = useState(invoice?.invoice_number || '');
    const [invDate,     setInvDate]     = useState(invoice?.invoice_date || new Date().toISOString().split('T')[0]);
    const [amount,      setAmount]      = useState(invoice?.amount ?? '');
    const [paymentStat, setPaymentStat] = useState(invoice?.payment_status || 'UNPAID');
    const [notes,       setNotes]       = useState(invoice?.notes || '');
    const [scanFile,    setScanFile]    = useState(null);
    const [selectedIds, setSelectedIds] = useState(() => {
        if (invoice) return new Set((invoice.inwards || []).map(iw => iw.id));
        return new Set(defaultSelectedIds);
    });
    const [expandedInwardId, setExpandedInwardId] = useState(null);

    // Three-way match state
    const [lines,         setLines]         = useState([]);   // invoice line grid (create/edit)
    const [detail,        setDetail]        = useState(null); // GET /invoices/:id payload (view)
    const [tolerance,     setTolerance]     = useState(null);
    const [matchFail,     setMatchFail]     = useState(null); // match_report from a 422
    const [overrideNotes, setOverrideNotes] = useState('');
    const [overrideOpen,  setOverrideOpen]  = useState(false); // standalone override form (view mode)
    const [matchBusy,     setMatchBusy]     = useState(false);

    const toggleExpand = (id) => setExpandedInwardId(prev => prev === id ? null : id);

    const buildScanUrl = (url) => {
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    };

    const TYPE_ICON = { fabric: Package, trim: Scissors };

    useEffect(() => { setErr(null); setMatchFail(null); setOverrideOpen(false); }, [mode]);

    const editable = mode === 'create' || mode === 'edit';

    useEffect(() => {
        purchaseDeptApi.getMatchTolerance()
            .then(r => setTolerance(r.data?.tolerance_pct))
            .catch(() => {});
    }, []);

    const loadDetail = async () => {
        if (!invoice?.id) return;
        try {
            const res = await purchaseDeptApi.getInvoiceById(invoice.id);
            setDetail(res.data);
        } catch { /* older list rows still render without detail */ }
    };
    useEffect(() => { loadDetail(); }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep the line grid in sync with the selected inwards: one row per GRN line,
    // prefilled with qty_received / effective rate so a clean invoice matches by construction.
    useEffect(() => {
        if (!editable) return;
        setLines(prev => {
            const prevById = new Map(prev.map(l => [l.purchase_inward_item_id, l]));
            const next = [];
            inwards.filter(iw => selectedIds.has(iw.id)).forEach(iw => {
                (iw.items || []).forEach(it => {
                    const kept = prevById.get(it.id);
                    next.push(kept || {
                        purchase_inward_item_id: it.id,
                        qty:  it.qty_received ?? '',
                        rate: (it.effective_unit_price ?? it.unit_price) ?? '',
                        description: '',
                        _label: itemLabel(it),
                        _grn:   iw.grn_number || `Inward #${iw.id}`,
                        _uom:   it.unit_of_measure || it.trim_uom || '',
                        _grnQty:   it.qty_received ?? null,
                        _grnRate:  (it.effective_unit_price ?? it.unit_price) ?? null,
                        _poItemId: it.purchase_order_item_id ?? null,
                    });
                });
            });
            return next;
        });
    }, [selectedIds, inwards, editable]);

    // When editing an existing invoice, overlay its saved line values onto the grid.
    useEffect(() => {
        if (!editable || !detail?.items?.length) return;
        setLines(prev => prev.map(l => {
            const saved = detail.items.find(d => d.purchase_inward_item_id === l.purchase_inward_item_id);
            return saved ? { ...l, qty: saved.qty, rate: saved.rate, description: saved.description || '' } : l;
        }));
    }, [detail, mode]); // eslint-disable-line react-hooks/exhaustive-deps

    const setLine = (idx, field, value) =>
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

    const setGroupRate = (groupKey, value) =>
        setLines(prev => prev.map(l => {
            const k = l._poItemId != null ? String(l._poItemId) : l._label;
            return k === groupKey ? { ...l, rate: value } : l;
        }));

    const linesTotal = useMemo(() =>
        lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0),
    [lines]);

    // Merge same-PO-item rows into one display row (one entry per unique purchase_order_item_id / label).
    const mergedLines = useMemo(() => {
        const groups = new Map();
        lines.forEach(l => {
            const key = l._poItemId != null ? String(l._poItemId) : l._label;
            if (!groups.has(key)) groups.set(key, { key, label: l._label, uom: l._uom, rate: l.rate, poItemId: l._poItemId, items: [] });
            groups.get(key).items.push(l);
        });
        return [...groups.values()];
    }, [lines]);

    // PO-ordered qty + qty received in OTHER (non-selected) inwards, keyed by mergedLines group key.
    const poContextMap = useMemo(() => {
        if (!poItems.length || !mergedLines.length) return {};
        const map = {};
        mergedLines.forEach(g => {
            if (g.poItemId == null) return;
            const poItem = poItems.find(p => String(p.id) === String(g.poItemId));
            if (!poItem) return;
            const otherReceived = inwards
                .filter(iw => !selectedIds.has(iw.id))
                .reduce((s, iw) => s + (iw.items || [])
                    .filter(it => String(it.purchase_order_item_id) === String(g.poItemId))
                    .reduce((ss, it) => ss + (parseFloat(it.qty_received) || 0), 0), 0);
            map[g.key] = { ordered: parseFloat(poItem.quantity) || 0, uom: poItem.uom || g.uom || 'pcs', otherReceived };
        });
        return map;
    }, [mergedLines, poItems, inwards, selectedIds]);

    const matchStatus = detail?.match_status ?? invoice?.match_status;

    const toggleInward = (id) => setSelectedIds(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    // An inward is selectable if: it has no invoice yet, OR it belongs to this invoice already.
    const isSelectable = (iw) =>
        iw.invoice_id == null || (invoice && iw.invoice_id === invoice.id);

    // Shared by the Create-Invoice button (gates opening the confirmation
    // review) and handleSave itself (defends against the confirmation being
    // bypassed / stale state if something changed underneath it).
    const getValidationError = (withOverride) => {
        if (!invNumber.trim()) return 'Invoice number is required.';
        if (!invDate)          return 'Invoice date is required.';
        if (amount === '' || isNaN(parseFloat(amount))) return 'Amount is required.';
        if (selectedIds.size === 0) return 'Link at least one inward.';
        if (lines.length === 0) return 'No billable GRN lines on the selected inwards.';
        const badLine = lines.findIndex(l =>
            l.qty === '' || isNaN(parseFloat(l.qty)) || l.rate === '' || isNaN(parseFloat(l.rate)));
        if (badLine !== -1) return `Line ${badLine + 1}: qty and rate are required.`;
        if (withOverride && !overrideNotes.trim()) return 'Override notes are mandatory to book with a mismatch.';
        return null;
    };

    // "Create Invoice" doesn't save directly — it opens the confirmation
    // review first (handleConfirmCreate below does the actual save).
    const handleReviewClick = () => {
        setErr(null);
        const validationError = getValidationError(false);
        if (validationError) { setErr(validationError); return; }
        setConfirmOpen(true);
    };

    // The confirm overlay's "Confirm & Create Invoice" button — handleSave
    // itself decides what happens next (stays in the overlay to show the
    // success/PDF screen on create-mode success, or drops confirmOpen back
    // to the form on failure so the error/override UI is visible there).
    const handleConfirmCreate = () => handleSave(false);

    const handleSave = async (withOverride = false) => {
        setErr(null);
        const validationError = getValidationError(withOverride);
        if (validationError) { setErr(validationError); return; }
        const inward_ids = [...selectedIds];

        setBusy(true);
        try {
            const payload = {
                invoice_number: invNumber.trim(),
                invoice_date:   invDate,
                amount:         parseFloat(amount),
                payment_status: paymentStat,
                notes:          notes || undefined,
                inward_ids,
                items: lines.map(l => ({
                    purchase_inward_item_id: l.purchase_inward_item_id,
                    qty:  parseFloat(l.qty),
                    rate: parseFloat(l.rate),
                    ...(l.description?.trim() ? { description: l.description.trim() } : {}),
                })),
                ...(withOverride ? { override_notes: overrideNotes.trim() } : {}),
            };
            const res = mode === 'create'
                ? await purchaseDeptApi.createInvoice(payload, scanFile)
                : await purchaseDeptApi.updateInvoice(invoice.id, payload, scanFile);
            setMatchFail(null);
            if (mode === 'create') {
                // Stay in the (still-open) confirm overlay, now showing the
                // success screen + PDF download instead of closing the modal.
                setCreatedResult(res.data);
            } else {
                onSaved?.(res.data);
            }
        } catch (e) {
            const data = e?.response?.data;
            setConfirmOpen(false); // drop back to the form so the error is visible there (no-op if not open)
            if (e?.response?.status === 422 && data?.match_report) {
                setMatchFail(data.match_report);
                setErr(data.error || 'Three-way match failed — not booked.');
            } else {
                setMatchFail(null);
                setErr(data?.error || e.message || 'Save failed.');
            }
        } finally {
            setBusy(false);
        }
    };

    const triggerBrowserDownload = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Builds the PDF from exactly what was just submitted (form state +
    // the match report returned alongside creation) — no extra fetch needed.
    const handleDownloadInvoicePdf = async () => {
        setPdfBusy(true); setPdfError(null);
        try {
            let company = null;
            try {
                const cr = await adminApi.getCompanyProfile();
                company = cr.data ?? null;
            } catch { company = null; }

            const pdfLines = mergedLines.map(group => {
                const totalQty = group.items.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
                const rate = parseFloat(group.rate) || 0;
                const grns = [...new Set(group.items.map(l => l._grn))].join(', ');
                return { label: group.label, uom: group.uom, qty: totalQty, rate, value: totalQty * rate, grn: grns };
            });
            const linkedInwards = inwards.filter(iw => selectedIds.has(iw.id));

            const pdfBlob = await generateInvoicePdf({
                invoice: {
                    invoice_number: invNumber.trim(),
                    invoice_date:   invDate,
                    amount:         parseFloat(amount) || 0,
                    payment_status: paymentStat,
                    notes,
                },
                po,
                company,
                inwards: linkedInwards,
                lines: pdfLines,
                matchReport: createdResult?.match_report || null,
            });

            const datestamp = new Date().toISOString().slice(0, 10);
            const safeNum   = invNumber.trim().replace(/[^A-Za-z0-9._-]/g, '_');
            triggerBrowserDownload(pdfBlob, `Invoice-${safeNum}-${datestamp}.pdf`);
        } catch (e) {
            setPdfError(e?.message || 'Failed to generate PDF.');
        } finally {
            setPdfBusy(false);
        }
    };

    const handleRematch = async () => {
        if (!invoice?.id) return;
        setMatchBusy(true); setErr(null);
        try {
            await purchaseDeptApi.rematchInvoice(invoice.id);
            await loadDetail();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Re-match failed.');
        } finally {
            setMatchBusy(false);
        }
    };

    const handleOverride = async () => {
        if (!invoice?.id) return;
        if (!overrideNotes.trim()) { setErr('Notes documenting the resolution are mandatory.'); return; }
        setMatchBusy(true); setErr(null);
        try {
            await purchaseDeptApi.overrideInvoiceMatch(invoice.id, overrideNotes.trim());
            setOverrideOpen(false);
            setOverrideNotes('');
            await loadDetail();
        } catch (e) {
            if (e?.response?.status === 409) {
                // It actually matches now — refresh the stored status instead.
                setErr(e?.response?.data?.error || 'Invoice matches now — running re-match instead.');
                await handleRematch();
                setOverrideOpen(false);
            } else {
                setErr(e?.response?.data?.error || 'Override failed.');
            }
        } finally {
            setMatchBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!invoice) return;
        if (!window.confirm(`Delete invoice ${invoice.invoice_number}? Linked inwards will become re-attachable.`)) return;
        setBusy(true); setErr(null);
        try {
            await purchaseDeptApi.deleteInvoice(invoice.id);
            onDeleted?.(invoice.id);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Delete failed.');
        } finally {
            setBusy(false);
        }
    };

    const scanUrl = (() => {
        const url = invoice?.scan_url;
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    })();

    return (
        <>
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <Receipt size={16} className="text-indigo-500" />
                            {mode === 'create' ? 'New Invoice' : `Invoice · ${invoice.invoice_number}`}
                        </h2>
                        {!isCreate && (
                            <div className="mt-1 flex items-center gap-1.5">
                                <PaymentPill status={invoice.payment_status} />
                                <MatchPill status={matchStatus} />
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}

                    {/* Three-way match failure (422) — report + optional override retry */}
                    {matchFail && editable && (
                        <div className="bg-red-50/60 border border-red-200 rounded-xl px-3 py-3 space-y-3">
                            <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                                <Scale size={13} /> PO · GRN · Invoice do not reconcile
                            </p>
                            <MatchReportPanel report={matchFail} tolerance={tolerance} />
                            {canOverride ? (
                                <div className="pt-2 border-t border-red-100 space-y-2">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Override notes (mandatory — becomes a permanent audit record)
                                    </label>
                                    <textarea
                                        value={overrideNotes}
                                        onChange={e => setOverrideNotes(e.target.value)}
                                        rows={2}
                                        placeholder="e.g. Freight included, approved by GM"
                                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400 resize-none bg-white"
                                    />
                                    <button
                                        onClick={() => handleSave(true)}
                                        disabled={busy || !overrideNotes.trim()}
                                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
                                    >
                                        {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                                        {mode === 'create' ? 'Book with override' : 'Save with override'}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[11px] text-slate-500 pt-2 border-t border-red-100">
                                    Resolve the variance (correct the invoice lines, PO, or GRN), or ask a factory admin /
                                    purchase manager to document an override.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice Number *</label>
                            <input
                                type="text"
                                value={invNumber}
                                onChange={e => setInvNumber(e.target.value)}
                                disabled={!editable}
                                placeholder="INV-2026-…"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice Date *</label>
                            <input
                                type="date"
                                value={invDate}
                                onChange={e => setInvDate(e.target.value)}
                                disabled={!editable}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount *</label>
                            <input
                                type="number"
                                step="any"
                                min="0"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                disabled={!editable}
                                placeholder="0.00"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-indigo-400 text-right tabular-nums"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Status</label>
                            <select
                                value={paymentStat}
                                onChange={e => setPaymentStat(e.target.value)}
                                disabled={!editable}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-indigo-400 bg-white"
                            >
                                {PAYMENT_OPTS.map(s => <option key={s} value={s}>{PAYMENT_CFG[s]?.label || s}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scan (jpg, ≤5MB)</label>
                            <div className="flex items-center gap-2 mt-1">
                                {editable && (
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg transition cursor-pointer bg-white">
                                        <Upload size={12} />
                                        {scanFile ? scanFile.name.slice(0, 18) : (scanUrl ? 'Replace' : 'Upload')}
                                        <input type="file" accept="image/jpeg" className="hidden" onChange={e => setScanFile(e.target.files?.[0] || null)} />
                                    </label>
                                )}
                                {scanUrl && (
                                    <a href={scanUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-700 underline">View existing</a>
                                )}
                                {!editable && !scanUrl && <span className="text-xs text-slate-400 italic">No scan</span>}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                disabled={!editable}
                                rows={2}
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-indigo-400 resize-none"
                            />
                        </div>
                    </div>

                    {/* Invoice lines — one row per billed GRN line (drives the three-way match) */}
                    {editable && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Scale size={11} /> Invoice Lines ({mergedLines.length})
                                </p>
                                {tolerance != null && (
                                    <span className="text-[10px] text-slate-400">Match tolerance ±{tolerance}%</span>
                                )}
                            </div>
                            {mode === 'edit' && matchStatus === 'MISMATCH_OVERRIDDEN' && (
                                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mb-2">
                                    Editing amount, lines, or linked inwards voids the existing match override.
                                </p>
                            )}
                            {mergedLines.length === 0 ? (
                                <p className="text-sm text-slate-400 italic">Select inwards below — their GRN lines appear here prefilled.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[11px]">
                                            <thead>
                                                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[9px]">
                                                    <th className="text-left  font-bold px-2.5 py-1.5">Item</th>
                                                    <th className="text-right font-bold px-2.5 py-1.5 w-28">Qty</th>
                                                    <th className="text-right font-bold px-2.5 py-1.5 w-24">Rate</th>
                                                    <th className="text-right font-bold px-2.5 py-1.5 w-24">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {mergedLines.map(group => {
                                                    const totalQty = group.items.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
                                                    const rate     = parseFloat(group.rate) || 0;
                                                    const value    = totalQty * rate;
                                                    const ctx      = poContextMap[group.key];
                                                    const grns     = [...new Set(group.items.map(l => l._grn))].join(', ');
                                                    const poBadge  = ctx
                                                        ? totalQty < ctx.ordered
                                                            ? 'bg-red-100 text-red-700'
                                                            : totalQty > ctx.ordered
                                                                ? 'bg-yellow-100 text-yellow-700'
                                                                : 'bg-green-100 text-green-700'
                                                        : 'bg-slate-100 text-slate-600';
                                                    return (
                                                        <tr key={group.key} className="hover:bg-slate-50/60">
                                                            <td className="px-2.5 py-2">
                                                                <p className="font-medium text-slate-700 truncate max-w-[220px]">{group.label}</p>
                                                                <p className="text-[9px] text-slate-400 mt-0.5">{grns}</p>
                                                                {ctx && (
                                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${poBadge}`}>
                                                                            PO {ctx.ordered.toLocaleString()} {ctx.uom}
                                                                        </span>
                                                                        {ctx.otherReceived > 0 && (
                                                                            <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                                                                Other GRNs {ctx.otherReceived.toLocaleString()} {ctx.uom}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-2.5 py-2 text-right tabular-nums font-bold text-slate-700 align-top">
                                                                {totalQty.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                                                {group.uom ? <span className="text-[9px] text-slate-400 ml-1">{group.uom}</span> : null}
                                                            </td>
                                                            <td className="px-2.5 py-2 align-top">
                                                                <input
                                                                    type="number" step="any" min="0"
                                                                    value={group.rate}
                                                                    onChange={e => setGroupRate(group.key, e.target.value)}
                                                                    className="w-full text-right tabular-nums border border-slate-200 rounded-md px-1.5 py-1 focus:outline-none focus:border-indigo-400 text-[11px]"
                                                                />
                                                            </td>
                                                            <td className="px-2.5 py-2 text-right tabular-nums font-bold text-slate-800 align-top">
                                                                ₹{num(value)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="flex items-center justify-end gap-3 px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px]">
                                        <span className="text-slate-500">
                                            Lines total: <strong className="tabular-nums text-slate-700">₹{num(linesTotal)}</strong>
                                        </span>
                                        {parseFloat(amount) !== linesTotal && (
                                            <button
                                                type="button"
                                                onClick={() => setAmount(String(Math.round(linesTotal * 100) / 100))}
                                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 underline"
                                            >
                                                Use as invoice amount
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Three-way match status & audit record (view mode) */}
                    {!editable && !isCreate && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 flex-wrap">
                                <Scale size={13} className="text-slate-500" />
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Three-Way Match</p>
                                <MatchPill status={matchStatus} />
                                <div className="ml-auto flex items-center gap-1.5">
                                    <button
                                        onClick={handleRematch}
                                        disabled={matchBusy}
                                        title="Re-run the match after PO/GRN corrections"
                                        className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-2 py-1 rounded-lg transition disabled:opacity-40"
                                    >
                                        <RefreshCw size={10} className={matchBusy ? 'animate-spin' : ''} /> Re-run match
                                    </button>
                                    {canOverride && matchStatus === 'UNMATCHED' && (
                                        <button
                                            onClick={() => setOverrideOpen(o => !o)}
                                            disabled={matchBusy}
                                            className="flex items-center gap-1 text-[10px] font-bold text-amber-700 hover:text-white hover:bg-amber-600 border border-amber-300 px-2 py-1 rounded-lg transition disabled:opacity-40"
                                        >
                                            <ShieldCheck size={10} /> Override
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="px-3 py-2.5 space-y-2.5">
                                {matchStatus === 'MISMATCH_OVERRIDDEN' && (detail?.match_override_by_name || detail?.match_override_notes) && (
                                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                        <p className="font-bold">
                                            Mismatch overridden{detail?.match_override_by_name ? ` by ${detail.match_override_by_name}` : ''}
                                            {detail?.match_override_at ? ` · ${new Date(detail.match_override_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                                        </p>
                                        {detail?.match_override_notes && <p className="mt-0.5 italic">“{detail.match_override_notes}”</p>}
                                    </div>
                                )}
                                {overrideOpen && (
                                    <div className="space-y-2 bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Resolution notes (mandatory — permanent audit record)
                                        </label>
                                        <textarea
                                            value={overrideNotes}
                                            onChange={e => setOverrideNotes(e.target.value)}
                                            rows={2}
                                            placeholder="How was the discrepancy resolved / approved?"
                                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400 resize-none bg-white"
                                        />
                                        <button
                                            onClick={handleOverride}
                                            disabled={matchBusy || !overrideNotes.trim()}
                                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
                                        >
                                            {matchBusy ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                                            Document override
                                        </button>
                                    </div>
                                )}
                                {detail?.items?.length > 0 && (
                                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider">
                                                    <th className="text-left  font-bold px-2 py-1.5">Item</th>
                                                    <th className="text-right font-bold px-2 py-1.5">Inv Qty</th>
                                                    <th className="text-right font-bold px-2 py-1.5">GRN Qty</th>
                                                    <th className="text-right font-bold px-2 py-1.5">Inv Rate</th>
                                                    <th className="text-right font-bold px-2 py-1.5">GRN Rate</th>
                                                    <th className="text-right font-bold px-2 py-1.5">PO Rate</th>
                                                    <th className="text-right font-bold px-2 py-1.5">Value</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {detail.items.map((it, i) => (
                                                    <tr key={it.id ?? i}>
                                                        <td className="px-2 py-1.5 text-slate-600 max-w-[160px] truncate">
                                                            {it.item_name || itemLabel(it) || it.description || `Line ${i + 1}`}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 font-medium">{num(it.qty)}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{num(it.grn_qty)}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 font-medium">{num(it.rate, 5)}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{num(it.grn_rate, 5)}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{num(it.po_rate, 5)}</td>
                                                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-700">
                                                            {num(it.line_value ?? (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0))}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {detail && !detail.items?.length && (
                                    <p className="text-[11px] text-slate-400 italic">
                                        Legacy invoice without line details — it stays Unmatched; payment requires a documented override.
                                    </p>
                                )}
                                {detail?.match_snapshot && (
                                    <details className="text-[11px]">
                                        <summary className="cursor-pointer text-slate-500 font-semibold hover:text-slate-700">
                                            Match report snapshot
                                        </summary>
                                        <div className="mt-2">
                                            <MatchReportPanel report={detail.match_snapshot} tolerance={tolerance} />
                                        </div>
                                    </details>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Inward selection */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Linked Inwards ({selectedIds.size} selected)
                        </p>
                        {inwards.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No inwards on this PO yet.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {inwards.map(iw => {
                                    const sel = selectedIds.has(iw.id);
                                    const allowed = isSelectable(iw);
                                    const linkedToOther = iw.invoice_id != null && (!invoice || iw.invoice_id !== invoice.id);
                                    const expanded = expandedInwardId === iw.id;
                                    const scan = buildScanUrl(iw.scan_url);
                                    return (
                                        <div
                                            key={iw.id}
                                            className={`rounded-xl border transition ${
                                                sel
                                                    ? 'bg-indigo-50 border-indigo-300'
                                                    : linkedToOther
                                                        ? 'bg-slate-50 border-slate-100 opacity-60'
                                                        : 'bg-white border-slate-200 hover:border-indigo-200'
                                            }`}
                                        >
                                            <div
                                                onClick={() => toggleExpand(iw.id)}
                                                className="flex items-center gap-3 p-2.5 cursor-pointer select-none"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); if (editable && allowed) toggleInward(iw.id); }}
                                                    disabled={!editable || !allowed}
                                                    className="shrink-0 disabled:cursor-not-allowed"
                                                    title={!editable ? 'View mode' : !allowed ? 'Linked to another invoice' : 'Toggle selection'}
                                                >
                                                    {sel
                                                        ? <CheckSquare size={14} className="text-indigo-600" />
                                                        : <Square size={14} className="text-slate-300" />
                                                    }
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-800 truncate">
                                                        {iw.grn_number || `Inward #${iw.id}`}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500">
                                                        {new Date(iw.received_date).toLocaleDateString('en', { dateStyle: 'medium' })}
                                                        {' · '}{(iw.items || []).length} item{(iw.items || []).length === 1 ? '' : 's'}
                                                        {iw.condition ? ` · ${iw.condition}` : ''}
                                                        {scan && <span className="ml-1 text-indigo-500">· 📎 scan</span>}
                                                    </p>
                                                </div>
                                                {linkedToOther && (
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                                                        On invoice #{iw.invoice_id}
                                                    </span>
                                                )}
                                                <div className="shrink-0 text-slate-400">
                                                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </div>
                                            </div>

                                            {expanded && (
                                                <div className="border-t border-slate-100 px-3 py-2.5 space-y-2 bg-white/60">
                                                    {/* Items list — branch on is_free_form */}
                                                    {(iw.items || []).length > 0 ? (
                                                        <div>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                                Items · {iw.items.length}
                                                            </p>
                                                            <div className="space-y-1">
                                                                {iw.items.map(it => {
                                                                    const itemType = it.item_type || it.type;  // resolved type
                                                                    const Icon = TYPE_ICON[itemType] || Tag;
                                                                    const label = itemLabel(it);
                                                                    const qty   = parseFloat(it.qty_received ?? 0);
                                                                    const unit  = it.unit_of_measure || it.trim_uom || (itemType === 'fabric' ? 'm' : 'pcs');
                                                                    const price = (it.effective_unit_price ?? it.unit_price) != null
                                                                        ? parseFloat(it.effective_unit_price ?? it.unit_price)
                                                                        : null;
                                                                    return (
                                                                        <div key={it.id}
                                                                            className={`text-[11px] rounded px-2 py-1.5 ${it.is_free_form ? 'bg-amber-50/60 border border-amber-100' : 'bg-slate-50'}`}>
                                                                            <div className="flex items-center gap-2">
                                                                                <Icon size={11} className="text-slate-500 shrink-0" />
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                                        <span className="font-medium text-slate-700 truncate">{label}</span>
                                                                                        {it.is_free_form && (
                                                                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0 rounded bg-amber-200/60 text-amber-700">
                                                                                                Free-form
                                                                                            </span>
                                                                                        )}
                                                                                        {it.is_substitute === true && (
                                                                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0 rounded bg-amber-200/60 text-amber-700">
                                                                                                🔄 sub
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {!it.is_free_form && it.planned_color_name && it.planned_color_name !== it.variant_color_name && (
                                                                                        <p className="text-[10px] text-slate-400">
                                                                                            Planned: {it.planned_color_name}{it.planned_color_number ? ` (${it.planned_color_number})` : ''}
                                                                                        </p>
                                                                                    )}
                                                                                    {it.is_free_form && it.description && (
                                                                                        <p className="text-[10px] text-slate-500 italic">{it.description}</p>
                                                                                    )}
                                                                                </div>
                                                                                <span className="shrink-0 tabular-nums font-bold text-slate-700">
                                                                                    {qty.toLocaleString()} {unit}
                                                                                </span>
                                                                                {price != null && (
                                                                                    <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                                                                                        @ {num(price, 5)}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[10px] text-slate-400 italic">No items recorded.</p>
                                                    )}

                                                    {/* Scan + meta */}
                                                    <div className="flex items-center flex-wrap gap-3 text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
                                                        {scan && (
                                                            <a href={scan} target="_blank" rel="noreferrer"
                                                               onClick={e => e.stopPropagation()}
                                                               className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold">
                                                                <FileText size={11} /> View scan
                                                            </a>
                                                        )}
                                                        {iw.created_by_name && <span>By {iw.created_by_name}</span>}
                                                        {iw.created_at && <span>{new Date(iw.created_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                                                    </div>

                                                    {iw.notes && (
                                                        <p className="text-[10px] text-slate-500 italic bg-slate-50 rounded px-2 py-1">
                                                            {iw.notes}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                    <div>
                        {mode === 'view' && !isCreate && (
                            <button
                                onClick={handleDelete}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {mode === 'view' && (
                            <button
                                onClick={() => setMode('edit')}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition"
                            >
                                <Edit3 size={12} /> Edit
                            </button>
                        )}
                        {editable && (
                            <>
                                <button
                                    onClick={onClose}
                                    disabled={busy}
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={mode === 'create' ? handleReviewClick : () => handleSave(false)}
                                    disabled={busy}
                                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                                >
                                    {busy && <Loader2 size={12} className="animate-spin" />}
                                    {mode === 'create' ? 'Create Invoice' : 'Save Changes'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Confirmation review (pre-save) → success + PDF screen (post-save), same overlay. */}
        {confirmOpen && (
            <div
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => createdResult ? onSaved?.(createdResult) : setConfirmOpen(false)}
            >
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            {createdResult
                                ? <CheckCircle2 size={16} className="text-emerald-500" />
                                : <ShieldCheck size={16} className="text-indigo-500" />}
                            {createdResult ? 'Invoice Created' : 'Confirm Invoice Details'}
                        </h2>
                        <button
                            onClick={() => createdResult ? onSaved?.(createdResult) : setConfirmOpen(false)}
                            className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0"
                        >
                            <X size={16} className="text-slate-500" />
                        </button>
                    </div>

                    {createdResult ? (
                    <>
                    <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-emerald-800">
                                    {invNumber.trim()} booked — ₹{num(parseFloat(amount) || 0)}
                                </p>
                                <p className="text-xs text-emerald-700 mt-0.5">
                                    {createdResult.message || 'Invoice created.'}
                                </p>
                            </div>
                            <span className="ml-auto shrink-0"><MatchPill status={createdResult.match_status} /></span>
                        </div>

                        {createdResult.match_report && (createdResult.match_report.warnings?.length > 0 || createdResult.match_report.reasons?.length > 0) && (
                            <div className="border border-slate-200 rounded-xl px-3 py-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Scale size={11} /> Three-Way Match Report
                                </p>
                                <MatchReportPanel report={createdResult.match_report} tolerance={tolerance} />
                            </div>
                        )}

                        {pdfError && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
                                <AlertTriangle size={13} /> {pdfError}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                        <button
                            onClick={handleDownloadInvoicePdf}
                            disabled={pdfBusy}
                            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-300 disabled:opacity-40 px-3 py-1.5 rounded-lg transition"
                        >
                            {pdfBusy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                            Generate &amp; Download PDF
                        </button>
                        <button
                            onClick={() => onSaved?.(createdResult)}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg transition shadow-sm"
                        >
                            Done
                        </button>
                    </div>
                    </>
                    ) : (
                    <>
                    <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                        <p className="text-xs text-slate-500">
                            Review everything below — creating an invoice runs the three-way match against these exact lines.
                        </p>

                        {/* Header fields */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Invoice Number</p>
                                <p className="text-sm font-bold text-slate-800">{invNumber.trim()}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Invoice Date</p>
                                <p className="text-sm font-bold text-slate-800">{new Date(invDate).toLocaleDateString('en', { dateStyle: 'medium' })}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Amount</p>
                                <p className="text-sm font-bold text-slate-800 tabular-nums">₹{num(parseFloat(amount) || 0)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Payment Status</p>
                                <p className="text-sm font-bold text-slate-800">{PAYMENT_CFG[paymentStat]?.label || paymentStat}</p>
                            </div>
                            {scanFile && (
                                <div className="col-span-2">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Scan</p>
                                    <p className="text-sm text-slate-700 flex items-center gap-1.5"><Upload size={12} className="text-slate-400" /> {scanFile.name}</p>
                                </div>
                            )}
                            {notes.trim() && (
                                <div className="col-span-2">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Notes</p>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{notes.trim()}</p>
                                </div>
                            )}
                        </div>

                        {/* Linked inwards */}
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                Linked Inwards ({selectedIds.size})
                            </p>
                            <div className="space-y-1">
                                {inwards.filter(iw => selectedIds.has(iw.id)).map(iw => (
                                    <div key={iw.id} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                                        <span className="font-bold text-indigo-600">{iw.grn_number || `Inward #${iw.id}`}</span>
                                        <span className="text-slate-400">
                                            {iw.received_date && new Date(iw.received_date).toLocaleDateString('en', { dateStyle: 'medium' })}
                                            {' · '}{(iw.items || []).length} item{(iw.items || []).length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Line items */}
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <Scale size={11} /> Invoice Lines ({mergedLines.length})
                            </p>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-400 uppercase tracking-wider text-[9px]">
                                                <th className="text-left  font-bold px-2.5 py-1.5">Item</th>
                                                <th className="text-right font-bold px-2.5 py-1.5 w-24">Qty</th>
                                                <th className="text-right font-bold px-2.5 py-1.5 w-24">Rate</th>
                                                <th className="text-right font-bold px-2.5 py-1.5 w-24">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {mergedLines.map(group => {
                                                const totalQty = group.items.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
                                                const rate     = parseFloat(group.rate) || 0;
                                                const value    = totalQty * rate;
                                                const ctx      = poContextMap[group.key];
                                                return (
                                                    <tr key={group.key}>
                                                        <td className="px-2.5 py-2">
                                                            <p className="font-medium text-slate-700 truncate max-w-[220px]">{group.label}</p>
                                                            {ctx && (
                                                                <p className="text-[9px] text-slate-400 mt-0.5">
                                                                    PO ordered {ctx.ordered.toLocaleString()} {ctx.uom}
                                                                    {ctx.otherReceived > 0 && ` · other GRNs ${ctx.otherReceived.toLocaleString()} ${ctx.uom}`}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-2.5 py-2 text-right tabular-nums font-bold text-slate-700 align-top">
                                                            {totalQty.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                                                            {group.uom ? <span className="text-[9px] text-slate-400 ml-1">{group.uom}</span> : null}
                                                        </td>
                                                        <td className="px-2.5 py-2 text-right tabular-nums text-slate-700 align-top">{num(rate, 5)}</td>
                                                        <td className="px-2.5 py-2 text-right tabular-nums font-bold text-slate-800 align-top">₹{num(value)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px]">
                                    <span className="text-slate-500">Lines total</span>
                                    <span className="font-bold text-slate-800 tabular-nums">₹{num(linesTotal)}</span>
                                </div>
                            </div>
                            {Math.abs((parseFloat(amount) || 0) - linesTotal) > 0.01 && (
                                <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                    <AlertTriangle size={11} className="shrink-0" />
                                    Invoice amount (₹{num(parseFloat(amount) || 0)}) differs from the line total (₹{num(linesTotal)}) — this alone can trigger a header-amount warning or block.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                        <button
                            onClick={() => setConfirmOpen(false)}
                            disabled={busy}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleConfirmCreate}
                            disabled={busy}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                        >
                            {busy && <Loader2 size={12} className="animate-spin" />}
                            Confirm & Create Invoice
                        </button>
                    </div>
                    </>
                    )}
                </div>
            </div>
        )}
        </>
    );
}

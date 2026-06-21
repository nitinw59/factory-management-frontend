import { useState, useEffect } from 'react';
import {
    X, Loader2, AlertTriangle, Trash2, Upload, Receipt, Edit3, CheckSquare, Square,
    ChevronDown, ChevronRight, FileText, Package, Scissors, Tag,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { IMAGE_BASE_URL } from '../../utils/api';

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

export default function InvoiceModal({
    inwards = [],            // all inwards on this PO
    invoice = null,
    initialMode = 'view',
    defaultSelectedIds = new Set(),
    onClose,
    onSaved,
    onDeleted,
}) {
    const isCreate = !invoice;
    const [mode, setMode] = useState(isCreate ? 'create' : initialMode);
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);

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

    const toggleExpand = (id) => setExpandedInwardId(prev => prev === id ? null : id);

    const buildScanUrl = (url) => {
        if (!url) return null;
        return url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`;
    };

    const TYPE_ICON = { fabric: Package, trim: Scissors };

    useEffect(() => { setErr(null); }, [mode]);

    const editable = mode === 'create' || mode === 'edit';

    const toggleInward = (id) => setSelectedIds(prev => {
        const s = new Set(prev);
        if (s.has(id)) s.delete(id); else s.add(id);
        return s;
    });

    // An inward is selectable if: it has no invoice yet, OR it belongs to this invoice already.
    const isSelectable = (iw) =>
        iw.invoice_id == null || (invoice && iw.invoice_id === invoice.id);

    const handleSave = async () => {
        setErr(null);
        if (!invNumber.trim()) { setErr('Invoice number is required.'); return; }
        if (!invDate)          { setErr('Invoice date is required.'); return; }
        if (amount === '' || isNaN(parseFloat(amount))) { setErr('Amount is required.'); return; }
        const inward_ids = [...selectedIds];
        if (inward_ids.length === 0) { setErr('Link at least one inward.'); return; }

        setBusy(true);
        try {
            const payload = {
                invoice_number: invNumber.trim(),
                invoice_date:   invDate,
                amount:         parseFloat(amount),
                payment_status: paymentStat,
                notes:          notes || undefined,
                inward_ids,
            };
            const res = mode === 'create'
                ? await purchaseDeptApi.createInvoice(payload, scanFile)
                : await purchaseDeptApi.updateInvoice(invoice.id, payload, scanFile);
            onSaved?.(res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Save failed.');
        } finally {
            setBusy(false);
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <Receipt size={16} className="text-indigo-500" />
                            {mode === 'create' ? 'New Invoice' : `Invoice · ${invoice.invoice_number}`}
                        </h2>
                        {!isCreate && <div className="mt-1"><PaymentPill status={invoice.payment_status} /></div>}
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
                                                                    const label = itemType === 'fabric'
                                                                        ? `${it.fabric_type_name || 'Fabric'}${it.fabric_color_name ? ` · ${it.fabric_color_name}` : ''}${it.fabric_color_number ? ` (${it.fabric_color_number})` : ''}`
                                                                        : `${it.trim_item_name || 'Trim'}${it.variant_color_name ? ` · ${it.variant_color_name}` : ''}${it.variant_color_number ? ` (${it.variant_color_number})` : ''}${it.variant_size ? ` · Sz ${it.variant_size}` : ''}`;
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
                                                                                        @ {price.toFixed(2)}
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
                                    onClick={handleSave}
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
    );
}

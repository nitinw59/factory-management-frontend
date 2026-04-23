import React, { useState, useEffect } from 'react';
import {
    X, Loader2, Truck, CheckCircle2, AlertCircle,
    FileText, Package, ClipboardList,
    AlertTriangle, Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';

// ─── SHARED ───────────────────────────────────────────────────────────────────

const Spinner = () => (
    <div className="flex justify-center items-center h-40">
        <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
    </div>
);

const StatusBadge = ({ status }) => {
    const map = {
        COMPLETED:   'bg-emerald-100 text-emerald-700 border-emerald-200',
        IN_PROGRESS: 'bg-indigo-100  text-indigo-700  border-indigo-200',
        NOT_STARTED: 'bg-gray-100    text-gray-500     border-gray-200',
        OPEN:        'bg-blue-100    text-blue-700     border-blue-200',
        PARTIAL:     'bg-amber-100   text-amber-700    border-amber-200',
        CLOSED:      'bg-emerald-100 text-emerald-700  border-emerald-200',
        PENDING:     'bg-yellow-50   text-yellow-700   border-yellow-200',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${map[status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {status?.replace(/_/g, ' ') ?? 'N/A'}
        </span>
    );
};

const TabBtn = ({ label, icon: Icon, active, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
        }`}
    >
        <Icon size={13} />{label}
    </button>
);

// ─── PIPELINE STAGES ─────────────────────────────────────────────────────────

const PipelineBar = ({ stages }) => (
    <div className="flex items-center gap-1 flex-wrap">
        {stages.map((s, i) => {
            const color =
                s.status === 'COMPLETED'   ? 'bg-emerald-500 text-white' :
                s.status === 'IN_PROGRESS' ? 'bg-indigo-500  text-white' :
                                             'bg-slate-200   text-slate-500';
            return (
                <React.Fragment key={i}>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold ${color}`} title={s.assigned_line || 'No line'}>
                        {s.status === 'COMPLETED'   && <CheckCircle2 size={9} />}
                        {s.status === 'IN_PROGRESS' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />}
                        {s.line_type}
                    </div>
                    {i < stages.length - 1 && <span className="text-slate-300 text-[10px]">→</span>}
                </React.Fragment>
            );
        })}
    </div>
);

// ─── TAB: OVERVIEW ────────────────────────────────────────────────────────────

const OverviewTab = ({ batch, totals, pipeline }) => (
    <div className="space-y-5">
        {/* Quantity Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
                { label: 'Total Cut',  value: totals.total_cut         ?? '—', color: 'bg-slate-50'   },
                { label: 'Approved',   value: totals.approved_garments  ?? '—', color: 'bg-emerald-50' },
                { label: 'Dispatched', value: totals.total_dispatched   ?? '—', color: 'bg-blue-50'    },
                { label: 'Remaining',  value: (totals.approved_garments ?? 0) - (totals.total_dispatched ?? 0), color: 'bg-amber-50' },
            ].map(({ label, value, color }) => (
                <div key={label} className={`${color} rounded-xl p-3 border border-black/5 text-center`}>
                    <p className="text-2xl font-black text-slate-800">{value}</p>
                    <p className="text-[9px] font-bold uppercase text-slate-400 mt-0.5">{label}</p>
                </div>
            ))}
        </div>

        {/* Size Breakdown */}
        {batch.size_breakdown && Object.keys(batch.size_breakdown).length > 0 && (
            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Size Ratios</p>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(batch.size_breakdown).map(([size, ratio]) => (
                        <div key={size} className="flex flex-col items-center bg-indigo-50 border border-indigo-100 rounded-lg overflow-hidden min-w-[2.75rem]">
                            <span className="w-full text-center bg-indigo-100 text-indigo-800 text-[9px] font-bold py-0.5">{size}</span>
                            <span className="text-indigo-900 font-black text-sm py-1.5">{ratio}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Pipeline */}
        {pipeline?.length > 0 && (
            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Production Pipeline</p>
                <PipelineBar stages={pipeline} />
                <div className="mt-3 space-y-1.5">
                    {pipeline.map((s, i) => (
                        <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 bg-slate-200 rounded px-1.5 py-0.5">#{s.sequence_no}</span>
                                <span className="text-xs font-semibold text-slate-700">{s.line_type}</span>
                                {s.approved_count > 0 && (
                                    <span className="text-[10px] text-slate-400 font-medium">{s.approved_count} approved</span>
                                )}
                                {s.assigned_line && <span className="text-[10px] text-slate-400">({s.assigned_line})</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <StatusBadge status={s.status} />
                                {s.completed_at && (
                                    <span className="text-[9px] text-slate-400">{new Date(s.completed_at).toLocaleDateString()}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
);

// ─── TAB: CREATE RECEIPT ─────────────────────────────────────────────────────

const CreateReceiptTab = ({ batchId, rolls, onSuccess }) => {
    const [inputs, setInputs] = useState(() => Object.fromEntries(rolls.map(r => [r.roll_id, 0])));
    const [notes, setNotes]   = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState(null);
    const [result, setResult] = useState(null);

    const available = (roll) => roll.available_to_dispatch ?? 0;
    const setMax = () => setInputs(Object.fromEntries(rolls.map(r => [r.roll_id, available(r)])));

    const total = Object.values(inputs).reduce((s, v) => s + (parseInt(v) || 0), 0);

    const handleSubmit = async () => {
        if (total === 0) { setError('Enter at least 1 piece to dispatch.'); return; }
        setError(null);
        setSaving(true);
        try {
            const payload = {
                batchId,
                dispatchedRolls: rolls
                    .filter(r => (parseInt(inputs[r.roll_id]) || 0) > 0)
                    .map(r => ({ roll_id: r.roll_id, quantity: parseInt(inputs[r.roll_id]) })),
                notes,
                closeBatch: false,
            };
            const res = await dispatchManagerApi.submitDispatch(payload);
            setResult(res.data);
            onSuccess && onSuccess(res.data);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to submit dispatch.');
        } finally {
            setSaving(false);
        }
    };

    if (result) return (
        <div className="flex flex-col items-center py-10 gap-3">
            <CheckCircle2 size={48} className="text-emerald-500" />
            <p className="font-black text-lg text-emerald-700">Receipt Created!</p>
            <p className="font-mono font-bold text-slate-600 bg-slate-100 px-4 py-2 rounded-xl text-sm">{result.receipt_number}</p>
            <p className="text-xs text-slate-400">{result.dispatch_date ? new Date(result.dispatch_date).toLocaleString() : ''}</p>
        </div>
    );

    if (!rolls.length) return <p className="text-center text-slate-400 italic text-sm py-8">No rolls with available pieces.</p>;

    return (
        <div className="space-y-4">
            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-slate-600">Set quantities per roll</p>
                <button onClick={setMax} className="text-xs font-bold text-indigo-600 hover:underline">
                    Max All
                </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-200">
                    <div className="col-span-1">Roll</div>
                    <div className="col-span-3">Color</div>
                    <div className="col-span-2">Fabric</div>
                    <div className="col-span-2 text-center">Cut</div>
                    <div className="col-span-2 text-center">Dispatched</div>
                    <div className="col-span-2 text-center text-indigo-500">Available</div>
                </div>
                {rolls.map(roll => (
                    <div key={roll.roll_id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 last:border-b-0 items-center hover:bg-slate-50">
                        <div className="col-span-1 font-mono text-xs text-slate-500">#{roll.roll_id}</div>
                        <div className="col-span-3 text-xs font-semibold text-slate-700 truncate">{roll.color}</div>
                        <div className="col-span-2 text-xs text-slate-500 truncate">{roll.fabric_type}</div>
                        <div className="col-span-2 text-center text-xs text-slate-500">{roll.total_cut}</div>
                        <div className="col-span-2 text-center text-xs text-slate-500">{roll.already_dispatched}</div>
                        <div className="col-span-2">
                            <input
                                type="number"
                                min={0}
                                max={available(roll)}
                                value={inputs[roll.roll_id] ?? 0}
                                onChange={e => setInputs(prev => ({ ...prev, [roll.roll_id]: Math.min(Math.max(parseInt(e.target.value) || 0, 0), available(roll)) }))}
                                className="w-full text-center border border-indigo-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
                            />
                            <p className="text-[9px] text-center text-slate-400 mt-0.5">max {available(roll)}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Notes (optional)</label>
                <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Shipment notes..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-none"
                />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="text-sm">
                    <span className="text-slate-500">Total dispatching:</span>
                    <span className="font-black text-indigo-700 ml-2 text-lg">{total} pcs</span>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={saving || total === 0}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                    {saving ? 'Submitting…' : 'Create Receipt'}
                </button>
            </div>
        </div>
    );
};

// ─── PDF GENERATOR ────────────────────────────────────────────────────────────

const generateReceiptPDF = async (receiptNumber) => {
    const res = await dispatchManagerApi.getReceiptByNumber(receiptNumber);
    const r   = res.data;

    const doc = new jsPDF();

    // Header bar
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Dispatch Receipt', 14, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(r.receipt_number, 196, 14, { align: 'right' });

    // Reset color
    doc.setTextColor(30, 41, 59);

    // Receipt meta
    let y = 32;
    const line = (label, value) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(label, 14, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value ?? '—'), 55, y);
        y += 7;
    };

    line('Receipt No:', r.receipt_number);
    line('Date:', r.dispatch_date ? new Date(r.dispatch_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
    line('Dispatched By:', r.dispatched_by ?? '—');
    if (r.notes) line('Notes:', r.notes);

    // Divider
    y += 2;
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y, 196, y);
    y += 8;

    // Batch details section
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text('Batch Details', 14, y);
    doc.setTextColor(30, 41, 59);
    y += 7;

    line('Batch Code:', r.batch?.batch_code);
    line('Product:', r.batch?.product_name);
    line('Customer:', r.batch?.customer);
    line('Order No:', r.batch?.order_number);

    // Size breakdown
    if (r.batch?.size_breakdown && Object.keys(r.batch.size_breakdown).length > 0) {
        const sizes = Object.entries(r.batch.size_breakdown).map(([s, v]) => `${s}: ${v}`).join('   ');
        line('Size Ratios:', sizes);
    }

    y += 4;
    doc.line(14, y, 196, y);
    y += 8;

    // Rolls dispatch table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text('Dispatched Items', 14, y);
    doc.setTextColor(30, 41, 59);
    y += 5;

    const totalDispatched = (r.rolls || []).reduce((s, roll) => s + (roll.quantity_dispatched || 0), 0);

    autoTable(doc, {
        startY: y,
        head: [['Roll ID', 'Color', 'Color No.', 'Qty Dispatched']],
        body: (r.rolls || []).map(roll => [
            `#${roll.roll_id}`,
            roll.color,
            roll.color_number,
            roll.quantity_dispatched,
        ]),
        foot: [['', '', 'Total Pieces', totalDispatched]],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 3: { halign: 'right' } },
        margin: { left: 14, right: 14 },
    });

    // Footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, pageH - 10);
    doc.text('Factory Management System', 196, pageH - 10, { align: 'right' });

    doc.save(`${r.receipt_number}.pdf`);
};

// ─── TAB: RECEIPTS ────────────────────────────────────────────────────────────

const ReceiptsTab = ({ receipts }) => {
    const [downloading, setDownloading] = useState(null);
    const [dlError, setDlError]         = useState(null);

    const handleDownload = async (receiptNumber) => {
        setDownloading(receiptNumber);
        setDlError(null);
        try {
            await generateReceiptPDF(receiptNumber);
        } catch (err) {
            setDlError(`Failed to generate PDF for ${receiptNumber}.`);
        } finally {
            setDownloading(null);
        }
    };

    if (!receipts?.length) return (
        <p className="text-center text-slate-400 italic text-sm py-8">No receipts yet for this batch.</p>
    );

    return (
        <div className="space-y-3">
            {dlError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                    <AlertCircle size={14} /> {dlError}
                </div>
            )}
            {receipts.map(r => (
                <div
                    key={r.receipt_id}
                    className="border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                    <div>
                        <p className="font-mono font-bold text-indigo-600 text-sm">{r.receipt_number}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {r.dispatch_date ? new Date(r.dispatch_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            {r.dispatched_by && ` · ${r.dispatched_by}`}
                        </p>
                        {r.notes && <p className="text-[10px] text-slate-400 mt-0.5 italic">"{r.notes}"</p>}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="font-black text-slate-800 text-lg">{r.total_dispatched}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-bold">pieces</p>
                        </div>
                        <button
                            onClick={() => handleDownload(r.receipt_number)}
                            disabled={downloading === r.receipt_number}
                            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            title="Download PDF"
                        >
                            {downloading === r.receipt_number
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Download size={13} />
                            }
                            PDF
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

const BatchDispatchModal = ({ batchId, batchCode, onClose }) => {
    const [data, setData]               = useState(null);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);
    const [activeTab, setActiveTab]     = useState('overview');
    const [closing, setClosing]         = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const [closeResult, setCloseResult]   = useState(null);

    const load = () => {
        setLoading(true);
        dispatchManagerApi.getBatchDetail(batchId)
            .then(res => setData(res.data))
            .catch(err => setError(err?.response?.data?.error || err.message || 'Failed to load'))
            .finally(() => setLoading(false));
    };

    useEffect(load, [batchId]);

    const handleCloseBatch = async () => {
        setClosing(true);
        try {
            const res = await dispatchManagerApi.closeBatch(batchId);
            setCloseResult(res.data);
            load();
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to close batch.');
        } finally {
            setClosing(false);
            setConfirmClose(false);
        }
    };
    console.log('Batch data:', data);
    const batch    = data?.batch;
    const rolls    = (data?.rolls || []).filter(r => (r.available_to_dispatch ?? 0) > 0 || r.total_cut > 0);
    const pipeline = data?.stage_pipeline || [];
    const receipts = data?.existing_receipts || [];
    const totals   = data?.totals || {};

    const title = batchCode ? `Dispatch: ${batchCode}` : `Dispatch Batch #${batchId}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div className="flex items-center gap-3">
                        <Truck size={20} className="text-indigo-500 shrink-0" />
                        <div>
                            <h3 className="font-black text-lg text-slate-800">{title}</h3>
                            {batch && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {batch.product_name} · {batch.customer_name} · {batch.order_number}
                                </p>
                            )}
                        </div>
                        {batch?.is_dispatch_closed && <StatusBadge status="CLOSED" />}
                    </div>
                    <div className="flex items-center gap-2">
                        {batch && !batch.is_dispatch_closed && !closeResult && (
                            confirmClose ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-600 font-bold">Confirm close?</span>
                                    <button
                                        onClick={handleCloseBatch}
                                        disabled={closing}
                                        className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                                    >
                                        {closing ? <Loader2 size={12} className="animate-spin" /> : null}
                                        Yes, Close
                                    </button>
                                    <button onClick={() => setConfirmClose(false)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5">
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmClose(true)}
                                    className="text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                                >
                                    <AlertTriangle size={12} /> Close Batch
                                </button>
                            )
                        )}
                        {closeResult && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1">
                                <CheckCircle2 size={12} /> Batch Closed
                            </span>
                        )}
                        <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 bg-white shrink-0 px-2 overflow-x-auto">
                    <TabBtn label="Overview"       icon={ClipboardList} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    {batch?.can_create_receipt && !batch.is_dispatch_closed && (
                        <TabBtn label="Create Receipt" icon={FileText}     active={activeTab === 'receipt'}  onClick={() => setActiveTab('receipt')} />
                    )}
                    <TabBtn label={`Receipts (${receipts.length})`} icon={Package} active={activeTab === 'receipts'} onClick={() => setActiveTab('receipts')} />
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? <Spinner /> : error ? (
                        <div className="flex flex-col items-center py-10 gap-2 text-red-500">
                            <AlertCircle size={28} />
                            <p className="font-bold text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'overview'  && (
                                <OverviewTab
                                    batch={batch}
                                    totals={totals}
                                    pipeline={pipeline}
                                />
                            )}
                            {activeTab === 'receipt'  && (
                                <CreateReceiptTab
                                    batchId={batchId}
                                    rolls={rolls}
                                    onSuccess={() => { load(); setActiveTab('receipts'); }}
                                />
                            )}
                            {activeTab === 'receipts' && <ReceiptsTab receipts={receipts} />}
                        </>
                    )}
                </div>

                <div className="flex justify-end px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                    <button onClick={onClose} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-sm transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchDispatchModal;

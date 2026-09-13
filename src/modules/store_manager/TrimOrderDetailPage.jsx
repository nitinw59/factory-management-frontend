import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import {
    LuPackage, LuTriangleAlert, LuRefreshCw,
    LuArrowLeft, LuListOrdered, LuCircleCheck, LuWand, LuTrash2,
    LuFileText, LuBookOpen, LuScissors, LuTag, LuPrinter, LuDownload, LuX,
    LuSend, LuUndo2, LuChevronDown, LuChevronsDownUp, LuChevronsUpDown, LuLock, LuLockOpen
} from 'react-icons/lu';
import { Loader2, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { storeManagerApi } from '../../api/storeManagerApi';
import { trimKitsApi } from '../../api/trimKitsApi';
import { kitStatusOf } from '../trim_kits/kitStatusConfig';
import { downloadHandoverById } from '../trim_kits/handoverSlip';
import ExchangePanel from '../trim_kits/ExchangePanel';
import { trimLossApi } from '../../api/trimLossApi';
import { caseStatusOf } from '../trim_loss/trimLossStatusConfig';
import { effectiveStockOf, reservedOf } from './trimOrderCellStatus';
import TrimOrderItemsGrid from './TrimOrderItemsGrid';
import TrimOrderItemDrilldownModal from './TrimOrderItemDrilldownModal';
const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

// --- Barcode Print/Download Modal ---
const BarcodePrintModal = ({ isOpen, onClose, batchId }) => {
    const [seqFrom, setSeqFrom] = useState('');
    const [seqTo, setSeqTo] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const reset = () => { setSeqFrom(''); setSeqTo(''); setResult(null); setError(null); };
    const handleClose = () => { reset(); onClose(); };

    const handleSubmit = async () => {
        setIsProcessing(true);
        setResult(null);
        setError(null);
        try {
            const payload = { batchId };
            if (seqFrom !== '' && seqTo !== '') {
                payload.sequenceFrom = parseInt(seqFrom, 10);
                payload.sequenceTo = parseInt(seqTo, 10);
            }
            const res = await storeManagerApi.markBatchBarcodePrinted(payload);
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to mark barcodes.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadCSV = () => {
        if (!result?.garments?.length) return;
        const header = 'sr_no,garment_uid,size,piece_sequence,barcode_printed_at';
        const rows = result.garments.map((g, i) =>
            `${i + 1},${g.garment_uid},${g.size},${g.piece_sequence},${g.barcode_printed_at}`
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `barcodes-batch-${batchId}${seqFrom && seqTo ? `-seq${seqFrom}-${seqTo}` : ''}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <LuPrinter className="h-5 w-5 text-indigo-600" />
                        <h2 className="text-base font-bold text-gray-900">Print / Download Barcodes</h2>
                    </div>
                    <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        <LuX className="h-4 w-4 text-gray-500" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-gray-500">Batch <span className="font-bold text-gray-700">#{batchId}</span>. Leave range empty to mark <span className="font-semibold">all unprinted</span> pieces.</p>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Seq From</label>
                            <input
                                type="number" min="1" value={seqFrom}
                                onChange={e => setSeqFrom(e.target.value)}
                                placeholder="e.g. 1"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Seq To</label>
                            <input
                                type="number" min="1" value={seqTo}
                                onChange={e => setSeqTo(e.target.value)}
                                placeholder="e.g. 50"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </div>
                    </div>

                    {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{error}</p>}

                    {result && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                            <p className="text-sm font-bold text-emerald-800">{result.message}</p>
                            <p className="text-xs text-emerald-600 mt-1">{result.count} barcode(s) marked as printed.</p>
                            <button
                                onClick={handleDownloadCSV}
                                className="mt-3 flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                                <LuDownload className="h-3.5 w-3.5" /> Download CSV
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button onClick={handleClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isProcessing || !!result}
                        className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</> : <><LuPrinter className="h-4 w-4" /> Mark & Print</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Reference Data Modal (BOM & Cutting) ---
// Reference data is already loaded once at page level; the modal reuses it rather than refetching.
// One BOM/recipe row — shared between the stage-grouped (5-column, with
// Comments) and legacy flat (4-column, no stage/comments concept) renderings.
const BomRefRow = ({ item, legacy = false }) => {
    const isPerSize = item.calculation_type === 'PER_SIZE';
    const qty       = parseFloat(item.quantity_per_piece);
    const waste     = parseFloat(item.wastage_percentage);
    return (
        <tr className="hover:bg-gray-50 align-top">
            <td className="py-3 px-5">
                <span className="font-semibold text-gray-800">{(item.item_name || '').trim() || '—'}</span>
                {item.is_color_agnostic && (
                    <span className="ml-2 text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-100">Generic</span>
                )}
            </td>
            <td className="py-3 px-5 text-center">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${isPerSize ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {isPerSize ? 'Per size' : 'Fixed'}
                </span>
            </td>
            <td className="py-3 px-5">
                {isPerSize ? (
                    (item.size_consumptions || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {item.size_consumptions.map(sc => (
                                <span key={sc.size} className="inline-flex items-baseline gap-1 bg-blue-50/60 border border-blue-100 rounded px-1.5 py-0.5 text-[11px]">
                                    <span className="font-bold text-gray-700">{sc.size}</span>
                                    <span className="font-mono text-blue-700">{Number(sc.quantity).toFixed(3)}</span>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs text-amber-600 italic">Per-size, but no sizes defined</span>
                    )
                ) : (
                    <span className="font-mono font-bold text-indigo-600">{Number.isFinite(qty) ? qty.toFixed(4) : '—'}</span>
                )}
            </td>
            <td className="py-3 px-5 text-center text-sm font-medium text-gray-500">
                {Number.isFinite(waste) && waste > 0 ? `+${waste}%` : '—'}
            </td>
            {!legacy && (
                <td className="py-3 px-5 text-sm text-gray-400 italic">{item.comments || '—'}</td>
            )}
        </tr>
    );
};

const ReferenceDataModal = ({ isOpen, onClose, data = { bom: [], cutting: [] }, loading = false }) => {
    const [activeTab, setActiveTab] = useState('bom');

    const totalCutSum = (data.cutting || []).reduce(
    (sum, cut) => sum + Number(cut.total_cut || 0),
    0
    );

    // Group BOM rows by the product's own workflow stage — only meaningful
    // when this data actually came from an approved BOM (bom_source==='BOM');
    // the legacy product_materials_required fallback has no stage concept,
    // so it renders as a single flat list as before. Mirrors the grouping
    // used everywhere else BOM materials are shown.
    const bomByStage = (() => {
        if (data.bom_source !== 'BOM') return null;
        const stages = data.product_stages || [];
        const groups = stages.map(s => ({
            key: `stage-${s.production_line_type_id}`,
            label: s.stage_name,
            items: (data.bom || []).filter(item => String(item.production_line_type_id || '') === String(s.production_line_type_id)),
        })).filter(g => g.items.length > 0);
        const unassigned = (data.bom || []).filter(item => !item.production_line_type_id);
        if (unassigned.length > 0) groups.unshift({ key: 'unassigned', label: 'Unassigned', items: unassigned });
        return groups;
    })();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
                      {/* Total Summary */}
        
                    
                    <div>
                        <h3 className="text-xl font-extrabold text-gray-800 flex items-center">
                            <LuBookOpen className="mr-2 text-indigo-600" /> Batch Reference Details
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">View single piece requirements and cutting history.</p>
                    </div>
                   

                          <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
    
                    <div className="flex items-center space-x-8">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                                Total Rolls
                            </p>
                            <p className="text-2xl font-semibold text-gray-800">
                                {data.cutting.length}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                                Total Cut Quantity
                            </p>
                            <p className="text-2xl font-semibold text-blue-600">
                                {totalCutSum.toLocaleString()}
                            </p>
                        </div>
                    </div>

                </div>

                 <button onClick={onClose} className="p-2 bg-gray-200 text-gray-600 hover:bg-gray-300 rounded-full transition-colors">
                        <LuTrash2 className="h-4 w-4" style={{display: 'none'}} />
                        <span className="font-bold px-1">✕</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 bg-white">
                    <button 
                        onClick={() => setActiveTab('bom')}
                        className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'bom' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <LuTag className="mr-2 h-4 w-4" /> Single Piece BOM
                    </button>
                    <button 
                        onClick={() => setActiveTab('cutting')}
                        className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors flex justify-center items-center ${activeTab === 'cutting' ? 'border-blue-600 text-blue-700 bg-blue-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                    >
                        <LuScissors className="mr-2 h-4 w-4" /> Cutting Details
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-0 overflow-y-auto flex-1 bg-gray-50/30">
                    {loading ? (
                        <div className="py-20 flex justify-center items-center flex-col">
                            <Loader2 className="animate-spin h-8 w-8 text-indigo-500 mb-4" />
                            <p className="text-gray-500 font-medium">Fetching details...</p>
                        </div>
                    ) : (
                        <>
                            {/* BOM TAB */}
                            {activeTab === 'bom' && (
                                data.bom.length === 0 ? (
                                    <p className="py-10 text-center text-gray-400">No BOM data found for this product.</p>
                                ) : bomByStage ? (
                                    // From an approved BOM — group by the product's own workflow stage.
                                    <div className="divide-y divide-gray-200">
                                        {bomByStage.map(group => (
                                            <div key={group.key} className="px-5 py-3">
                                                <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${group.key === 'unassigned' ? 'text-amber-600' : 'text-indigo-600'}`}>
                                                    {group.label} <span className="font-normal normal-case text-gray-400">· {group.items.length}</span>
                                                </p>
                                                <table className="min-w-full text-left border-collapse">
                                                    <thead className="text-xs uppercase text-gray-500 font-bold">
                                                        <tr>
                                                            <th className="py-1.5 pr-3 border-b">Material Name</th>
                                                            <th className="py-1.5 pr-3 border-b text-center">Type</th>
                                                            <th className="py-1.5 pr-3 border-b">Req. Qty / Pc</th>
                                                            <th className="py-1.5 pr-3 border-b text-center">Wastage</th>
                                                            <th className="py-1.5 border-b">Comments</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 bg-white">
                                                        {group.items.map((item, idx) => <BomRefRow key={item.trim_item_id ?? idx} item={item} />)}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    // Legacy product_materials_required fallback — no stage concept, flat list.
                                    <table className="min-w-full text-left border-collapse">
                                        <thead className="bg-gray-100 text-xs uppercase text-gray-600 font-bold sticky top-0">
                                            <tr>
                                                <th className="py-3 px-5 border-b">Material Name</th>
                                                <th className="py-3 px-5 border-b text-center">Type</th>
                                                <th className="py-3 px-5 border-b">Req. Qty / Pc</th>
                                                <th className="py-3 px-5 border-b text-center">Wastage</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                            {data.bom.map((item, idx) => <BomRefRow key={item.trim_item_id ?? idx} item={item} legacy />)}
                                        </tbody>
                                    </table>
                                )
                            )}

                            {/* CUTTING TAB */}
                            {activeTab === 'cutting' && (
                                <table className="min-w-full text-left border-collapse">
                                    <thead className="bg-gray-100 text-xs uppercase text-gray-600 font-bold sticky top-0">
                                        <tr>
                                            <th className="py-3 px-5 border-b">Roll No.</th>
                                            <th className="py-3 px-5 border-b">Color</th>
                                            <th className="py-3 px-5 border-b text-center">Total Cut Qty</th>
                                            <th className="py-3 px-5 border-b">Size Breakdown</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {data.cutting.length > 0 ? data.cutting.map((cut, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="py-3 px-5 font-bold text-gray-800">{cut.roll_no}</td>
                                                <td className="py-3 px-5 text-sm text-gray-600 font-medium">
                                                    {cut.color_name || 'N/A'}
                                                    {cut.color_number && <span className="ml-1.5 text-[10px] font-mono text-gray-400">{cut.color_number}</span>}
                                                </td>
                                                <td className="py-3 px-5 text-center font-bold text-blue-700">{cut.total_cut}</td>
                                                <td className="py-3 px-5 text-sm text-gray-500 font-mono bg-gray-50">{cut.sizes || 'N/A'}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="py-10 text-center text-gray-400">No cutting records found for this batch yet.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Reservation Usage Modal ---
// Breaks a buyer reservation's "already used" total down by the production batch /
// trim order that actually drew against it. Backend endpoint TBD — see storeManagerApi.
const ReservationUsageModal = ({ sopId, variantIds, title, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [err, setErr] = useState(null);
    const idsKey = variantIds.join(',');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setErr(null);
        storeManagerApi.getTrimReservationUsage({
            sales_order_product_id: sopId,
            trim_item_variant_ids: idsKey,
        })
            .then(res => {
                if (cancelled) return;
                setRows(res.data?.data ?? res.data ?? []);
            })
            .catch(() => { if (!cancelled) setErr('Could not load usage breakdown.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [sopId, idsKey]);

    const total = rows.reduce((s, r) => s + Number(r.quantity_used || 0), 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-[70] flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reservation usage by batch</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">{title}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                        <LuX className="h-4 w-4 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6 text-orange-500" /></div>
                    ) : err ? (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-8">No usage recorded against this reservation yet.</p>
                    ) : (
                        rows.map((r, i) => (
                            <div key={r.trim_order_id != null ? `${r.trim_order_id}-${r.trim_item_variant_id ?? i}` : i}
                                className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                        {r.batch_code || (r.production_batch_id ? `Batch #${r.production_batch_id}` : 'Unknown batch')}
                                    </p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                        {r.trim_order_id != null && <>Trim order #{r.trim_order_id}</>}
                                        {r.color_name && <> · {r.color_name}{r.color_number ? ` (${r.color_number})` : ''}</>}
                                        {r.used_at && <> · {new Date(r.used_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>}
                                    </p>
                                </div>
                                <span className="text-sm font-bold text-orange-700 tabular-nums shrink-0">{Number(r.quantity_used || 0).toLocaleString('en-IN')}</span>
                            </div>
                        ))
                    )}
                </div>

                {rows.length > 0 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm shrink-0">
                        <span className="font-bold text-slate-500">Total used</span>
                        <span className="font-extrabold text-orange-700">{total.toLocaleString('en-IN')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main Page Component ---
// Static class lookup so Tailwind's purge can see every variant.
const STATUS_STYLES = {
    green:   { text: 'text-green-700',   bg: 'bg-green-100',   border: 'border-green-200',   barBg: 'bg-green-500'   },
    blue:    { text: 'text-blue-700',    bg: 'bg-blue-100',    border: 'border-blue-200',    barBg: 'bg-blue-500'    },
    purple:  { text: 'text-purple-700',  bg: 'bg-purple-100',  border: 'border-purple-200',  barBg: 'bg-purple-500'  },
    teal:    { text: 'text-teal-700',    bg: 'bg-teal-100',    border: 'border-teal-200',    barBg: 'bg-teal-500'    },
    red:     { text: 'text-red-700',     bg: 'bg-red-100',     border: 'border-red-200',     barBg: 'bg-red-500'     },
    gray:    { text: 'text-gray-700',    bg: 'bg-gray-100',    border: 'border-gray-200',    barBg: 'bg-gray-400'    },
    amber:   { text: 'text-amber-700',   bg: 'bg-amber-100',   border: 'border-amber-200',   barBg: 'bg-amber-500'   },
    emerald: { text: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-200', barBg: 'bg-emerald-500' },
    indigo:  { text: 'text-indigo-700',  bg: 'bg-indigo-100',  border: 'border-indigo-200',  barBg: 'bg-indigo-500'  },
};

// Auto-dismiss toast notification
const Toast = ({ kind, message, onDismiss }) => {
    useEffect(() => {
        if (!message) return undefined;
        const t = setTimeout(onDismiss, 4000);
        return () => clearTimeout(t);
    }, [message, onDismiss]);
    if (!message) return null;
    const cls = kind === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    return (
        <div className={`fixed bottom-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-bold text-white ${cls}`}>
            {kind === 'error' ? <LuTriangleAlert className="w-4 h-4 shrink-0" /> : <LuCircleCheck className="w-4 h-4 shrink-0" />}
            <span className="max-w-xs">{message}</span>
            <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100"><LuX className="w-3.5 h-3.5" /></button>
        </div>
    );
};

const FORCE_CLOSE_ROLES = ['store_manager', 'factory_admin'];

const TrimOrderDetailPage = () => {
    const { orderId } = useParams();
    const { user } = useAuth();
    const [orderInfo, setOrderInfo] = useState(null);
    const [items, setItems] = useState([]);
    const [missingItems, setMissingItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFulfillingAll, setIsFulfillingAll] = useState(false);
    const [isReverting, setIsReverting] = useState(false);
    const [error, setError] = useState(null);

    // Modals state
    const [drilldownState, setDrilldownState] = useState({ isOpen: false, cellItems: null, rowGroupName: null });
    const [fulfillErr, setFulfillErr] = useState(null);
    const [refModalOpen, setRefModalOpen] = useState(false);
    const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
    const [productModalOpen, setProductModalOpen] = useState(false);

    // Force close / re-open
    const [closeModalOpen, setCloseModalOpen] = useState(false);
    const [closeReason, setCloseReason] = useState('');
    const [closeBusy, setCloseBusy] = useState(false);
    const isClosed = orderInfo?.status === 'CLOSED';
    const canForceClose = FORCE_CLOSE_ROLES.includes(user?.role);
    // Custody transferred → not force-closable; use the trim-loss workflow instead.
    const closeBlockedByIssued = orderInfo?.status === 'ISSUED';

    // Per-trim recompute — backend rejects (409) these states; disable the button to match.
    // PARTIALLY_ISSUED is NOT in this list on purpose: custody transfer is
    // tracked per allocation (trim_fulfillment_log.issue_id), not per order,
    // so a trim item with no issued line yet is still safe to recompute even
    // while other trims on the order have already gone out — the backend
    // enforces the finer-grained per-trim check and skips/rejects only the
    // ones that actually have an issued line.
    const [recomputingId, setRecomputingId] = useState(null);
    const [recomputingAll, setRecomputingAll] = useState(false);
    const recomputeBlocked = ['CLOSED', 'READY_FOR_PICKUP', 'ISSUED'].includes(orderInfo?.status);

    // Toast
    const [toast, setToast] = useState(null);
    const showToast = useCallback((kind, message) => setToast({ kind, message }), []);

    // Reference data (BOM + cutting) — loaded on mount
    const [refData, setRefData] = useState({ bom: [], cutting: [] });
    const [refDataLoaded, setRefDataLoaded] = useState(false);

    const [usageModal, setUsageModal] = useState(null); // { variantIds, title } | null

    // Grid + overrides
    const [statusFilter, setStatusFilter] = useState('all');   // 'all' | 'ready' | 'sub' | 'insufficient' | 'fulfilled'
    const [overrides,    setOverrides]    = useState({});      // { [itemId]: { fulfilling_variant_id, fulfilling_variant, quantity_to_fulfill, decision } }
    const [bulkBusyKey,  setBulkBusyKey]  = useState(null);     // trimItemGroups row name currently bulk-fulfilling

    // Buyer-reservation numbers for every variant on this order, prefetched once
    // (and refreshed alongside fetchDetails) instead of fetched per selection —
    // both the grid's row hover-popover and the drilldown modal read from this.
    const [reservationsByVariantId, setReservationsByVariantId] = useState(new Map());
    const fetchReservations = useCallback(async () => {
        if (!orderInfo?.sopId) { setReservationsByVariantId(new Map()); return; }
        try {
            const res = await storeManagerApi.getTrimReservations({ sales_order_product_id: orderInfo.sopId });
            const body = res.data?.data ?? res.data ?? {};
            const map = new Map();
            (body.groups || []).forEach(g => (g.variants || []).forEach(v => {
                const reserved = Number(v.total_reserved || 0);
                const active   = Number(v.total_active   || 0);
                map.set(String(v.trim_item_variant_id ?? v.id), { reserved, active, consumed: reserved - active });
            }));
            setReservationsByVariantId(map);
        } catch (err) {
            setReservationsByVariantId(new Map());
        }
    }, [orderInfo?.sopId]);
    useEffect(() => { fetchReservations(); }, [fetchReservations]);

    const fetchRefData = useCallback(async () => {
        setRefDataLoaded(false);
        try {
            const res = await storeManagerApi.getOrderReferenceData(orderId);
            const refRaw = res.data || { bom: [], cutting: [] };
            setRefData(refRaw);
        } catch (err) {
            console.error('[TrimOrderDetail] refData fetch failed:', err?.response?.data || err.message);
            setRefData({ bom: [], cutting: [] });
        } finally {
            setRefDataLoaded(true);
        }
    }, [orderId]);

    useEffect(() => { fetchRefData(); }, [fetchRefData]);

    // Handover slips + loader custody — both live on the kit endpoint.
    const [handoverSlips, setHandoverSlips] = useState([]);
    const [kitCustodyVariants, setKitCustodyVariants] = useState([]);
    const [downloadingSlipId, setDownloadingSlipId] = useState(null);
    const handleDownloadSlip = async (slip) => {
        const issueId = slip.issue_id ?? slip.id;
        if (issueId == null) return;
        setDownloadingSlipId(slip.id);
        try {
            await downloadHandoverById(issueId);
        } catch (err) {
            showToast('error', `Could not download slip ${slip.issue_number || ''}.`);
        } finally {
            setDownloadingSlipId(null);
        }
    };
    const fetchHandovers = useCallback(async () => {
        try {
            const res = await trimKitsApi.getKitOrder(orderId);
            setHandoverSlips(res.data?.slips || []);
            // Net custody per variant = signed out (qty) minus not-yet-issued (unissued_qty).
            const cust = {};
            (res.data?.items || []).forEach(it => (it.fulfilled_with || []).forEach(fw => {
                const held = (parseFloat(fw.qty) || 0) - (parseFloat(fw.unissued_qty) || 0);
                if (held > 0) {
                    const k = fw.variant_id;
                    if (!cust[k]) cust[k] = {
                        variant_id: fw.variant_id,
                        item_name: fw.item_name || it.item_name,
                        color_name: fw.color_name,
                        color_number: fw.color_number,
                        variant_size: fw.variant_size,
                        custody_qty: 0,
                    };
                    cust[k].custody_qty += held;
                }
            }));
            setKitCustodyVariants(Object.values(cust));
        } catch (err) {
            // Store manager may not have kit read access on older orders — non-fatal.
            setHandoverSlips([]);
            setKitCustodyVariants([]);
        }
    }, [orderId]);

    useEffect(() => { fetchHandovers(); }, [fetchHandovers]);

    // Trim-loss cases raised against this batch (missing trim reported off the signed slips).
    // Linked by production_batch_id; server filter is best-effort so we also narrow client-side.
    const [lossCases, setLossCases] = useState([]);
    const fetchLossCases = useCallback(async (batchId) => {
        if (!batchId) { setLossCases([]); return; }
        try {
            const res = await trimLossApi.getCases({
                status: 'ESCALATED,UNDER_INVESTIGATION,RESPONSIBILITY_FIXED,DEBIT_APPROVED,CLOSED,CANCELLED',
                production_batch_id: batchId,
            });
            const rows = res.data?.data ?? res.data ?? [];
            setLossCases((Array.isArray(rows) ? rows : [])
                .filter(r => String(r.production_batch_id ?? '') === String(batchId)));
        } catch (err) {
            // Store manager may lack trim-loss read access — non-fatal, card just hides.
            setLossCases([]);
        }
    }, []);

    const fetchDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            const sanitizedItems = (response.data.items || []).map(item => ({
                ...item,
                quantity_fulfilled: parseInt(item.quantity_fulfilled) || 0,
                quantity_required: parseInt(item.quantity_required) || 0,
            }));
            setItems(sanitizedItems);
            setMissingItems(response.data.missing_items || []);
            setOrderInfo({
                status: response.data.status,
                batchId: response.data.production_batch_id,
                batch_code: response.data.batch_code,
                batch_index: response.data.batch_index ?? null,
                sopId: response.data.sales_order_product_id ?? null,
                salesOrderNumber: response.data.sales_order_number ?? null,
                purchaseOrderCode: response.data.purchase_order_code ?? null,
                productId: response.data.product_id ?? null,
                productName: response.data.product_name ?? null,
                productBrand: response.data.product_brand ?? null,
                productType: response.data.product_type ?? null,
                sizeBreakdown: response.data.size_breakdown ?? null,
                productionReadiness: response.data.production_readiness ?? null,
                // Force-close stamps (present only when status === 'CLOSED')
                statusBeforeClose: response.data.status_before_close ?? null,
                forceCloseReason: response.data.force_close_reason ?? null,
                forceClosedAt: response.data.force_closed_at ?? null,
                forceClosedByName: response.data.force_closed_by_name ?? response.data.force_closed_by ?? null,
            });
        } catch (err) {
            setError('Could not load order details.');
        } finally {
            setIsLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    useEffect(() => { fetchLossCases(orderInfo?.batchId); }, [orderInfo?.batchId, fetchLossCases]);

    // 1. Primary Exact Fulfillable Items
    const exactFulfillableItems = useMemo(() => {
        return items.filter(item => {
            const remaining = item.quantity_required - item.quantity_fulfilled;
            return !item.is_fulfilled && remaining > 0 && item.available_stock >= remaining;
        });
    }, [items]);

    // 2. Substitute Fulfillable Items
    const substituteFulfillableItems = useMemo(() => {
        return items.filter(item => {
            const remaining = item.quantity_required - item.quantity_fulfilled;
            const needsSub = item.available_stock < remaining;
            const hasGoodSub = item.substitutes && item.substitutes.some(sub => sub.available_stock >= remaining);
            return !item.is_fulfilled && remaining > 0 && needsSub && hasGoodSub;
        });
    }, [items]);

    const handleFulfillAllExact = async () => {
        if (isClosed) return;
        if (!window.confirm(`Auto-fulfill ${exactFulfillableItems.length} items using exact matches?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillOrder(orderId);
            showToast('success', res.data.message || 'Auto-fulfill complete.');
            fetchDetails();
            fetchReservations();
        } catch (err) {
            showToast('error', `Failed: ${err.response?.data?.error || 'Server error'}`);
            if (err.response?.status === 409) fetchDetails(); // kit locked for pickup / already issued
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillAllSubs = async () => {
        if (isClosed) return;
        if (!window.confirm(`Auto-fulfill ${substituteFulfillableItems.length} items using available substitutes?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillSubstitutes(orderId);
            showToast('success', res.data.message || 'Substitute auto-fulfill complete.');
            fetchDetails();
            fetchReservations();
        } catch (err) {
            showToast('error', `Failed: ${err.response?.data?.error || 'Server error'}`);
            if (err.response?.status === 409) fetchDetails(); // kit locked for pickup / already issued
        } finally {
            setIsFulfillingAll(false);
        }
    };

    // ── Effective plan (server plan + client override) ────────────────────────
    const getEffectivePlan = useCallback((item) => {
        const o = overrides[item.id];
        if (o) return o;
        return item.planned_fulfillment || {
            decision:              'insufficient',
            fulfilling_variant_id: null,
            fulfilling_variant:    null,
            quantity_to_fulfill:   0,
            shortfall:             Math.max(0, item.quantity_required - item.quantity_fulfilled),
        };
    }, [overrides]);

    // ── Group items by base trim item name (before " - <variant>") ──────────
    const trimItemGroups = useMemo(() => {
        const map = new Map();
        items.forEach(it => {
            const baseName = it.item_name?.split(' - ')[0]?.trim() || `#${it.trim_item_variant_id}`;
            if (!map.has(baseName)) map.set(baseName, { name: baseName, items: [] });
            map.get(baseName).items.push(it);
        });
        // Aggregate counts so the left card can show "12 ready / 5 sub / 3 missing"
        return [...map.values()].map(g => {
            const counts = { exact: 0, substitute: 0, insufficient: 0, fulfilled: 0 };
            // A variant is "handed over" once one of its allocations went out on a signed slip (has issue_id).
            let handedOver = 0;
            g.items.forEach(it => {
                const plan = getEffectivePlan(it);
                counts[plan.decision] = (counts[plan.decision] || 0) + 1;
                if ((it.fulfillment_log || []).some(log => log.issue_id)) handedOver += 1;
            });
            const total = g.items.length;
            const done  = counts.fulfilled;
            return { ...g, counts, handedOver, total, donePct: total ? Math.round((done / total) * 100) : 0 };
        });
    }, [items, getEffectivePlan]);

    // Apply status filter (the grid does its own name filtering)
    const visibleTrimItemGroups = useMemo(() => {
        return trimItemGroups.filter(g => {
            if (statusFilter === 'all')          return true;
            if (g.total === 0)                   return false;
            // A trim item matches a status only when EVERY variant is in that state.
            if (statusFilter === 'ready')        return g.counts.exact        === g.total;
            if (statusFilter === 'sub')          return g.counts.substitute   === g.total;
            if (statusFilter === 'insufficient') return g.counts.insufficient === g.total;
            if (statusFilter === 'fulfilled')    return g.counts.fulfilled     === g.total;
            if (statusFilter === 'handed')       return g.handedOver          === g.total;
            return true;
        });
    }, [trimItemGroups, statusFilter]);

    // Order-wide progress
    const overallProgress = useMemo(() => {
        const total = items.length;
        const done  = items.filter(it => it.is_fulfilled).length;
        const partial = items.filter(it => !it.is_fulfilled && it.quantity_fulfilled > 0).length;
        return { total, done, partial, pct: total ? Math.round((done / total) * 100) : 0 };
    }, [items]);

    // ── Override actions: pick a different variant for a single row ──────────
    const handlePickOverride = (item, source) => {
        if (isClosed) return;
        // `source` is either an entry from item.substitutes (substitute) or the item itself (exact).
        const isExact = source.__isExact === true;
        const variantId    = isExact ? item.trim_item_variant_id : (source.substitute_variant_id || source.id);
        const variant = isExact ? {
            id:              item.trim_item_variant_id,
            item_name:       item.item_name,
            color_name:      item.color_name,
            color_number:    item.color_number,
            variant_size:    item.variant_size,
            available_stock: item.available_stock,
            is_substitute:   false,
        } : {
            id:              source.substitute_variant_id || source.id,
            item_name:       source.item_name || item.item_name,
            color_name:      source.color_name,
            color_number:    source.color_number,
            variant_size:    source.variant_size,
            available_stock: source.available_stock,
            is_substitute:   true,
        };
        const remaining = Math.max(0, item.quantity_required - item.quantity_fulfilled);
        const available = Number(variant.available_stock || 0);
        const qty       = Math.min(remaining, available);
        const decision  = qty <= 0 ? 'insufficient' : (isExact ? 'exact' : 'substitute');
        setOverrides(prev => ({
            ...prev,
            [item.id]: {
                fulfilling_variant_id: variantId,
                fulfilling_variant:    variant,
                quantity_to_fulfill:   qty,
                shortfall:             Math.max(0, remaining - qty),
                decision,
            },
        }));
    };

    const handleResetOverride = (itemId) => {
        setOverrides(prev => {
            if (!(itemId in prev)) return prev;
            const next = { ...prev };
            delete next[itemId];
            return next;
        });
    };

    // Bulk fulfill every actionable item in one trim-item row (both exact and
    // substitute decisions together — the grid has one "Allocate" action per
    // row now, not one per intent bucket), committing each item's effective plan.
    const handleBulkFulfillGroup = async (group) => {
        if (isClosed) return;
        const fulfillable = group.items
            .map(it => ({ item: it, plan: getEffectivePlan(it) }))
            .filter(({ plan }) => plan.decision !== 'fulfilled' && plan.fulfilling_variant_id && plan.quantity_to_fulfill > 0);
        if (fulfillable.length === 0) { showToast('error', 'Nothing to fulfill for this trim item.'); return; }

        // Detect rows whose planned qty exceeds the net-of-reservations stock of the variant
        // they're pulling from. Surface them so the user explicitly confirms the over-allocation.
        const overReserved = fulfillable.map(({ item, plan }) => {
            const fulfillingVar = String(plan.fulfilling_variant_id) === String(item.trim_item_variant_id)
                ? item
                : (item.substitutes || []).find(s => String(s.substitute_variant_id || s.id) === String(plan.fulfilling_variant_id));
            if (!fulfillingVar) return null;
            const net = effectiveStockOf(fulfillingVar);
            const res = reservedOf(fulfillingVar);
            if (res <= 0 || plan.quantity_to_fulfill <= net) return null;
            const dipsBy = plan.quantity_to_fulfill - net;
            return { item, plan, fulfillingVar, net, res, dipsBy };
        }).filter(Boolean);

        const lines = [`Allocate stock for ${fulfillable.length} variant${fulfillable.length === 1 ? '' : 's'} — ${group.name}?`];
        if (overReserved.length > 0) {
            lines.push('');
            lines.push(`⚠ ${overReserved.length} row${overReserved.length === 1 ? '' : 's'} will dip into stock reserved for other plan requirements:`);
            overReserved.slice(0, 12).forEach(({ item, plan, fulfillingVar, net, dipsBy }) => {
                const colorLabel = `${fulfillingVar.color_name || ''} ${fulfillingVar.color_number || ''}`.trim() || `var #${plan.fulfilling_variant_id}`;
                lines.push(`  • ${item.color_name} ${item.color_number} → ${colorLabel}: allocate ${plan.quantity_to_fulfill}, net ${net} (over by ${dipsBy})`);
            });
            if (overReserved.length > 12) lines.push(`  …and ${overReserved.length - 12} more.`);
            lines.push('');
            lines.push('Proceed anyway?');
        }
        if (!window.confirm(lines.join('\n'))) return;
        // Set `isFulfillingAll` so the page-level spinner check (`isLoading && !isFulfillingAll`)
        // stays false during fetchDetails — keeps the grid mounted and preserves scroll.
        setBulkBusyKey(group.name);
        setIsFulfillingAll(true);
        let failures = 0;
        try {
            for (const { item, plan } of fulfillable) {
                try {
                    await storeManagerApi.fulfillWithVariant({
                        orderItemId:         item.id,
                        fulfillingVariantId: plan.fulfilling_variant_id,
                        quantityToFulfill:   plan.quantity_to_fulfill,
                    });
                } catch (err) {
                    failures += 1;
                    console.error('Fulfill row failed', item.id, err?.response?.data || err);
                }
            }
            // Clear any overrides we committed
            setOverrides(prev => {
                const next = { ...prev };
                fulfillable.forEach(({ item }) => delete next[item.id]);
                return next;
            });
            if (failures > 0) showToast('error', `Completed with ${failures} failure${failures === 1 ? '' : 's'} — some rows blocked by missing reservations.`);
            await Promise.all([fetchDetails(), fetchReservations()]);
        } finally {
            setBulkBusyKey(null);
            setIsFulfillingAll(false);
        }
    };

    const handleCellClick = (cellItems, rowGroupName) => setDrilldownState({ isOpen: true, cellItems, rowGroupName });
    const closeDrilldown = () => { setDrilldownState({ isOpen: false, cellItems: null, rowGroupName: null }); setFulfillErr(null); };

    const handleFulfillmentSubmit = async (fulfillmentData) => {
        if (isClosed) return;
        setIsFulfillingAll(true);   // keep the page-level spinner off so scroll position survives the refresh
        setFulfillErr(null);
        try {
            await storeManagerApi.fulfillWithVariant(fulfillmentData);
            closeDrilldown();
            await Promise.all([fetchDetails(), fetchReservations()]);
        } catch (err) {
            const d = err?.response?.data || {};
            setFulfillErr({
                message: d.error || 'Fulfillment failed.',
                sopId:   d.sales_order_product_id ?? null,
                trimId:  d.trim_item_id ?? null,
            });
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleRevertFulfillment = async (logId) => {
        if (isClosed) return;
        if (!window.confirm("Revert this fulfillment? This reverts the allocation only — no stock moves. You will need to pick this again.")) return;
        setIsReverting(true);
        try {
            await storeManagerApi.revertFulfillment(logId);
            showToast('success', 'Fulfillment allocation reverted.');
            fetchDetails();
            fetchReservations();
        } catch (err) {
            showToast('error', `Failed to revert: ${err.response?.data?.error || 'Server error'}`);
            if (err.response?.status === 409) fetchDetails();
        } finally {
            setIsReverting(false);
        }
    };

    const handleRecheck = async () => {
        setIsFulfillingAll(true);   // keep page-level spinner off so scroll position survives
        try {
            const response = await storeManagerApi.recheckMissingItems(orderId);
            showToast('success', response.data.message || 'Re-check complete.');
            await fetchDetails();
        } catch (err) {
            showToast('error', `Re-check failed: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsFulfillingAll(false);
        }
    };

    // Re-run the BOM × cut-pieces calculation for one trim item (or every distinct
    // trim_item_id in the selected group), reconciling its lines & missing items.
    const handleRecomputeTrim = async (group) => {
        if (recomputeBlocked) return;   // defensive; the button is also disabled
        const trimIds = [...new Set((group.items || []).map(it => it.trim_item_id).filter(Boolean))];
        if (trimIds.length === 0) return;
        setRecomputingId(group.name);
        setIsFulfillingAll(true);       // overlay spinner; preserves scroll position
        try {
            const agg = { updated: 0, inserted: 0, deleted: 0, kept: 0, mAdded: 0, mRemoved: 0 };
            let lastStatus;
            for (const tid of trimIds) {
                const { data } = await storeManagerApi.recomputeTrimItem(orderId, tid);
                agg.updated  += data.lines?.updated  || 0;
                agg.inserted += data.lines?.inserted || 0;
                agg.deleted  += data.lines?.deleted  || 0;
                agg.kept     += data.lines?.kept_with_fulfillment || 0;
                agg.mAdded   += data.missing_items?.added   || 0;
                agg.mRemoved += data.missing_items?.removed || 0;
                lastStatus = data.order_status;
            }
            const parts = [];
            if (agg.updated)  parts.push(`${agg.updated} updated`);
            if (agg.inserted) parts.push(`${agg.inserted} added`);
            if (agg.deleted)  parts.push(`${agg.deleted} removed`);
            if (agg.kept)     parts.push(`${agg.kept} kept (already fulfilled)`);
            const missing = (agg.mAdded || agg.mRemoved) ? ` · missing +${agg.mAdded}/-${agg.mRemoved}` : '';
            if (agg.kept > 0) {
                // Kept lines are no longer required at all (or would be required below
                // what's already fulfilled) — call the trim out by name so it doesn't
                // get lost inside the aggregate count above.
                showToast('error', `⚠ ${group.name}: ${agg.kept} variant(s) kept for manual review (no longer required at the fulfilled quantity).`);
            } else {
                showToast('success', `Recomputed ${group.name}: ${parts.join(', ') || 'no changes'}${missing}. Status: ${lastStatus}.`);
            }
            await fetchDetails();
        } catch (err) {
            showToast('error', `Recompute failed: ${err.response?.data?.error || 'Server error'}`);
            if (err.response?.status === 409) fetchDetails();   // re-sync status on conflict
        } finally {
            setIsFulfillingAll(false);
            setRecomputingId(null);
        }
    };

    // Full-order recompute — reconciles the union of (trims already on the order,
    // trims sitting in the missing-items table, and whatever the batch's current
    // BOM/recipe now requires). Picks up trims that were never on the order at all,
    // e.g. a BOM line that only exists after the BOM got approved post-order-creation.
    const handleRecomputeAll = async () => {
        if (recomputeBlocked) return;   // defensive; the button is also disabled
        const confirmMsg = "Re-verify this entire order against the batch's current BOM/recipe? This can add newly-required trims and update quantities on existing lines."
            + (orderInfo?.status === 'PARTIALLY_ISSUED' ? ' Trims already issued to the loader will be left untouched.' : '');
        if (!window.confirm(confirmMsg)) return;
        setRecomputingAll(true);
        setIsFulfillingAll(true);       // overlay spinner; preserves scroll position
        try {
            const { data } = await storeManagerApi.recomputeAllTrims(orderId);
            const t = data.totals || {};

            // Kept-with-fulfillment lines take priority — resolve trim_item_id → name
            // so a store manager knows exactly which trim to go review, not just a count.
            const nameByTrimId = new Map(items.map(it => [String(it.trim_item_id), it.item_name?.split(' - ')[0]?.trim() || `#${it.trim_item_id}`]));
            const keptNames = (data.results || [])
                .filter(r => r.kept_with_fulfillment > 0)
                .map(r => nameByTrimId.get(String(r.trim_item_id)) || `Trim #${r.trim_item_id}`);
            // Already-issued trims the backend deliberately left untouched — the
            // order can be PARTIALLY_ISSUED and still recompute everything else.
            const skippedNames = (data.skipped_issued_trim_ids || [])
                .map(id => nameByTrimId.get(String(id)) || `Trim #${id}`);
            const skippedNote = skippedNames.length > 0
                ? ` · skipped (already issued): ${[...new Set(skippedNames)].join(', ')}`
                : '';

            if (keptNames.length > 0) {
                showToast('error', `Needs manual review — no longer required at the fulfilled quantity: ${[...new Set(keptNames)].join(', ')}.${skippedNote}`);
            } else {
                const parts = [];
                if (t.inserted) parts.push(`${t.inserted} added`);
                if (t.updated)  parts.push(`${t.updated} updated`);
                if (t.deleted)  parts.push(`${t.deleted} removed`);
                const missing = (t.missing_added || t.missing_removed) ? ` · missing +${t.missing_added || 0}/-${t.missing_removed || 0}` : '';
                showToast('success', `Recomputed ${data.trims_recomputed} trim item(s): ${parts.join(', ') || 'no changes'}${missing}${skippedNote}. Status: ${data.order_status}.`);
            }

            await Promise.all([fetchDetails(), fetchRefData()]);
        } catch (err) {
            showToast('error', `Recompute-all failed: ${err.response?.data?.error || 'Server error'}`);
            if (err.response?.status === 409) fetchDetails();   // re-sync status on conflict (order-state 409s)
        } finally {
            setIsFulfillingAll(false);
            setRecomputingAll(false);
        }
    };

    // ── Kit custody: mark ready / pull back ───────────────────────────────
    const [kitBusy, setKitBusy] = useState(false);
    const [markReadyOpen, setMarkReadyOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState({}); // Review-modal accordion state — all collapsed by default
    // Something picked since the last handover = any fulfillment-log row not yet on an issue slip
    const hasUnissuedPick = useMemo(
        () => items.some(it => (it.fulfillment_log || []).some(log => !log.issue_id)),
        [items]
    );
    const canMarkReady = ['PENDING', 'PREPARED', 'COMPLETED', 'PARTIALLY_ISSUED'].includes(orderInfo?.status) && hasUnissuedPick;

    // What actually goes out in this kit — allocations not yet on a signed slip, grouped by ordered item.
    const kitReviewGroups = useMemo(() => {
        return items.map(it => {
            const picks = (it.fulfillment_log || []).filter(l => !l.issue_id);
            const pickedQty = picks.reduce((s, l) => s + (parseFloat(l.quantity_fulfilled) || 0), 0);
            return { item: it, picks, pickedQty };
        }).filter(g => g.picks.length > 0);
    }, [items]);

    const kitTotals = useMemo(() => ({
        variants: kitReviewGroups.length,
        qty: kitReviewGroups.reduce((s, g) => s + g.pickedQty, 0),
        hasSub: kitReviewGroups.some(g => g.picks.some(p => p.used_substitute)),
    }), [kitReviewGroups]);

    // Roll the per-variant review rows up under their trim name for the collapsible review modal.
    const reviewByItem = useMemo(() => {
        const order = [];
        const map = new Map();
        kitReviewGroups.forEach(g => {
            const key = g.item.item_name || `#${g.item.id}`;
            if (!map.has(key)) { map.set(key, { name: g.item.item_name || 'Unnamed trim', groups: [], qty: 0, subCount: 0 }); order.push(key); }
            const e = map.get(key);
            e.groups.push(g);
            e.qty += g.pickedQty;
            e.subCount += g.picks.filter(p => p.used_substitute).length;
        });
        return order.map(k => map.get(k));
    }, [kitReviewGroups]);

    const allReviewCollapsed = reviewByItem.length > 0 && reviewByItem.every(e => !reviewOpen[e.name]);
    const toggleAllReview = () => setReviewOpen(allReviewCollapsed ? Object.fromEntries(reviewByItem.map(e => [e.name, true])) : {});

    const handleConfirmMarkReady = async () => {
        if (isClosed) return;
        setKitBusy(true);
        try {
            await storeManagerApi.markKitReady(orderId);
            showToast('success', 'Kit marked ready — loaders have been notified.');
            setMarkReadyOpen(false);
            await Promise.all([fetchDetails(), fetchHandovers()]);
        } catch (err) {
            showToast('error', err.response?.data?.error || 'Failed to mark kit ready.');
        } finally {
            setKitBusy(false);
        }
    };

    const handleUnmarkReady = async () => {
        setKitBusy(true);
        try {
            const res = await storeManagerApi.unmarkKitReady(orderId);
            showToast('success', res.data?.message || 'Kit pulled back — you can adjust allocations.');
            await Promise.all([fetchDetails(), fetchHandovers()]);
        } catch (err) {
            showToast('error', err.response?.data?.error || 'Failed to pull back kit.');
        } finally {
            setKitBusy(false);
        }
    };

    // ── Force close / re-open ─────────────────────────────────────────────
    const handleForceClose = async () => {
        setCloseBusy(true);
        try {
            const reason = closeReason.trim();
            await storeManagerApi.forceCloseTrimOrder(orderId, reason ? { reason } : {});
            showToast('success', 'Order closed.');
            setCloseModalOpen(false);
            setCloseReason('');
            await fetchDetails();
        } catch (err) {
            // 409 = already closed / issued — refetch so the UI reflects real state.
            const msg = err.response?.data?.error || 'Failed to close the order.';
            showToast('error', msg);
            if (err.response?.status === 409) { setCloseModalOpen(false); fetchDetails(); }
        } finally {
            setCloseBusy(false);
        }
    };

    const handleForceOpen = async () => {
        setCloseBusy(true);
        try {
            const res = await storeManagerApi.forceOpenTrimOrder(orderId);
            showToast('success', `Order re-opened${res.data?.status ? ` (${kitStatusOf(res.data.status).label})` : ''}.`);
            await fetchDetails();
        } catch (err) {
            showToast('error', err.response?.data?.error || 'Failed to re-open the order.');
            if (err.response?.status === 409) fetchDetails();
        } finally {
            setCloseBusy(false);
        }
    };


    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="mb-6">
                <Link to="/store-manager/trim-orders" className="text-sm text-blue-600 hover:underline flex items-center mb-4 font-semibold">
                    <LuArrowLeft className="mr-2" /> Back to All Orders
                </Link>
                
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-2xl font-extrabold text-gray-900">
                                    Batch #{orderInfo?.batchId ?? '—'}
                                    {orderInfo?.batch_code && (
                                        <span className="ml-2 text-lg font-bold text-gray-500">({orderInfo.batch_code})</span>
                                    )}
                                    {orderInfo?.batch_index != null && (
                                        <span className="ml-2 text-sm font-bold text-gray-400">#{orderInfo.batch_index}</span>
                                    )}
                                </h1>
                                {orderInfo?.status && (
                                    <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${kitStatusOf(orderInfo.status).badge}`}>
                                        {kitStatusOf(orderInfo.status).label}
                                    </span>
                                )}
                            </div>

                            {isClosed && (
                                <div className="mb-3 flex items-start gap-2 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2">
                                    <LuLock className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                                    <div className="text-xs text-gray-600">
                                        <p className="font-bold text-gray-700">This order is closed — fulfillment is locked.</p>
                                        {orderInfo.forceCloseReason && <p className="mt-0.5 italic">“{orderInfo.forceCloseReason}”</p>}
                                        {(orderInfo.forceClosedByName || orderInfo.forceClosedAt) && (
                                            <p className="mt-0.5 text-gray-500">
                                                {orderInfo.forceClosedByName ? `Closed by ${orderInfo.forceClosedByName}` : 'Closed'}
                                                {orderInfo.forceClosedAt ? ` · ${new Date(orderInfo.forceClosedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                                                {orderInfo.statusBeforeClose ? ` · was ${kitStatusOf(orderInfo.statusBeforeClose).label}` : ''}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {orderInfo?.productName && (
                                <button
                                    type="button"
                                    onClick={() => setProductModalOpen(true)}
                                    className="group flex items-center gap-2 mb-3 text-left"
                                    title="View product details"
                                >
                                    <LuPackage className="h-4 w-4 text-indigo-500 shrink-0" />
                                    <span className="text-base font-bold text-gray-800 group-hover:text-indigo-700 group-hover:underline transition-colors">{orderInfo.productName}</span>
                                    <Info className="h-3.5 w-3.5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                                </button>
                            )}

                            {orderInfo && (
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-lg inline-flex">
                                    <div className="flex items-center">
                                        <span className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mr-2">Trim Order:</span>
                                        <span className="font-semibold text-gray-800">#{orderId}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-end gap-3 shrink-0 mt-2 md:mt-0">
                            {canForceClose && (isClosed ? (
                                <button
                                    onClick={handleForceOpen}
                                    disabled={closeBusy}
                                    className="px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center disabled:opacity-50"
                                    title="Re-open the order and restore its previous status"
                                >
                                    {closeBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LuLockOpen className="mr-2 h-5 w-5" />} Re-open
                                </button>
                            ) : !closeBlockedByIssued && (
                                <button
                                    onClick={() => { setCloseReason(''); setCloseModalOpen(true); }}
                                    disabled={closeBusy}
                                    className="px-5 py-2.5 bg-white text-red-600 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center disabled:opacity-50"
                                    title="Force-close this order and lock fulfillment"
                                >
                                    <LuLock className="mr-2 h-5 w-5" /> Close
                                </button>
                            ))}
                            {!isClosed && (orderInfo?.status === 'READY_FOR_PICKUP' ? (
                                <button
                                    onClick={handleUnmarkReady}
                                    disabled={kitBusy}
                                    className="px-5 py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-200 hover:border-amber-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center disabled:opacity-50"
                                    title="Pull the kit back to adjust allocations — loaders can no longer sign it"
                                >
                                    <LuUndo2 className="mr-2 h-5 w-5" /> Pull Back Kit
                                </button>
                            ) : orderInfo?.status !== 'ISSUED' && (
                                <button
                                    onClick={() => { setReviewOpen({}); setMarkReadyOpen(true); }}
                                    disabled={kitBusy || !canMarkReady}
                                    className="px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={canMarkReady ? 'Review the kit, then notify loaders it is ready for pickup' : 'Pick at least one item before marking the kit ready'}
                                >
                                    <LuSend className="mr-2 h-5 w-5" /> Mark Kit Ready
                                </button>
                            ))}
                            <button
                                onClick={handleRecomputeAll}
                                disabled={recomputeBlocked || isFulfillingAll || isReverting}
                                title={recomputeBlocked
                                    ? `Recompute is locked while the order is ${orderInfo?.status}`
                                    : "Re-run the BOM × cut-pieces calculation for every trim item on this order — picks up newly-required trims too (e.g. after a BOM gets approved). Trims already issued to the loader are skipped automatically."}
                                className="px-5 py-2.5 bg-white text-violet-700 hover:bg-violet-600 hover:text-white border border-violet-200 hover:border-violet-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {recomputingAll ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LuRefreshCw className="mr-2 h-5 w-5" />}
                                Recompute All
                            </button>
                            {/* ✅ NEW BUTTON: Opens Reference Modal */}
                            <button
                                onClick={() => setRefModalOpen(true)}
                                className="px-5 py-2.5 bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center"
                            >
                                <Info className="mr-2 h-5 w-5 text-gray-500" />
                                View Ref &amp; BOM
                            </button>

                            <Link
                                to={`/store-manager/trim-orders/${orderId}/summary`}
                                className="px-5 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white border border-indigo-100 hover:border-indigo-600 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center group"
                            >
                                <LuFileText className="mr-2 h-5 w-5 text-indigo-500 group-hover:text-indigo-200 transition-colors" />
                                View Order Summary
                            </Link>
                            {orderInfo?.batchId && (
                                <button
                                    onClick={() => setBarcodeModalOpen(true)}
                                    className="px-5 py-2.5 bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center"
                                >
                                    <LuPrinter className="mr-2 h-5 w-5 text-gray-500" />
                                    Print Barcodes
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>
            
            {isLoading && !isFulfillingAll && !isReverting ? <Spinner /> : error ? (
                <div className="p-4 bg-red-100 text-red-700 rounded-lg shadow-sm border border-red-200">{error}</div>
            ) : (
                <main className="space-y-6">
                    {missingItems.length > 0 && (
                         <div className="p-5 border-l-4 border-red-500 bg-white rounded-r-xl shadow-sm">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center">
                                    <LuTriangleAlert className="h-8 w-8 text-red-500 mr-4" />
                                    <div>
                                        <h2 className="text-lg font-bold text-red-800">Action Required: Missing Items</h2>
                                        <p className="text-sm text-red-700 font-medium">These trim variants must be created in the system before the order can be completed.</p>
                                    </div>
                                </div>
                                <button onClick={handleRecheck} className="px-5 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center font-bold shadow-sm transition-colors">
                                    <LuRefreshCw className="mr-2 h-4 w-4"/> Re-check Inventory
                                </button>
                            </div>
                            <ul className="list-disc list-inside pl-12 mt-3 space-y-1 text-sm text-red-900 font-medium">
                                {missingItems.map(item => (
                                    <li key={item.id}><strong>{Math.ceil(item.quantity_required)} units</strong> of {item.item_name} - {item.color_name || "AGNOSTIC"} ({item.color_number})</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Handover history — signed kit slips (custody transferred) */}
                    {handoverSlips.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100 flex items-center">
                                <LuFileText className="w-4 h-4 mr-2 text-green-600" />
                                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Handovers</h3>
                                <span className="ml-2 text-xs text-gray-400 font-medium">custody transferred to loaders</span>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold tracking-wider">
                                    <tr>
                                        <th className="px-5 py-2.5 text-left">Slip</th>
                                        <th className="px-5 py-2.5 text-left">Signed</th>
                                        <th className="px-5 py-2.5 text-left">Taken by</th>
                                        <th className="px-5 py-2.5 text-right">Value</th>
                                        <th className="px-5 py-2.5 text-left">Bill</th>
                                        <th className="px-5 py-2.5 text-right">Slip PDF</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {handoverSlips.map(s => (
                                        <tr key={s.id} className="hover:bg-gray-50/60">
                                            <td className="px-5 py-2.5 font-mono font-bold text-gray-800">{s.issue_number}</td>
                                            <td className="px-5 py-2.5 text-gray-600">{s.created_at ? new Date(s.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                                            <td className="px-5 py-2.5 font-medium text-gray-700">{s.issued_to_name || '—'}</td>
                                            <td className="px-5 py-2.5 text-right font-mono">₹{parseFloat(s.total_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className="px-5 py-2.5 text-gray-600">{s.bill_number || '—'}</td>
                                            <td className="px-5 py-2.5 text-right">
                                                <button
                                                    onClick={() => handleDownloadSlip(s)}
                                                    disabled={downloadingSlipId === s.id}
                                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Download this handover as an issue-slip PDF"
                                                >
                                                    {downloadingSlipId === s.id
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <LuDownload className="w-3.5 h-3.5" />}
                                                    PDF
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Exchanges — swap wrong variants already in the loader's custody.
                        Show once anything has been handed over (status-based so it doesn't depend on the slips fetch). */}
                    {(['PARTIALLY_ISSUED', 'ISSUED'].includes(orderInfo?.status) || handoverSlips.length > 0) && (
                        <ExchangePanel orderId={orderId} custodyVariants={kitCustodyVariants} onChanged={fetchHandovers} />
                    )}

                    {/* Trim-loss cases — missing trim reported off this batch's signed slips */}
                    {lossCases.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100 flex items-center">
                                <LuTriangleAlert className="w-4 h-4 mr-2 text-red-600" />
                                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Trim-loss cases</h3>
                                <span className="ml-2 text-xs text-gray-400 font-medium">missing trim reported against this batch</span>
                                <span className="ml-auto text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">{lossCases.length}</span>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold tracking-wider">
                                    <tr>
                                        <th className="px-5 py-2.5 text-left">Case</th>
                                        <th className="px-5 py-2.5 text-left">Status</th>
                                        <th className="px-5 py-2.5 text-left">Item</th>
                                        <th className="px-5 py-2.5 text-left">Slip</th>
                                        <th className="px-5 py-2.5 text-right">Outstanding</th>
                                        <th className="px-5 py-2.5 text-right">Loss value</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {lossCases.map(c => {
                                        const meta = caseStatusOf(c.status);
                                        const itemName = c.item_name || c.trim_item_name || '—';
                                        const variant = [c.color_number ? `${c.color_number} - ${c.color_name || ''}`.trim() : c.color_name, c.variant_size].filter(Boolean).join(' / ');
                                        const outstanding = c.outstanding_qty != null ? c.outstanding_qty : Math.max(0, (Number(c.missing_qty) || 0) - (Number(c.found_qty) || 0));
                                        return (
                                            <tr key={c.id} className="hover:bg-gray-50/60">
                                                <td className="px-5 py-2.5">
                                                    <Link to={`/trim-loss/cases/${c.id}`} className="font-mono font-bold text-indigo-600 hover:text-indigo-800 hover:underline">
                                                        {c.case_number || `#${c.id}`}
                                                    </Link>
                                                </td>
                                                <td className="px-5 py-2.5">
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                                                </td>
                                                <td className="px-5 py-2.5 text-gray-700">
                                                    <span className="font-semibold">{itemName}</span>
                                                    {variant && <span className="text-gray-500"> — {variant}</span>}
                                                </td>
                                                <td className="px-5 py-2.5 font-mono text-gray-600">{c.issue_number || c.original_issue_number || '—'}</td>
                                                <td className="px-5 py-2.5 text-right font-mono font-bold text-gray-900">{outstanding}</td>
                                                <td className="px-5 py-2.5 text-right font-mono text-gray-700">{c.loss_value != null ? `₹${parseFloat(c.loss_value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Order-level progress strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Variants</p>
                            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{overallProgress.total}</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Fulfilled</p>
                            <p className="text-2xl font-extrabold text-emerald-700 tabular-nums">{overallProgress.done}</p>
                            <p className="text-[10px] text-gray-500">{overallProgress.pct}% of order</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Partial</p>
                            <p className="text-2xl font-extrabold text-purple-700 tabular-nums">{overallProgress.partial}</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-gray-200">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Missing variants</p>
                            <p className="text-2xl font-extrabold text-red-700 tabular-nums">{missingItems.length}</p>
                        </div>
                    </div>

                    {/* Order requirements — pivot grid, rows = trim items, columns = colors */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-base font-bold text-gray-800 flex items-center">
                                <LuListOrdered className="mr-2 text-blue-600"/>Order Requirements
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                    {trimItemGroups.length} trim item{trimItemGroups.length === 1 ? '' : 's'} · {items.length} variants
                                </span>
                            </h3>
                            <div className="flex items-center gap-2">
                                {!isClosed && substituteFulfillableItems.length > 0 && (
                                    <button onClick={handleFulfillAllSubs} disabled={isFulfillingAll || isReverting}
                                        className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-purple-700 transition-colors flex items-center disabled:opacity-70">
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1"/> : <LuWand className="mr-1 h-3.5 w-3.5"/>}
                                        Auto-Fulfill {substituteFulfillableItems.length} Subs
                                    </button>
                                )}
                                {!isClosed && exactFulfillableItems.length > 0 && (
                                    <button onClick={handleFulfillAllExact} disabled={isFulfillingAll || isReverting}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center disabled:opacity-70">
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1"/> : <LuCircleCheck className="mr-1 h-3.5 w-3.5"/>}
                                        Auto-Fulfill {exactFulfillableItems.length} Exact
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Status filter chips */}
                        <div className="flex flex-wrap gap-1 px-4 py-2.5 border-b border-gray-100 bg-white">
                            {[
                                { key: 'all',          label: 'All',          color: 'gray'   },
                                { key: 'ready',        label: 'Ready',        color: 'blue'   },
                                { key: 'sub',          label: 'Substitute',   color: 'purple' },
                                { key: 'insufficient', label: 'Insufficient', color: 'red'    },
                                { key: 'fulfilled',    label: 'Fulfilled',    color: 'green'  },
                                { key: 'handed',       label: 'Handed over',  color: 'teal'   },
                            ].map(opt => {
                                const active = statusFilter === opt.key;
                                const cs = STATUS_STYLES[opt.color];
                                return (
                                    <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${active ? `${cs.bg} ${cs.text} ${cs.border}` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="relative p-4">
                            {(isFulfillingAll || isReverting) && (
                                <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                                    <div className="bg-white px-6 py-3 rounded-xl shadow-lg border flex items-center font-bold text-blue-700">
                                        <Loader2 className="animate-spin h-5 w-5 mr-3"/> Processing operation…
                                    </div>
                                </div>
                            )}
                            {visibleTrimItemGroups.length === 0 ? (
                                <p className="text-center text-sm text-gray-400 italic py-10">
                                    {items.length === 0 ? 'No items in this order.' : 'No trim items match the filter.'}
                                </p>
                            ) : (
                                <TrimOrderItemsGrid
                                    trimItemGroups={visibleTrimItemGroups}
                                    getEffectivePlan={getEffectivePlan}
                                    overrides={overrides}
                                    refData={refData}
                                    refDataLoaded={refDataLoaded}
                                    reservationsByVariantId={reservationsByVariantId}
                                    onOpenUsage={(variantIds, title) => setUsageModal({ variantIds, title })}
                                    onCellClick={handleCellClick}
                                    onRowBulkFulfill={handleBulkFulfillGroup}
                                    onRowRecompute={handleRecomputeTrim}
                                    recomputeBlocked={recomputeBlocked}
                                    recomputingId={recomputingId}
                                    rowBusyKey={bulkBusyKey}
                                    isClosed={isClosed}
                                    actionsDisabled={isFulfillingAll || isReverting}
                                />
                            )}
                        </div>
                    </div>
                </main>
            )}

            {drilldownState.isOpen && (() => {
                const rowItems = trimItemGroups.find(g => g.name === drilldownState.rowGroupName)?.items || drilldownState.cellItems;
                return (
                    <TrimOrderItemDrilldownModal
                        cellItems={drilldownState.cellItems}
                        rowGroupName={drilldownState.rowGroupName}
                        rowItems={rowItems}
                        refData={refData}
                        refDataLoaded={refDataLoaded}
                        reservationsByVariantId={reservationsByVariantId}
                        overrides={overrides}
                        getEffectivePlan={getEffectivePlan}
                        isClosed={isClosed}
                        apiError={fulfillErr}
                        onClose={closeDrilldown}
                        onSaveOverride={handlePickOverride}
                        onResetOverride={handleResetOverride}
                        onConfirmFulfill={handleFulfillmentSubmit}
                        onOpenUsage={(variantIds, title) => setUsageModal({ variantIds, title })}
                        onRevertFulfillment={handleRevertFulfillment}
                    />
                );
            })()}

            <ReferenceDataModal isOpen={refModalOpen} onClose={() => setRefModalOpen(false)} data={refData} loading={!refDataLoaded} />
            <BarcodePrintModal isOpen={barcodeModalOpen} onClose={() => setBarcodeModalOpen(false)} batchId={orderInfo?.batchId} />

            {usageModal && (
                <ReservationUsageModal
                    sopId={orderInfo?.sopId}
                    variantIds={usageModal.variantIds}
                    title={usageModal.title}
                    onClose={() => setUsageModal(null)}
                />
            )}

            {/* Force-close confirmation with optional reason */}
            {closeModalOpen && createPortal(
                <div className="fixed inset-0 bg-black/50 z-[650] flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !closeBusy) setCloseModalOpen(false); }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                        <div className="flex items-center gap-2 p-5 border-b border-gray-100">
                            <LuLock className="h-5 w-5 text-red-600" />
                            <h2 className="text-base font-bold text-gray-900">Close this trim order?</h2>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-sm text-gray-500">Closing locks the order — no fulfilling, editing, or marking ready until it's re-opened. You can re-open it later.</p>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Reason <span className="normal-case font-medium text-gray-400">(optional)</span></label>
                                <textarea
                                    value={closeReason}
                                    onChange={e => setCloseReason(e.target.value)}
                                    rows={3}
                                    placeholder="e.g. batch cancelled by planning"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-300"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 px-5 pb-5">
                            <button onClick={() => setCloseModalOpen(false)} disabled={closeBusy} className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50">
                                Cancel
                            </button>
                            <button onClick={handleForceClose} disabled={closeBusy} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                {closeBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Closing…</> : <><LuLock className="h-4 w-4" /> Close order</>}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Product detail popup — opened from the product name in the header */}
            {productModalOpen && orderInfo && createPortal(
                <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 z-[600]" onMouseDown={(e) => { if (e.target === e.currentTarget) setProductModalOpen(false); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-lg"><LuPackage className="w-5 h-5 text-indigo-600" /></div>
                                <div>
                                    <h2 className="text-lg font-extrabold text-gray-900">{orderInfo.productName || 'Product'}</h2>
                                    <p className="text-xs text-gray-500 font-medium">Product details for this batch</p>
                                </div>
                            </div>
                            <button onClick={() => setProductModalOpen(false)} className="text-gray-400 hover:text-gray-600"><LuX className="w-5 h-5" /></button>
                        </div>

                        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderInfo.productBrand && (
                                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">{orderInfo.productBrand}</span>
                                )}
                                {orderInfo.productType && (
                                    <span className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">{orderInfo.productType}</span>
                                )}
                                {orderInfo.productionReadiness && (
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${orderInfo.productionReadiness === 'READY' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {orderInfo.productionReadiness}
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {orderInfo.salesOrderNumber && (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sales Order</p>
                                        <p className="font-semibold text-gray-800">{orderInfo.salesOrderNumber}</p>
                                    </div>
                                )}
                                {orderInfo.purchaseOrderCode && (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Purchase Order</p>
                                        <p className="font-semibold text-gray-800">{orderInfo.purchaseOrderCode}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Batch</p>
                                    <p className="font-semibold text-gray-800">#{orderInfo.batchId}{orderInfo.batch_code ? ` (${orderInfo.batch_code})` : ''}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Trim Order</p>
                                    <p className="font-semibold text-gray-800">#{orderId}</p>
                                </div>
                            </div>

                            {orderInfo.sizeBreakdown && Object.keys(orderInfo.sizeBreakdown).length > 0 && (() => {
                                const entries = Object.entries(orderInfo.sizeBreakdown);
                                const totalPcs = entries.reduce((s, [, q]) => s + (Number(q) || 0), 0);
                                return (
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                                            Size breakdown · {totalPcs.toLocaleString('en-IN')} pcs
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {entries.map(([size, qty]) => (
                                                <span key={size} className="inline-flex items-baseline gap-1 bg-white border border-gray-200 rounded-md px-2 py-1">
                                                    <span className="text-xs font-bold text-gray-700">{size}</span>
                                                    <span className="text-xs font-mono text-indigo-600 tabular-nums">{(Number(qty) || 0).toLocaleString('en-IN')}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex justify-end shrink-0">
                            <button onClick={() => setProductModalOpen(false)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors">Close</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Mark-ready review — confirm exactly what will go to the loader before locking the kit */}
            {markReadyOpen && createPortal(
                <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center p-4 z-[600]" onMouseDown={(e) => { if (e.target === e.currentTarget && !kitBusy) setMarkReadyOpen(false); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-lg"><LuSend className="w-5 h-5 text-indigo-600" /></div>
                                <div>
                                    <h2 className="text-lg font-extrabold text-gray-900">Review Kit Before Pickup</h2>
                                    <p className="text-xs text-gray-500 font-medium">Confirm these are the items you're handing over. Loaders will count and sign for exactly this.</p>
                                </div>
                            </div>
                            <button onClick={() => !kitBusy && setMarkReadyOpen(false)} className="text-gray-400 hover:text-gray-600"><LuX className="w-5 h-5" /></button>
                        </div>

                        <div className="px-6 py-4 grid grid-cols-3 gap-3 shrink-0">
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                <p className="text-2xl font-black text-gray-900">{kitTotals.variants}</p>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Variants</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                                <p className="text-2xl font-black text-gray-900">{kitTotals.qty.toLocaleString('en-IN')}</p>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Total Qty</p>
                            </div>
                            <div className={`border rounded-lg p-3 text-center ${kitTotals.hasSub ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                                <p className={`text-2xl font-black ${kitTotals.hasSub ? 'text-amber-700' : 'text-gray-900'}`}>{kitReviewGroups.reduce((s, g) => s + g.picks.filter(p => p.used_substitute).length, 0)}</p>
                                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Substitutes</p>
                            </div>
                        </div>

                        <div className="px-6 overflow-y-auto flex-1">
                            {reviewByItem.length === 0 ? (
                                <p className="text-sm text-gray-500 py-8 text-center">Nothing picked yet — there's nothing to hand over.</p>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between pb-2">
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{reviewByItem.length} trim item{reviewByItem.length === 1 ? '' : 's'}</p>
                                        <button
                                            type="button"
                                            onClick={toggleAllReview}
                                            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700"
                                        >
                                            {allReviewCollapsed ? <LuChevronsUpDown className="w-3.5 h-3.5" /> : <LuChevronsDownUp className="w-3.5 h-3.5" />}
                                            {allReviewCollapsed ? 'Expand all' : 'Collapse all'}
                                        </button>
                                    </div>
                                    <div className="space-y-2 pb-2">
                                        {reviewByItem.map(entry => {
                                            const isOpen = !!reviewOpen[entry.name];
                                            return (
                                                <div key={entry.name} className="border border-gray-200 rounded-lg overflow-hidden">
                                                    {/* Accordion header — one row per trim item, collapsed by default */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setReviewOpen(p => ({ ...p, [entry.name]: !p[entry.name] }))}
                                                        className="w-full flex items-center justify-between gap-2 bg-gray-50 hover:bg-gray-100 px-3 py-2.5 text-left transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <LuChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                                                            <span className="text-sm font-bold text-gray-800 truncate">{entry.name}</span>
                                                            {entry.groups.length > 1 && (
                                                                <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                                                                    {entry.groups.length} variants
                                                                </span>
                                                            )}
                                                            {entry.subCount > 0 && (
                                                                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                                                                    {entry.subCount} sub
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs font-mono font-bold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded shrink-0">{entry.qty.toLocaleString('en-IN')} pcs</span>
                                                    </button>
                                                    {isOpen && (
                                                        <div className="divide-y divide-gray-100 border-t border-gray-200">
                                                            {entry.groups.map(({ item, picks, pickedQty }) => (
                                                                <div key={item.id} className="px-3 py-2">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <p className="text-xs font-semibold text-gray-600">{item.color_name || 'AGNOSTIC'} {item.color_number ? `(${item.color_number})` : ''}</p>
                                                                        <span className="text-[11px] font-mono font-bold text-gray-500 shrink-0">{pickedQty.toLocaleString('en-IN')} pcs</span>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        {picks.map(p => (
                                                                            <div key={p.id} className="flex items-center justify-between px-2 py-1 text-xs bg-gray-50 rounded">
                                                                                <span className="truncate text-gray-700">
                                                                                    <span className="bg-gray-200 text-gray-700 px-1 rounded mr-1.5 font-mono">{p.quantity_fulfilled}×</span>
                                                                                    {p.fulfilled_color_name} {p.fulfilled_color_number}
                                                                                    {p.used_substitute && <span className="text-amber-700 font-bold ml-1.5 bg-amber-50 border border-amber-200 px-1 rounded">substitute</span>}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0">
                            <p className="text-xs text-gray-500 font-medium">Once ready, allocations lock until a loader signs or you pull the kit back.</p>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => setMarkReadyOpen(false)} disabled={kitBusy} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50">Cancel</button>
                                <button
                                    onClick={handleConfirmMarkReady}
                                    disabled={kitBusy || kitReviewGroups.length === 0}
                                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center"
                                >
                                    {kitBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LuSend className="w-4 h-4 mr-2" />}
                                    Confirm & Mark Ready
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <Toast kind={toast?.kind} message={toast?.message} onDismiss={() => setToast(null)} />


        </div>
    );
};

export default TrimOrderDetailPage;
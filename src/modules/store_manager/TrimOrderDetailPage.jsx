import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import {
    LuPackage, LuTriangleAlert, LuRefreshCw,
    LuReplace, LuArrowLeft, LuListOrdered, LuCircleCheck, LuWand,
    LuTrash2, LuFileText, LuBookOpen, LuScissors, LuTag, LuPrinter, LuDownload, LuX,
    LuSend, LuUndo2, LuChevronDown, LuChevronsDownUp, LuChevronsUpDown
} from 'react-icons/lu';
import { Loader2, Info } from 'lucide-react';
import { storeManagerApi } from '../../api/storeManagerApi';
import { trimKitsApi } from '../../api/trimKitsApi';
import { kitStatusOf } from '../trim_kits/kitStatusConfig';
import ExchangePanel from '../trim_kits/ExchangePanel';
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
            console.log("Mark Barcode Result:", res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to mark barcodes.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadCSV = () => {
        if (!result?.garments?.length) return;
        const header = 'sr_no,garment_uid,size,piece_sequence,barcode_printed_at';
        console.log("Garments for CSV:", result.garments);
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
const ReferenceDataModal = ({ isOpen, onClose, orderId }) => {
    const [activeTab, setActiveTab] = useState('bom');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({ bom: [], cutting: [] });

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            storeManagerApi.getOrderReferenceData(orderId)
                .then(res => setData(res.data))
                .catch(err => console.error("Failed to load reference data", err))
                .finally(() => setLoading(false));
               
        }

        console.log("Reference MModal Data:", data);
    }, [isOpen, orderId]);

    const totalCutSum = data.cutting.reduce(
    (sum, cut) => sum + Number(cut.total_cut || 0),
    0
    );

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
                                        {data.bom.length > 0 ? data.bom.map((item, idx) => {
                                            const isPerSize = item.calculation_type === 'PER_SIZE';
                                            const qty       = parseFloat(item.quantity_per_piece);
                                            const waste     = parseFloat(item.wastage_percentage);
                                            return (
                                                <tr key={item.trim_item_id ?? idx} className="hover:bg-gray-50 align-top">
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
                                                                            <span className="font-mono text-blue-700">{Number(sc.quantity).toFixed(2)}</span>
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
                                                </tr>
                                            );
                                        }) : (
                                            <tr><td colSpan="4" className="py-10 text-center text-gray-400">No BOM data found for this product.</td></tr>
                                        )}
                                    </tbody>
                                </table>
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

// --- Fulfillment Modal ---
const FulfillmentModal = ({ item, sopId, onClose, onSubmit, apiError }) => {
    const fulfillmentOptions = [
        ...(item.available_stock > 0 ? [{ ...item, id: item.trim_item_variant_id, is_substitute: false }] : []),
        ...(item.substitutes || []).map(sub => ({ ...sub, id: sub.substitute_variant_id, is_substitute: true }))
    ];

    const remainingRequired = item.quantity_required - item.quantity_fulfilled;
    const [selectedVariantId, setSelectedVariantId] = useState(fulfillmentOptions[0]?.id || '');
    const [quantity, setQuantity] = useState(remainingRequired);

    const [reservationInfo, setReservationInfo] = useState(null);
    const [reservationLoading, setReservationLoading] = useState(false);

    useEffect(() => {
        if (!selectedVariantId) { setReservationInfo(null); return; }
        const params = { trim_item_variant_id: selectedVariantId };
        if (sopId) params.sales_order_product_id = sopId;
        console.log('[FulfillmentModal] fetching reservation', params);
        setReservationLoading(true);
        storeManagerApi.getTrimReservations(params)
            .then(res => {
                const body    = res.data?.data ?? res.data ?? {};
                const variant = body.groups?.[0]?.variants?.[0] ?? null;
                const info = variant ? {
                    reserved: Number(variant.total_reserved || 0),
                    active:   Number(variant.total_active   || 0),
                    consumed: Number(variant.total_reserved || 0) - Number(variant.total_active || 0),
                    scopedToSop: !!sopId,
                } : null;
                console.log('[FulfillmentModal] reservation result', info ?? 'none found');
                setReservationInfo(info);
            })
            .catch(err => { console.log('[FulfillmentModal] reservation fetch failed', err); setReservationInfo(null); })
            .finally(() => setReservationLoading(false));
    }, [sopId, selectedVariantId]);

    const selectedOption = fulfillmentOptions.find(opt => opt.id === selectedVariantId);
    const maxAllowed = selectedOption ? Math.min(remainingRequired, selectedOption.available_stock) : 0;

    const [validationErr, setValidationErr] = useState(null);
    const handleSubmit = () => {
        if (!selectedOption) { setValidationErr("Please select an item to fulfill with."); return; }
        if (isNaN(quantity) || quantity <= 0) { setValidationErr("Invalid quantity. Please enter a number greater than 0."); return; }
        if (quantity > maxAllowed) { setValidationErr(`Quantity cannot exceed available stock (${selectedOption.available_stock}) or remaining required (${remainingRequired}).`); return; }
        setValidationErr(null);
        console.log('[FulfillmentModal] submitting allocation', {
            orderItemId: item.id,
            variantId: selectedVariantId,
            quantity,
            reservationActive: reservationInfo?.active ?? 'unknown',
            reservationReserved: reservationInfo?.reserved ?? 'unknown',
        });
        onSubmit({
            orderItemId: item.id,
            quantityToFulfill: quantity,
            fulfillingVariantId: selectedVariantId
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4 transition-opacity duration-300">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b">
                    <h3 className="text-xl font-bold text-gray-800">Fulfill Order Item</h3>
                    <p className="text-sm text-gray-500">Required: <strong>{item.item_name} - {item.color_name} - {item.color_number}</strong></p>
                </div>
                <div className="p-6 space-y-5 bg-gray-50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Item to Use for Fulfillment</label>
                        <div className="space-y-3">
                            {fulfillmentOptions.map(option => (
                                <label key={option.id} htmlFor={`variant-${option.id}`} className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedVariantId === option.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
                                    <input type="radio" id={`variant-${option.id}`} name="fulfillment-variant" value={option.id} checked={selectedVariantId === option.id} onChange={() => setSelectedVariantId(option.id)} className="h-4 w-4 text-blue-600 focus:ring-blue-500" />
                                    <div className="ml-4 flex-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-gray-900 text-sm">{option.item_name}</span>
                                            {option.is_substitute && (
                                                <span className="text-[10px] font-extrabold text-purple-600 bg-purple-100 px-2 py-0.5 rounded flex items-center"><LuReplace className="mr-1"/>SUBSTITUTE</span>
                                            )}
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-600 font-medium">
                                            <span>
                                                {option.color_name}
                                                {option.color_number && <span className="ml-1.5 text-[10px] font-mono text-gray-400">{option.color_number}</span>}
                                            </span>
                                            <span className="bg-gray-100 px-2 rounded">Stock: {option.available_stock}</span>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    {/* Reservation status for selected variant */}
                    {selectedVariantId && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs">
                            <p className="font-bold text-blue-700 mb-1.5 uppercase tracking-wider text-[10px]">
                                Buyer reservation for this variant
                                {reservationInfo && !reservationInfo.scopedToSop && (
                                    <span className="ml-1.5 normal-case font-normal text-blue-400">(all orders combined)</span>
                                )}
                            </p>
                            {reservationLoading ? (
                                <p className="text-blue-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Checking…</p>
                            ) : reservationInfo ? (
                                <div className="flex items-center gap-4">
                                    <span className="text-slate-600"><span className="font-bold text-blue-800">{reservationInfo.reserved.toLocaleString('en-IN')}</span> reserved</span>
                                    <span className="text-slate-600"><span className="font-bold text-orange-700">{reservationInfo.consumed.toLocaleString('en-IN')}</span> already used</span>
                                    <span className="text-slate-600"><span className={`font-bold ${reservationInfo.active > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{reservationInfo.active.toLocaleString('en-IN')}</span> available to allocate</span>
                                </div>
                            ) : (
                                <p className="text-amber-700 flex items-center gap-1"><LuTriangleAlert size={11} /> No reservation found — ask buyer to reserve first.</p>
                            )}
                        </div>
                    )}
                    <div>
                        <label htmlFor="fulfill-quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Fulfill (Remaining: {remainingRequired})</label>
                        <input type="number" id="fulfill-quantity" value={quantity} onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold" min="1" max={maxAllowed} />
                    </div>
                    {apiError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
                            <p className="font-semibold flex items-center gap-1.5"><LuTriangleAlert size={14} /> {apiError.message}</p>
                            {apiError.sopId && apiError.trimId && (
                                <p className="mt-1 text-xs text-red-600">Ask buyer to reserve the required trim stock before placing this order.</p>
                            )}
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 bg-white border-t space-y-3">
                    {validationErr && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5 font-medium">
                            <LuTriangleAlert size={14} /> {validationErr}
                        </p>
                    )}
                    <div className="flex justify-end space-x-3">
                        <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                        <button onClick={handleSubmit} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Confirm Fulfillment</button>
                    </div>
                </div>
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

// Raw stock (available_stock / main_store_stock) minus reservations. Defensive — works on
// items, substitute entries, and ad-hoc variant-like objects. Falls back to raw when reservation
// data isn't present on that particular variant.
const effectiveStockOf = (v) => {
    if (!v) return 0;
    const raw = Number(v.available_stock ?? v.main_store_stock ?? v.in_stock ?? 0);
    const res = Number(v.quantity_reserved ?? 0);
    return Math.max(0, raw - res);
};
const reservedOf = (v) => Number(v?.quantity_reserved ?? 0);

const intentDisplay = (decision, fulfillingVariant) => {
    if (decision === 'exact')        return { key: 'exact',        label: 'Exact match',                                                       color: 'blue',   order: 0 };
    if (decision === 'fulfilled')    return { key: 'fulfilled',    label: 'Already fulfilled',                                                 color: 'green',  order: 4 };
    if (decision === 'insufficient') return { key: 'insufficient', label: 'Cannot fulfill',                                                    color: 'red',    order: 3 };
    // substitute — one bucket per substitute variant id
    const v = fulfillingVariant || {};
    return {
        key:   `substitute:${v.id || 'unknown'}`,
        label: `Substitute with ${v.color_name || 'variant'}${v.color_number ? ` ${v.color_number}` : ''}`,
        color: 'purple',
        order: 1,
    };
};

const TrimOrderDetailPage = () => {
    const { orderId } = useParams();
    const [orderInfo, setOrderInfo] = useState(null);
    const [items, setItems] = useState([]);
    const [missingItems, setMissingItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFulfillingAll, setIsFulfillingAll] = useState(false);
    const [isReverting, setIsReverting] = useState(false);
    const [error, setError] = useState(null);

    // Modals state
    const [modalState, setModalState] = useState({ isOpen: false, item: null });
    const [fulfillErr, setFulfillErr] = useState(null);
    const [refModalOpen, setRefModalOpen] = useState(false);
    const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
    const [productModalOpen, setProductModalOpen] = useState(false);

    // Toast
    const [toast, setToast] = useState(null);
    const showToast = useCallback((kind, message) => setToast({ kind, message }), []);

    // Reference data (BOM + cutting) — loaded on mount
    const [refData, setRefData] = useState({ bom: [], cutting: [] });
    const [refDataLoaded, setRefDataLoaded] = useState(false);

    // Billed composite keys (item_name|color_name|color_number) — fulfillment log entries matching these cannot be reverted
    const [billedKeys, setBilledKeys] = useState(new Set());

    // Reservation info for the currently selected trim item
    const [trimReservation, setTrimReservation] = useState(null);
    const [trimResLoading, setTrimResLoading] = useState(false);

    // Master-detail + intent grouping
    const [selectedTrimName, setSelectedTrimName] = useState(null);
    const [statusFilter,     setStatusFilter]     = useState('all');   // 'all' | 'ready' | 'sub' | 'insufficient' | 'fulfilled'
    const [search,           setSearch]           = useState('');
    const [overrides,        setOverrides]        = useState({});      // { [itemId]: { fulfilling_variant_id, fulfilling_variant, quantity_to_fulfill, decision } }
    const [popoverAnchor,    setPopoverAnchor]    = useState(null);    // { itemId, rect: DOMRect } | null
    const [bulkBusyKey,      setBulkBusyKey]      = useState(null);
    const popoverRef = useRef(null);

    // Close popover on Esc, outside click, and any scroll/resize (fixed-positioned, so it can't follow content).
    useEffect(() => {
        if (!popoverAnchor) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') setPopoverAnchor(null); };
        const onScroll = () => setPopoverAnchor(null);
        const onResize = () => setPopoverAnchor(null);
        const onDocMouseDown = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) setPopoverAnchor(null);
        };
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        document.addEventListener('mousedown', onDocMouseDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
            document.removeEventListener('mousedown', onDocMouseDown);
        };
    }, [popoverAnchor]);

    const fetchRefData = useCallback(async () => {
        setRefDataLoaded(false);
        try {
            const res = await storeManagerApi.getOrderReferenceData(orderId);
            const refRaw = res.data || { bom: [], cutting: [] };
            console.log('[TrimOrderDetail] refData loaded:', refRaw);
            console.log('[TrimOrderDetail] raw BOM fetched —', (refRaw.bom || []).length, 'row(s):', refRaw.bom);
            console.log('[TrimOrderDetail] raw BOM JSON:', JSON.stringify(refRaw.bom ?? [], null, 2));
            console.log('[TrimOrderDetail] raw CUTTING fetched —', (refRaw.cutting || []).length, 'row(s):', refRaw.cutting);
            console.log('[TrimOrderDetail] raw CUTTING JSON:', JSON.stringify(refRaw.cutting ?? [], null, 2));
            // The `sizes` string is what PER_SIZE BOM derivation matches against — log the raw
            // strings and the tokens they parse into, so a size-format mismatch is obvious.
            console.log('[TrimOrderDetail] cutting `sizes` strings:', (refRaw.cutting || []).map(c => c.sizes));
            const dbgSizeMap = {};
            (refRaw.cutting || []).forEach(c => (c.sizes || '').split(',').forEach(part => {
                const [sz, qty] = part.trim().split(':').map(s => s.trim());
                if (sz && qty) dbgSizeMap[sz] = (dbgSizeMap[sz] || 0) + Number(qty);
            }));
            console.log('[TrimOrderDetail] cutting sizes parsed → qty by size:', dbgSizeMap);
            console.log('[TrimOrderDetail] distinct cutting size tokens:', Object.keys(dbgSizeMap));
            setRefData(refRaw);
        } catch (err) {
            console.error('[TrimOrderDetail] refData fetch failed:', err?.response?.data || err.message);
            setRefData({ bom: [], cutting: [] });
        } finally {
            setRefDataLoaded(true);
        }
    }, [orderId]);

    useEffect(() => { fetchRefData(); }, [fetchRefData]);

    const billKey = (itemName, colorName, colorNumber) =>
        `${String(itemName || '').trim().toLowerCase()}|${String(colorName || '').trim().toLowerCase()}|${String(colorNumber || '').toLowerCase()}`;

    const fetchBills = useCallback(async () => {
        try {
            const res = await storeManagerApi.getTrimBillsForOrder(orderId);
            const bills = res.data || [];
            console.log('[TrimBilling] raw bills from API:', bills);
            const keys = new Set(
                bills.flatMap(b => (b.items || []).map(i => billKey(i.item_name, i.color_name, i.color_number)))
            );
            console.log('[TrimBilling] billed composite keys:', [...keys]);
            setBilledKeys(keys);
        } catch (err) {
            console.warn('[TrimBilling] failed to load bills — revert buttons remain enabled:', err?.response?.data || err.message);
        }
    }, [orderId]);

    useEffect(() => { fetchBills(); }, [fetchBills]);

    // Handover slips + loader custody — both live on the kit endpoint.
    const [handoverSlips, setHandoverSlips] = useState([]);
    const [kitCustodyVariants, setKitCustodyVariants] = useState([]);
    const fetchHandovers = useCallback(async () => {
        try {
            const res = await trimKitsApi.getKitOrder(orderId);
            console.log('[trimkits] store getKitOrder raw:', res.data);
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

    const fetchDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            console.log("Order Details Response:", response.data);
            console.log('[TrimOrderDetail] key fields from API:', {
                sales_order_product_id: response.data.sales_order_product_id,
                trim_item_id_on_first_item: response.data.items?.[0]?.trim_item_id,
                first_item_keys: response.data.items?.[0] ? Object.keys(response.data.items[0]) : [],
            });
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
        if (!window.confirm(`Auto-fulfill ${exactFulfillableItems.length} items using exact matches?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillOrder(orderId);
            showToast('success', res.data.message || 'Auto-fulfill complete.');
            fetchDetails();
        } catch (err) {
            showToast('error', `Failed: ${err.response?.data?.error || 'Server error'}`);
            if (err.response?.status === 409) fetchDetails(); // kit locked for pickup / already issued
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillAllSubs = async () => {
        if (!window.confirm(`Auto-fulfill ${substituteFulfillableItems.length} items using available substitutes?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillSubstitutes(orderId);
            showToast('success', res.data.message || 'Substitute auto-fulfill complete.');
            fetchDetails();
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
            g.items.forEach(it => {
                const plan = getEffectivePlan(it);
                counts[plan.decision] = (counts[plan.decision] || 0) + 1;
            });
            const total = g.items.length;
            const done  = counts.fulfilled;
            return { ...g, counts, total, donePct: total ? Math.round((done / total) * 100) : 0 };
        });
    }, [items, getEffectivePlan]);

    // Apply status filter + search on the left pane
    const visibleTrimItemGroups = useMemo(() => {
        const q = search.trim().toLowerCase();
        return trimItemGroups.filter(g => {
            if (q && !g.name.toLowerCase().includes(q)) return false;
            if (statusFilter === 'all')          return true;
            if (statusFilter === 'ready')        return g.counts.exact > 0;
            if (statusFilter === 'sub')          return g.counts.substitute > 0;
            if (statusFilter === 'insufficient') return g.counts.insufficient > 0;
            if (statusFilter === 'fulfilled')    return g.counts.fulfilled > 0;
            return true;
        });
    }, [trimItemGroups, search, statusFilter]);

    // Auto-select the first trim item when data lands or when the current selection disappears
    useEffect(() => {
        if (!visibleTrimItemGroups.length) { if (selectedTrimName) setSelectedTrimName(null); return; }
        if (!selectedTrimName || !visibleTrimItemGroups.some(g => g.name === selectedTrimName)) {
            setSelectedTrimName(visibleTrimItemGroups[0].name);
        }
    }, [visibleTrimItemGroups, selectedTrimName]);

    // Fetch reservation summary whenever the selected trim group or SOP changes.
    // Filters by sales_order_product_id + each trim_item_variant_id in the group; no trim_item_id needed.
    const selectedTrimGroup = trimItemGroups.find(g => g.name === selectedTrimName) || null;
    useEffect(() => {
        const sopId = orderInfo?.sopId;
        if (!sopId || !selectedTrimGroup) {
            console.log('[TrimOrderDetail] skipping panel reservation fetch — missing sopId or no selected group', { sopId, group: selectedTrimGroup?.name });
            setTrimReservation(null);
            return;
        }
        const variantIds = new Set(selectedTrimGroup.items.map(it => String(it.trim_item_variant_id)));
        console.log('[TrimOrderDetail] fetching panel reservations', { sopId, trimName: selectedTrimGroup.name, variantIds: [...variantIds] });
        setTrimResLoading(true);
        storeManagerApi.getTrimReservations({ sales_order_product_id: sopId })
            .then(res => {
                const body = res.data?.data ?? res.data ?? {};
                let reserved = 0, active = 0;
                (body.groups || []).forEach(g =>
                    (g.variants || []).forEach(v => {
                        if (variantIds.has(String(v.trim_item_variant_id))) {
                            reserved += Number(v.total_reserved || 0);
                            active   += Number(v.total_active   || 0);
                        }
                    })
                );
                const info = reserved > 0 ? { reserved, active, consumed: reserved - active } : null;
                console.log('[TrimOrderDetail] panel reservation result', info ?? 'none found');
                setTrimReservation(info);
            })
            .catch(err => { console.log('[TrimOrderDetail] panel reservation fetch failed', err); setTrimReservation(null); })
            .finally(() => setTrimResLoading(false));
    }, [selectedTrimGroup?.name, orderInfo?.sopId]);
    const intentGroups = useMemo(() => {
        if (!selectedTrimGroup) return [];
        const groups = new Map();
        selectedTrimGroup.items.forEach(it => {
            const plan    = getEffectivePlan(it);
            const display = intentDisplay(plan.decision, plan.fulfilling_variant);
            if (!groups.has(display.key)) {
                groups.set(display.key, { ...display, fulfilling_variant: plan.fulfilling_variant, rows: [] });
            }
            groups.get(display.key).rows.push({ item: it, plan });
        });
        return [...groups.values()].sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            const sumA = a.rows.reduce((s, r) => s + (r.plan.quantity_to_fulfill || 0), 0);
            const sumB = b.rows.reduce((s, r) => s + (r.plan.quantity_to_fulfill || 0), 0);
            return sumB - sumA;
        });
    }, [selectedTrimGroup, getEffectivePlan]);

    // Fulfilled quantity aggregated by the color actually used — scoped to the currently selected trim item.
    // Surfaces "X pcs fulfilled with BLACK", "Y with WHITE" inside the right pane.
    const fulfilledByColor = useMemo(() => {
        if (!selectedTrimGroup) return [];
        const map = new Map();
        selectedTrimGroup.items.forEach(it => {
            (it.fulfillment_log || []).forEach(log => {
                const colorNum  = log.fulfilled_color_number ?? log.color_number ?? log.fulfilling_color_number ?? null;
                const colorName = log.fulfilled_color_name   ?? log.color_name   ?? log.fulfilling_color_name   ?? null;
                const variantId = log.fulfilled_variant_id   ?? log.fulfilling_variant_id ?? log.variant_id ?? null;
                const qty       = Number(log.quantity_fulfilled ?? log.quantity ?? log.qty ?? 0);
                const key       = String(colorNum ?? colorName ?? `var-${variantId ?? 'unknown'}`);
                const variantKey = String(variantId ?? colorNum ?? colorName ?? key);
                if (!map.has(key)) {
                    map.set(key, {
                        color_number: colorNum,
                        color_name:   colorName || 'Unknown',
                        total_qty:    0,
                        variants:     new Set(),
                    });
                }
                const e = map.get(key);
                e.total_qty += qty;
                e.variants.add(variantKey);
            });
        });
        return [...map.values()]
            .map(e => ({ ...e, variant_count: e.variants.size }))
            .sort((a, b) => b.total_qty - a.total_qty);
    }, [selectedTrimGroup]);

    // Order-wide progress
    const overallProgress = useMemo(() => {
        const total = items.length;
        const done  = items.filter(it => it.is_fulfilled).length;
        const partial = items.filter(it => !it.is_fulfilled && it.quantity_fulfilled > 0).length;
        return { total, done, partial, pct: total ? Math.round((done / total) * 100) : 0 };
    }, [items]);

    // ── Override actions: pick a different variant for a single row ──────────
    const handlePickOverride = (item, source) => {
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
        setPopoverAnchor(null);
    };

    const handleResetOverride = (itemId) => {
        setOverrides(prev => {
            if (!(itemId in prev)) return prev;
            const next = { ...prev };
            delete next[itemId];
            return next;
        });
        setPopoverAnchor(null);
    };

    // Bulk fulfill every row in one intent group, committing each row's effective plan.
    const handleBulkFulfillGroup = async (group) => {
        const fulfillable = group.rows.filter(r => r.plan.decision !== 'fulfilled' && r.plan.fulfilling_variant_id && r.plan.quantity_to_fulfill > 0);
        if (fulfillable.length === 0) { showToast('error', 'Nothing to fulfill in this group.'); return; }

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

        const lines = [`Allocate stock for ${fulfillable.length} variant${fulfillable.length === 1 ? '' : 's'} — ${group.label}?`];
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
        // stays false during fetchDetails — keeps the master-detail mounted and preserves scroll.
        setBulkBusyKey(group.key);
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
            await fetchDetails();
        } finally {
            setBulkBusyKey(null);
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillClick = (item) => setModalState({ isOpen: true, item: item });

    const handleFulfillmentSubmit = async (fulfillmentData) => {
        setIsFulfillingAll(true);   // keep the page-level spinner off so scroll position survives the refresh
        setFulfillErr(null);
        try {
            await storeManagerApi.fulfillWithVariant(fulfillmentData);
            setModalState({ isOpen: false, item: null });
            await fetchDetails();
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
        if (!window.confirm("Revert this fulfillment? This reverts the allocation only — no stock moves. You will need to pick this again.")) return;
        setIsReverting(true);
        try {
            await storeManagerApi.revertFulfillment(logId);
            showToast('success', 'Fulfillment allocation reverted.');
            fetchDetails();
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
                            {orderInfo?.status === 'READY_FOR_PICKUP' ? (
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
                            )}
                            {/* ✅ NEW BUTTON: Opens Reference Modal */}
                            <button 
                                onClick={() => setRefModalOpen(true)}
                                className="px-5 py-2.5 bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center"
                            >
                                <Info className="mr-2 h-5 w-5 text-gray-500" /> 
                                View Ref & BOMm
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


                    {/* Master-detail body */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 flex-wrap p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-base font-bold text-gray-800 flex items-center">
                                <LuListOrdered className="mr-2 text-blue-600"/>Order Requirements
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                    {trimItemGroups.length} trim item{trimItemGroups.length === 1 ? '' : 's'} · {items.length} variants
                                </span>
                            </h3>
                            <div className="flex items-center gap-2">
                                {substituteFulfillableItems.length > 0 && (
                                    <button onClick={handleFulfillAllSubs} disabled={isFulfillingAll || isReverting}
                                        className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-purple-700 transition-colors flex items-center disabled:opacity-70">
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1"/> : <LuWand className="mr-1 h-3.5 w-3.5"/>}
                                        Auto-Fulfill {substituteFulfillableItems.length} Subs
                                    </button>
                                )}
                                {exactFulfillableItems.length > 0 && (
                                    <button onClick={handleFulfillAllExact} disabled={isFulfillingAll || isReverting}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center disabled:opacity-70">
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1"/> : <LuCircleCheck className="mr-1 h-3.5 w-3.5"/>}
                                        Auto-Fulfill {exactFulfillableItems.length} Exact
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-0 h-[75vh]">
                            {(isFulfillingAll || isReverting) && (
                                <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                                    <div className="bg-white px-6 py-3 rounded-xl shadow-lg border flex items-center font-bold text-blue-700">
                                        <Loader2 className="animate-spin h-5 w-5 mr-3"/> Processing operation…
                                    </div>
                                </div>
                            )}

                            {/* LEFT PANE — trim item cards */}
                            <div className="lg:col-span-4 lg:border-r border-gray-200 flex flex-col overflow-hidden">
                                {/* sticky search + filter */}
                                <div className="shrink-0 p-3 border-b border-gray-100 space-y-2 bg-white">
                                    <div className="relative">
                                        <input type="search" placeholder="Search trim items…"
                                            value={search} onChange={e => setSearch(e.target.value)}
                                            className="w-full pl-3 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {[
                                            { key: 'all',          label: 'All',          color: 'gray'   },
                                            { key: 'ready',        label: 'Ready',        color: 'blue'   },
                                            { key: 'sub',          label: 'Substitute',   color: 'purple' },
                                            { key: 'insufficient', label: 'Insufficient', color: 'red'    },
                                            { key: 'fulfilled',    label: 'Fulfilled',    color: 'green'  },
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
                                </div>
                                {/* scrollable cards list */}
                                <div className="pane-scroll flex-1 overflow-y-auto p-2 space-y-1.5">
                                    {visibleTrimItemGroups.length === 0 ? (
                                        <p className="text-center text-xs text-gray-400 italic py-8">
                                            {items.length === 0 ? 'No items in this order.' : 'No trim items match the filter.'}
                                        </p>
                                    ) : visibleTrimItemGroups.map(group => {
                                        const isSel = selectedTrimName === group.name;
                                        const c = group.counts;
                                        return (
                                            <button key={group.name} onClick={() => setSelectedTrimName(group.name)}
                                                className={`w-full text-left p-3 rounded-lg border transition ${isSel ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-200 bg-white hover:border-blue-200'}`}>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <p className="text-sm font-bold text-gray-800 truncate">{group.name}</p>
                                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded shrink-0">
                                                        {group.total}
                                                    </span>
                                                </div>
                                                {/* Legend: green = allocated (done) · blue = ready to allocate · purple = via substitute · red = missing/short */}
                                                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mb-1.5">
                                                    {c.fulfilled    > 0 && <div className="bg-green-500"   style={{ width: `${(c.fulfilled    / group.total) * 100}%` }} />}
                                                    {c.exact        > 0 && <div className="bg-blue-500"    style={{ width: `${(c.exact        / group.total) * 100}%` }} />}
                                                    {c.substitute   > 0 && <div className="bg-purple-500"  style={{ width: `${(c.substitute   / group.total) * 100}%` }} />}
                                                    {c.insufficient > 0 && <div className="bg-red-500"     style={{ width: `${(c.insufficient / group.total) * 100}%` }} />}
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                                                    {c.exact        > 0 && <span className="text-blue-700">{c.exact} ready</span>}
                                                    {c.substitute   > 0 && <span className="text-purple-700">{c.substitute} sub</span>}
                                                    {c.insufficient > 0 && <span className="text-red-700">{c.insufficient} short</span>}
                                                    {c.fulfilled    > 0 && <span className="text-green-700">{c.fulfilled} done</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* RIGHT PANE — intent groups for the selected trim item */}
                            <div className="pane-scroll lg:col-span-8 overflow-y-auto">
                                {!selectedTrimGroup ? (
                                    <div className="flex items-center justify-center h-full text-gray-400 italic p-8">
                                        Pick a trim item on the left to see fulfillment plans.
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-4 border-b border-gray-100 bg-gray-50/40">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Trim item</p>
                                            <h4 className="text-base font-extrabold text-gray-800">{selectedTrimGroup.name}</h4>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {selectedTrimGroup.total} variant{selectedTrimGroup.total === 1 ? '' : 's'}
                                                {' · '}{selectedTrimGroup.counts.fulfilled} fulfilled
                                                {' · '}{selectedTrimGroup.counts.exact + selectedTrimGroup.counts.substitute} actionable
                                                {selectedTrimGroup.counts.insufficient > 0 && <span className="text-red-600 font-bold"> · {selectedTrimGroup.counts.insufficient} blocked</span>}
                                            </p>
                                            {/* Unified stats + BOM cards */}
                                            {(() => {
                                                const totalRequired  = selectedTrimGroup.items.reduce((s, it) => s + Number(it.quantity_required  || 0), 0);
                                                const totalFulfilled = selectedTrimGroup.items.reduce((s, it) => s + Number(it.quantity_fulfilled || 0), 0);
                                                const remaining      = Math.max(0, totalRequired - totalFulfilled);
                                                const pct            = totalRequired > 0 ? Math.round((totalFulfilled / totalRequired) * 100) : 0;

                                                // Each order item carries trim_item_id directly — use it to match BOM entries by ID (reliable, name-independent)
                                                const groupItemIds = new Set(
                                                    selectedTrimGroup.items.map(it => String(it.trim_item_id)).filter(Boolean)
                                                );
                                                const idMatchResult = refData.bom.find(b => groupItemIds.has(String(b.trim_item_id)));
                                                console.log('[BOM match] group trim_item_ids:', [...groupItemIds], '| BOM match:', idMatchResult ? `FOUND — ${idMatchResult.item_name} (id=${idMatchResult.trim_item_id})` : 'NO MATCH');

                                                const bomEntry = refDataLoaded ? idMatchResult : undefined;
                                                const totalCut   = refData.cutting.reduce((s, c) => s + Number(c.total_cut || 0), 0);
                                                const wastage    = bomEntry ? parseFloat(bomEntry.wastage_percentage || 0) : 0;
                                                const wasteFactor = 1 + wastage / 100;
                                                const calcType   = bomEntry?.calculation_type || 'FIXED';
                                                // quantity_per_piece is null on PER_SIZE rows — parseFloat gives NaN, which passes `!= null`.
                                                const qtyPerPcRaw = bomEntry ? parseFloat(bomEntry.quantity_per_piece) : NaN;
                                                const qtyPerPc    = Number.isFinite(qtyPerPcRaw) ? qtyPerPcRaw : null;

                                                // Parse "28: 5, 30: 5, ..." per cutting roll, aggregate by size
                                                const sizeCutMap = {};
                                                refData.cutting.forEach(c => {
                                                    (c.sizes || '').split(',').forEach(part => {
                                                        const [sz, qty] = part.trim().split(':').map(s => s.trim());
                                                        if (sz && qty) sizeCutMap[sz] = (sizeCutMap[sz] || 0) + Number(qty);
                                                    });
                                                });

                                                let bomDerived = null;
                                                let bomFormula = null;
                                                if (bomEntry && totalCut > 0) {
                                                    if (calcType === 'PER_SIZE' && (bomEntry.size_consumptions || []).length > 0) {
                                                        const raw = (bomEntry.size_consumptions || []).reduce((sum, sc) => {
                                                            const cut = sizeCutMap[String(sc.size)] || 0;
                                                            return sum + sc.quantity * cut;
                                                        }, 0);
                                                        bomDerived = Math.round(raw * wasteFactor);
                                                        bomFormula = `Σ(size qty × cut) × ${wasteFactor.toFixed(4)}`;
                                                    } else if (calcType === 'FIXED' && qtyPerPc != null) {
                                                        bomDerived = Math.round(qtyPerPc * totalCut * wasteFactor);
                                                        bomFormula = `${qtyPerPc.toFixed(4)} × ${totalCut.toLocaleString()} × ${wasteFactor.toFixed(4)}`;
                                                    }
                                                }

                                                const variance = bomDerived != null ? totalRequired - bomDerived : null;
                                                const pctOff   = (bomDerived && variance != null) ? Math.abs(Math.round((variance / bomDerived) * 100)) : 0;
                                                const isMatch  = variance != null && Math.abs(variance) <= 1;
                                                const isOver   = variance != null && variance > 0;

                                                return (
                                                    <div className="mt-3 space-y-2">
                                                        {/* Row 1 — order quantities */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Required</p>
                                                                <p className="text-base font-extrabold text-gray-900 tabular-nums">{totalRequired.toLocaleString()}</p>
                                                            </div>
                                                            <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Fulfilled</p>
                                                                <p className="text-base font-extrabold text-emerald-700 tabular-nums">{totalFulfilled.toLocaleString()}</p>
                                                                <p className="text-[10px] text-gray-500">{pct}% of required</p>
                                                            </div>
                                                            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Remaining</p>
                                                                <p className={`text-base font-extrabold tabular-nums ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{remaining.toLocaleString()}</p>
                                                            </div>
                                                            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Variants done</p>
                                                                <p className="text-base font-extrabold text-gray-900 tabular-nums">{selectedTrimGroup.counts.fulfilled} <span className="text-xs font-bold text-gray-400">/ {selectedTrimGroup.total}</span></p>
                                                            </div>
                                                        </div>

                                                        {/* Row 2 — BOM calculation */}
                                                        {!refDataLoaded ? null : !bomEntry ? (
                                                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 flex items-center gap-2">
                                                                <LuTriangleAlert className="h-4 w-4 text-red-500 shrink-0" />
                                                                <div>
                                                                    <p className="text-xs font-bold text-red-700">No BOM entry for this trim item</p>
                                                                    <p className="text-[10px] text-red-500 mt-0.5">Required quantities cannot be verified against BOM. Add this item to the product BOM.</p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                                <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-violet-500">BOM Qty / Pc</p>
                                                                    {calcType === 'PER_SIZE'
                                                                        ? <p className="text-sm font-bold text-violet-700">Per Size</p>
                                                                        : <p className="text-base font-extrabold text-violet-800 tabular-nums font-mono">{qtyPerPc != null ? qtyPerPc.toFixed(4) : '—'}</p>
                                                                    }
                                                                    {wastage > 0 && <p className="text-[9px] text-violet-400">+{wastage}% wastage</p>}
                                                                </div>
                                                                <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-violet-500">Total Cut</p>
                                                                    <p className="text-base font-extrabold text-violet-800 tabular-nums">{totalCut > 0 ? totalCut.toLocaleString() : <span className="text-gray-400 text-sm font-sans">—</span>}</p>
                                                                    {calcType === 'PER_SIZE' && Object.keys(sizeCutMap).length > 0 && (
                                                                        <p className="text-[9px] text-violet-400">{Object.keys(sizeCutMap).length} sizes</p>
                                                                    )}
                                                                </div>
                                                                <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-violet-500">BOM Derived</p>
                                                                    <p className="text-base font-extrabold text-violet-800 tabular-nums">{bomDerived != null ? bomDerived.toLocaleString() : <span className="text-gray-400 text-sm font-sans">—</span>}</p>
                                                                    {bomFormula && <p className="text-[9px] text-violet-400 font-mono truncate" title={bomFormula}>{bomFormula}</p>}
                                                                </div>
                                                                <div className={`rounded-lg px-3 py-2 border ${variance == null ? 'bg-gray-50 border-gray-200' : isMatch ? 'bg-emerald-50 border-emerald-200' : isOver ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                                                    <p className={`text-[9px] font-bold uppercase tracking-wider ${variance == null ? 'text-gray-400' : isMatch ? 'text-emerald-600' : isOver ? 'text-amber-600' : 'text-red-600'}`}>Variance</p>
                                                                    {variance == null
                                                                        ? <p className="text-sm font-bold text-gray-400">No cut data</p>
                                                                        : isMatch
                                                                            ? <p className="text-base font-extrabold text-emerald-700">✓ Exact</p>
                                                                            : <p className={`text-base font-extrabold tabular-nums ${isOver ? 'text-amber-700' : 'text-red-700'}`}>{isOver ? '+' : ''}{variance.toLocaleString()} <span className="text-xs">({pctOff}%)</span></p>
                                                                    }
                                                                    {variance != null && !isMatch && <p className={`text-[9px] ${isOver ? 'text-amber-500' : 'text-red-500'}`}>{isOver ? 'ordered extra' : 'short vs BOM'}</p>}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {/* Buyer reservation status for this trim item */}
                                            {orderInfo?.sopId && (
                                                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">Buyer reservation · this trim item</p>
                                                    {trimResLoading ? (
                                                        <p className="text-xs text-blue-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Checking…</p>
                                                    ) : trimReservation ? (
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div className="bg-white border border-blue-100 rounded-lg px-2 py-1.5 text-center">
                                                                <p className="text-[9px] font-bold uppercase tracking-wider text-blue-500">Reserved</p>
                                                                <p className="text-base font-extrabold text-blue-800 tabular-nums">{trimReservation.reserved.toLocaleString('en-IN')}</p>
                                                            </div>
                                                            <div className="bg-white border border-orange-100 rounded-lg px-2 py-1.5 text-center">
                                                                <p className="text-[9px] font-bold uppercase tracking-wider text-orange-500">Already used</p>
                                                                <p className="text-base font-extrabold text-orange-700 tabular-nums">{trimReservation.consumed.toLocaleString('en-IN')}</p>
                                                            </div>
                                                            <div className={`bg-white rounded-lg px-2 py-1.5 text-center border ${trimReservation.active > 0 ? 'border-emerald-100' : 'border-red-100'}`}>
                                                                <p className={`text-[9px] font-bold uppercase tracking-wider ${trimReservation.active > 0 ? 'text-emerald-600' : 'text-red-500'}`}>Allocatable</p>
                                                                <p className={`text-base font-extrabold tabular-nums ${trimReservation.active > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{trimReservation.active.toLocaleString('en-IN')}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-amber-700 flex items-center gap-1.5">
                                                            <LuTriangleAlert size={12} /> No reservation found — ask buyer to reserve before allocating.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Per-trim-item "fulfilled by color" breakdown */}
                                            {fulfilledByColor.length > 0 && (
                                                <div className="mt-3">
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                                                        Fulfilled by color · this trim item
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {fulfilledByColor.map(c => (
                                                            <div key={c.color_number || c.color_name}
                                                                className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
                                                                <span className="text-xs font-extrabold text-emerald-800">{c.color_name}</span>
                                                                {c.color_number && (
                                                                    <span className="text-[9px] font-mono text-emerald-500">{c.color_number}</span>
                                                                )}
                                                                <span className="text-emerald-300">·</span>
                                                                <span className="text-xs font-bold text-gray-800 tabular-nums">{c.total_qty.toLocaleString()}</span>
                                                                <span className="text-[9px] text-gray-500">pcs</span>
                                                                <span className="text-emerald-300">·</span>
                                                                <span className="text-[9px] font-bold text-emerald-700">{c.variant_count} var</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-4 space-y-3">
                                            {intentGroups.length === 0 && (
                                                <p className="text-center text-xs text-gray-400 italic py-8">No variants on this trim item.</p>
                                            )}
                                            {intentGroups.map(group => {
                                                const cs = STATUS_STYLES[group.color] || STATUS_STYLES.gray;
                                                const isFulfilledGroup = group.key === 'fulfilled';
                                                const fulfillable = group.rows.filter(r => r.plan.decision !== 'fulfilled' && r.plan.fulfilling_variant_id && r.plan.quantity_to_fulfill > 0);
                                                // For Already Fulfilled, sum the actual fulfilled quantity; for everything else, sum the planned qty.
                                                const totalQty    = isFulfilledGroup
                                                    ? group.rows.reduce((s, r) => s + Number(r.item.quantity_fulfilled || 0), 0)
                                                    : group.rows.reduce((s, r) => s + (r.plan.quantity_to_fulfill || 0), 0);
                                                const totalShort  = group.rows.reduce((s, r) => s + (r.plan.shortfall || 0), 0);
                                                const isBusy      = bulkBusyKey === group.key;
                                                return (
                                                    <div key={group.key} className={`rounded-xl border-2 ${cs.border} ${cs.bg} overflow-hidden`}>
                                                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/70 border-b border-current/10">
                                                            <div className="min-w-0">
                                                                <p className={`text-sm font-extrabold ${cs.text} truncate`}>{group.label}</p>
                                                                <p className="text-[10px] text-gray-600">
                                                                    {group.rows.length} variant{group.rows.length === 1 ? '' : 's'}
                                                                    {' · '}
                                                                    {isFulfilledGroup ? `${totalQty.toLocaleString()} pcs fulfilled` : `${totalQty} pcs`}
                                                                    {totalShort > 0 && <span className="text-red-600 font-bold"> · {totalShort} short</span>}
                                                                </p>
                                                            </div>
                                                            {fulfillable.length > 0 && group.key !== 'fulfilled' && group.key !== 'insufficient' && (
                                                                <button onClick={() => handleBulkFulfillGroup(group)}
                                                                    disabled={isBusy || isFulfillingAll || isReverting}
                                                                    className={`flex items-center gap-1.5 text-xs font-bold text-white ${group.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'} disabled:opacity-50 px-3 py-1.5 rounded-lg shadow-sm transition`}>
                                                                    {isBusy ? <Loader2 className="animate-spin h-3.5 w-3.5"/> : <LuPackage className="h-3.5 w-3.5"/>}
                                                                    Allocate {fulfillable.length}
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="p-3 flex flex-wrap gap-1.5">
                                                            {group.rows.map(({ item, plan }) => {
                                                                const isOverridden = !!overrides[item.id];
                                                                const isOpen = popoverAnchor?.itemId === item.id;
                                                                const remaining = Math.max(0, item.quantity_required - item.quantity_fulfilled);
                                                                const isFulfilledRow = plan.decision === 'fulfilled';
                                                                // Does this row's planned allocation dip into reserved stock of its fulfilling variant?
                                                                const fulfillingVar = !plan.fulfilling_variant_id ? null
                                                                    : (String(plan.fulfilling_variant_id) === String(item.trim_item_variant_id)
                                                                        ? item
                                                                        : (item.substitutes || []).find(s => String(s.substitute_variant_id || s.id) === String(plan.fulfilling_variant_id)));
                                                                const fulfillingNet = effectiveStockOf(fulfillingVar);
                                                                const fulfillingRes = reservedOf(fulfillingVar);
                                                                const overReserved  = !isFulfilledRow && fulfillingRes > 0 && plan.quantity_to_fulfill > fulfillingNet;
                                                                return (
                                                                    <button
                                                                        key={item.id}
                                                                        onClick={(e) => {
                                                                            if (isFulfilledRow) return;
                                                                            if (isOpen) { setPopoverAnchor(null); return; }
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            setPopoverAnchor({ itemId: item.id, rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height } });
                                                                        }}
                                                                        disabled={isFulfilledRow}
                                                                        title={isFulfilledRow
                                                                            ? `Fulfilled · ${item.quantity_fulfilled} pcs`
                                                                            : overReserved
                                                                                ? `Planned ${plan.quantity_to_fulfill} but only ${fulfillingNet} net after ${fulfillingRes} reserved`
                                                                                : 'Click to override the planned variant'}
                                                                        className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold transition ${isFulfilledRow ? 'bg-green-50 text-green-700 border-green-200 cursor-default' : 'bg-white text-gray-800 border-gray-200 hover:border-blue-300'} ${isOverridden ? 'ring-1 ring-amber-300' : ''} ${overReserved ? 'ring-1 ring-amber-400 bg-amber-50' : ''} ${isOpen ? 'ring-2 ring-blue-400' : ''}`}>
                                                                        <span className={isFulfilledRow ? 'text-green-700' : 'text-gray-500'}>{item.color_name || 'AGNOSTIC'}</span>
                                                                        <span className="text-[9px] text-gray-400 font-mono">{item.color_number}</span>
                                                                        <span className="text-gray-300">·</span>
                                                                        {isFulfilledRow ? (
                                                                            <span className="font-mono">✓ {Number(item.quantity_fulfilled || 0).toLocaleString()}</span>
                                                                        ) : (
                                                                            <span className="font-mono">{plan.quantity_to_fulfill || 0}/{remaining}</span>
                                                                        )}
                                                                        {plan.shortfall > 0 && <span className="text-red-600 ml-0.5">−{plan.shortfall}</span>}
                                                                        {overReserved && <span className="text-amber-700 ml-0.5" title="Allocates beyond net-of-reserved stock">⚠</span>}
                                                                        {isOverridden && <span className="text-amber-700 ml-0.5">★</span>}
                                                                        {!isFulfilledRow && <span className="text-gray-400 ml-0.5">⌄</span>}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Per-trim-item fulfillment history (collapsible) */}
                                            {selectedTrimGroup.items.some(it => (it.fulfillment_log || []).length > 0) && (
                                                <details className="bg-gray-50 border border-gray-200 rounded-xl">
                                                    <summary className="px-4 py-2.5 cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-700">
                                                        Fulfillment history
                                                    </summary>
                                                    <div className="p-3 space-y-2 border-t border-gray-100">
                                                        {selectedTrimGroup.items.filter(it => (it.fulfillment_log || []).length > 0).map(it => (
                                                            <div key={it.id} className="bg-white border border-gray-200 rounded-lg p-2.5">
                                                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                                                    {it.color_name} {it.color_number} · {it.quantity_fulfilled} / {it.quantity_required}
                                                                </p>
                                                                <div className="space-y-1">
                                                                    {it.fulfillment_log.map(log => {
                                                                        const logKey = billKey(log.fulfilled_item_name, log.fulfilled_color_name, log.fulfilled_color_number);
                                                                        const isBilled = billedKeys.has(logKey);
                                                                        const isIssued = !!log.issue_id;
                                                                        return (
                                                                        <div key={log.id} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded text-[11px]">
                                                                            <span className="truncate">
                                                                                <span className="bg-gray-200 text-gray-700 px-1 rounded mr-1">{log.quantity_fulfilled}×</span>
                                                                                {log.fulfilled_color_name} {log.fulfilled_color_number}
                                                                                {log.used_substitute && <span className="text-purple-600 font-bold ml-1.5 bg-purple-50 px-1 rounded">sub</span>}
                                                                                {isBilled && !isIssued && <span className="text-amber-700 font-bold ml-1.5 bg-amber-50 border border-amber-200 px-1 rounded">billed</span>}
                                                                            </span>
                                                                            {isIssued ? (
                                                                                <span
                                                                                    className="text-green-700 font-bold bg-green-50 border border-green-200 px-1.5 py-0.5 rounded whitespace-nowrap"
                                                                                    title="Custody transferred — this allocation went out on a signed issue slip and can no longer be reverted"
                                                                                >
                                                                                    handed over{log.issue_number ? ` · ${log.issue_number}` : ''}
                                                                                </span>
                                                                            ) : (
                                                                            <button
                                                                                onClick={() => handleRevertFulfillment(log.id)}
                                                                                disabled={isBilled}
                                                                                className={`p-1 rounded transition-colors ${isBilled ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:text-white hover:bg-red-500'}`}
                                                                                title={isBilled ? 'Cannot revert — this variant has been billed' : 'Undo this allocation (no stock moves)'}>
                                                                                <LuTrash2 size={11} />
                                                                            </button>
                                                                            )}
                                                                        </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            )}
            
            {/* Existing Fulfillment Modal */}
            {modalState.isOpen && (
                <FulfillmentModal item={modalState.item} sopId={orderInfo?.sopId} onClose={() => { setModalState({ isOpen: false, item: null }); setFulfillErr(null); }} onSubmit={handleFulfillmentSubmit} apiError={fulfillErr} />
            )}

            <ReferenceDataModal isOpen={refModalOpen} onClose={() => setRefModalOpen(false)} orderId={orderId} />
            <BarcodePrintModal isOpen={barcodeModalOpen} onClose={() => setBarcodeModalOpen(false)} batchId={orderInfo?.batchId} />

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

            {/* Portal-rendered override popover — escapes intent-card overflow-hidden and right-pane overflow-auto */}
            {popoverAnchor && (() => {
                const item = items.find(it => it.id === popoverAnchor.itemId);
                if (!item) return null;
                const plan         = getEffectivePlan(item);
                const isOverridden = !!overrides[item.id];
                const altSubs      = item.substitutes || [];
                const exactStock     = Number(item.available_stock || 0);
                const exactReserved  = reservedOf(item);
                const exactEffective = effectiveStockOf(item);
                const exactAvail     = exactStock > 0;
                const remaining      = Math.max(0, item.quantity_required - item.quantity_fulfilled);
                // Position: prefer below the chip; flip above when popover would clip viewport.
                const POPOVER_W = 288;        // w-72
                const POPOVER_H_EST = 280;    // safe upper bound for estimate
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const wantBelow  = popoverAnchor.rect.bottom + 4 + POPOVER_H_EST < vh;
                const top   = wantBelow ? popoverAnchor.rect.bottom + 4 : Math.max(8, popoverAnchor.rect.top - POPOVER_H_EST - 4);
                const left  = Math.min(Math.max(8, popoverAnchor.rect.left), vw - POPOVER_W - 8);
                return createPortal(
                    <div
                        ref={popoverRef}
                        style={{ position: 'fixed', top, left, width: POPOVER_W }}
                        className="z-[1000] bg-white border border-gray-200 rounded-lg shadow-2xl p-2 space-y-1"
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div className="flex items-baseline justify-between gap-2 px-1 py-0.5">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                Override variant · {item.color_name} {item.color_number}
                            </p>
                            <p className="text-[9px] text-gray-400">need {remaining}</p>
                        </div>
                        {/* Exact option */}
                        <button
                            onClick={() => handlePickOverride(item, { __isExact: true })}
                            disabled={!exactAvail}
                            title={exactReserved > 0 ? `Raw ${exactStock} · ${exactReserved} reserved → ${exactEffective} net` : `Raw ${exactStock}`}
                            className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${plan.decision === 'exact' ? 'bg-blue-50' : ''}`}
                        >
                            <span className="flex items-center gap-1 min-w-0">
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-blue-100 text-blue-700">Exact</span>
                                <span className="font-bold text-gray-800 truncate">{item.color_name} {item.color_number}</span>
                                {exactEffective < remaining && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700">⚠ over</span>
                                )}
                            </span>
                            <span className="flex items-baseline gap-1.5 shrink-0 font-mono">
                                <span className={exactAvail ? 'text-gray-700' : 'text-gray-400'}>{exactStock}</span>
                                {exactReserved > 0 && (
                                    <span className={`text-[9px] ${exactEffective < remaining ? 'text-amber-700 font-bold' : 'text-emerald-700'}`}>
                                        net {exactEffective}
                                    </span>
                                )}
                            </span>
                        </button>
                        {/* Substitute options */}
                        {altSubs.length === 0 ? (
                            <p className="px-2 py-1 text-[10px] text-gray-400 italic">No substitutes available.</p>
                        ) : altSubs.map(sub => {
                            const subId      = sub.substitute_variant_id || sub.id;
                            const subRaw     = Number(sub.available_stock || 0);
                            const subRes     = reservedOf(sub);
                            const subNet     = effectiveStockOf(sub);
                            const isCurrent  = String(plan.fulfilling_variant_id) === String(subId);
                            const isOverRes  = subNet < remaining && subRaw > 0;
                            return (
                                <button
                                    key={subId}
                                    onClick={() => handlePickOverride(item, sub)}
                                    disabled={subRaw <= 0}
                                    title={subRes > 0 ? `Raw ${subRaw} · ${subRes} reserved → ${subNet} net` : `Raw ${subRaw}`}
                                    className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${isCurrent ? 'bg-purple-50' : ''}`}
                                >
                                    <span className="flex items-center gap-1 min-w-0">
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-purple-100 text-purple-700">Sub</span>
                                        <span className="font-bold text-gray-800 truncate">{sub.color_name} {sub.color_number}</span>
                                        {isOverRes && (
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700">⚠ over</span>
                                        )}
                                    </span>
                                    <span className="flex items-baseline gap-1.5 shrink-0 font-mono">
                                        <span className={subRaw > 0 ? 'text-gray-700' : 'text-gray-400'}>{subRaw}</span>
                                        {subRes > 0 && (
                                            <span className={`text-[9px] ${isOverRes ? 'text-amber-700 font-bold' : 'text-emerald-700'}`}>
                                                net {subNet}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                        <div className="flex items-center justify-between gap-2 px-2 pt-1 mt-1 border-t border-gray-100">
                            {isOverridden ? (
                                <button onClick={() => handleResetOverride(item.id)} className="text-[10px] text-amber-700 font-bold hover:underline">Reset to plan</button>
                            ) : <span />}
                            <button onClick={() => { setPopoverAnchor(null); handleFulfillClick(item); }} className="text-[10px] text-blue-600 font-bold hover:underline">Open full dialog…</button>
                        </div>
                    </div>,
                    document.body
                );
            })()}

        </div>
    );
};

export default TrimOrderDetailPage;
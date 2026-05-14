import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import {
    LuPackage, LuTriangleAlert, LuRefreshCw,
    LuReplace, LuArrowLeft, LuListOrdered, LuCircleCheck, LuWand,
    LuTrash2, LuFileText, LuBookOpen, LuScissors, LuTag, LuPrinter, LuDownload, LuX
} from 'react-icons/lu';
import { Loader2, Info } from 'lucide-react';
import { storeManagerApi } from '../../api/storeManagerApi';
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
                                            <th className="py-3 px-5 border-b text-center">Req. Qty / Pc</th>
                                            <th className="py-3 px-5 border-b">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {data.bom.length > 0 ? data.bom.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="py-3 px-5 font-semibold text-gray-800">{item.item_name}</td>
                                                <td className="py-3 px-5 text-center font-mono font-bold text-indigo-600 bg-indigo-50/30">{parseFloat(item.quantity_per_piece).toFixed(4)}</td>
                                                <td className="py-3 px-5 text-sm text-gray-500 italic">{item.notes || '-'}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="3" className="py-10 text-center text-gray-400">No BOM data found for this product.</td></tr>
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
                                                <td className="py-3 px-5 text-sm text-gray-600 font-medium">{cut.color_name || 'N/A'}</td>
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
const FulfillmentModal = ({ item, onClose, onSubmit }) => {
    const fulfillmentOptions = [
        ...(item.available_stock > 0 ? [{ ...item, id: item.trim_item_variant_id, is_substitute: false }] : []),
        ...(item.substitutes || []).map(sub => ({ ...sub, id: sub.substitute_variant_id, is_substitute: true }))
    ];

    const remainingRequired = item.quantity_required - item.quantity_fulfilled;
    const [selectedVariantId, setSelectedVariantId] = useState(fulfillmentOptions[0]?.id || '');
    const [quantity, setQuantity] = useState(remainingRequired);

    const selectedOption = fulfillmentOptions.find(opt => opt.id === selectedVariantId);
    const maxAllowed = selectedOption ? Math.min(remainingRequired, selectedOption.available_stock) : 0;

    const handleSubmit = () => {
        if (!selectedOption) return alert("Please select an item to fulfill with.");
        if (isNaN(quantity) || quantity <= 0) return alert("Invalid quantity. Please enter a number greater than 0.");
        if (quantity > maxAllowed) return alert(`Error: Quantity cannot be greater than the available stock (${selectedOption.available_stock}) or remaining required (${remainingRequired}).`);
        
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
                                            <span>{option.color_name}</span>
                                            <span className="bg-gray-100 px-2 rounded">Stock: {option.available_stock}</span>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="fulfill-quantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Fulfill (Remaining: {remainingRequired})</label>
                        <input type="number" id="fulfill-quantity" value={quantity} onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)} className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold" min="1" max={maxAllowed} />
                    </div>
                </div>
                <div className="px-6 py-4 bg-white border-t flex justify-end space-x-3">
                    <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md">Confirm Fulfillment</button>
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
    if (decision === 'exact')        return { key: 'exact',        label: 'Exact match',                                                       color: 'green',  order: 0 };
    if (decision === 'fulfilled')    return { key: 'fulfilled',    label: 'Already fulfilled',                                                 color: 'gray',   order: 4 };
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
    const [refModalOpen, setRefModalOpen] = useState(false);
    const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);

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

    const fetchDetails = useCallback(async () => {
        setIsLoading(true); 
        setError(null);
        try {
            const response = await storeManagerApi.getTrimOrderDetails(orderId);
            console.log("Order Details Response:", response.data);
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
            alert(res.data.message);
            fetchDetails();
        } catch (err) {
            alert(`Failed: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillAllSubs = async () => {
        if (!window.confirm(`Auto-fulfill ${substituteFulfillableItems.length} items using available substitutes?`)) return;
        setIsFulfillingAll(true);
        try {
            const res = await storeManagerApi.autoFulfillSubstitutes(orderId);
            alert(res.data.message);
            fetchDetails();
        } catch (err) {
            alert(`Failed: ${err.response?.data?.error || 'Server error'}`);
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

    // ── Group items by trim_item_name (= one card in the left pane) ──────────
    const trimItemGroups = useMemo(() => {
        const map = new Map();
        items.forEach(it => {
            const key = it.item_name || `#${it.trim_item_variant_id}`;
            if (!map.has(key)) map.set(key, { name: key, items: [] });
            map.get(key).items.push(it);
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

    // Selected trim item → group its variants by fulfillment intent
    const selectedTrimGroup = trimItemGroups.find(g => g.name === selectedTrimName) || null;
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
        if (fulfillable.length === 0) { alert('Nothing to fulfill in this group.'); return; }

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
            if (failures > 0) alert(`Completed with ${failures} failure${failures === 1 ? '' : 's'}. Check the console for details.`);
            await fetchDetails();
        } finally {
            setBulkBusyKey(null);
            setIsFulfillingAll(false);
        }
    };

    const handleFulfillClick = (item) => setModalState({ isOpen: true, item: item });

    const handleFulfillmentSubmit = async (fulfillmentData) => {
        setIsFulfillingAll(true);   // keep the page-level spinner off so scroll position survives the refresh
        try {
            await storeManagerApi.fulfillWithVariant(fulfillmentData);
            setModalState({ isOpen: false, item: null });
            await fetchDetails();
        } catch (err) {
            alert(`Fulfillment failed: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsFulfillingAll(false);
        }
    };

    const handleRevertFulfillment = async (logId) => {
        if (!window.confirm("Are you sure you want to remove this fulfillment? The items will be returned to inventory and you will need to fulfill this again.")) return;
        setIsReverting(true);
        try {
            await storeManagerApi.revertFulfillment(logId);
            fetchDetails();
        } catch (err) {
            alert(`Failed to revert: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsReverting(false);
        }
    };
    
    const handleRecheck = async () => {
        setIsFulfillingAll(true);   // keep page-level spinner off so scroll position survives
        try {
            const response = await storeManagerApi.recheckMissingItems(orderId);
            alert(response.data.message);
            await fetchDetails();
        } catch (err) {
            alert(`Re-check failed: ${err.response?.data?.error || 'Server error'}`);
        } finally {
            setIsFulfillingAll(false);
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
                            <div className="flex items-center gap-3 mb-3">
                                <h1 className="text-2xl font-extrabold text-gray-900">Trim Order #{orderId}</h1>
                                {orderInfo?.status && (
                                    <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${orderInfo.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                        {orderInfo.status}
                                    </span>
                                )}
                            </div>
                            
                            {orderInfo && (
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 bg-gray-50 border border-gray-100 p-3 rounded-lg inline-flex">
                                    <div className="flex items-center">
                                        <span className="font-bold text-gray-400 uppercase text-[10px] tracking-wider mr-2">Batch:</span> 
                                        <span className="font-semibold text-gray-800">
                                            #{orderInfo.batchId} 
                                            {orderInfo.batch_code && <span className="ml-1 text-gray-500">({orderInfo.batch_code})</span>}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-end gap-3 shrink-0 mt-2 md:mt-0">
                            {/* ✅ NEW BUTTON: Opens Reference Modal */}
                            <button 
                                onClick={() => setRefModalOpen(true)}
                                className="px-5 py-2.5 bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 hover:border-gray-400 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center"
                            >
                                <Info className="mr-2 h-5 w-5 text-gray-500" /> 
                                View Ref & BOM
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
                                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-green-700 transition-colors flex items-center disabled:opacity-70">
                                        {isFulfillingAll ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1"/> : <LuCircleCheck className="mr-1 h-3.5 w-3.5"/>}
                                        Auto-Fulfill {exactFulfillableItems.length} Exact
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[60vh]">
                            {(isFulfillingAll || isReverting) && (
                                <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                                    <div className="bg-white px-6 py-3 rounded-xl shadow-lg border flex items-center font-bold text-blue-700">
                                        <Loader2 className="animate-spin h-5 w-5 mr-3"/> Processing operation…
                                    </div>
                                </div>
                            )}

                            {/* LEFT PANE — trim item cards */}
                            <div className="lg:col-span-4 lg:border-r border-gray-200 flex flex-col min-h-0">
                                <div className="p-3 border-b border-gray-100 space-y-2">
                                    <div className="relative">
                                        <input type="search" placeholder="Search trim items…"
                                            value={search} onChange={e => setSearch(e.target.value)}
                                            className="w-full pl-3 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400" />
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {[
                                            { key: 'all',          label: 'All',          color: 'gray'    },
                                            { key: 'ready',        label: 'Ready',        color: 'green'   },
                                            { key: 'sub',          label: 'Substitute',   color: 'purple'  },
                                            { key: 'insufficient', label: 'Insufficient', color: 'red'     },
                                            { key: 'fulfilled',    label: 'Fulfilled',    color: 'emerald' },
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
                                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
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
                                                {/* Aggregate progress bar — proportional segments per intent */}
                                                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mb-1.5">
                                                    {c.fulfilled    > 0 && <div className="bg-emerald-500" style={{ width: `${(c.fulfilled    / group.total) * 100}%` }} />}
                                                    {c.exact        > 0 && <div className="bg-green-500"   style={{ width: `${(c.exact        / group.total) * 100}%` }} />}
                                                    {c.substitute   > 0 && <div className="bg-purple-500"  style={{ width: `${(c.substitute   / group.total) * 100}%` }} />}
                                                    {c.insufficient > 0 && <div className="bg-red-500"     style={{ width: `${(c.insufficient / group.total) * 100}%` }} />}
                                                </div>
                                                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                                                    {c.exact        > 0 && <span className="text-green-700">{c.exact} ready</span>}
                                                    {c.substitute   > 0 && <span className="text-purple-700">{c.substitute} sub</span>}
                                                    {c.insufficient > 0 && <span className="text-red-700">{c.insufficient} short</span>}
                                                    {c.fulfilled    > 0 && <span className="text-emerald-700">{c.fulfilled} done</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* RIGHT PANE — intent groups for the selected trim item */}
                            <div className="lg:col-span-8 flex flex-col min-h-0">
                                {!selectedTrimGroup ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-400 italic p-8">
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
                                            {/* Quantity summary across this trim item */}
                                            {(() => {
                                                const totalRequired  = selectedTrimGroup.items.reduce((s, it) => s + Number(it.quantity_required  || 0), 0);
                                                const totalFulfilled = selectedTrimGroup.items.reduce((s, it) => s + Number(it.quantity_fulfilled || 0), 0);
                                                const remaining      = Math.max(0, totalRequired - totalFulfilled);
                                                const pct            = totalRequired > 0 ? Math.round((totalFulfilled / totalRequired) * 100) : 0;
                                                return (
                                                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Required (qty)</p>
                                                            <p className="text-base font-extrabold text-gray-900 tabular-nums">{totalRequired.toLocaleString()}</p>
                                                        </div>
                                                        <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Fulfilled (qty)</p>
                                                            <p className="text-base font-extrabold text-emerald-700 tabular-nums">{totalFulfilled.toLocaleString()}</p>
                                                            <p className="text-[10px] text-gray-500">{pct}% of required</p>
                                                        </div>
                                                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Remaining (qty)</p>
                                                            <p className={`text-base font-extrabold tabular-nums ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{remaining.toLocaleString()}</p>
                                                        </div>
                                                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Variants fulfilled</p>
                                                            <p className="text-base font-extrabold text-gray-900 tabular-nums">{selectedTrimGroup.counts.fulfilled} <span className="text-xs font-bold text-gray-400">/ {selectedTrimGroup.total}</span></p>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

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

                                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                                                                    className={`flex items-center gap-1.5 text-xs font-bold text-white ${group.color === 'green' ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'} disabled:opacity-50 px-3 py-1.5 rounded-lg shadow-sm transition`}>
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
                                                                        className={`group inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold transition ${isFulfilledRow ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default' : 'bg-white text-gray-800 border-gray-200 hover:border-blue-300'} ${isOverridden ? 'ring-1 ring-amber-300' : ''} ${overReserved ? 'ring-1 ring-amber-400 bg-amber-50' : ''} ${isOpen ? 'ring-2 ring-blue-400' : ''}`}>
                                                                        <span className={isFulfilledRow ? 'text-emerald-700' : 'text-gray-500'}>{item.color_name || 'AGNOSTIC'}</span>
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
                                                                    {it.fulfillment_log.map(log => (
                                                                        <div key={log.id} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded text-[11px]">
                                                                            <span className="truncate">
                                                                                <span className="bg-gray-200 text-gray-700 px-1 rounded mr-1">{log.quantity_fulfilled}×</span>
                                                                                {log.fulfilled_color_name} {log.fulfilled_color_number}
                                                                                {log.used_substitute && <span className="text-purple-600 font-bold ml-1.5 bg-purple-50 px-1 rounded">sub</span>}
                                                                            </span>
                                                                            <button onClick={() => handleRevertFulfillment(log.id)}
                                                                                className="text-red-400 hover:text-white hover:bg-red-500 p-1 rounded transition-colors"
                                                                                title="Undo this specific fulfillment">
                                                                                <LuTrash2 size={11} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
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
                <FulfillmentModal item={modalState.item} onClose={() => setModalState({ isOpen: false, item: null })} onSubmit={handleFulfillmentSubmit} />
            )}

            <ReferenceDataModal isOpen={refModalOpen} onClose={() => setRefModalOpen(false)} orderId={orderId} />
            <BarcodePrintModal isOpen={barcodeModalOpen} onClose={() => setBarcodeModalOpen(false)} batchId={orderInfo?.batchId} />

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
                            className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${plan.decision === 'exact' ? 'bg-green-50' : ''}`}
                        >
                            <span className="flex items-center gap-1 min-w-0">
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-green-100 text-green-700">Exact</span>
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
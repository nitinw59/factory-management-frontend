import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Truck, Search, CheckCircle, X, 
    FileText, ShieldCheck, 
    Loader2, AlertCircle, ChevronDown, Eye, Box,
    ShoppingBag, ChevronRight
} from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';
import DispatchReceiptDocument from './DispatchReceiptDocument';

// ==========================================
// SHARED COMPONENTS
// ==========================================
const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-rose-600 bg-rose-50 rounded-xl border border-rose-100 font-medium flex items-center justify-center space-x-2"><AlertCircle size={20} /><span>{message}</span></div>;

const Modal = ({ title, onClose, children, maxWidth = "max-w-4xl" }) => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
        <div className={`bg-white sm:rounded-2xl shadow-2xl w-full ${maxWidth} overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-t-2xl`}>
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
                <h3 className="font-bold text-base sm:text-lg text-slate-800 flex items-center space-x-2 truncate">
                    <Truck className="text-blue-600 shrink-0" size={20} />
                    <span className="truncate">{title}</span>
                </h3>
                <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors shrink-0">
                    <X size={20} />
                </button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-6 pb-8 sm:pb-6">
                {children}
            </div>
        </div>
    </div>
);

const BatchStatusGroup = ({ title, count, headerBg, countBg, countText, children, isOpen, onToggle }) => (
    <div className="mb-6 sm:mb-8 rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-slate-50/50">
        <div 
            onClick={onToggle}
            className={`flex items-center justify-between p-4 cursor-pointer transition-colors select-none ${headerBg} border-b border-slate-100`}
        >
            <div className="flex items-center space-x-3">
                <div className={`p-1.5 rounded-lg bg-white/80 shadow-sm border border-slate-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-4 h-4 text-slate-500"/>
                </div>
                <h3 className="font-bold text-slate-700 text-base sm:text-lg flex items-center tracking-tight">{title}</h3>
            </div>
            <span className={`px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-full ${countBg} ${countText} shadow-sm`}>{count}</span>
        </div>
        {isOpen && (
            <div className="p-4 sm:p-6 animate-in slide-in-from-top-4 duration-300 ease-out">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {children}
                </div>
            </div>
        )}
    </div>
);

// ==========================================
// PARTIAL DISPATCH FORM MODAL
// ==========================================
const DispatchFormModal = ({ batch, onClose, onSuccess }) => {
    const [rolls, setRolls] = useState([]);
    const [inputs, setInputs] = useState({});
    const [closeBatch, setCloseBatch] = useState(false); 
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showWarning, setShowWarning] = useState(false);

    useEffect(() => {
        const fetchRolls = async () => {
            setIsLoading(true);
            try {
                const res = await dispatchManagerApi.getRollDetailsForBatch(batch.real_batch_id);
                const rollData = Array.isArray(res.data?.data) ? res.data.data : [];
                
                const validRolls = rollData.filter(r => r.remainingPieces > 0);
                const initial = {};
                validRolls.forEach(r => { initial[r.rollId] = 0; });
                
                setRolls(validRolls);
                setInputs(initial);
            } catch (err) {
                setError("Failed to fetch roll cut details.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchRolls();
    }, [batch.id, batch.real_batch_id]);

    const handleInputChange = (rollId, val, max) => {
        const num = parseInt(val) || 0;
        setInputs(prev => ({ ...prev, [rollId]: Math.min(Math.max(num, 0), max) }));
    };

    const setMaxQuantities = () => {
        const maxed = {};
        rolls.forEach(r => maxed[r.rollId] = r.remainingPieces);
        setInputs(maxed);
    };

    const handleSubmit = async () => {
        setShowWarning(false);
        setIsSubmitting(true);
        try {
            const payload = {
                batchId: batch.real_batch_id,
                dispatchedRolls: rolls.map(r => ({ ...r, dispatchedPieces: inputs[r.rollId] })).filter(r => r.dispatchedPieces > 0),
                closeBatch: closeBatch
            };
            
            if(payload.dispatchedRolls.length === 0 && !closeBatch) {
                alert("Cannot submit an empty dispatch without closing the batch.");
                setIsSubmitting(false);
                return;
            }

            const response = await dispatchManagerApi.submitDispatch(payload);
            const generatedReceipt = {
                ...batch,
                dispatchDate: response.data.dispatchDate,
                receiptId: response.data.receiptId,
                rolls: payload.dispatchedRolls
            };
            
            onSuccess(generatedReceipt);
        } catch (err) {
            setError("Failed to finalize dispatch process.");
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <Modal title={`Loading Details: ${batch.id}`} onClose={onClose}><Spinner /></Modal>;
    if (error) return <Modal title="Error" onClose={onClose}><ErrorDisplay message={error} /></Modal>;

    const totalRemaining = rolls.reduce((sum, r) => sum + parseInt(r.remainingPieces || 0, 10), 0);
    const totalNowDispatching = rolls.reduce((sum, r) => sum + parseInt(inputs[r.rollId] || 0, 10), 0);

    return (
        <Modal title={`Dispatch Process: ${batch.id}`} onClose={onClose} maxWidth="max-w-4xl">
            <div className="space-y-4 sm:space-y-6">
                {/* Header Information */}
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-0">
                    <div>
                        <p className="text-[10px] sm:text-xs font-bold text-blue-400 uppercase tracking-wider mb-0.5 sm:mb-1">Client</p>
                        <p className="text-base sm:text-lg font-bold text-blue-900 truncate">{batch.client}</p>
                    </div>
                    <div className="sm:text-right">
                        <p className="text-[10px] sm:text-xs font-bold text-blue-400 uppercase tracking-wider mb-0.5 sm:mb-1">Style</p>
                        <p className="text-sm sm:text-md font-medium text-blue-900 truncate">{batch.style}</p>
                    </div>
                </div>

                {!showPreview ? (
                    <>
                        {/* Title and Auto-fill Button */}
                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-3 sm:gap-0 mb-2">
                            <h4 className="font-bold text-sm sm:text-base text-slate-700">Enter Quantities to Dispatch</h4>
                            <button onClick={setMaxQuantities} className="w-full sm:w-auto text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-2 sm:py-1.5 rounded-lg border border-blue-100 transition-colors">
                                Dispatch All Remaining
                            </button>
                        </div>

                        {/* --- MOBILE FRIENDLY INPUT LIST --- */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-slate-50/30">
                            {/* Desktop Table Header (Hidden on Mobile) */}
                            <div className="hidden md:grid grid-cols-12 gap-4 p-3 bg-slate-100 text-slate-600 border-b border-slate-200 text-xs uppercase tracking-wider font-semibold">
                                <div className="col-span-2">Roll ID</div>
                                <div className="col-span-3">Color</div>
                                <div className="col-span-2 text-center">Total Cut</div>
                                <div className="col-span-1 text-center text-emerald-600">Prev.</div>
                                <div className="col-span-2 text-center text-amber-600">Rem.</div>
                                <div className="col-span-2 text-right text-blue-600">Dispatching</div>
                            </div>
                            
                            {/* List of Rolls (Cards on Mobile, Rows on Desktop) */}
                            <div className="divide-y divide-slate-100">
                                {rolls.map((roll, idx) => (
                                    <div key={idx} className="flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 p-4 md:p-3 hover:bg-white transition-colors md:items-center">
                                        
                                        {/* Mobile Header: Roll & Color */}
                                        <div className="flex justify-between items-start md:col-span-5 md:hidden mb-1 border-b border-slate-100 pb-2">
                                            <span className="font-bold text-slate-800">{roll.rollId}</span>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-600">{roll.color} ({roll.colorNumber})</span>
                                        </div>

                                        {/* Desktop Only: Roll & Color */}
                                        <div className="hidden md:block col-span-2 font-medium text-slate-800 text-sm truncate" title={roll.rollId}>{roll.rollId}</div>
                                        <div className="hidden md:block col-span-3 text-xs">
                                            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 truncate max-w-full inline-block">{roll.color} ({roll.colorNumber})</span>
                                        </div>

                                        {/* Stats Row (Grid on Mobile, Columns on Desktop) */}
                                        <div className="grid grid-cols-3 gap-2 md:contents text-xs md:text-sm">
                                            <div className="bg-slate-50 md:bg-transparent p-2 md:p-0 rounded-lg text-center flex flex-col md:block md:col-span-2">
                                                <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5 md:hidden">Cut</span>
                                                <span className="text-slate-500 font-medium">{roll.cutPieces}</span>
                                            </div>
                                            <div className="bg-emerald-50 md:bg-transparent p-2 md:p-0 rounded-lg text-center flex flex-col md:block md:col-span-1">
                                                <span className="text-[10px] text-emerald-600/70 uppercase tracking-wider mb-0.5 md:hidden">Prev</span>
                                                <span className="font-bold text-emerald-600">{roll.alreadyDispatched}</span>
                                            </div>
                                            <div className="bg-amber-50 md:bg-transparent p-2 md:p-0 rounded-lg text-center flex flex-col md:block md:col-span-2">
                                                <span className="text-[10px] text-amber-600/70 uppercase tracking-wider mb-0.5 md:hidden">Rem</span>
                                                <span className="font-bold text-amber-600">{roll.remainingPieces}</span>
                                            </div>
                                        </div>

                                        {/* Input Field */}
                                        <div className="mt-2 md:mt-0 md:col-span-2 md:text-right flex items-center justify-between md:justify-end border-t border-slate-100 md:border-t-0 pt-3 md:pt-0">
                                            <span className="text-xs font-bold text-blue-600 uppercase md:hidden">Dispatch Qty:</span>
                                            <input 
                                                type="number" min="0" max={roll.remainingPieces}
                                                value={inputs[roll.rollId] !== undefined ? inputs[roll.rollId] : ''}
                                                onChange={(e) => handleInputChange(roll.rollId, e.target.value, roll.remainingPieces)}
                                                className="w-24 md:w-full text-right px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-blue-700 bg-white shadow-sm"
                                            />
                                        </div>
                                    </div>
                                ))}
                                {rolls.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">All rolls for this batch have been completely dispatched.</div>}
                            </div>
                            
                            {/* Totals Footer */}
                            <div className="bg-slate-100/50 border-t-2 border-slate-200 p-4 flex justify-between items-center md:grid md:grid-cols-12 md:gap-4 md:p-3">
                                <div className="md:col-span-7 font-bold text-slate-600 uppercase text-[10px] sm:text-xs tracking-wider text-left md:text-right">Totals:</div>
                                <div className="hidden md:block col-span-2 text-center font-bold text-amber-600 text-sm">{totalRemaining}</div>
                                <div className="md:col-span-3 text-right font-black text-blue-700 text-lg sm:text-xl">
                                    <span className="text-[10px] text-slate-500 mr-2 md:hidden">Disp:</span>
                                    {totalNowDispatching}
                                </div>
                            </div>
                        </div>

                        {/* Force Close Toggle */}
                        <div className="bg-amber-50 border border-amber-200 p-3 sm:p-4 rounded-xl flex items-start space-x-3 transition-colors hover:bg-amber-100/50">
                            <input 
                                type="checkbox" 
                                id="closeBatch" 
                                checked={closeBatch} 
                                onChange={(e) => setCloseBatch(e.target.checked)}
                                className="mt-1 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer shrink-0" 
                            />
                            <div>
                                <label htmlFor="closeBatch" className="font-bold text-amber-900 block cursor-pointer text-sm sm:text-base">Mark Batch as Completed (Close Short)</label>
                                <p className="text-[10px] sm:text-xs text-amber-700 mt-0.5 leading-snug">Check this if the remaining pieces are defective or rejected and this batch will have no further shipments.</p>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-slate-100">
                            <button onClick={onClose} className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-slate-100 text-slate-700 font-bold sm:font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                            <button 
                                onClick={() => setShowPreview(true)} 
                                disabled={totalNowDispatching === 0 && !closeBatch} 
                                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 text-sm shadow-md"
                            >
                                <span>Review Dispatch</span>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* PREVIEW & CONFIRM MODE */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h4 className="font-bold text-blue-900 mb-4 flex items-center text-sm sm:text-base"><Eye size={18} className="mr-2"/> Dispatch Summary Preview</h4>
                            <div className="space-y-2 sm:space-y-3">
                                {rolls.filter(r => inputs[r.rollId] > 0).map((roll, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-blue-100">
                                        <div className="flex flex-col sm:flex-row sm:items-center">
                                            <span className="font-bold text-slate-800 text-sm">{roll.rollId}</span>
                                            <span className="text-[10px] sm:text-xs text-slate-500 sm:ml-2">({roll.color}-{roll.colorNumber})</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-black text-blue-700 text-sm sm:text-base">{inputs[roll.rollId]} <span className="text-[10px] text-blue-400 font-normal">pcs</span></span>
                                        </div>
                                    </div>
                                ))}
                                {totalNowDispatching === 0 && <p className="text-xs sm:text-sm italic text-blue-600 font-medium p-3 bg-white rounded-lg border border-blue-100">No items are being shipped. Only closing batch.</p>}
                            </div>
                            <div className="mt-4 pt-4 border-t border-blue-200 flex justify-between items-center font-bold text-blue-900">
                                <span className="uppercase text-[10px] sm:text-xs tracking-wider">Total Pieces Dispatched Today:</span>
                                <span className="text-lg sm:text-xl font-black">{totalNowDispatching}</span>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100">
                            <button 
                                onClick={() => setShowPreview(false)} 
                                disabled={isSubmitting}
                                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-slate-100 text-slate-700 font-bold sm:font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm disabled:opacity-50"
                            >
                                Back to Edit
                            </button>
                            <button 
                                onClick={() => setShowWarning(true)} 
                                disabled={isSubmitting} 
                                className="w-full sm:w-auto px-5 py-3 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 text-sm shadow-md"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle size={18} />}
                                <span>{isSubmitting ? 'Processing...' : 'Confirm & Submit'}</span>
                            </button>
                        </div>
                        
                        {/* FINAL WARNING MODAL OVERLAY */}
                        {showWarning && (
                            <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 sm:p-8 text-center animate-in zoom-in-95 duration-200 mb-4 sm:mb-0">
                                    <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 sm:mb-5 shadow-inner">
                                        <AlertCircle className="text-red-600 w-6 h-6 sm:w-8 sm:h-8" />
                                    </div>
                                    <h3 className="text-xl sm:text-2xl font-black text-slate-800 mb-2 sm:mb-3 tracking-tight">Final Confirmation</h3>
                                    <p className="text-red-600 font-bold text-xs sm:text-sm bg-red-50 p-3 sm:p-4 rounded-xl border border-red-100 mb-6 sm:mb-8 leading-relaxed">
                                        THIS RECEIPT CAN BE GENERATED ONLY ONCE AND CANNOT BE MODIFIED
                                    </p>
                                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                        <button 
                                            onClick={() => setShowWarning(false)} 
                                            className="w-full sm:flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleSubmit} 
                                            className="w-full sm:flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-red-600/20"
                                        >
                                            Generate
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

// ==========================================
// MAIN DASHBOARD
// ==========================================
export default function DispatchDashboardPage() {
    const [activeBatches, setActiveBatches] = useState([]);
    const [receiptHistory, setReceiptHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    const [dispatchingBatch, setDispatchingBatch] = useState(null);
    const [receiptView, setReceiptView] = useState(null);
    const [expandedSections, setExpandedSections] = useState({ READY: true, DISPATCHED: false });

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [dashRes, recRes] = await Promise.all([
                dispatchManagerApi.getDashboardData(),
                dispatchManagerApi.getAllReceipts()
            ]);
            setActiveBatches(dashRes.data?.data || dashRes.data || []);
            setReceiptHistory(recRes.data?.data || recRes.data || []);
        } catch (err) {
            setError("Failed to load dispatch dashboard.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleDispatchSuccess = (receiptData) => {
        setDispatchingBatch(null);
        setReceiptView(receiptData);
        loadData(); 
        setExpandedSections({ READY: false, DISPATCHED: true });
    };

    const handleViewReceipt = async (receiptId) => {
        setIsLoading(true);
        try {
            const res = await dispatchManagerApi.getReceiptDetails(receiptId);
            const receiptData = res.data?.data || res.data || {};
            setReceiptView(receiptData);
        } catch (err) {
            alert("Failed to fetch receipt data.");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSection = (section) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    
    const filteredBatches = useMemo(() => {
        const lower = searchQuery.toLowerCase();
        return activeBatches.filter(b => 
            b.id.toLowerCase().includes(lower) || 
            b.client.toLowerCase().includes(lower) || 
            b.style.toLowerCase().includes(lower) ||
            (b.po_code && b.po_code.toLowerCase().includes(lower))
        );
    }, [activeBatches, searchQuery]);

    const filteredReceipts = useMemo(() => {
        const lower = searchQuery.toLowerCase();
        return receiptHistory.filter(r => 
            r.receiptId.toLowerCase().includes(lower) || 
            r.batchId.toLowerCase().includes(lower) || 
            r.client.toLowerCase().includes(lower)
        );
    }, [receiptHistory, searchQuery]);


    if (receiptView) {
        return <DispatchReceiptDocument receipt={receiptView} onBack={() => setReceiptView(null)} />;
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
            
            {/* Mobile/Desktop Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-14 sm:h-16">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                            <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg shadow-sm"><Truck className="text-white w-4 h-4 sm:w-5 sm:h-5" /></div>
                            <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-800">Dispatch Portal</span>
                        </div>
                        <div className="flex items-center space-x-2 bg-emerald-50 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-emerald-100">
                            <ShieldCheck className="text-emerald-600 w-4 h-4 sm:w-5 sm:h-5" />
                            <div className="hidden sm:block text-sm">
                                <p className="font-bold text-emerald-900 leading-none">Auth User</p>
                                <p className="text-emerald-600/80 text-[10px] uppercase tracking-wider font-bold">Dispatch Officer</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8">
                
                {/* Search Bar & Title Area */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 sm:mb-8 gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight">Dispatch Queue</h1>
                        <p className="text-slate-500 text-xs sm:text-sm mt-1">Review, authorize, and generate multi-part receipts.</p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search ID, client, PO or style..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow placeholder:text-slate-400"
                        />
                    </div>
                </div>

                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="space-y-6 sm:space-y-8">
                        
                        {/* IN-PROGRESS BATCHES */}
                        <BatchStatusGroup 
                            title="Pending Dispatches" 
                            count={filteredBatches.length}
                            headerBg="bg-white hover:bg-slate-50"
                            countBg="bg-blue-100"
                            countText="text-blue-700"
                            isOpen={expandedSections.READY}
                            onToggle={() => toggleSection('READY')}
                        >
                            {filteredBatches.map(batch => {
                                const isPartial = batch.status === 'PARTIAL';
                                const percentage = Math.round((batch.totalDispatched / batch.totalPieces) * 100) || 0;

                                return (
                                    <div key={batch.id} className={`bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all border-t-[4px] sm:border-t-[6px] ${isPartial ? 'border-t-blue-400' : 'border-t-amber-400'}`}>
                                        <div className="p-4 sm:p-5 border-b border-slate-50">
                                            {batch.po_code && (
                                                <div className="mb-2 sm:mb-3">
                                                    <span className="inline-flex items-center text-[9px] sm:text-[10px] font-bold tracking-wide uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                        <ShoppingBag size={10} className="mr-1 shrink-0"/> <span className="truncate">ID: {batch.real_batch_id}</span>
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-start mb-2 sm:mb-3">
                                                <div className="bg-blue-50 text-blue-600 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-blue-200 flex items-center shadow-sm max-w-[70%]">
                                                    <Box size={14} className="mr-1.5 sm:mr-2 opacity-70 shrink-0" />
                                                    <span className="text-xs sm:text-sm font-bold font-mono tracking-tight truncate">CODE: {batch.po_code}</span>
                                                </div>
                                                <span className={`px-2 py-0.5 sm:px-3 sm:py-1 text-[9px] sm:text-[10px] uppercase font-bold tracking-wider rounded-full border shrink-0 ${isPartial ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                                    {isPartial ? 'Partial' : 'Ready'}
                                                </span>
                                            </div>
                                            <h2 className="font-bold text-base sm:text-lg text-slate-800 leading-tight mb-1 truncate">{batch.style}</h2>
                                            <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{batch.client}</p>
                                        </div>
                                        <div className="p-3 sm:p-4 bg-slate-50/50 flex-1">
                                            <div className="mb-2 sm:mb-3">
                                                <div className="flex justify-between text-[10px] sm:text-xs font-bold text-slate-500 mb-1">
                                                    <span>Dispatched</span>
                                                    <span>{batch.totalDispatched} / {batch.totalPieces}</span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-1.5 sm:h-2">
                                                    <div className="bg-blue-500 h-1.5 sm:h-2 rounded-full transition-all" style={{width: `${percentage}%`}}></div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-700">
                                                <span>Remaining:</span>
                                                <span className="text-amber-600 text-sm sm:text-base">{batch.remainingPieces} <span className="text-[10px] font-normal text-amber-600/70">pcs</span></span>
                                            </div>
                                        </div>
                                        <div className="p-3 sm:p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                                            <button 
                                                onClick={() => setDispatchingBatch(batch)}
                                                className="w-full px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-bold text-white rounded-xl flex items-center justify-center transition-all shadow-sm bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
                                            >
                                                <Truck className="mr-2 w-4 h-4 shrink-0"/> {isPartial ? 'Continue Dispatch' : 'Start Dispatch'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredBatches.length === 0 && <p className="text-xs sm:text-sm text-slate-400 col-span-full py-4 text-center">No batches waiting for dispatch.</p>}
                        </BatchStatusGroup>

                        {/* GENERATED RECEIPTS */}
                        <BatchStatusGroup 
                            title="Receipt History" 
                            count={filteredReceipts.length}
                            headerBg="bg-emerald-50/30 hover:bg-emerald-50/60"
                            countBg="bg-emerald-100"
                            countText="text-emerald-800"
                            isOpen={expandedSections.DISPATCHED}
                            onToggle={() => toggleSection('DISPATCHED')}
                        >
                            {filteredReceipts.map(receipt => (
                                <div key={receipt.receiptId} className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all border-t-[4px] sm:border-t-[6px] border-t-emerald-400">
                                    <div className="p-4 sm:p-5 border-b border-slate-50">
                                        <div className="flex justify-between items-start mb-2 sm:mb-3">
                                            <div className="bg-slate-100 text-slate-600 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 flex items-center shadow-sm max-w-full">
                                                <FileText size={14} className="mr-1.5 sm:mr-2 opacity-70 shrink-0" />
                                                <span className="text-xs sm:text-sm font-bold font-mono tracking-tight truncate">{receipt.receiptId}</span>
                                            </div>
                                        </div>
                                        <h2 className="font-bold text-sm sm:text-base text-slate-800 leading-tight mb-1 truncate" title={`ID: ${receipt.real_batch_id}`}>ID: {receipt.real_batch_id}</h2>
                                        <h4 className="font-bold text-sm sm:text-base text-slate-800 leading-tight mb-1 truncate" title={`CODE: ${receipt.batchId}`}>CODE: {receipt.batchId}</h4>
                                        <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{receipt.client} - {receipt.style}</p>
                                    </div>
                                    <div className="p-3 sm:p-4 bg-slate-50/50 flex-1">
                                         <div className="flex justify-between items-center text-xs sm:text-sm mb-1.5 sm:mb-2">
                                            <span className="text-slate-500">Dispatch Date:</span>
                                            <span className="font-bold text-slate-700">{receipt.dispatchDate}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs sm:text-sm">
                                            <span className="text-slate-500">Qty Shipped:</span>
                                            <span className="font-bold text-emerald-700">{receipt.totalDispatched} <span className="text-[10px] font-normal opacity-70">pcs</span></span>
                                        </div>
                                    </div>
                                    <div className="p-3 sm:p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                                        <button 
                                            onClick={() => handleViewReceipt(receipt.receiptId)}
                                            className="w-full px-4 py-2.5 sm:py-2.5 text-xs sm:text-sm font-bold text-slate-600 rounded-xl flex items-center justify-center transition-all bg-slate-100 hover:bg-slate-200 active:scale-[0.98]"
                                        >
                                            <Eye className="mr-2 w-4 h-4 shrink-0"/> View Receipt
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredReceipts.length === 0 && <p className="text-xs sm:text-sm text-slate-400 col-span-full py-4 text-center">No receipt history found.</p>}
                        </BatchStatusGroup>
                    </div>
                )}
            </main>

            {dispatchingBatch && (
                <DispatchFormModal 
                    batch={dispatchingBatch} 
                    onClose={() => setDispatchingBatch(null)} 
                    onSuccess={handleDispatchSuccess} 
                />
            )}
        </div>
    );
}
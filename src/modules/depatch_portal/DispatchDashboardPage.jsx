import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Truck, Search, CheckCircle, X, 
    FileText, ShieldCheck, 
    Loader2, AlertCircle, ChevronDown, Eye, Box,
    ShoppingBag, ChevronRight
} from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';

// IMPORT THE SHARED COMPONENT
import DispatchReceiptDocument from './DispatchReceiptDocument';

const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-rose-600 bg-rose-50 rounded-xl border border-rose-100 font-medium flex items-center justify-center space-x-2"><AlertCircle size={20} /><span>{message}</span></div>;

const Modal = ({ title, onClose, children, maxWidth = "max-w-4xl" }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
        <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} overflow-hidden flex flex-col max-h-[90vh]`}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800 flex items-center space-x-2">
                    <Truck className="text-blue-600" size={20} />
                    <span>{title}</span>
                </h3>
                <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                    <X size={20} />
                </button>
            </div>
            <div className="overflow-y-auto p-6">
                {children}
            </div>
        </div>
    </div>
);

const BatchStatusGroup = ({ title, count, headerBg, countBg, countText, children, isOpen, onToggle }) => (
    <div className="mb-8 rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-slate-50/50">
        <div 
            onClick={onToggle}
            className={`flex items-center justify-between p-4 cursor-pointer transition-colors select-none ${headerBg} border-b border-slate-100`}
        >
            <div className="flex items-center space-x-3">
                <div className={`p-1.5 rounded-lg bg-white/80 shadow-sm border border-slate-100 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-4 h-4 text-slate-500"/>
                </div>
                <h3 className="font-bold text-slate-700 text-lg flex items-center tracking-tight">{title}</h3>
            </div>
            <span className={`px-3 py-1 text-xs font-bold rounded-full ${countBg} ${countText} shadow-sm`}>{count}</span>
        </div>
        {isOpen && (
            <div className="p-6 animate-in slide-in-from-top-4 duration-300 ease-out">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    const [closeBatch, setCloseBatch] = useState(false); // Flag to forcefully complete batch
    
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
                
                // Only keep rolls that actually have remaining pieces
                const validRolls = rollData.filter(r => r.remainingPieces > 0);
                
                const initial = {};
                // Default input to 0, force user to type amount
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
        // Cap the input at the remaining amount
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
            
            if(payload.dispatchedRolls.length === 0) {
                alert("Cannot submit an empty dispatch.");
                setIsSubmitting(false);
                return;
            }

            const response = await dispatchManagerApi.submitDispatch(payload);
            console.log("Dispatch submission response:", response);
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
            <div className="space-y-6">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 flex justify-between items-center">
                    <div>
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Client</p>
                        <p className="text-lg font-bold text-blue-900">{batch.client}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Style</p>
                        <p className="text-md font-medium text-blue-900">{batch.style}</p>
                    </div>
                </div>

                {!showPreview ? (
                    <>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-slate-700">Enter Quantities to Dispatch Today</h4>
                            <button onClick={setMaxQuantities} className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                                Dispatch All Remaining
                            </button>
                        </div>
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                        <th className="p-3 font-semibold">Roll ID</th>
                                        <th className="p-3 font-semibold">Color</th>
                                        <th className="p-3 font-semibold text-center">Total Cut</th>
                                        <th className="p-3 font-semibold text-center text-emerald-600">Prev. Disp</th>
                                        <th className="p-3 font-semibold text-center text-amber-600">Remaining</th>
                                        <th className="p-3 font-semibold text-right w-40 text-blue-600">Now Dispatching</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rolls.map((roll, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-800">{roll.rollId}</td>
                                            <td className="p-3 text-slate-600"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 border border-slate-200">{roll.color}({roll.colorNumber})</span></td>
                                            <td className="p-3 text-center text-slate-500">{roll.cutPieces}</td>
                                            <td className="p-3 text-center font-medium text-emerald-600">{roll.alreadyDispatched}</td>
                                            <td className="p-3 text-center font-bold text-amber-600">{roll.remainingPieces}</td>
                                            <td className="p-3">
                                                <input 
                                                    type="number" min="0" max={roll.remainingPieces}
                                                    value={inputs[roll.rollId] !== undefined ? inputs[roll.rollId] : ''}
                                                    onChange={(e) => handleInputChange(roll.rollId, e.target.value, roll.remainingPieces)}
                                                    className="w-full text-right px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-blue-700 bg-white"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {rolls.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-slate-500 font-medium">All rolls for this batch have been completely dispatched.</td></tr>}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
                                        <td colSpan="4" className="p-3 text-right uppercase text-xs tracking-wider text-slate-500">Totals:</td>
                                        <td className="p-3 text-center text-amber-600">{totalRemaining}</td>
                                        <td className="p-3 text-right text-blue-700 text-lg">{totalNowDispatching}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {/* Force Close Toggle */}
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start space-x-3">
                            <input 
                                type="checkbox" 
                                id="closeBatch" 
                                checked={closeBatch} 
                                onChange={(e) => setCloseBatch(e.target.checked)}
                                className="mt-1 w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500" 
                            />
                            <div>
                                <label htmlFor="closeBatch" className="font-bold text-amber-900 block cursor-pointer">Mark Batch as Completed (Close Short)</label>
                                <p className="text-xs text-amber-700 mt-0.5">Check this if the remaining pieces are defective or rejected and this batch will have no further shipments.</p>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                            <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                            <button 
                                onClick={() => setShowPreview(true)} 
                                disabled={totalNowDispatching === 0 && !closeBatch} 
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center space-x-2 transition-colors disabled:opacity-50 text-sm shadow-md"
                            >
                                <span>Review Dispatch</span>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* PREVIEW & CONFIRM MODE */}
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 animate-in fade-in slide-in-from-right-4 duration-300">
                            <h4 className="font-bold text-blue-900 mb-4 flex items-center"><Eye size={18} className="mr-2"/> Dispatch Summary Preview</h4>
                            <div className="space-y-3">
                                {rolls.filter(r => inputs[r.rollId] > 0).map((roll, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-blue-100">
                                        <div>
                                            <span className="font-bold text-slate-800">{roll.rollId}</span>
                                            <span className="text-xs text-slate-500 ml-2">({roll.color}-{roll.colorNumber})</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-blue-700 text-base">{inputs[roll.rollId]} pcs</span>
                                        </div>
                                    </div>
                                ))}
                                {totalNowDispatching === 0 && <p className="text-sm italic text-blue-600">No items are being shipped. Only closing batch.</p>}
                            </div>
                            <div className="mt-4 pt-4 border-t border-blue-200 flex justify-between items-center font-bold text-blue-900">
                                <span className="uppercase text-sm tracking-wider">Total Pieces Dispatched Today:</span>
                                <span className="text-xl">{totalNowDispatching}</span>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                            <button 
                                onClick={() => setShowPreview(false)} 
                                disabled={isSubmitting}
                                className="px-5 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Back to Edit
                            </button>
                            <button 
                                onClick={() => setShowWarning(true)} 
                                disabled={isSubmitting} 
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle size={18} />}
                                <span>{isSubmitting ? 'Processing...' : 'Confirm & Submit'}</span>
                            </button>
                        </div>
                        
                        {/* FINAL WARNING MODAL OVERLAY */}
                        {showWarning && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in-95 duration-200">
                                    <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-5 shadow-inner">
                                        <AlertCircle className="text-red-600 w-8 h-8" />
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Final Confirmation</h3>
                                    <p className="text-red-600 font-bold bg-red-50 p-4 rounded-xl border border-red-100 mb-8 leading-relaxed">
                                        THIS RECEIPT CAN BE GENERATED ONLY ONCE AND CANNOT BE MODIFIED
                                    </p>
                                    <div className="flex gap-3 justify-center">
                                        <button 
                                            onClick={() => setShowWarning(false)} 
                                            className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleSubmit} 
                                            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-md shadow-red-600/20"
                                        >
                                            Generate Receipt
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

    // Load Active Batches AND Historical Receipts separately
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [dashRes, recRes] = await Promise.all([
                dispatchManagerApi.getDashboardData(),
                dispatchManagerApi.getAllReceipts()
            ]);
            setActiveBatches(dashRes.data?.data || dashRes.data || []);
            setReceiptHistory(recRes.data?.data || recRes.data || []);
            console.log("Dashboard data loaded:", dashRes.data);
            console.log("Receipt history loaded:", recRes.data);
        } catch (err) {
            console.error("Error loading dispatch data:", err);
            setError("Failed to load dispatch dashboard.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleDispatchSuccess = (receiptData) => {
        setDispatchingBatch(null);
        setReceiptView(receiptData);
        loadData(); // Refresh both lists to move items
        setExpandedSections({ READY: false, DISPATCHED: true });
    };

    const handleViewReceipt = async (receiptId) => {
        setIsLoading(true);
        try {
            // Note: Updated to pass the generated receiptId (e.g. REC-123)
            const res = await dispatchManagerApi.getReceiptDetails(receiptId);
            const receiptData = res.data?.data || res.data || {};
            setReceiptView(receiptData);
        } catch (err) {
            console.log("Error fetching receipt details:", err);
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
            b.style.toLowerCase().includes(lower)
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

 

    // --- VIEW SPECIFIC RECEIPT ---
    if (receiptView) {
        console.log("Viewing receipt:", receiptView);
        return <DispatchReceiptDocument receipt={receiptView} onBack={() => setReceiptView(null)} />;
    }

    // --- MAIN PORTAL RENDER ---
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
            
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center space-x-3">
                            <div className="bg-blue-600 p-2 rounded-lg shadow-sm"><Truck className="text-white" size={20} /></div>
                            <span className="font-bold text-xl tracking-tight text-slate-800">Dispatch Portal</span>
                        </div>
                        <div className="flex items-center space-x-3 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">
                            <ShieldCheck size={18} className="text-emerald-600" />
                            <div className="text-sm">
                                <p className="font-bold text-emerald-900">Auth User</p>
                                <p className="text-emerald-600/80 text-[10px] uppercase tracking-wider font-bold">Dispatch Officer</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dispatch Queue</h1>
                        <p className="text-slate-500 text-sm mt-1">Review, authorize, and generate multi-part dispatch receipts.</p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by ID, client or style..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                        />
                    </div>
                </div>

                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="space-y-6">
                        
                        {/* IN-PROGRESS BATCHES */}
                        <BatchStatusGroup 
                            title="Pending & Partial Dispatches" 
                            count={filteredBatches.length}
                            headerBg="bg-white hover:bg-slate-50"
                            countBg="bg-blue-100"
                            countText="text-blue-700"
                            isOpen={expandedSections.READY}
                            onToggle={() => toggleSection('READY')}
                        >
                            {filteredBatches.map(batch => {
                                const isPartial = batch.status === 'PARTIAL';
                                const percentage = Math.round((batch.totalDispatched / batch.totalPieces) * 100);

                                return (
                                    <div key={batch.id} className={`bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all border-t-[6px] ${isPartial ? 'border-t-blue-400' : 'border-t-amber-400'}`}>
                                        <div className="p-5 border-b border-slate-50">
                                            {batch.po_code && (
                                                <div className="mb-3">
                                                    <span className="inline-flex items-center text-[10px] font-bold tracking-wide uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                        <ShoppingBag size={10} className="mr-1"/> CODE: {batch.po_code}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center shadow-sm">
                                                    <Box size={14} className="mr-2 opacity-70" />
                                                    <span className="text-sm font-bold font-mono tracking-tight">ID: {batch.id}</span>
                                                </div>
                                                <span className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border ${isPartial ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                                                    {isPartial ? 'Partial' : 'Ready'}
                                                </span>
                                            </div>
                                            <h2 className="font-bold text-lg text-slate-800 leading-tight mb-1">{batch.style}</h2>
                                            <p className="text-sm text-slate-500 font-medium">{batch.client}</p>
                                        </div>
                                        <div className="p-4 bg-slate-50/50 flex-1">
                                            {/* Progress Bar for Partial Dispatch */}
                                            <div className="mb-3">
                                                <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                                                    <span>Dispatched</span>
                                                    <span>{batch.totalDispatched} / {batch.totalPieces}</span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2">
                                                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width: `${percentage}%`}}></div>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-sm font-bold text-slate-700">
                                                <span>Remaining:</span>
                                                <span className="text-amber-600">{batch.remainingPieces} pcs</span>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                                            <button 
                                                onClick={() => setDispatchingBatch(batch)}
                                                className="w-full px-4 py-2.5 text-sm font-bold text-white rounded-xl flex items-center justify-center transition-all shadow-sm bg-blue-600 hover:bg-blue-700 hover:shadow-md"
                                            >
                                                <Truck className="mr-2 w-4 h-4"/> {isPartial ? 'Continue Dispatch' : 'Start Dispatch'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {filteredBatches.length === 0 && <p className="text-sm text-slate-400 col-span-full py-4 text-center">No batches waiting for dispatch.</p>}
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
                                <div key={receipt.receiptId} className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all border-t-[6px] border-t-emerald-400">
                                    <div className="p-5 border-b border-slate-50">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center shadow-sm">
                                                <FileText size={14} className="mr-2 opacity-70" />
                                                <span className="text-sm font-bold font-mono tracking-tight">{receipt.receiptId}</span>
                                            </div>
                                        </div>
                                        <h2 className="font-bold text-base text-slate-800 leading-tight mb-1">ID: {receipt.real_batch_id}</h2>
                                        <h4 className="font-bold text-base text-slate-800 leading-tight mb-1">CODE: {receipt.batchId}</h4>
                                        <p className="text-sm text-slate-500 font-medium">{receipt.client} - {receipt.style}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50/50 flex-1">
                                         <div className="flex justify-between items-center text-sm mb-2">
                                            <span className="text-slate-500">Dispatch Date:</span>
                                            <span className="font-bold text-slate-700">{receipt.dispatchDate}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Qty Shipped:</span>
                                            <span className="font-bold text-emerald-700">{receipt.totalDispatched} pcs</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                                        <button 
                                            onClick={() => handleViewReceipt(receipt.receiptId)}
                                            className="w-full px-4 py-2.5 text-sm font-bold text-slate-600 rounded-xl flex items-center justify-center transition-all bg-slate-100 hover:bg-slate-200"
                                        >
                                            <Eye className="mr-2 w-4 h-4"/> View Receipt
                                        </button>
                                    </div>
                                </div>
                            ))}
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
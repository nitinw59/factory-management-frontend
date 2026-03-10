import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Truck, Search, CheckCircle, Clock, Package, X, 
    FileText, Printer, ArrowLeft, ShieldCheck, Building2, 
    Calendar, Loader2, AlertCircle, ChevronDown, Eye, Box,
    ShoppingBag, ChevronRight
} from 'lucide-react';

// ==========================================
// 1. MOCK API SERVICE (Replaces external imports for Canvas preview)
// ==========================================
import { dispatchManagerApi } from '../../api/dispatchManagerApi';

//const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// const dispatchManagerApi = {
//     getDashboardData: async () => {
//         await delay(800);
//         return {
//             data: [
//                 { id: 'B-2026-001', style: 'Mens Cotton Polo', client: 'RetailCorp', status: 'READY', date: '2026-03-01', totalPieces: 270, po_code: 'PO-9912' },
//                 { id: 'B-2026-002', style: 'Womens Denim Jacket', client: 'FashionHub', status: 'READY', date: '2026-03-05', totalPieces: 85, po_code: 'PO-8821' },
//                 { id: 'B-2026-003', style: 'Kids Summer Tee', client: 'TinyTots', status: 'READY', date: '2026-03-08', totalPieces: 530 },
//                 { id: 'B-2026-004', style: 'Winter Fleece Zip', client: 'OutdoorGear', status: 'DISPATCHED', date: '2026-02-28', dispatchDate: '2026-03-02', totalPieces: 400 },
//             ]
//         };
//     },
//     getRollDetailsForBatch: async (batchId) => {
//         await delay(600);
//         const mockDb = {
//             'B-2026-001': [{ rollId: 'R-1001', color: 'Navy Blue', cutPieces: 120 }, { rollId: 'R-1002', color: 'White', cutPieces: 150 }],
//             'B-2026-002': [{ rollId: 'R-2001', color: 'Washed Blue', cutPieces: 85 }],
//             'B-2026-003': [{ rollId: 'R-3001', color: 'Yellow', cutPieces: 200 }, { rollId: 'R-3002', color: 'Red', cutPieces: 180 }, { rollId: 'R-3003', color: 'Green', cutPieces: 150 }],
//         };
//         return { data: mockDb[batchId] || [] };
//     },
//     submitDispatch: async (payload) => {
//         await delay(1000); // Simulate processing all cycle stages to COMPLETED
//         return { success: true, receiptId: `REC-${payload.batchId.replace('B-', '')}`, dispatchDate: new Date().toLocaleDateString() };
//     },
//     getReceiptDetails: async (batchId) => {
//         await delay(500);
//         return {
//             data: {
//                 dispatchDate: '2026-03-02',
//                 rolls: [{ rollId: 'R-4001', color: 'Black', cutPieces: 400, dispatchedPieces: 400 }]
//             }
//         };
//     }
// };

// ==========================================
// 2. SHARED UI COMPONENTS
// ==========================================
const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-rose-600 bg-rose-50 rounded-xl border border-rose-100 font-medium flex items-center justify-center space-x-2"><AlertCircle size={20} /><span>{message}</span></div>;

const Modal = ({ title, onClose, children, maxWidth = "max-w-2xl" }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
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
// 3. DISPATCH MODAL / FORM
// ==========================================
const DispatchFormModal = ({ batch, onClose, onSuccess }) => {
    const [rolls, setRolls] = useState([]);
    const [inputs, setInputs] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [showPreview, setShowPreview] = useState(false); // New state for review step
    const [showWarning, setShowWarning] = useState(false); // State for the final warning dialog

    useEffect(() => {
        const fetchRolls = async () => {
            setIsLoading(true);
            try {
                const res = await dispatchManagerApi.getRollDetailsForBatch(batch.real_batch_id);
                const rollData = Array.isArray(res.data?.data) 
                ? res.data.data 
                : (Array.isArray(res.data) ? res.data : []);
                const initial = {};
                rollData.forEach(r => { initial[r.rollId] = r.cutPieces; });
                setRolls(rollData);
                setInputs(initial);
            } catch (err) {
                setError("Failed to fetch roll cut details.");
                console.error("Error fetching roll cut details:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRolls();
    }, [batch.id]);

    const handleInputChange = (rollId, val) => {
        setInputs(prev => ({ ...prev, [rollId]: parseInt(val) || 0 }));
    };

    const handleSubmit = async () => {
        setShowWarning(false);
        setIsSubmitting(true);
        try {
            const payload = {
                batchId: batch.real_batch_id,
                dispatchedRolls: rolls.map(r => ({ ...r, dispatchedPieces: inputs[r.rollId] }))
            };
            const response = await dispatchManagerApi.submitDispatch(payload);
            
            // Generate standard receipt payload to return back to dashboard
            const generatedReceipt = {
                ...batch,
                dispatchDate: response.dispatchDate,
                receiptId: response.receiptId,
                rolls: payload.dispatchedRolls
            };
            
            onSuccess(generatedReceipt);
        } catch (err) {
            setError("Failed to finalize dispatch process.");
            setIsSubmitting(false); // Re-enable buttons if error occurs
        }
    };

    if (isLoading) return <Modal title={`Dispatching: ${batch.id}`} onClose={onClose}><Spinner /></Modal>;
    if (error) return <Modal title="Error" onClose={onClose}><ErrorDisplay message={error} /></Modal>;

    // Calculate dynamic totals
    const totalCut = rolls.reduce((sum, r) => sum + parseInt(r.cutPieces || 0, 10), 0);
    const totalDispatched = rolls.reduce((sum, r) => sum + parseInt(inputs[r.rollId] || 0, 10), 0);

    return (
        <Modal title={`Dispatch Process: ${batch.id}`} onClose={onClose}>
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
                        {/* EDIT MODE */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                        <th className="p-3 font-semibold">Roll ID</th>
                                        <th className="p-3 font-semibold">Color</th>
                                        <th className="p-3 font-semibold text-right">Cut Pieces</th>
                                        <th className="p-3 font-semibold text-right w-40">Dispatched</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rolls.map((roll, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-800">{roll.rollId}</td>
                                            <td className="p-3 text-slate-600"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 border border-slate-200">{roll.color}</span></td>
                                            <td className="p-3 text-right font-medium text-slate-600">{roll.cutPieces}</td>
                                            <td className="p-3">
                                                <input 
                                                    type="number" min="0"
                                                    value={inputs[roll.rollId] !== undefined ? inputs[roll.rollId] : ''}
                                                    onChange={(e) => handleInputChange(roll.rollId, e.target.value)}
                                                    className="w-full text-right px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-blue-700 bg-white"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {rolls.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate-500">No roll details available.</td></tr>}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-800">
                                        <td colSpan="2" className="p-3 text-right uppercase text-xs tracking-wider text-slate-500">Total Sum:</td>
                                        <td className="p-3 text-right">{totalCut}</td>
                                        <td className="p-3 text-right text-blue-700 text-lg">{totalDispatched}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                            <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                            <button 
                                onClick={() => setShowPreview(true)} 
                                disabled={rolls.length === 0} 
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
                                {rolls.map((roll, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-blue-100">
                                        <div>
                                            <span className="font-bold text-slate-800">{roll.rollId}</span>
                                            <span className="text-xs text-slate-500 ml-2">({roll.color})</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-400 mr-3">Cut: {roll.cutPieces}</span>
                                            <span className="font-bold text-blue-700 text-base">Disp: {inputs[roll.rollId] || 0}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t border-blue-200 flex justify-between items-center font-bold text-blue-900">
                                <span className="uppercase text-sm tracking-wider">Total Final Quantities:</span>
                                <span className="text-xl">{totalDispatched} <span className="text-sm text-blue-500">/ {totalCut} pcs</span></span>
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
// 4. MAIN PAGE / DASHBOARD
// ==========================================
export default function DispatchDashboardPage() {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // UI State
    const [dispatchingBatch, setDispatchingBatch] = useState(null);
    const [receiptView, setReceiptView] = useState(null);
    const [expandedSections, setExpandedSections] = useState({ READY: true, DISPATCHED: false });

    const fetchDashboard = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await dispatchManagerApi.getDashboardData();
            const fetchedBatches = res.data?.data || res.data || []; 
        
             // Ensure we strictly set an array
            setBatches(Array.isArray(fetchedBatches) ? fetchedBatches : []);
        } catch (err) {
            console.error("Error fetching dashboard data:", err);   
            setError("Failed to load dispatch queue.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const handleDispatchSuccess = (receiptData) => {
        setDispatchingBatch(null);
        setReceiptView(receiptData);
        // In a real app, you'd re-fetch the dashboard. Here we locally update to show immediate UI response.
        setBatches(prev => prev.map(b => b.id === receiptData.id ? { ...b, status: 'DISPATCHED', dispatchDate: receiptData.dispatchDate } : b));
        setExpandedSections({ READY: false, DISPATCHED: true });
    };

        const handleViewExistingReceipt = async (batch) => {
                setIsLoading(true);
                try {
                    const res = await dispatchManagerApi.getReceiptDetails(batch.real_batch_id);
                    
                    // Safely extract the nested receipt object
                    // Axios = res.data.data | Fetch = res.data
                    const receiptData = res.data?.data || res.data || {};

                    setReceiptView({ 
                        ...batch, 
                        receiptId: receiptData.receiptId, // Capture the actual receipt number
                        dispatchDate: receiptData.dispatchDate, 
                        rolls: Array.isArray(receiptData.rolls) ? receiptData.rolls : [] 
                    });
                } catch (err) {
                    console.log("Error fetching receipt details:", err);
                    alert("Failed to fetch receipt data.");
                } finally {
                    setIsLoading(false);
                }
            };

    const toggleSection = (section) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
            const filteredBatches = useMemo(() => {
                // SAFETY NET: Ensure batches is always an array before filtering
                const safeBatches = Array.isArray(batches) ? batches : [];

                if (!searchQuery) return safeBatches;
                
                const lower = searchQuery.toLowerCase();
                return safeBatches.filter(b => 
                    b.id.toLowerCase().includes(lower) || 
                    b.client.toLowerCase().includes(lower) || 
                    b.style.toLowerCase().includes(lower)
                );
            }, [batches, searchQuery]);

    const groupedBatches = useMemo(() => {
        return filteredBatches.reduce((acc, batch) => {
            if (!acc[batch.status]) acc[batch.status] = [];
            acc[batch.status].push(batch);
            return acc;
        }, { READY: [], DISPATCHED: [] });
    }, [filteredBatches]);

    // --- RECEIPT RENDER ---
    if (receiptView) {
        const totalDispatched = receiptView.rolls.reduce((sum, r) => sum + r.dispatchedPieces, 0);
        const totalCut = receiptView.rolls.reduce((sum, r) => sum + r.cutPieces, 0);
        
        return (
            <div className="min-h-screen bg-slate-100 p-8 font-sans">
                <div className="max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-6 print:hidden">
                        <button onClick={() => setReceiptView(null)} className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 bg-white px-4 py-2 rounded-lg shadow-sm">
                            <ArrowLeft size={18} /><span>Back to Dashboard</span>
                        </button>
                        <button onClick={() => window.print()} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm font-medium transition-colors">
                            <Printer size={18} /><span>Print Receipt</span>
                        </button>
                    </div>

                    <div className="bg-white p-10 rounded-xl shadow-lg print:shadow-none print:p-0 print:m-0 border border-slate-200">
                        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8">
                            <div>
                                <div className="flex items-center space-x-2 mb-2">
                                    <Building2 size={28} className="text-slate-800" />
                                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">EnterpriseOS</h1>
                                </div>
                                <p className="text-slate-500 text-sm">Official Goods Dispatch Receipt</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-xl font-bold text-slate-800">RECEIPT #{receiptView.receiptId || receiptView.id.replace('B-', 'REC-')}</h2>
                                <div className="flex items-center justify-end space-x-2 mt-2 text-slate-600">
                                    <Calendar size={14} /><span className="text-sm">Date: {receiptView.dispatchDate}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-8 bg-slate-50 p-6 rounded-lg border border-slate-100">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Batch Information</h3>
                                <p className="font-semibold text-slate-800 text-lg">{receiptView.id}</p>
                                <p className="text-slate-600 mt-1">{receiptView.style}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Client</h3>
                                <p className="font-semibold text-slate-800 text-lg">{receiptView.client}</p>
                            </div>
                        </div>

                        <div className="mb-12">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-600 text-sm uppercase tracking-wider">
                                        <th className="p-3 font-semibold rounded-tl-lg">Roll ID</th>
                                        <th className="p-3 font-semibold">Color</th>
                                        <th className="p-3 font-semibold text-right">Cut Pieces</th>
                                        <th className="p-3 font-semibold text-right rounded-tr-lg">Dispatched Pieces</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {receiptView.rolls.map((roll, idx) => (
                                        <tr key={idx} className="border-b border-slate-100">
                                            <td className="p-3 font-medium text-slate-800">{roll.rollId}</td>
                                            <td className="p-3 text-slate-600">{roll.color}</td>
                                            <td className="p-3 text-right text-slate-600">{roll.cutPieces}</td>
                                            <td className="p-3 text-right font-bold text-slate-800">{roll.dispatchedPieces}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                                        <td colSpan="2" className="p-3 font-bold text-slate-800 text-right">Total:</td>
                                        <td className="p-3 text-right font-bold text-slate-800">{totalCut}</td>
                                        <td className="p-3 text-right font-bold text-blue-700 text-lg">{totalDispatched}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div className="flex justify-between items-end mt-24 pt-8 border-t border-slate-200">
                            <div className="text-center w-48">
                                <div className="border-b border-slate-400 h-8 mb-2"></div>
                                <p className="text-sm font-medium text-slate-600">Authorized Dispatch Officer</p>
                                <p className="text-xs text-slate-400 mt-1">System Verified</p>
                            </div>
                            <div className="text-center w-48">
                                <div className="border-b border-slate-400 h-8 mb-2"></div>
                                <p className="text-sm font-medium text-slate-600">Transport / Receiver Signature</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- DASHBOARD RENDER ---
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
            
            {/* Header / Auth Display */}
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
                        <p className="text-slate-500 text-sm mt-1">Review, authorize, and generate dispatch receipts.</p>
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
                        
                        {/* READY BATCHES ACCORDION */}
                        <BatchStatusGroup 
                            title="Ready for Dispatch" 
                            count={groupedBatches.READY.length}
                            headerBg="bg-white hover:bg-slate-50"
                            countBg="bg-blue-100"
                            countText="text-blue-700"
                            isOpen={expandedSections.READY}
                            onToggle={() => toggleSection('READY')}
                        >
                            {groupedBatches.READY.map(batch => (
                                <div key={batch.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all border-t-[6px] border-t-amber-400">
                                    <div className="p-5 border-b border-slate-50">
                                        {batch.po_code && (
                                            <div className="mb-3">
                                                <span className="inline-flex items-center text-[10px] font-bold tracking-wide uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                    <ShoppingBag size={10} className="mr-1"/> {batch.real_batch_id}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center shadow-sm">
                                                <Box size={14} className="mr-2 opacity-70" />
                                                <span className="text-sm font-bold font-mono tracking-tight">{batch.id}</span>
                                            </div>
                                            <span className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                                                Pending
                                            </span>
                                        </div>
                                        <h2 className="font-bold text-lg text-slate-800 leading-tight mb-1">{batch.style}</h2>
                                        <p className="text-sm text-slate-500 font-medium">{batch.client}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50/50 flex-1">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Total Pieces Cut:</span>
                                            <span className="font-bold text-slate-700">{batch.totalPieces}</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                                        <button 
                                            onClick={() => setDispatchingBatch(batch)}
                                            className="w-full px-4 py-2.5 text-sm font-bold text-white rounded-xl flex items-center justify-center transition-all shadow-sm bg-blue-600 hover:bg-blue-700 hover:shadow-md"
                                        >
                                            <Truck className="mr-2 w-4 h-4"/> Authorize Dispatch
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {groupedBatches.READY.length === 0 && <p className="text-sm text-slate-400 col-span-full py-4 text-center">No batches ready for dispatch.</p>}
                        </BatchStatusGroup>

                        {/* COMPLETED BATCHES ACCORDION */}
                        <BatchStatusGroup 
                            title="Dispatched Records" 
                            count={groupedBatches.DISPATCHED.length}
                            headerBg="bg-emerald-50/30 hover:bg-emerald-50/60"
                            countBg="bg-emerald-100"
                            countText="text-emerald-800"
                            isOpen={expandedSections.DISPATCHED}
                            onToggle={() => toggleSection('DISPATCHED')}
                        >
                            {groupedBatches.DISPATCHED.map(batch => (
                                <div key={batch.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full hover:shadow-md transition-all border-t-[6px] border-t-emerald-400">
                                    <div className="p-5 border-b border-slate-50">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 flex items-center shadow-sm">
                                                <Box size={14} className="mr-2 opacity-70" />
                                                <span className="text-sm font-bold font-mono tracking-tight">{batch.id}</span>
                                            </div>
                                            <span className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">
                                                Dispatched
                                            </span>
                                        </div>
                                        <h2 className="font-bold text-lg text-slate-800 leading-tight mb-1">{batch.style}</h2>
                                        <p className="text-sm text-slate-500 font-medium">{batch.client}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50/50 flex-1">
                                         <div className="flex justify-between items-center text-sm mb-2">
                                            <span className="text-slate-500">Date:</span>
                                            <span className="font-bold text-slate-700">{batch.dispatchDate}</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                                        <button 
                                            onClick={() => handleViewExistingReceipt(batch)}
                                            className="w-full px-4 py-2.5 text-sm font-bold text-slate-600 rounded-xl flex items-center justify-center transition-all bg-slate-100 hover:bg-slate-200"
                                        >
                                            <FileText className="mr-2 w-4 h-4"/> View Receipt
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </BatchStatusGroup>
                    </div>
                )}
            </main>

            {/* MODALS */}
            {dispatchingBatch && (
                <DispatchFormModal 
                    batch={dispatchingBatch} 
                    onClose={() => setDispatchingBatch(null)} 
                    onSuccess={handleDispatchSuccess} 
                />
            )}

            {/* Print Formatting */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print\\:hidden { display: none !important; }
                    .print\\:block { display: block !important; }
                    .print\\:shadow-none { box-shadow: none !important; }
                    .print\\:p-0 { padding: 0 !important; }
                    .print\\:m-0 { margin: 0 !important; }
                    @page { margin: 1.5cm; }
                }
            `}} />
        </div>
    );
}
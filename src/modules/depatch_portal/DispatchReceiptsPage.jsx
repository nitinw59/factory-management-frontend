import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Search, FileText, Loader2, AlertCircle, Archive, Printer, Eye, ShoppingBag, Box
} from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';

// IMPORT THE SHARED COMPONENT
import DispatchReceiptDocument from './DispatchReceiptDocument';

// ==========================================
// SHARED COMPONENTS
// ==========================================
const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-rose-600 bg-rose-50 rounded-xl border border-rose-100 font-medium flex items-center justify-center space-x-2"><AlertCircle size={20} /><span>{message}</span></div>;

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================
export default function DispatchReceiptsPage() {
    const [receipts, setReceipts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // State for viewing a specific receipt
    const [receiptView, setReceiptView] = useState(null);
    const [isReceiptLoading, setIsReceiptLoading] = useState(false);

    // Fetch all receipts on mount
    const fetchReceipts = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await dispatchManagerApi.getAllReceipts();
            const fetchedReceipts = res.data?.data || res.data || [];
            console.log("Fetched receipts:", fetchedReceipts);
            setReceipts(Array.isArray(fetchedReceipts) ? fetchedReceipts : []);
        } catch (err) {
            console.error(err);
            setError("Failed to load receipt history.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

    // Handle viewing a specific receipt's details
    const handleViewReceipt = async (receiptSummary) => {
        setIsReceiptLoading(true);
        try {
            const res = await dispatchManagerApi.getReceiptDetails(receiptSummary.receiptId);
            const detailData = res.data?.data || res.data || {};
            console.log("Fetched receipt details for receiptId", receiptSummary.receiptId, ":", detailData);
            setReceiptView({
                ...receiptSummary, // Base info (client, style, etc.)
                receiptId: detailData.receiptId || receiptSummary.receiptId,
                dispatchDate: detailData.dispatchDate || receiptSummary.dispatchDate,
                sizeRatio: detailData.sizeRatio || null, // Capture Size Ratio
                rolls: Array.isArray(detailData.rolls) ? detailData.rolls : []
            });
        } catch (err) {
            console.error(err);
            alert("Failed to load receipt details.");
        } finally {
            setIsReceiptLoading(false);
        }
    };

    // Filter logic
    const filteredReceipts = useMemo(() => {
        const safeReceipts = Array.isArray(receipts) ? receipts : [];
        if (!searchQuery) return safeReceipts;
        
        const lower = searchQuery.toLowerCase();
        return safeReceipts.filter(r => 
            r.receiptId?.toLowerCase().includes(lower) || 
            r.batchId?.toLowerCase().includes(lower) || 
            r.client?.toLowerCase().includes(lower) || 
            r.style?.toLowerCase().includes(lower) ||
            r.po_code?.toLowerCase().includes(lower)
        );
    }, [receipts, searchQuery]);

    // ==========================================
    // RENDER: RECEIPT DETAIL VIEW
    // ==========================================
    if (receiptView) {
        return (
            <DispatchReceiptDocument 
                receipt={receiptView} 
                onBack={() => setReceiptView(null)} 
            />
        );
    }

    // ==========================================
    // RENDER: DISPATCH RECEIPTS LIST
    // ==========================================
    return (
        <div className="bg-slate-50 min-h-screen font-sans pb-12">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                
                {/* Header & Search */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 sm:mb-8 gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                            <Archive className="text-blue-600 w-5 h-5 sm:w-6 sm:h-6" /> Dispatch History
                        </h1>
                        <p className="text-slate-500 text-xs sm:text-sm mt-1">View and reprint all historical dispatch receipts.</p>
                    </div>
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search by Receipt #, Batch, Client..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow placeholder:text-slate-400"
                        />
                    </div>
                </div>

                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="bg-transparent sm:bg-white sm:border border-slate-200 sm:rounded-2xl sm:shadow-sm sm:overflow-hidden">
                        
                        {/* --- MOBILE VIEW: CARDS --- */}
                        <div className="block sm:hidden space-y-4">
                            {filteredReceipts.map((receipt) => (
                                <div key={receipt.receiptId} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                                    <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                                        <div className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center shadow-sm max-w-[70%]">
                                            <FileText size={14} className="mr-1.5 opacity-70 shrink-0" />
                                            <span className="text-xs font-bold font-mono tracking-tight truncate">{receipt.receiptId}</span>
                                        </div>
                                        <span className="text-xs font-medium text-slate-500 shrink-0">
                                            {receipt.dispatchDate}
                                        </span>
                                    </div>
                                    
                                    <div className="mb-3">
                                        {receipt.po_code && (
                                            <div className="mb-2">
                                                <span className="inline-flex items-center text-[9px] font-bold tracking-wide uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                    <ShoppingBag size={10} className="mr-1 shrink-0"/> <span className="truncate">PO: {receipt.po_code}</span>
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mb-1">
                                            <Box size={14} className="text-slate-400" />
                                            <h2 className="font-bold text-sm text-slate-800 truncate">{receipt.batchId}</h2>
                                        </div>
                                        <p className="text-xs font-medium text-slate-600 truncate">{receipt.style} • {receipt.client}</p>
                                    </div>
                                    
                                    <div className="flex justify-between items-center pt-3 border-t border-slate-100 mt-3">
                                        <div>
                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">Dispatched</span>
                                            <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100 text-xs">
                                                {receipt.totalDispatched} pcs
                                            </span>
                                        </div>
                                        
                                        <button 
                                            onClick={() => handleViewReceipt(receipt)}
                                            disabled={isReceiptLoading}
                                            className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm inline-flex items-center space-x-1.5 disabled:opacity-50 active:scale-[0.98]"
                                        >
                                            {isReceiptLoading ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Eye size={14} className="opacity-70" />}
                                            <span>View</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredReceipts.length === 0 && (
                                <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
                                    <Search size={32} className="mb-3 opacity-20 mx-auto" />
                                    <p className="text-base font-medium text-slate-600">No receipts found</p>
                                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria.</p>
                                </div>
                            )}
                        </div>

                        {/* --- DESKTOP VIEW: TABLE --- */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                        <th className="p-4 font-semibold">Receipt Number</th>
                                        <th className="p-4 font-semibold">Date</th>
                                        <th className="p-4 font-semibold">Batch & Style</th>
                                        <th className="p-4 font-semibold">Client / PO</th>
                                        <th className="p-4 font-semibold text-right">Total Dispatched</th>
                                        <th className="p-4 font-semibold text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredReceipts.map((receipt) => (
                                        <tr key={receipt.receiptId} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors group">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-800 flex items-center space-x-2">
                                                    <FileText size={16} className="text-blue-500" />
                                                    <span>{receipt.receiptId}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-600 font-medium whitespace-nowrap">
                                                {receipt.dispatchDate}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded w-fit mb-1 border border-slate-200">
                                                        {receipt.batchId}
                                                    </span>
                                                    <span className="text-sm font-medium text-slate-800">{receipt.style}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-700">{receipt.client}</span>
                                                    {receipt.po_code && <span className="text-xs text-slate-400 mt-0.5">PO: {receipt.po_code}</span>}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                                    {receipt.totalDispatched} pcs
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => handleViewReceipt(receipt)}
                                                    disabled={isReceiptLoading}
                                                    className="bg-white border border-slate-300 hover:bg-slate-50 hover:border-blue-300 text-slate-700 hover:text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center space-x-2 disabled:opacity-50"
                                                >
                                                    {isReceiptLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Printer size={16} className="opacity-70" />}
                                                    <span>View</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredReceipts.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="p-12 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <Search size={40} className="mb-4 opacity-20" />
                                                    <p className="text-lg font-medium text-slate-600">No receipts found</p>
                                                    <p className="text-sm">Try adjusting your search criteria.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
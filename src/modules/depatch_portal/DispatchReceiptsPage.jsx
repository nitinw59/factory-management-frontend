import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Search, FileText, Loader2, AlertCircle, Archive, Printer
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
            // Safe extraction handling Axios/Fetch nested data structures
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
            // Note: We use receiptId here because this is the historical table
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
    // RENDER: DISPATCH RECEIPTS LIST (TABLE)
    // ==========================================
    return (
        <div className="bg-slate-50 min-h-screen font-sans pb-12">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                
                {/* Header & Search */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                            <Archive className="text-blue-600" /> Dispatch History
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">View and reprint all historical dispatch receipts.</p>
                    </div>
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by Receipt #, Batch, Client..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
                        />
                    </div>
                </div>

                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
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
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    Search, FileText, ArrowLeft, Printer, Building2, 
    Calendar, Loader2, AlertCircle, Box, Archive
} from 'lucide-react';

import { dispatchManagerApi } from '../../api/dispatchManagerApi';
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
            // Reusing your existing getReceiptDetails endpoint using the batchId
            const res = await dispatchManagerApi.getReceiptDetails(receiptSummary.batchId);
            const detailData = res.data?.data || res.data || {};
            
            setReceiptView({
                ...receiptSummary, // Base info (client, style, etc.)
                receiptId: detailData.receiptId || receiptSummary.receiptId,
                dispatchDate: detailData.dispatchDate || receiptSummary.dispatchDate,
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
    // RENDER: RECEIPT DETAIL / PRINT VIEW
    // ==========================================
    if (receiptView) {
        const totalDispatched = receiptView.rolls.reduce((sum, r) => sum + r.dispatchedPieces, 0);
        const totalCut = receiptView.rolls.reduce((sum, r) => sum + r.cutPieces, 0);
        
        return (
            <div className="min-h-screen bg-slate-100 p-8 font-sans">
                <div className="max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-6 print:hidden">
                        <button onClick={() => setReceiptView(null)} className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 transition-colors">
                            <ArrowLeft size={18} /><span>Back to History</span>
                        </button>
                        <button onClick={() => window.print()} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm font-medium transition-colors">
                            <Printer size={18} /><span>Print / Save PDF</span>
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
                                <h2 className="text-xl font-bold text-slate-800">{receiptView.receiptId}</h2>
                                <div className="flex items-center justify-end space-x-2 mt-2 text-slate-600">
                                    <Calendar size={14} /><span className="text-sm">Date: {receiptView.dispatchDate}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-8 bg-slate-50 p-6 rounded-lg border border-slate-100">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Batch & Product</h3>
                                <p className="font-semibold text-slate-800 text-lg">{receiptView.batchId}</p>
                                <p className="text-slate-600 mt-1">{receiptView.style}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Client Details</h3>
                                <p className="font-semibold text-slate-800 text-lg">{receiptView.client}</p>
                                {receiptView.po_code && <p className="text-slate-500 text-sm mt-1">PO: {receiptView.po_code}</p>}
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
                                    {receiptView.rolls.length === 0 && (
                                        <tr><td colSpan="4" className="p-6 text-center text-slate-400">No detailed roll data available for this legacy receipt.</td></tr>
                                    )}
                                </tbody>
                                {receiptView.rolls.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-slate-50 border-t-2 border-slate-200">
                                            <td colSpan="2" className="p-3 font-bold text-slate-800 text-right">Total:</td>
                                            <td className="p-3 text-right font-bold text-slate-800">{totalCut}</td>
                                            <td className="p-3 text-right font-bold text-blue-700 text-lg">{totalDispatched}</td>
                                        </tr>
                                    </tfoot>
                                )}
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
                {/* Print Styles included in main app render below */}
            </div>
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

            {/* Print Formatting */}
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
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
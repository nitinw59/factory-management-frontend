import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Truck, X, Loader2, Package } from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';

const BatchReceiptsModal = ({ batchId, realBatchId, onClose }) => {
    const [receipts, setReceipts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchBatchReceipts = async () => {
            setIsLoading(true);
            try {
                // Fetch all receipts and filter down to just this batch. 
                // (If you build a specific backend route like /batch/:id/receipts later, you can swap this!)
                const res = await dispatchManagerApi.getAllReceipts();
                const allReceipts = res.data?.data || res.data || [];
                
                // Filter by either the friendly batchId or the database realBatchId
                const filtered = allReceipts.filter(r => r.batchId === batchId || r.real_batch_id === realBatchId);
                setReceipts(filtered);
            } catch (err) {
                console.error("Failed to load receipts for batch", err);
                setError("Could not load dispatch history for this batch.");
            } finally {
                setIsLoading(false);
            }
        };

        if (batchId || realBatchId) {
            fetchBatchReceipts();
        }
    }, [batchId, realBatchId]);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Modal Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <Truck className="text-blue-600" size={20} />
                        <span>Dispatch History: {batchId}</span>
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="overflow-y-auto p-6 bg-slate-50/50 flex-1">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                            <Loader2 className="animate-spin w-8 h-8 mb-4" />
                            <span className="text-sm font-medium text-slate-500">Locating shipping records...</span>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center font-medium border border-red-100">
                            {error}
                        </div>
                    ) : receipts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <Package className="w-12 h-12 mb-3 opacity-20" />
                            <p className="font-medium text-slate-600">No dispatch receipts found.</p>
                            <p className="text-xs mt-1">This batch has not been shipped yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {receipts.map((receipt, idx) => (
                                <div key={receipt.receiptId} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-blue-300 transition-colors shadow-sm">
                                    
                                    {/* Receipt Info */}
                                    <div className="flex items-start gap-3">
                                        <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-100 shrink-0">
                                            <FileText className="text-blue-600 w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm sm:text-base">{receipt.receiptId}</p>
                                            <p className="text-xs text-slate-500 font-medium flex items-center mt-1">
                                                <Calendar className="w-3.5 h-3.5 mr-1" />
                                                Dispatched on: {receipt.dispatchDate}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Quantity Badge */}
                                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t border-slate-100 sm:border-t-0 pt-3 sm:pt-0">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Shipped</span>
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-black px-3 py-1.5 rounded-lg text-sm sm:text-base shadow-sm">
                                            {receipt.totalDispatched} <span className="text-xs font-medium opacity-80">pcs</span>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
                    <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BatchReceiptsModal;
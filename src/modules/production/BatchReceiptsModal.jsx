import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Truck, X, Loader2, Package, Download, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BatchReceiptsModal = ({ batchId, realBatchId, onClose }) => {
    const [receipts, setReceipts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [closeState, setCloseState] = useState('idle'); // 'idle' | 'confirm' | 'closing' | 'done'

    useEffect(() => {
        const fetchBatchReceipts = async () => {
            setIsLoading(true);
            try {
                // Fetch all receipts and filter down to just this batch. 
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

    const handleDownloadPDF = async (receiptSummary) => {
        setDownloadingId(receiptSummary.receiptId);
        try {
            // 1. Fetch detailed data for this specific receipt
            const res = await dispatchManagerApi.getReceiptDetails(receiptSummary.receiptId);
            const detailData = res.data?.data || res.data || {};
            
            // 2. Merge summary with details
            const receipt = {
                ...receiptSummary,
                sizeRatio: detailData.sizeRatio || null,
                rolls: Array.isArray(detailData.rolls) ? detailData.rolls : []
            };

            // 3. Generate PDF
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;
            
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text("MATRIX OVERSEAS", pageWidth / 2, 20, { align: "center" });

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            const addressLines = [
                "PLOT NO. 24,26,27, K T STEEL PLOT PREMISSES,",
                "R K CNG PUMP, WIMCO NAKA, AMBERNATH 421505.",
                "Phone: +918591383476"
            ];
            doc.text(addressLines, pageWidth / 2, 28, { align: "center", lineHeightFactor: 1.5 });

            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.5);
            doc.line(14, 45, pageWidth - 14, 45);

            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("DISPATCH RECEIPT", 14, 55);

            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("Receipt #:", 14, 65);
            doc.setFont("helvetica", "normal");
            doc.text(`${receipt.receiptId}`, 40, 65);

            doc.setFont("helvetica", "bold");
            doc.text("Date:", 14, 72);
            doc.setFont("helvetica", "normal");
            doc.text(`${receipt.dispatchDate}`, 40, 72);
            
            doc.setFont("helvetica", "bold");
            doc.text("Batch ID:", 14, 79);
            doc.setFont("helvetica", "normal");
            doc.text(`${receipt.batchId || receipt.id || receipt.real_batch_id}`, 40, 79);

            doc.setFont("helvetica", "bold");
            doc.text("Client:", 120, 65);
            doc.setFont("helvetica", "normal");
            doc.text(`${receipt.client}`, 135, 65);
            
            doc.setFont("helvetica", "bold");
            doc.text("Style:", 120, 72);
            doc.setFont("helvetica", "normal");
            doc.text(`${receipt.style}`, 135, 72);

            if (receipt.po_code) {
                doc.setFont("helvetica", "bold");
                doc.text("PO Ref:", 120, 79);
                doc.setFont("helvetica", "normal");
                doc.text(`${receipt.po_code}`, 135, 79);
            }

            let currentY = 88;

            if (receipt.sizeRatio && Object.keys(receipt.sizeRatio).length > 0) {
                doc.setFont("helvetica", "bold");
                doc.text("Size Ratio:", 14, currentY);
                doc.setFont("helvetica", "normal");
                const ratioString = Object.entries(receipt.sizeRatio).map(([size, ratio]) => `[${size}: ${ratio}]`).join('   ');
                doc.text(ratioString, 40, currentY);
                currentY += 10;
            }

            const totalDispatched = receipt.rolls.reduce((sum, r) => sum + parseInt(r.dispatchedPieces || 0, 10), 0);

            autoTable(doc, { 
                startY: currentY + 5, 
                head: [['Roll ID', 'Color', 'Dispatched Pieces']], 
                body: receipt.rolls.filter(r => r.dispatchedPieces > 0).map(r => [
                    r.rollId, 
                    r.color + (r.colorNumber ? ` (${r.colorNumber})` : ''), 
                    r.dispatchedPieces
                ]),
                theme: 'grid',
                headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], lineColor: [0, 0, 0], lineWidth: 0.5 },
                bodyStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
                alternateRowStyles: { fillColor: [255, 255, 255] }, 
                styles: { fontSize: 10, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5 },
                columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
                foot: [[
                    { content: 'Total in this Shipment', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
                    { content: `${totalDispatched}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } }
                ]],
                footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 }
            });

            const finalY = doc.lastAutoTable.finalY + 30;
            
            doc.setFont("helvetica", "bold");
            doc.text("Authorized Dispatch Officer", 14, finalY);
            doc.setDrawColor(0, 0, 0); 
            doc.line(14, finalY + 1, 70, finalY + 1);

            doc.text("Transport / Receiver Signature", 120, finalY);
            doc.line(120, finalY + 1, 180, finalY + 1);

            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            doc.text("This is a computer-generated receipt and requires signatures for physical transit.", pageWidth / 2, finalY + 15, { align: 'center' });

            // 4. Trigger download
            doc.save(`${receipt.receiptId}.pdf`);

        } catch (err) {
            console.error("Failed to generate PDF", err);
            alert("Failed to generate PDF. Make sure receipt details are available.");
        } finally {
            setDownloadingId(null);
        }
    };

    const handleCloseBatch = async () => {
        setCloseState('closing');
        try {
            await dispatchManagerApi.closeBatch(realBatchId);
            setCloseState('done');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to close batch.');
            setCloseState('confirm');
        }
    };

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
                            {receipts.map((receipt) => (
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

                                    {/* Badges & Actions */}
                                    <div className="flex flex-col items-end gap-2 border-t border-slate-100 sm:border-t-0 pt-3 sm:pt-0 w-full sm:w-auto">
                                        <div className="flex justify-between w-full sm:w-auto items-center sm:justify-end gap-3">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Shipped:</span>
                                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-black px-3 py-1 rounded-lg text-sm sm:text-base shadow-sm">
                                                {receipt.totalDispatched} <span className="text-xs font-medium opacity-80">pcs</span>
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => handleDownloadPDF(receipt)}
                                            disabled={downloadingId === receipt.receiptId}
                                            className="w-full sm:w-auto mt-2 sm:mt-0 flex items-center justify-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 border border-blue-100 hover:border-blue-200"
                                        >
                                            {downloadingId === receipt.receiptId ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                            <span>{downloadingId === receipt.receiptId ? 'Generating...' : 'Download PDF'}</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-slate-100 bg-white">
                    {closeState === 'done' ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                                <CheckCircle2 size={18} /> Batch closed successfully.
                            </div>
                            <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors">
                                Done
                            </button>
                        </div>
                    ) : closeState === 'confirm' ? (
                        <div className="space-y-3">
                            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
                                <ShieldAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-black text-red-700">Confirm Batch Closure</p>
                                    <p className="text-xs text-red-600 mt-0.5">
                                        This will permanently close batch <span className="font-black">{batchId}</span> and lock all dispatch records. This cannot be undone.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setCloseState('idle')}
                                    className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCloseBatch}
                                    disabled={closeState === 'closing'}
                                    className="px-5 py-2 text-sm font-black text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-60"
                                >
                                    {closeState === 'closing'
                                        ? <><Loader2 size={14} className="animate-spin" /> Closing…</>
                                        : 'Yes, Close Batch'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center">
                            <button
                                onClick={() => setCloseState('confirm')}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
                            >
                                <ShieldAlert size={15} /> Close Batch
                            </button>
                            <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BatchReceiptsModal;
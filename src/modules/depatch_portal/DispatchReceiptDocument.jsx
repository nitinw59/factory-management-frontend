import React from 'react';
import { ArrowLeft, Printer, Building2, Calendar } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function DispatchReceiptDocument({ receipt, onBack }) {
    if (!receipt) return null;

    const totalDispatched = receipt.rolls.reduce((sum, r) => sum + parseInt(r.dispatchedPieces || 0, 10), 0);
    const totalCut = receipt.rolls.reduce((sum, r) => sum + parseInt(r.cutPieces || 0, 10), 0);

    const handlePrintPDF = () => {
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
        doc.text(`${receipt.id || receipt.batchId}`, 40, 79);

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

        doc.save(`${receipt.receiptId}.pdf`);
    };

    return (
        <div className="min-h-screen bg-slate-100 p-8 font-sans print:p-0 print:bg-white">
            <div className="max-w-3xl mx-auto">
                <div className="flex justify-between items-center mb-6 print:hidden">
                    <button onClick={onBack} className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 transition-colors">
                        <ArrowLeft size={18} /><span>Back</span>
                    </button>
                    <button onClick={handlePrintPDF} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm font-medium transition-colors">
                        <Printer size={18} /><span>Download PDF</span>
                    </button>
                </div>

                <div className="bg-white p-10 rounded-xl shadow-lg print:shadow-none print:p-0 print:m-0 border border-slate-200 print:border-none">
                    <div className="hidden print:block text-center mb-8 pb-4 border-b-2 border-slate-800">
                        <h1 className="text-3xl font-bold tracking-tight">MATRIX OVERSEAS</h1>
                        <p className="text-sm mt-1">PLOT NO. 24,26,27, K T STEEL PLOT PREMISSES,</p>
                        <p className="text-sm">R K CNG PUMP, WIMCO NAKA, AMBERNATH 421505.</p>
                        <p className="text-sm mt-1 font-medium">Phone: +918591383476</p>
                    </div>
                    
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-6 mb-8 print:border-none print:pb-0">
                        <div>
                            <div className="flex items-center space-x-2 mb-2 print:hidden">
                                <Building2 size={28} className="text-slate-800" />
                                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">EnterpriseOS</h1>
                            </div>
                            <p className="text-slate-500 text-sm print:text-xl print:font-bold print:text-black">Official Goods Dispatch Receipt</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-xl font-bold text-slate-800 print:text-black">{receipt.receiptId}</h2>
                            <div className="flex items-center justify-end space-x-2 mt-2 text-slate-600 print:text-black">
                                <Calendar size={14} className="print:hidden"/><span className="text-sm">Date: {receipt.dispatchDate}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-6 bg-slate-50 p-6 rounded-lg border border-slate-100 print:bg-transparent print:border-none print:p-0">
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-600">Batch Information</h3>
                            <p className="font-semibold text-slate-800 text-lg print:text-black">{receipt.id || receipt.batchId}</p>
                            <p className="text-slate-600 mt-1 print:text-black">{receipt.style}</p>
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-600">Client</h3>
                            <p className="font-semibold text-slate-800 text-lg print:text-black">{receipt.client}</p>
                            {receipt.po_code && <p className="text-slate-500 text-sm mt-1 print:text-black">PO: {receipt.po_code}</p>}
                        </div>
                    </div>
                {console.log(receipt.sizeRatio)}
                     {receipt.sizeRatio && (
                        <div className="mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex flex-col md:flex-row md:items-center gap-4 print:bg-transparent print:border-none print:p-0">
                            <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider shrink-0 print:text-slate-600">Size Ratio:</h3>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(receipt.sizeRatio).map(([size, ratio]) => (
                                    <span key={size} className="bg-white text-indigo-700 border border-indigo-200 px-3 py-1 rounded-md shadow-sm text-sm font-bold flex items-center gap-2 print:bg-transparent print:border-none print:shadow-none print:p-0 print:text-black">
                                        <span className="text-slate-400 font-medium text-xs print:text-slate-600">[{size}:</span>
                                        <span>{ratio}]</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-12 print:mb-24">
                        <table className="w-full text-left border-collapse print:border print:border-slate-800">
                            <thead className="print:bg-slate-100">
                                <tr className=" text-slate-600 text-sm uppercase tracking-wider print:text-black">
                                    <th className="p-3 font-semibold rounded-tl-lg print:border print:border-slate-300">Roll ID</th>
                                    <th className="p-3 font-semibold print:border print:border-slate-300">Color</th>
                                    <th className="p-3 font-semibold text-right rounded-tr-lg print:border print:border-slate-300">Dispatched Pieces</th>
                                </tr>
                            </thead>
                            <tbody className="print:divide-slate-300">
                                {receipt.rolls.filter(r => r.dispatchedPieces > 0).map((roll, idx) => (
                                    <tr key={idx} className="border-b border-slate-100 print:border-slate-300">
                                        <td className="p-3 font-medium text-slate-800 print:border print:border-slate-300 print:text-black">{roll.rollId}</td>
                                        <td className="p-3 text-slate-600 print:border print:border-slate-300 print:text-black">{roll.color}({roll.colorNumber})</td>
                                        <td className="p-3 text-right font-bold text-slate-800 print:border print:border-slate-300 print:text-black">{roll.dispatchedPieces}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="print:bg-slate-100">
                                <tr className="bg-slate-50 border-t-2 border-slate-200 print:border-t print:border-slate-800">
                                    <td colSpan="2" className="p-3 font-bold text-slate-800 text-right print:border print:border-slate-300 print:text-black">Total in this Shipment:</td>
                                    <td className="p-3 text-right font-bold text-blue-700 text-lg print:border print:border-slate-300 print:text-black">{totalDispatched}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="flex justify-between items-end mt-24 pt-8 border-t border-slate-200 print:border-slate-800">
                        <div className="text-center w-48">
                            <div className="border-b border-slate-400 h-8 mb-2 print:border-slate-800"></div>
                            <p className="text-sm font-medium text-slate-600 print:text-black">Authorized Dispatch Officer</p>
                            <p className="text-xs text-slate-400 mt-1 print:hidden">System Verified</p>
                        </div>
                        <div className="text-center w-48">
                            <div className="border-b border-slate-400 h-8 mb-2 print:border-slate-800"></div>
                            <p className="text-sm font-medium text-slate-600 print:text-black">Transport / Receiver Signature</p>
                        </div>
                    </div>
                    <div className="hidden print:block text-center mt-8 text-xs text-slate-500 italic">
                        This is a computer-generated receipt and requires signatures for physical transit.
                    </div>
                </div>
            </div>
        </div>
    );
}
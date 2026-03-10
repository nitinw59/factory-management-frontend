import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Truck, Search, CheckCircle, Package, X, 
    FileText, Printer, ArrowLeft, ShieldCheck, Building2, 
    Calendar, Loader2, AlertCircle, ChevronDown, Eye, Box,
    ShoppingBag, ChevronRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ==========================================
// 1. MOCK API SERVICE (For Canvas Preview)
// In production, UNCOMMENT the line below and DELETE this mock object
// ==========================================
import { dispatchManagerApi } from '../../api/dispatchManagerApi';



// ==========================================
// 2. SHARED UI COMPONENTS
// ==========================================
const Spinner = () => <div className="flex justify-center items-center p-12"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-rose-600 bg-rose-50 rounded-xl border border-rose-100 font-medium flex items-center justify-center space-x-2"><AlertCircle size={20} /><span>{message}</span></div>;

const Modal = ({ title, onClose, children, maxWidth = "max-w-2xl" }) => (
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
// 3. DISPATCH MODAL / FORM
// ==========================================
const DispatchFormModal = ({ batch, onClose, onSuccess }) => {
    const [rolls, setRolls] = useState([]);
    const [inputs, setInputs] = useState({});
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
    }, [batch.id, batch.real_batch_id]);

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
            
            const generatedReceipt = {
                ...batch,
                dispatchDate: response.dispatchDate,
                receiptId: response.receiptId,
                rolls: payload.dispatchedRolls
            };
            
            onSuccess(generatedReceipt);
        } catch (err) {
            setError("Failed to finalize dispatch process.");
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <Modal title={`Dispatching: ${batch.id}`} onClose={onClose}><Spinner /></Modal>;
    if (error) return <Modal title="Error" onClose={onClose}><ErrorDisplay message={error} /></Modal>;

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
        setBatches(prev => prev.map(b => b.id === receiptData.id ? { ...b, status: 'DISPATCHED', dispatchDate: receiptData.dispatchDate } : b));
        setExpandedSections({ READY: false, DISPATCHED: true });
    };

    const handleViewExistingReceipt = async (batch) => {
        setIsLoading(true);
        try {
            const res = await dispatchManagerApi.getReceiptDetails(batch.real_batch_id);
            const receiptData = res.data?.data || res.data || {};
            console.log("Fetched receipt details:", receiptData);
            setReceiptView({ 
                ...batch, 
                receiptId: receiptData.receiptId, 
                dispatchDate: receiptData.dispatchDate, 
                sizeRatio: receiptData.sizeRatio || null,
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

    // ==========================================
    // PDF GENERATION WITH JSPDF (For B&W Printing)
    // ==========================================
    const handlePrintPDF = () => {
        if (!receiptView) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        
        const totalCut = receiptView.rolls.reduce((sum, r) => sum + parseInt(r.cutPieces || 0, 10), 0);
        const totalDispatched = receiptView.rolls.reduce((sum, r) => sum + parseInt(r.dispatchedPieces || 0, 10), 0);

        // Set global text color to pure black
        doc.setTextColor(0, 0, 0);

        // --- LETTERHEAD ---
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

        // Separator Line (Black)
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(14, 45, pageWidth - 14, 45);

        // --- RECEIPT HEADER INFO ---
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("DISPATCH RECEIPT", 14, 55);

        // Left Side
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Receipt #:", 14, 65);
        doc.setFont("helvetica", "normal");
        doc.text(`${receiptView.receiptId}`, 40, 65);

        doc.setFont("helvetica", "bold");
        doc.text("Date:", 14, 72);
        doc.setFont("helvetica", "normal");
        doc.text(`${receiptView.dispatchDate}`, 40, 72);
        
        doc.setFont("helvetica", "bold");
        doc.text("Batch ID:", 14, 79);
        doc.setFont("helvetica", "normal");
        doc.text(`${receiptView.id}`, 40, 79);

        // Right Side 
        doc.setFont("helvetica", "bold");
        doc.text("Client:", 120, 65);
        doc.setFont("helvetica", "normal");
        doc.text(`${receiptView.client}`, 135, 65);
        
        doc.setFont("helvetica", "bold");
        doc.text("Style:", 120, 72);
        doc.setFont("helvetica", "normal");
        doc.text(`${receiptView.style}`, 135, 72);

        if (receiptView.po_code) {
            doc.setFont("helvetica", "bold");
            doc.text("PO Ref:", 120, 79);
            doc.setFont("helvetica", "normal");
            doc.text(`${receiptView.po_code}`, 135, 79);
        }

        let currentY = 88;

        // --- SIZE RATIO SECTION ---
        if (receiptView.sizeRatio && Object.keys(receiptView.sizeRatio).length > 0) {
            doc.setFont("helvetica", "bold");
            doc.text("Size Ratio:", 14, currentY);
            
            doc.setFont("helvetica", "normal");
            const ratioString = Object.entries(receiptView.sizeRatio)
                .map(([size, ratio]) => `[${size}: ${ratio}]`)
                .join('   ');
                
            doc.text(ratioString, 40, currentY);
            currentY += 10;
        }

        // --- ITEMS TABLE (Black & White Styles) ---
        autoTable(doc, { 
            startY: currentY + 5, 
            head: [['Roll ID', 'Color',  'Dispatched Pieces']], 
            body: receiptView.rolls.map(r => [
                r.rollId, 
                r.color + (r.colorNumber ? ` (${r.colorNumber})` : ''), 
                r.dispatchedPieces
            ]),
            theme: 'grid',
            // Use white text on black background for header, pure black borders
            headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], lineColor: [0, 0, 0], lineWidth: 0.5 },
            // Use black text on white background for body, pure black borders
            bodyStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
            alternateRowStyles: { fillColor: [255, 255, 255] }, // Disable alternate row coloring
            styles: { fontSize: 10, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5 },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right', fontStyle: 'bold' }
            },
            foot: [[
                { content: 'Grand Total', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
                { content: `${totalCut}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
                { content: `${totalDispatched}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } }
            ]],
            // Ensure footer borders are black
            footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 }
        });

        // --- FOOTER SIGNATURES ---
        const finalY = doc.lastAutoTable.finalY + 30;
        
        doc.setFont("helvetica", "bold");
        doc.text("Authorized Dispatch Officer", 14, finalY);
        doc.setDrawColor(0, 0, 0); // Black line
        doc.line(14, finalY + 1, 70, finalY + 1);

        doc.text("Transport / Receiver Signature", 120, finalY);
        doc.line(120, finalY + 1, 180, finalY + 1);

        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text("This is a computer-generated receipt and requires signatures for physical transit.", pageWidth / 2, finalY + 15, { align: 'center' });

        // Trigger Download
        doc.save(`Dispatch_Receipt_${receiptView.receiptId}.pdf`);
    };

    // --- RECEIPT RENDER ---
    if (receiptView) {
        const totalDispatched = receiptView.rolls.reduce((sum, r) => sum + r.dispatchedPieces, 0);
        const totalCut = receiptView.rolls.reduce((sum, r) => sum + r.cutPieces, 0);
        
        return (
            <div className="min-h-screen bg-slate-100 p-8 font-sans print:p-0 print:bg-white">
                <div className="max-w-3xl mx-auto">
                    <div className="flex justify-between items-center mb-6 print:hidden">
                        <button onClick={() => setReceiptView(null)} className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 bg-white px-4 py-2 rounded-lg shadow-sm">
                            <ArrowLeft size={18} /><span>Back to Dashboard</span>
                        </button>
                        <button onClick={handlePrintPDF} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm font-medium transition-colors">
                            <Printer size={18} /><span>Download PDF</span>
                        </button>
                    </div>

                    <div className="bg-white p-10 rounded-xl shadow-lg print:shadow-none print:p-0 print:m-0 border border-slate-200 print:border-none">
                        
                        {/* Print Only Letterhead */}
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
                                <h2 className="text-xl font-bold text-slate-800 print:text-black">RECEIPT #{receiptView.receiptId || receiptView.id.replace('B-', 'REC-')}</h2>
                                <div className="flex items-center justify-end space-x-2 mt-2 text-slate-600 print:text-black">
                                    <Calendar size={14} className="print:hidden"/><span className="text-sm">Date: {receiptView.dispatchDate}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-6 bg-slate-50 p-6 rounded-lg border border-slate-100 print:bg-transparent print:border-none print:p-0">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-600">Batch Information</h3>
                                <p className="font-semibold text-slate-800 text-lg print:text-black">{receiptView.id}</p>
                                <p className="text-slate-600 mt-1 print:text-black">{receiptView.style}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-600">Client</h3>
                                <p className="font-semibold text-slate-800 text-lg print:text-black">{receiptView.client}</p>
                                {receiptView.po_code && <p className="text-slate-500 text-sm mt-1 print:text-black">PO: {receiptView.po_code}</p>}
                            </div>
                        </div>

                         {/* UI Element for Size Ratio */}
                         {receiptView.sizeRatio && (
                            <div className="mb-6 bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex flex-col md:flex-row md:items-center gap-4 print:bg-transparent print:border-none print:p-0">
                                <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider shrink-0 print:text-slate-600">Size Ratio:</h3>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(receiptView.sizeRatio).map(([size, ratio]) => (
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
                                        <th className="p-3 font-semibold text-right print:border print:border-slate-300">Cut Pieces</th>
                                        <th className="p-3 font-semibold text-right rounded-tr-lg print:border print:border-slate-300">Dispatched Pieces</th>
                                    </tr>
                                </thead>
                                <tbody className="print:divide-slate-300">
                                    {receiptView.rolls.map((roll, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 print:border-slate-300">
                                            <td className="p-3 font-medium text-slate-800 print:border print:border-slate-300 print:text-black">{roll.rollId}</td>
                                            <td className="p-3 text-slate-600 print:border print:border-slate-300 print:text-black">{roll.color}({roll.colorNumber})</td>
                                            <td className="p-3 text-right text-slate-600 print:border print:border-slate-300 print:text-black">{roll.cutPieces}</td>
                                            <td className="p-3 text-right font-bold text-slate-800 print:border print:border-slate-300 print:text-black">{roll.dispatchedPieces}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="print:bg-slate-100">
                                    <tr className="bg-slate-50 border-t-2 border-slate-200 print:border-t print:border-slate-800">
                                        <td colSpan="2" className="p-3 font-bold text-slate-800 text-right print:border print:border-slate-300 print:text-black">Total:</td>
                                        <td className="p-3 text-right font-bold text-slate-800 print:border print:border-slate-300 print:text-black">{totalCut}</td>
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
                                                    <ShoppingBag size={10} className="mr-1"/> {batch.po_code}
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
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
                    .print\\:hidden { display: none !important; }
                    .print\\:block { display: block !important; }
                    .print\\:shadow-none { box-shadow: none !important; }
                    .print\\:p-0 { padding: 0 !important; }
                    .print\\:m-0 { margin: 0 !important; }
                    .print\\:bg-white { background-color: white !important; }
                    .print\\:bg-transparent { background-color: transparent !important; }
                    .print\\:border-none { border: none !important; }
                    .print\\:border { border-width: 1px !important; }
                    .print\\:border-slate-800 { border-color: #1e293b !important; }
                    .print\\:border-slate-300 { border-color: #cbd5e1 !important; }
                    .print\\:text-black { color: black !important; }
                    .print\\:border-collapse { border-collapse: collapse !important; }
                    .print\\:bg-slate-100 { background-color: #f1f5f9 !important; }
                    @page { margin: 1.5cm; }
                }
            `}} />
        </div>
    );
}
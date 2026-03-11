import React, { useState, useEffect, useRef } from 'react';
import { 
    Package, Users, Wrench, Search, FileText, CheckCircle, 
    Clock, AlertCircle, Loader2, Plus, Trash2, Printer, User, X, ChevronDown, RefreshCcw
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Assuming you have your api utility configured
import { storeManagerApi } from '../../api/storeManagerApi';

// ==========================================
// SHARED COMPONENTS
// ==========================================
const Spinner = () => (
    <div className="flex flex-col items-center justify-center p-12 text-indigo-600">
        <Loader2 className="animate-spin h-8 w-8 mb-4" />
        <p className="text-sm font-medium text-gray-500">Loading inventory data...</p>
    </div>
);

const ErrorDisplay = ({ message, onRetry }) => (
    <div className="flex flex-col items-center justify-center p-12 bg-red-50 rounded-2xl border border-red-100 m-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold text-red-800 mb-2">Failed to Load Data</h3>
        <p className="text-sm text-red-600 mb-6">{message}</p>
        <button onClick={onRetry} className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 font-medium transition-colors">
            <RefreshCcw className="w-4 h-4 mr-2" /> Retry Connection
        </button>
    </div>
);

const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                <h2 className="text-lg font-bold text-gray-800">{title}</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">{children}</div>
        </div>
    </div>
);

// --- Simple Searchable Dropdown ---
const SearchableDropdown = ({ options, value, onChange, placeholder, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));
    const selected = options.find(opt => String(opt.value) === String(value));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button type="button" onClick={() => !disabled && setIsOpen(!isOpen)} disabled={disabled} className={`w-full p-3 border rounded-xl bg-white text-left flex justify-between items-center focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'border-gray-300 hover:border-gray-400'}`}>
                <span className={`block truncate ${!selected ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>{selected ? selected.label : placeholder}</span>
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
            </button>
            {isOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 flex flex-col overflow-hidden">
                    <div className="p-2 bg-gray-50 border-b border-gray-100">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <input type="text" className="w-full pl-8 pr-2 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-indigo-500" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filtered.map(opt => (
                            <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(''); }} className="px-4 py-3 text-sm cursor-pointer hover:bg-indigo-50 text-gray-700 font-medium border-b border-gray-50 last:border-0">
                                {opt.label}
                            </div>
                        ))}
                        {filtered.length === 0 && <div className="p-4 text-center text-sm text-gray-500">No results found.</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================
export default function SparesIssuanceDashboard() {
    const [activeTab, setActiveTab] = useState('requests'); 
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Core Data States
    const [requests, setRequests] = useState([]);
    const [users, setUsers] = useState([]);
    const [storeSpares, setStoreSpares] = useState([]);
    const [invoices, setInvoices] = useState([]);

    // UI Interactive States
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [invoiceToView, setInvoiceToView] = useState(null);

    // Direct Issuance Form States
    const [directUserId, setDirectUserId] = useState('');
    const [directItems, setDirectItems] = useState([{ spare_part_id: '', quantity: 1 }]);
    const [directNotes, setDirectNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initial Fetch
    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [reqsRes, usrRes, sprsRes, invsRes] = await Promise.all([
                storeManagerApi.getPendingRequests(),
                storeManagerApi.getFactoryUsers(),
                storeManagerApi.getStoreSparesInventory(), // Ensure correct endpoint is hit
                storeManagerApi.getInvoices()
            ]);

            // Safe extraction logic (Handles Axios wrapping e.g., res.data vs res.data.data)
            const reqsData = reqsRes.data?.data || reqsRes.data || reqsRes || [];
            const usrData = usrRes.data?.data || usrRes.data || usrRes || [];
            const sprsData = sprsRes.data?.data || sprsRes.data || sprsRes || [];
            const invsData = invsRes.data?.data || invsRes.data || invsRes || [];

            setRequests(Array.isArray(reqsData) ? reqsData : []);
            setUsers(Array.isArray(usrData) ? usrData.map(u => ({ label: `${u.name} (${u.role})`, value: u.id })) : []);
            setStoreSpares(Array.isArray(sprsData) ? sprsData : []);
            setInvoices(Array.isArray(invsData) ? invsData : []);

        } catch (err) {
            console.error("Dashboard Load Error:", err);
            setError(err.response?.data?.error || err.message || "Unable to reach the server. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    // --- FULFILLMENT MODAL COMPONENT ---
    const FulfillModal = ({ reqData, onClose }) => {
        const [items, setItems] = useState(reqData.items.map(i => {
            const pendingQty = i.requested_qty - (i.issued_qty || 0);
            return {
                ...i,
                pending_qty: pendingQty,
                // Default to issuing whatever is pending, capped by what's actually in stock
                issue_qty: i.store_stock >= pendingQty ? pendingQty : i.store_stock
            };
        }));
        const [processing, setProcessing] = useState(false);

        const handleIssue = async () => {
            const validItems = items.filter(i => i.issue_qty > 0);
            if (validItems.length === 0) return alert("Please specify quantities to issue.");

            setProcessing(true);
            try {
                const payload = {
                    target_user_id: reqData.requested_by_user_id,
                    request_id: reqData.request_id,
                    items: validItems.map(i => ({ spare_part_id: i.spare_part_id, quantity: i.issue_qty })),
                    notes: `Fulfillment of Request #${reqData.request_id}`
                };
                
                await storeManagerApi.generateInvoice(payload);
                alert("Spares Issued and Invoice Generated Successfully!");
                onClose();
                loadData(); // Refresh the main dashboard
            } catch (err) {
                console.error("Fulfillment Error:", err);
                alert(err.response?.data?.error || "Failed to process issuance.");
            } finally {
                setProcessing(false);
            }
        };

        const totalCost = items.reduce((sum, i) => sum + (i.issue_qty * i.unit_cost), 0);

        return (
            <Modal title={`Fulfill Request #${reqData.request_id}`} onClose={onClose}>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Requested By</p>
                        <p className="text-lg font-bold text-indigo-900">{reqData.requested_by_name}</p>
                    </div>
                    <div className="sm:text-right">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Date Logged</p>
                        <p className="text-sm font-medium text-indigo-900">{new Date(reqData.created_at).toLocaleString()}</p>
                    </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-x-auto mb-6">
                    <table className="w-full text-left border-collapse text-sm min-w-[600px]">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="p-3 font-semibold">Part Info</th>
                                <th className="p-3 font-semibold text-center">Req / Issued</th>
                                <th className="p-3 font-semibold text-center">Store Stock</th>
                                <th className="p-3 font-semibold text-right">Approve Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((item, idx) => {
                                const isShort = item.store_stock < item.pending_qty;
                                const isComplete = item.pending_qty <= 0;

                                return (
                                    <tr key={idx} className={isComplete ? "bg-gray-50 opacity-60" : isShort ? "bg-red-50/30" : ""}>
                                        <td className="p-3">
                                            <p className="font-bold text-gray-800">{item.part_name}</p>
                                            <p className="text-xs text-gray-500 font-mono">{item.part_number}</p>
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="text-xs font-bold text-gray-700">
                                                {item.requested_qty} Req <br/>
                                                <span className="text-indigo-600">{item.issued_qty || 0} Issued</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${isShort ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {item.store_stock} available
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <input 
                                                type="number" min="0" max={item.store_stock}
                                                disabled={isComplete}
                                                value={item.issue_qty}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    const newItems = [...items];
                                                    // Ensure we don't issue more than we have, OR more than what is pending
                                                    const maxAllowed = Math.min(item.store_stock, item.pending_qty);
                                                    newItems[idx].issue_qty = val > maxAllowed ? maxAllowed : val;
                                                    setItems(newItems);
                                                }}
                                                className="w-full max-w-[90px] ml-auto text-right p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-700 bg-white disabled:bg-gray-100"
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-100 gap-4">
                    <p className="text-sm text-gray-500 font-medium">Estimated Value: <span className="text-lg font-black text-gray-900">${totalCost.toFixed(2)}</span></p>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={onClose} className="flex-1 sm:flex-none px-5 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                        <button onClick={handleIssue} disabled={processing} className="flex-1 sm:flex-none px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center justify-center shadow-md transition-colors disabled:opacity-70">
                            {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <CheckCircle className="w-4 h-4 mr-2"/>} Issue Spares
                        </button>
                    </div>
                </div>
            </Modal>
        );
    };

    // --- DIRECT ISSUANCE SUBMIT ---
    const handleDirectIssue = async (e) => {
        e.preventDefault();
        if (!directUserId) return alert("Please select a user to issue spares to.");
        
        const validItems = directItems.filter(i => i.spare_part_id && i.quantity > 0);
        if (validItems.length === 0) return alert("Please add at least one valid spare part with a quantity greater than 0.");

        setIsSubmitting(true);
        try {
            const payload = {
                target_user_id: directUserId,
                items: validItems,
                notes: directNotes
            };
            
            await storeManagerApi.generateInvoice(payload);
            alert("Direct Issuance Logged & Invoice Generated Successfully!");
            
            // Reset Form
            setDirectUserId('');
            setDirectItems([{ spare_part_id: '', quantity: 1 }]);
            setDirectNotes('');
            
            // Refresh Dashboard to update stock levels
            loadData();
        } catch (err) {
            console.error("Direct Issuance Error:", err);
            alert(err.response?.data?.error || "Failed to issue spares. Ensure sufficient stock.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- PDF GENERATOR (Production Quality) ---
    const generatePDF = (invoice) => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        
        // Colors - purely B&W for physical printing
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

        // Separator Line
        doc.setLineWidth(0.5);
        doc.setDrawColor(0, 0, 0);
        doc.line(14, 45, pageWidth - 14, 45);

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("SPARE PARTS INVOICE", 14, 55);

        // Header Data Left
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Invoice #:", 14, 65);
        doc.setFont("helvetica", "normal");
        doc.text(invoice.invoice_number, 40, 65);

        doc.setFont("helvetica", "bold");
        doc.text("Date:", 14, 72);
        doc.setFont("helvetica", "normal");
        doc.text(new Date(invoice.created_at).toLocaleString(), 40, 72);

        // Header Data Right
        doc.setFont("helvetica", "bold");
        doc.text("Issued To:", 120, 65);
        doc.setFont("helvetica", "normal");
        doc.text(invoice.issued_to, 145, 65);

        doc.setFont("helvetica", "bold");
        doc.text("Issued By:", 120, 72);
        doc.setFont("helvetica", "normal");
        doc.text(invoice.issued_by, 145, 72);

        // Render Table
        autoTable(doc, { 
            startY: 85, 
            head: [['Part Name', 'SKU', 'Qty', 'Unit Price', 'Total']], 
            body: invoice.items.map(i => [
                i.part_name, 
                i.part_number, 
                i.quantity, 
                `$${parseFloat(i.unit_price).toFixed(2)}`, 
                `$${parseFloat(i.total_price).toFixed(2)}`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], lineColor: [0, 0, 0], lineWidth: 0.5 },
            bodyStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
            alternateRowStyles: { fillColor: [255, 255, 255] },
            styles: { fontSize: 10, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.5 },
            columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
            foot: [[
                { content: 'Grand Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } },
                { content: `$${parseFloat(invoice.total_amount).toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] } }
            ]],
            footStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 }
        });

        // Signatures Footer
        const finalY = doc.lastAutoTable.finalY + 40;
        doc.setFont("helvetica", "bold");
        doc.text("Authorized Store Manager", 14, finalY);
        doc.line(14, finalY + 1, 75, finalY + 1);

        doc.text("Receiver Signature", 120, finalY);
        doc.line(120, finalY + 1, 180, finalY + 1);

        doc.save(`${invoice.invoice_number}.pdf`);
    };

    // --- RENDERING ---
    if (loading) return <Spinner />;
    if (error) return <ErrorDisplay message={error} onRetry={loadData} />;

    return (
        <div className="min-h-screen bg-gray-50 font-inter text-gray-900 pb-20">
            {/* Top Navigation / Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm px-6 py-4">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 p-2 rounded-xl shadow-sm"><Wrench className="text-white" size={24} /></div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Spares Issuance & Billing</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">
                
                {/* TABS */}
                <div className="flex overflow-x-auto hide-scrollbar bg-gray-200/60 p-1.5 rounded-xl w-full md:w-max mb-8 snap-x">
                    <button onClick={() => setActiveTab('requests')} className={`shrink-0 snap-center flex items-center px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'requests' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Clock className="w-4 h-4 mr-2"/> Pending Requests
                        {requests.length > 0 && <span className="ml-2 bg-rose-500 text-white px-2 py-0.5 rounded-full text-xs shadow-sm">{requests.length}</span>}
                    </button>
                    <button onClick={() => setActiveTab('direct')} className={`shrink-0 snap-center flex items-center px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'direct' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <User className="w-4 h-4 mr-2"/> Direct Issue
                    </button>
                    <button onClick={() => setActiveTab('history')} className={`shrink-0 snap-center flex items-center px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <FileText className="w-4 h-4 mr-2"/> Invoices Log
                    </button>
                </div>

                {/* TAB 1: PENDING REQUESTS */}
                {activeTab === 'requests' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        {requests.length === 0 ? (
                            <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                                <CheckCircle className="mx-auto h-16 w-16 text-emerald-400 mb-4 opacity-50"/>
                                <p className="text-lg font-bold text-gray-700">All Caught Up!</p>
                                <p className="text-gray-500 font-medium">There are no pending spare part requests from the floor.</p>
                            </div>
                        ) : (
                            requests.map(req => (
                                <div key={req.request_id} className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 hover:border-indigo-300 transition-all flex flex-col md:flex-row gap-6">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-3 mb-3">
                                            <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-3 py-1 rounded-md uppercase tracking-wider">REQ #{req.request_id}</span>
                                            <span className="text-sm font-medium text-gray-500 flex items-center"><Clock className="w-4 h-4 mr-1.5"/> {new Date(req.created_at).toLocaleString()}</span>
                                            {req.status === 'PARTIAL' && <span className="text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-md uppercase">Partially Filled</span>}
                                        </div>
                                        <h3 className="font-bold text-xl text-gray-900 mb-3">{req.requested_by_name}</h3>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {req.items.map((item, i) => {
                                                const pending = item.requested_qty - (item.issued_qty || 0);
                                                return pending > 0 ? (
                                                    <span key={i} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm px-3 py-1.5 rounded-lg font-medium shadow-sm">
                                                        <span className="font-black text-indigo-600 mr-1.5">{pending}x</span> {item.part_name}
                                                    </span>
                                                ) : null;
                                            })}
                                        </div>
                                        {req.notes && (
                                            <div className="bg-gray-50 border-l-4 border-gray-300 p-3 rounded-r-lg">
                                                <p className="text-sm text-gray-600 italic font-medium">"{req.notes}"</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-gray-100 pt-5 md:pt-0 md:pl-6 min-w-[180px]">
                                        <button onClick={() => setSelectedRequest(req)} className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors active:scale-95">
                                            Review & Fulfill
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* TAB 2: DIRECT ISSUANCE */}
                {activeTab === 'direct' && (
                    <form onSubmit={handleDirectIssue} className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200 animate-in fade-in duration-300">
                        <div className="mb-8 pb-6 border-b border-gray-100">
                            <h2 className="text-xl font-black text-gray-900 mb-2">Direct Issuance Invoice</h2>
                            <p className="text-sm text-gray-500 font-medium">Bypass requests to issue stock directly to any registered factory user. This automatically deducts from the main store and logs the invoice.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Issue To (Receiver) *</label>
                                <SearchableDropdown 
                                    options={users} 
                                    value={directUserId} 
                                    onChange={setDirectUserId} 
                                    placeholder="Search by name or role..." 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notes / Reference</label>
                                <input 
                                    type="text" 
                                    value={directNotes} 
                                    onChange={e => setDirectNotes(e.target.value)} 
                                    placeholder="e.g., General supply for Line 2..." 
                                    className="w-full p-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm transition-all bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Line Items *</label>
                            {directItems.map((item, idx) => {
                                const selectedPartInfo = storeSpares.find(s => s.id === item.spare_part_id);
                                const maxStock = selectedPartInfo ? selectedPartInfo.current_stock : 9999;

                                return (
                                    <div key={idx} className="flex flex-col sm:flex-row items-center gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="flex-1 w-full">
                                            <SearchableDropdown 
                                                options={storeSpares.map(s => ({ 
                                                    label: `${s.name} (${s.part_number}) - Stock: ${s.current_stock}`, 
                                                    value: s.id 
                                                }))} 
                                                value={item.spare_part_id} 
                                                onChange={(val) => {
                                                    const newItems = [...directItems];
                                                    newItems[idx].spare_part_id = val;
                                                    newItems[idx].quantity = 1; // reset qty on part change
                                                    setDirectItems(newItems);
                                                }} 
                                                placeholder="Search Store Catalog..." 
                                            />
                                        </div>
                                        <div className="w-full sm:w-40 flex items-center bg-white border border-gray-300 rounded-xl overflow-hidden shrink-0 shadow-sm">
                                            <span className="px-4 text-xs font-bold text-gray-500 bg-gray-50 border-r border-gray-200 py-3.5 uppercase">Qty</span>
                                            <input 
                                                type="number" min="1" max={maxStock}
                                                disabled={!item.spare_part_id}
                                                value={item.quantity} 
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 0;
                                                    const newItems = [...directItems];
                                                    // Prevent exceeding stock
                                                    newItems[idx].quantity = val > maxStock ? maxStock : val;
                                                    setDirectItems(newItems);
                                                }} 
                                                className="w-full p-2.5 text-center outline-none font-black text-indigo-700 disabled:bg-gray-100"
                                            />
                                        </div>
                                        {directItems.length > 1 && (
                                            <button type="button" onClick={() => setDirectItems(prev => prev.filter((_, i) => i !== idx))} className="p-3.5 text-red-400 hover:text-red-600 bg-white rounded-xl border border-gray-200 hover:border-red-200 transition-colors shrink-0 shadow-sm">
                                                <Trash2 size={20}/>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                            <button type="button" onClick={() => setDirectItems(prev => [...prev, { spare_part_id: '', quantity: 1 }])} className="text-sm font-bold text-indigo-600 flex items-center hover:bg-indigo-50 px-4 py-3.5 rounded-xl border border-indigo-200 border-dashed transition-colors w-full justify-center mt-2 bg-white">
                                <Plus size={18} className="mr-1.5"/> Add Another Part
                            </button>
                        </div>

                        <div className="flex justify-end pt-6 border-t border-gray-100">
                            <button type="submit" disabled={isSubmitting} className="px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 w-full md:w-auto justify-center">
                                {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin"/> : <FileText className="w-5 h-5 mr-2"/>} 
                                {isSubmitting ? 'Processing Invoice...' : 'Generate Direct Invoice'}
                            </button>
                        </div>
                    </form>
                )}

                {/* TAB 3: INVOICE HISTORY */}
                {activeTab === 'history' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in duration-300">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                                    <tr>
                                        <th className="p-5 font-bold">Invoice #</th>
                                        <th className="p-5 font-bold">Date Issued</th>
                                        <th className="p-5 font-bold">Issued To</th>
                                        <th className="p-5 font-bold text-right">Total Amount</th>
                                        <th className="p-5 font-bold text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {invoices.map(inv => (
                                        <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="p-5 font-bold text-indigo-900">{inv.invoice_number}</td>
                                            <td className="p-5 text-gray-600 font-medium text-sm">{new Date(inv.created_at).toLocaleString()}</td>
                                            <td className="p-5 font-bold text-gray-800">{inv.issued_to}</td>
                                            <td className="p-5 text-right font-black text-emerald-600 text-lg">${parseFloat(inv.total_amount).toFixed(2)}</td>
                                            <td className="p-5 text-right">
                                                <button onClick={() => setInvoiceToView(inv)} className="bg-white border border-gray-300 hover:border-indigo-400 text-gray-700 hover:text-indigo-700 px-4 py-2.5 rounded-lg text-sm font-bold shadow-sm inline-flex items-center transition-colors active:scale-95">
                                                    <Printer size={16} className="mr-2 opacity-70"/> Print View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {invoices.length === 0 && <tr><td colSpan="5" className="p-12 text-center text-gray-400 font-medium">No invoices generated yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* MODALS */}
            {selectedRequest && <FulfillModal reqData={selectedRequest} onClose={() => setSelectedRequest(null)} />}
            
            {invoiceToView && (
                <Modal title={`Invoice Details: ${invoiceToView.invoice_number}`} onClose={() => setInvoiceToView(null)}>
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6 flex flex-col sm:flex-row sm:justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase mb-1 tracking-wider">Issued To</p>
                            <p className="font-bold text-gray-900 text-lg">{invoiceToView.issued_to}</p>
                        </div>
                        <div className="sm:text-right">
                            <p className="text-xs font-bold text-gray-400 uppercase mb-1 tracking-wider">Total Value</p>
                            <p className="text-2xl font-black text-emerald-600">${parseFloat(invoiceToView.total_amount).toFixed(2)}</p>
                        </div>
                    </div>
                    
                    <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-100 border-b border-gray-200">
                                <tr>
                                    <th className="p-3 font-bold text-gray-700">Part Description</th>
                                    <th className="p-3 font-bold text-gray-700 text-center">Qty</th>
                                    <th className="p-3 font-bold text-gray-700 text-right">Total Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {invoiceToView.items.map((it, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="p-3">
                                            <p className="font-bold text-gray-900">{it.part_name}</p>
                                            <p className="text-xs text-gray-500 font-mono mt-0.5">{it.part_number}</p>
                                        </td>
                                        <td className="p-3 text-center font-black text-gray-700">{it.quantity}</td>
                                        <td className="p-3 text-right font-bold text-gray-900 font-mono">${parseFloat(it.total_price).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="flex justify-end pt-4 border-t border-gray-100">
                        <button onClick={() => generatePDF(invoiceToView)} className="px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 flex items-center transition-colors active:scale-95">
                            <Printer size={18} className="mr-2"/> Download Official PDF
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
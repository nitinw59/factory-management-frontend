import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    AlertTriangle, CheckCircle, Clock, Search, Plus, X, 
    Wrench, FileText, ChevronRight, Filter, Loader2, 
    ThumbsUp, ThumbsDown, Camera, QrCode
} from 'lucide-react';
import { assetApi } from '../../api/assetApi';  
import { Html5QrcodeScanner } from 'html5-qrcode';

// --- SHARED COMPONENTS ---
const Spinner = () => <Loader2 className="animate-spin h-5 w-5 text-current" />;

const Badge = ({ type, value }) => {
    const styles = {
        OPEN: 'bg-red-100 text-red-800 border-red-200',
        IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
        RESOLVED: 'bg-green-100 text-green-800 border-green-200',
        CLOSED: 'bg-gray-100 text-gray-600 border-gray-200',
        CRITICAL: 'bg-red-50 text-red-600 border-red-100 animate-pulse',
        HIGH: 'bg-orange-50 text-orange-600 border-orange-100',
        MEDIUM: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        LOW: 'bg-gray-50 text-gray-600 border-gray-100',
    };
    
    const labels = { RESOLVED: 'WAITING VERIFICATION' }; 
    
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${styles[value] || 'bg-gray-100'}`}>
            {type === 'status' ? (labels[value] || value.replace('_', ' ')) : value}
        </span>
    );
};

// --- QR SCANNER COMPONENT ---
const QRScannerOverlay = ({ onScanSuccess, onClose }) => {
    useEffect(() => {
        // Initialize Scanner
        const html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader", 
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            false // verbose=false
        );

        html5QrcodeScanner.render(
            (decodedText) => {
                // On Success: Stop scanning and return text
                html5QrcodeScanner.clear();
                onScanSuccess(decodedText);
            },
            (errorMessage) => {
                // Ignore background scan errors (it throws an error every frame it doesn't see a QR)
            }
        );

        // Cleanup: Ensure camera turns off when modal is closed
        return () => {
            html5QrcodeScanner.clear().catch(error => {
                console.error("Failed to clear html5QrcodeScanner. ", error);
            });
        };
    }, [onScanSuccess]);

    return (
        <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
            <button 
                onClick={onClose} 
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            >
                <X className="w-6 h-6" />
            </button>
            
            <div className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl">
                <div className="bg-slate-800 p-4 text-center">
                    <h3 className="text-white font-bold flex items-center justify-center">
                        <QrCode className="w-5 h-5 mr-2" /> Scan Asset Tag
                    </h3>
                </div>
                {/* The div where the camera feed will be injected */}
                <div id="qr-reader" className="w-full border-none"></div>
            </div>
            <p className="text-white/70 text-sm mt-6 font-medium tracking-wide">Align QR code within the frame</p>
        </div>
    );
};

// --- MODALS ---
const COMMON_ISSUES = [
    "Needle breakage",
    "Thread tension problems",
    "Timing shift",
    "Knife issue",
    "Lubrication / Oil leak"
];

const ReportModal = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({ qr_id: '', issue: '', priority: 'MEDIUM' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScanning, setIsScanning] = useState(false); // QR State

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            console.log("Submitting breakdown:", formData);
            await assetApi.reportBreakdown(formData);
            onSuccess();
        } catch (error) {
            alert("Failed to report breakdown");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleScanSuccess = (decodedText) => {
        setFormData({ ...formData, qr_id: decodedText });
        setIsScanning(false);
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center">
                            <AlertTriangle className="w-5 h-5 text-red-500 mr-2"/> Report Breakdown
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-md transition-colors">
                            <X className="w-5 h-5 text-gray-400 hover:text-gray-600"/>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Asset QR ID / Tag</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="Enter Asset ID..." 
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm shadow-sm"
                                        value={formData.qr_id}
                                        onChange={e => setFormData({...formData, qr_id: e.target.value})}
                                    />
                                    <QrCode className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                </div>
                                <button 
                                    type="button"
                                    onClick={() => setIsScanning(true)}
                                    className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors flex items-center justify-center font-bold text-sm"
                                    title="Scan QR Code"
                                >
                                    <Camera className="w-4 h-4 mr-2" /> Scan
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Priority Level</label>
                            <div className="grid grid-cols-2 gap-3">
                                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setFormData({...formData, priority: p})}
                                        className={`py-2 text-xs font-bold rounded-xl border-2 transition-all shadow-sm ${
                                            formData.priority === p 
                                            ? 'bg-red-50 border-red-500 text-red-700' 
                                            : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Describe the Issue</label>
                            
                            {/* Quick Select Common Issues */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {COMMON_ISSUES.map(issueText => (
                                    <button
                                        key={issueText}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ 
                                            ...prev, 
                                            issue: prev.issue ? `${prev.issue}, ${issueText}` : issueText 
                                        }))}
                                        className="px-2.5 py-1.5 bg-gray-50 hover:bg-red-50 text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                                    >
                                        + {issueText}
                                    </button>
                                ))}
                            </div>

                            <textarea 
                                required
                                rows="3"
                                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                                placeholder="Additional details..."
                                value={formData.issue}
                                onChange={e => setFormData({...formData, issue: e.target.value})}
                            ></textarea>
                        </div>

                        <div className="pt-2">
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-black rounded-xl shadow-md shadow-red-200 transition-all flex justify-center items-center active:scale-[0.98]"
                            >
                                {isSubmitting ? <Spinner/> : "SUBMIT TICKET"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Render the Scanner Overlay if active */}
            {isScanning && (
                <QRScannerOverlay 
                    onScanSuccess={handleScanSuccess} 
                    onClose={() => setIsScanning(false)} 
                />
            )}
        </>
    );
};

const VerifyModal = ({ ticket, onClose, onSuccess }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState('');

    const handleVerify = async (isSatisfied) => {
        setIsSubmitting(true);
        try {
            await assetApi.verifyRepair({ complaint_id: ticket.id, is_satisfied: isSatisfied, feedback_notes: feedback });
            onSuccess();
        } catch (error) {
            alert("Operation failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-green-50 p-6 border-b border-green-100 text-center relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-green-700/50 hover:text-green-700"><X size={20}/></button>
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-green-900">Verify Repair</h2>
                    <p className="text-green-700 text-sm mt-1">Mechanic marked this ticket as resolved.</p>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
                        <div className="flex justify-between mb-2">
                            <span className="text-xs font-bold text-gray-500 uppercase">Asset</span>
                            <span className="text-sm font-bold text-gray-800">{ticket.asset_name}</span>
                        </div>
                        <div className="flex justify-between mb-2">
                             <span className="text-xs font-bold text-gray-500 uppercase">Issue</span>
                             <span className="text-sm text-gray-800 text-right w-2/3 truncate">{ticket.issue}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200">
                            <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Mechanic Note</span>
                            <p className="text-sm text-gray-700 italic bg-white p-2 border border-gray-100 rounded-lg">"{ticket.mechanic_note || 'Maintenance performed as requested.'}"</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Feedback (Optional)</label>
                        <textarea 
                            className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 shadow-sm"
                            rows="2"
                            placeholder="Any comments for the mechanic..."
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <button 
                            onClick={() => handleVerify(false)}
                            disabled={isSubmitting}
                            className="flex flex-col items-center justify-center p-4 border-2 border-red-100 bg-red-50 hover:bg-red-100 hover:border-red-300 rounded-xl transition-all group active:scale-95 shadow-sm"
                        >
                            <ThumbsDown className="w-6 h-6 text-red-500 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-sm font-bold text-red-700">Not Fixed</span>
                            <span className="text-[10px] text-red-500 uppercase font-bold tracking-wider mt-1">Re-open Ticket</span>
                        </button>
                        
                        <button 
                            onClick={() => handleVerify(true)}
                            disabled={isSubmitting}
                            className="flex flex-col items-center justify-center p-4 border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 rounded-xl transition-all group active:scale-95 shadow-sm"
                        >
                            <ThumbsUp className="w-6 h-6 text-green-600 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-sm font-bold text-green-800">It Works</span>
                            <span className="text-[10px] text-green-600 uppercase font-bold tracking-wider mt-1">Close Ticket</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---
const SewingMachineComplaintPage = () => {
    const [complaints, setComplaints] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active'); 
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal States
    const [showReportModal, setShowReportModal] = useState(false);
    const [verifyTicket, setVerifyTicket] = useState(null);

    const fetchComplaints = async () => {
        setIsLoading(true);
        try {
            const res = await assetApi.getMyComplaints();
            setComplaints(res.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchComplaints();
    }, []);

    const filteredData = useMemo(() => {
        return complaints.filter(c => {
            const matchesTab = activeTab === 'active' 
                ? ['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(c.status)
                : ['CLOSED'].includes(c.status);
            const matchesSearch = c.asset_name?.toLowerCase().includes(searchTerm.toLowerCase()) 
                || c.asset_qr?.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [complaints, activeTab, searchTerm]);

    const stats = useMemo(() => ({
        open: complaints.filter(c => c.status === 'OPEN').length,
        resolved: complaints.filter(c => c.status === 'RESOLVED').length, 
        critical: complaints.filter(c => c.priority === 'CRITICAL' && c.status !== 'CLOSED').length
    }), [complaints]);

    return (
        <div className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 flex items-center">
                        <Wrench className="w-7 h-7 mr-3 text-blue-600"/> Maintenance Logs
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Manage production line breakdowns and verify repairs.</p>
                </div>
                
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    <div className="bg-gray-50 px-5 py-2 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center flex-1 md:flex-none">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Pending</span>
                        <span className="text-2xl font-black text-red-600">{stats.open}</span>
                    </div>
                    <div className="bg-gray-50 px-5 py-2 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center flex-1 md:flex-none">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Verify</span>
                        <span className={`text-2xl font-black ${stats.resolved > 0 ? 'text-green-600 animate-pulse' : 'text-gray-700'}`}>{stats.resolved}</span>
                    </div>
                     <button 
                        onClick={() => setShowReportModal(true)}
                        className="w-full md:w-auto bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl shadow-lg shadow-red-200 flex items-center justify-center font-bold transition-all active:scale-95"
                    >
                        <Plus className="w-5 h-5 mr-1.5"/> Report Issue
                    </button>
                </div>
            </div>

            {/* Search & Tabs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-100 p-4 sm:p-5 flex flex-col md:flex-row justify-between items-center gap-4 bg-gray-50/50">
                    <div className="flex bg-gray-200/50 p-1.5 rounded-xl w-full md:w-auto">
                        <button 
                            onClick={() => setActiveTab('active')}
                            className={`flex-1 md:flex-none px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'active' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                            Active Issues
                        </button>
                        <button 
                            onClick={() => setActiveTab('closed')}
                            className={`flex-1 md:flex-none px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'closed' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                            History
                        </button>
                    </div>
                    
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/>
                        <input 
                            type="text" 
                            placeholder="Search by Machine ID or Name..."
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Table / List */}
                <div className="divide-y divide-gray-100">
                    {isLoading ? (
                        <div className="p-16 flex justify-center"><Spinner /></div>
                    ) : filteredData.length === 0 ? (
                        <div className="p-16 text-center bg-gray-50/30">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-gray-800 font-bold text-lg">No tickets found</h3>
                            <p className="text-gray-500 text-sm mt-1">Your production line is running smoothly.</p>
                        </div>
                    ) : (
                        filteredData.map(ticket => (
                            <div key={ticket.id} className="p-5 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="font-extrabold text-gray-800">{ticket.asset_name}</span>
                                        <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                                            <QrCode className="w-3 h-3 inline mr-1 opacity-60"/>{ticket.asset_qr}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                         <Badge type="status" value={ticket.status} />
                                         <Badge type="priority" value={ticket.priority} />
                                         <span className="text-xs font-bold text-gray-400 flex items-center ml-1">
                                            <Clock className="w-3.5 h-3.5 mr-1"/> {new Date(ticket.created_at).toLocaleDateString()}
                                         </span>
                                    </div>
                                    <p className="text-sm text-gray-600 font-medium bg-white border border-gray-100 p-2 rounded-lg mt-1 inline-block">
                                        {ticket.issue}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                    {ticket.status === 'RESOLVED' ? (
                                        <button 
                                            onClick={() => setVerifyTicket(ticket)}
                                            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-green-200 animate-pulse flex items-center justify-center active:scale-95 transition-transform"
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2"/> Verify Repair
                                        </button>
                                    ) : (
                                        <div className="text-right hidden sm:block bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mechanic</span>
                                            <span className="text-sm font-bold text-gray-700">{ticket.mechanic || 'Unassigned'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Modals */}
            {showReportModal && (
                <ReportModal 
                    onClose={() => setShowReportModal(false)} 
                    onSuccess={() => { setShowReportModal(false); fetchComplaints(); }} 
                />
            )}

            {verifyTicket && (
                <VerifyModal 
                    ticket={verifyTicket}
                    onClose={() => setVerifyTicket(null)}
                    onSuccess={() => { setVerifyTicket(null); fetchComplaints(); }}
                />
            )}
        </div>
    );
};

export default SewingMachineComplaintPage;
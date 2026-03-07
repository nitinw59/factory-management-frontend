import React, { useState, useEffect, useMemo } from 'react';
import { 
    AlertTriangle, CheckCircle, Clock, Search, Plus, X, 
    Wrench, FileText, ChevronRight, Filter, Loader2, 
    ThumbsUp, ThumbsDown, Camera
} from 'lucide-react';
import { assetApi } from '../../api/assetApi';  

// --- SHARED COMPONENTS ---
const Spinner = () => <Loader2 className="animate-spin h-5 w-5 text-current" />;

const Badge = ({ type, value }) => {
    const styles = {
        // Status
        OPEN: 'bg-red-100 text-red-800 border-red-200',
        IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
        RESOLVED: 'bg-green-100 text-green-800 border-green-200',
        CLOSED: 'bg-gray-100 text-gray-600 border-gray-200',
        // Priority
        CRITICAL: 'bg-red-50 text-red-600 border-red-100 animate-pulse',
        HIGH: 'bg-orange-50 text-orange-600 border-orange-100',
        MEDIUM: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        LOW: 'bg-gray-50 text-gray-600 border-gray-100',
    };
    
    const labels = { RESOLVED: 'WAITING VERIFICATION' }; // Custom label for this UI
    
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${styles[value] || 'bg-gray-100'}`}>
            {type === 'status' ? (labels[value] || value.replace('_', ' ')) : value}
        </span>
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

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center">
                        <AlertTriangle className="w-5 h-5 text-red-500 mr-2"/> Report Breakdown
                    </h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-600"/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Asset QR ID / Tag</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                required
                                placeholder="Scan or enter Asset ID (e.g., ASSET-001)" 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                value={formData.qr_id}
                                onChange={e => setFormData({...formData, qr_id: e.target.value})}
                            />
                            <Camera className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority Level</label>
                        <div className="grid grid-cols-2 gap-3">
                            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(p => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setFormData({...formData, priority: p})}
                                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                                        formData.priority === p 
                                        ? 'bg-red-50 border-red-500 text-red-700 shadow-sm' 
                                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-end mb-1">
                            <label className="block text-sm font-medium text-gray-700">Describe the Issue</label>
                        </div>
                        
                        {/* Quick Select Common Issues */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {COMMON_ISSUES.map(issueText => (
                                <button
                                    key={issueText}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ 
                                        ...prev, 
                                        issue: prev.issue ? `${prev.issue}, ${issueText}` : issueText 
                                    }))}
                                    className="px-2.5 py-1 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-md text-[10px] font-semibold transition-colors"
                                >
                                    + {issueText}
                                </button>
                            ))}
                        </div>

                        <textarea 
                            required
                            rows="4"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                            placeholder="e.g., Needle hits the plate, strange noise from motor..."
                            value={formData.issue}
                            onChange={e => setFormData({...formData, issue: e.target.value})}
                        ></textarea>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-md transition-all flex justify-center items-center"
                        >
                            {isSubmitting ? <Spinner/> : "Submit Ticket"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
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
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-green-50 p-6 border-b border-green-100 text-center">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-green-900">Verify Repair</h2>
                    <p className="text-green-700 text-sm mt-1">Mechanic marked this ticket as resolved.</p>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <div className="flex justify-between mb-2">
                            <span className="text-xs font-bold text-gray-500 uppercase">Asset</span>
                            <span className="text-xs font-bold text-gray-800">{ticket.asset_name}</span>
                        </div>
                        <div className="flex justify-between mb-2">
                             <span className="text-xs font-bold text-gray-500 uppercase">Issue</span>
                             <span className="text-xs text-gray-800 text-right w-2/3 truncate">{ticket.issue}</span>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200">
                            <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Mechanic Note</span>
                            <p className="text-sm text-gray-700 italic">"{ticket.mechanic_note || 'Maintenance performed as requested.'}"</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Feedback (Optional)</label>
                        <textarea 
                            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                            rows="2"
                            placeholder="Any comments..."
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <button 
                            onClick={() => handleVerify(false)}
                            disabled={isSubmitting}
                            className="flex flex-col items-center justify-center p-4 border-2 border-red-100 bg-red-50 hover:bg-red-100 hover:border-red-200 rounded-xl transition-all group"
                        >
                            <ThumbsDown className="w-6 h-6 text-red-500 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-sm font-bold text-red-700">Not Fixed</span>
                            <span className="text-[10px] text-red-500">Re-open Ticket</span>
                        </button>
                        
                        <button 
                            onClick={() => handleVerify(true)}
                            disabled={isSubmitting}
                            className="flex flex-col items-center justify-center p-4 border-2 border-green-100 bg-green-50 hover:bg-green-100 hover:border-green-200 rounded-xl transition-all group"
                        >
                            <ThumbsUp className="w-6 h-6 text-green-600 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-sm font-bold text-green-800">It Works</span>
                            <span className="text-[10px] text-green-600">Close Ticket</span>
                        </button>
                    </div>
                    
                    <button onClick={onClose} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-2">Cancel</button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---
const SewingMachineComplaintPage = () => {
    const [complaints, setComplaints] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('active'); // 'active' | 'closed'
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

    // Filter Logic
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

    // Stats for Header
    const stats = useMemo(() => ({
        open: complaints.filter(c => c.status === 'OPEN').length,
        resolved: complaints.filter(c => c.status === 'RESOLVED').length, // Waiting verify
        critical: complaints.filter(c => c.priority === 'CRITICAL' && c.status !== 'CLOSED').length
    }), [complaints]);

    return (
        <div className="min-h-screen bg-gray-50 font-inter p-6">
            <div className="max-w-5xl mx-auto">
                
                {/* Header & Stats */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                            <Wrench className="w-6 h-6 mr-2 text-blue-600"/> Maintenance & Complaints
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Manage production line breakdowns.</p>
                    </div>
                    
                    <div className="flex gap-3">
                         {/* Stat Cards */}
                        <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm flex flex-col items-center min-w-[80px]">
                            <span className="text-xs font-bold text-gray-400 uppercase">Pending</span>
                            <span className="text-xl font-extrabold text-red-600">{stats.open}</span>
                        </div>
                        <div className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm flex flex-col items-center min-w-[80px]">
                            <span className="text-xs font-bold text-gray-400 uppercase">Verify</span>
                            <span className={`text-xl font-extrabold ${stats.resolved > 0 ? 'text-green-600 animate-pulse' : 'text-gray-700'}`}>{stats.resolved}</span>
                        </div>
                         <button 
                            onClick={() => setShowReportModal(true)}
                            className="ml-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-md flex items-center font-bold transition-colors"
                        >
                            <Plus className="w-5 h-5 mr-1.5"/> Report Issue
                        </button>
                    </div>
                </div>

                {/* Search & Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                    <div className="border-b border-gray-100 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setActiveTab('active')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'active' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Active Issues
                            </button>
                            <button 
                                onClick={() => setActiveTab('closed')}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'closed' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                History
                            </button>
                        </div>
                        
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/>
                            <input 
                                type="text" 
                                placeholder="Search Machine ID..."
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Table / List */}
                    <div className="divide-y divide-gray-100">
                        {isLoading ? (
                            <div className="p-12 flex justify-center"><Spinner /></div>
                        ) : filteredData.length === 0 ? (
                            <div className="p-12 text-center">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <CheckCircle className="w-8 h-8 text-gray-300" />
                                </div>
                                <h3 className="text-gray-900 font-medium">No tickets found</h3>
                                <p className="text-gray-500 text-sm mt-1">Your production line is running smoothly.</p>
                            </div>
                        ) : (
                            filteredData.map(ticket => (
                                <div key={ticket.id} className="p-4 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-gray-800">{ticket.asset_name}</span>
                                            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{ticket.asset_qr}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                             <Badge type="status" value={ticket.status} />
                                             <Badge type="priority" value={ticket.priority} />
                                             <span className="text-xs text-gray-400 flex items-center ml-2">
                                                <Clock className="w-3 h-3 mr-1"/> {new Date(ticket.created_at).toLocaleDateString()}
                                             </span>
                                        </div>
                                        <p className="text-sm text-gray-600 line-clamp-1">{ticket.issue}</p>
                                    </div>

                                    <div className="flex items-center gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                                        {ticket.status === 'RESOLVED' ? (
                                            <button 
                                                onClick={() => setVerifyTicket(ticket)}
                                                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm animate-pulse flex items-center justify-center"
                                            >
                                                <CheckCircle className="w-4 h-4 mr-1.5"/> Verify Repair
                                            </button>
                                        ) : (
                                            <div className="text-right hidden sm:block">
                                                <span className="text-xs text-gray-400 block">Mechanic</span>
                                                <span className="text-sm font-medium text-gray-700">{ticket.mechanic || 'Unassigned'}</span>
                                            </div>
                                        )}
                                        <button className="p-2 text-gray-400 hover:bg-gray-200 rounded-full transition-colors">
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
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
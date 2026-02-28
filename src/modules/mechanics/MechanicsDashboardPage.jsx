import React, { useState, useEffect, useMemo } from 'react';
import { 
    Wrench, Clock, AlertTriangle, CheckCircle, Search, 
    Plus, Trash2, Save, FileText, History, ChevronRight,
    Package, DollarSign, ArrowLeft, Loader2
} from 'lucide-react';

import {mechanicApi} from '../../api/mechanicApi';

// --- SHARED COMPONENTS ---
const Spinner = () => <Loader2 className="animate-spin text-blue-600" />;

const PriorityBadge = ({ priority }) => {
    const styles = {
        CRITICAL: 'bg-red-100 text-red-700 border-red-200 animate-pulse',
        HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
        MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        LOW: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${styles[priority] || styles.LOW}`}>
            {priority}
        </span>
    );
};

// --- SUB-COMPONENTS ---

// 1. SPARE PARTS SELECTOR
const SparePartSelector = ({ spares, onAdd }) => {
    const [search, setSearch] = useState('');
    const filtered = spares.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase()) || 
        s.part_number.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="border rounded-lg p-3 bg-gray-50">
            <div className="relative mb-2">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400"/>
                <input 
                    className="w-full pl-8 pr-2 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="Search part name or SKU..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
                {filtered.map(part => (
                    <div key={part.id} className="flex justify-between items-center bg-white p-2 rounded border hover:bg-blue-50 transition-colors">
                        <div>
                            <p className="text-sm font-medium text-gray-800">{part.name}</p>
                            <p className="text-xs text-gray-500">{part.part_number} • Stock: {part.current_stock} • ${part.unit_cost}</p>
                        </div>
                        <button 
                            type="button"
                            disabled={part.current_stock <= 0}
                            onClick={() => onAdd(part)}
                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Add
                        </button>
                    </div>
                ))}
                {filtered.length === 0 && <p className="text-xs text-center text-gray-400">No parts found.</p>}
            </div>
        </div>
    );
};

// 2. JOB HISTORY VIEW
const JobHistory = ({ history, isLoading }) => {
    if (isLoading) return <div className="p-4 flex justify-center"><Spinner/></div>;
    if (!history || history.length === 0) return <div className="p-4 text-sm text-gray-500 text-center italic">No previous maintenance records for this ticket.</div>;

    return (
        <div className="space-y-4 mt-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center"><History className="w-4 h-4 mr-1"/> Previous Attempts</h4>
            {history.map((log, idx) => (
                <div key={idx} className="border-l-2 border-gray-300 pl-4 ml-2 relative">
                    <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-gray-400"></div>
                    <div className="text-sm">
                        <span className="font-bold text-gray-800">{log.mechanic_name}</span> 
                        <span className="text-gray-500"> on {log.maintenance_date}</span>
                    </div>
                    <div className="text-xs font-bold text-gray-600 bg-gray-100 inline-block px-1 rounded mt-1">{log.maintenance_type}</div>
                    <p className="text-sm text-gray-700 mt-1">"{log.description}"</p>
                    {log.spares && log.spares.length > 0 && (
                        <div className="mt-2 bg-gray-50 p-2 rounded text-xs">
                            <span className="font-bold text-gray-500">Parts Used:</span>
                            <ul className="list-disc list-inside ml-1 text-gray-700">
                                {log.spares.map((s, i) => <li key={i}>{s.qty}x {s.part_name}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// 3. MAINTENANCE FORM (The Core)
const MaintenanceForm = ({ job, sparesList, onCancel, onSuccess }) => {
    const [formData, setFormData] = useState({
        maintenance_type: 'REPAIR',
        description: '',
        labor_cost: '',
        next_scheduled_date: ''
    });
    const [usedSpares, setUsedSpares] = useState([]); // Array of { ...part, quantity }
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load history when opening a ticket (in case it's a re-opened ticket)
    useEffect(() => {
        setLoadingHistory(true);
        mechanicApi.getComplaintHistory(job.id).then(setHistory).finally(() => setLoadingHistory(false));
    }, [job.id]);

    const handleAddSpare = (part) => {
        setUsedSpares(prev => {
            const existing = prev.find(p => p.id === part.id);
            if (existing) {
                // Don't exceed stock
                if (existing.quantity >= part.current_stock) return prev; 
                return prev.map(p => p.id === part.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { ...part, quantity: 1 }];
        });
    };

    const handleRemoveSpare = (id) => {
        setUsedSpares(prev => prev.filter(p => p.id !== id));
    };

    const updateSpareQty = (id, delta) => {
        setUsedSpares(prev => prev.map(p => {
            if (p.id === id) {
                const newQty = Math.max(1, Math.min(p.current_stock, p.quantity + delta));
                return { ...p, quantity: newQty };
            }
            return p;
        }));
    };

    const totalCost = useMemo(() => {
        const sparesCost = usedSpares.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0);
        const labor = parseFloat(formData.labor_cost) || 0;
        return (sparesCost + labor).toFixed(2);
    }, [usedSpares, formData.labor_cost]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // Format payload for backend
            const payload = {
                complaint_id: job.id,
                description: formData.description,
                maintenance_type: formData.maintenance_type,
                labor_cost: formData.labor_cost || 0,
                next_scheduled_date: formData.next_scheduled_date || null,
                sparesUsed: usedSpares.map(s => ({ spare_part_id: s.id, quantity: s.quantity }))
            };

            await mechanicApi.performMaintenance(payload);
            onSuccess();
        } catch (error) {
            alert("Failed to log maintenance.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            {/* Left: Job Context & History */}
            <div className="lg:col-span-1 bg-white p-4 rounded-xl shadow-sm border border-gray-200 overflow-y-auto">
                <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-800 flex items-center mb-4">
                    <ArrowLeft className="w-4 h-4 mr-1"/> Back to Job Board
                </button>
                
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
                    <h3 className="font-bold text-lg text-blue-900 mb-1">{job.asset_name}</h3>
                    <p className="text-sm text-blue-700 mb-2">{job.location}</p>
                    <PriorityBadge priority={job.priority} />
                    <div className="mt-4">
                        <span className="text-xs font-bold text-blue-400 uppercase">Issue Reported</span>
                        <p className="text-sm text-gray-800 mt-1">{job.issue_description}</p>
                    </div>
                    <div className="mt-2 text-xs text-blue-400">
                        Reported by {job.reported_by} on {new Date(job.created_at).toLocaleDateString()}
                    </div>
                </div>

                <JobHistory history={history} isLoading={loadingHistory} />
            </div>

            {/* Right: Maintenance Log Form */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                    <FileText className="w-6 h-6 mr-2 text-green-600"/> Log Maintenance Work
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Type</label>
                            <select 
                                className="w-full p-2 border rounded-lg bg-gray-50"
                                value={formData.maintenance_type}
                                onChange={e => setFormData({...formData, maintenance_type: e.target.value})}
                            >
                                <option value="REPAIR">Repair Breakdown</option>
                                <option value="PREVENTATIVE">Preventative Check</option>
                                <option value="CALIBRATION">Calibration / Adjustment</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Labor/Service Cost ($)</label>
                            <input 
                                type="number" step="0.01" placeholder="0.00"
                                className="w-full p-2 border rounded-lg"
                                value={formData.labor_cost}
                                onChange={e => setFormData({...formData, labor_cost: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Work Description</label>
                        <textarea 
                            required
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500"
                            rows="4"
                            placeholder="Describe what you fixed, replaced, or adjusted..."
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        ></textarea>
                    </div>

                    {/* Spare Parts Section */}
                    <div className="border-t border-gray-100 pt-4 flex-1">
                        <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                            <Package className="w-5 h-5 mr-2 text-purple-600"/> Spare Parts Used
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Selector */}
                            <SparePartSelector spares={sparesList} onAdd={handleAddSpare} />
                            
                            {/* Selected List */}
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col">
                                <div className="flex-1 overflow-y-auto max-h-40 space-y-2">
                                    {usedSpares.length === 0 && <p className="text-sm text-gray-400 text-center mt-10">No parts added.</p>}
                                    {usedSpares.map(part => (
                                        <div key={part.id} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                                            <div className="flex-1">
                                                <p className="text-sm font-bold truncate">{part.name}</p>
                                                <p className="text-xs text-gray-500">${part.unit_cost} each</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center border rounded bg-gray-100">
                                                    <button type="button" onClick={() => updateSpareQty(part.id, -1)} className="px-2 text-gray-600 hover:bg-gray-200">-</button>
                                                    <span className="px-2 text-sm font-mono">{part.quantity}</span>
                                                    <button type="button" onClick={() => updateSpareQty(part.id, 1)} disabled={part.quantity >= part.current_stock} className="px-2 text-gray-600 hover:bg-gray-200 disabled:opacity-50">+</button>
                                                </div>
                                                <button type="button" onClick={() => handleRemoveSpare(part.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Parts Total:</span>
                                    <span className="font-mono font-bold text-gray-800">${usedSpares.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
                        <div className="flex items-center text-gray-700">
                            <DollarSign className="w-5 h-5 text-green-600 mr-1"/>
                            <span className="text-sm mr-2">Total Repair Cost:</span>
                            <span className="text-xl font-extrabold">${totalCost}</span>
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onCancel} className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold shadow-md hover:bg-green-700 flex items-center disabled:opacity-70">
                                {isSubmitting ? <Spinner/> : <><CheckCircle className="w-5 h-5 mr-2"/> Complete Job</>}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- MAIN COMPONENT ---
const MechanicsDashboardPage = () => {
    const [view, setView] = useState('board'); // 'board' or 'work'
    const [jobs, setJobs] = useState([]);
    const [allSpares, setAllSpares] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDashboard = () => {
        setLoading(true);
        Promise.all([
            mechanicApi.getOpenComplaints(),
            mechanicApi.getAllSpares()
        ]).then(([jobsData, sparesData]) => {
            setJobs(jobsData);
            setAllSpares(sparesData);
            setLoading(false);
        });
    };

    useEffect(() => { fetchDashboard(); }, []);

    const handleStartJob = (job) => {
        setSelectedJob(job);
        setView('work');
    };

    const handleJobSuccess = () => {
        alert("Maintenance Logged Successfully!");
        setSelectedJob(null);
        setView('board');
        fetchDashboard();
    };

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-sans text-gray-900">
            {/* Navbar */}
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 flex items-center">
                        <Wrench className="mr-3 text-blue-600 h-8 w-8"/> Mechanic Portal
                    </h1>
                    <p className="text-slate-500 mt-1">Manage repairs and equipment maintenance</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200 text-sm font-medium text-gray-600">
                    Active Tickets: <span className="text-blue-600 font-bold">{jobs.length}</span>
                </div>
            </header>

            {loading ? <div className="h-64 flex justify-center items-center"><Spinner/></div> : (
                <>
                    {/* VIEW: JOB BOARD */}
                    {view === 'board' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {jobs.length === 0 && (
                                <div className="col-span-full text-center py-12 text-gray-400 bg-white rounded-xl border-2 border-dashed">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50"/>
                                    <p>No active complaints. Good job!</p>
                                </div>
                            )}
                            {jobs.map(job => (
                                <div key={job.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col relative overflow-hidden group">
                                    {/* Status Stripe */}
                                    <div className={`h-1 w-full absolute top-0 left-0 ${job.status === 'OPEN' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                    
                                    <div className="p-5 flex-1">
                                        <div className="flex justify-between items-start mb-3">
                                            <PriorityBadge priority={job.priority} />
                                            <span className="text-xs text-gray-400 flex items-center">
                                                <Clock className="w-3 h-3 mr-1"/> {new Date(job.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-lg text-gray-800 mb-1">{job.asset_name}</h3>
                                        <p className="text-sm text-gray-500 mb-4 flex items-center"><Package className="w-3 h-3 mr-1"/> {job.location}</p>
                                        
                                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm text-gray-700">
                                            <span className="font-bold text-gray-400 text-xs uppercase block mb-1">Issue</span>
                                            "{job.issue_description}"
                                        </div>
                                    </div>

                                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                                        <button 
                                            onClick={() => handleStartJob(job)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm flex items-center transition-colors"
                                        >
                                            Start Repair <ChevronRight className="w-4 h-4 ml-1"/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* VIEW: WORK FORM */}
                    {view === 'work' && selectedJob && (
                        <MaintenanceForm 
                            job={selectedJob} 
                            sparesList={allSpares}
                            onCancel={() => setView('board')}
                            onSuccess={handleJobSuccess}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default MechanicsDashboardPage;
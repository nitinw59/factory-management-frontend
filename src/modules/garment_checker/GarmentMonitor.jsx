import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Activity, History, Box, Zap, AlertTriangle, Clock, RefreshCw, X, 
    TrendingUp, Timer, ShieldCheck, SearchCode, Loader2, User, Search, Filter, Layers
} from 'lucide-react';
import { assemblyApi } from '../../api/assemblyApi';

const AssemblyMonitor = () => {
    // --- STATE MANAGEMENT ---
    const [data, setData] = useState({ activeBatches: [], recentScans: [], workstation: {} });
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);

    // Deep Dive States
    const [selectedGarment, setSelectedGarment] = useState(null); // For DNA Trace
    const [activeBatch, setActiveBatch] = useState(null);         // Replaces the Batch Modal
    const [batchGarments, setBatchGarments] = useState([]);       // Holds the detailed list
    const [kpiFilter, setKpiFilter] = useState('ALL');            // 'ALL', 'APPROVED', 'NEEDS_REWORK', 'QC_REJECTED'

    // --- CORE LOGIC: DATA FETCHING ---
    const refreshData = useCallback(async () => {
        try {
            const res = await assemblyApi.getMonitorData();
            // Force Descending Sort on History
            const sortedHistory = (res.data.recentScans || []).sort((a, b) => {
                const dateA = new Date(a.assembled_at || a.updated_at);
                const dateB = new Date(b.assembled_at || b.updated_at);
                return dateB - dateA; // Descending
            });
            setData({ ...res.data, recentScans: sortedHistory });
        } catch (e) { 
            console.error("Monitor Data Fetch Error:", e); 
        } finally { 
            setIsLoading(false); 
        }
    }, []);

    useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 30000); 
        return () => clearInterval(interval);
    }, [refreshData]);

    // --- FEATURE: BATCH DEEP DIVE ---
    const openBatchDeepDive = async (batch) => {
        setIsSearching(true);
        setActiveBatch(batch);
        setKpiFilter('ALL'); // Reset filter when opening new batch
        try {
            const res = await assemblyApi.getBatchGarments(batch.batch_id);
            setBatchGarments(res.data);
        } catch (e) {
            alert("Failed to load batch garments.");
        } finally {
            setIsSearching(false);
        }
    };

    // --- FEATURE: GLOBAL DNA TRACE ---
    const viewDetails = async (id) => {
        if (isSearching) return;
        setIsSearching(true);
        try {
            console.log("Fetching DNA trace for garment ID:", id);
            const res = await assemblyApi.getGarmentTrace(id);
            console.log("Garment Trace Data:", res.data);
            setSelectedGarment(res.data);
        } catch (e) {
            alert("Could not retrieve DNA history.");
        } finally { setIsSearching(false); }
    };

    const handleGlobalSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        try {
            const res = await assemblyApi.getGarmentDetails(searchTerm.trim());
            setSelectedGarment(res.data);
            setSearchTerm('');
        } catch (e) { alert("Serial Number not found."); } 
        finally { setIsSearching(false); }
    };

    // --- HELPER: FILTERING BATCH GARMENTS ---
    const filteredGarments = useMemo(() => {
        if (kpiFilter === 'ALL') return batchGarments;
        return batchGarments.filter(g => g.status === kpiFilter);
    }, [batchGarments, kpiFilter]);

    // --- HELPER: ETA CALCULATOR ---
    const calculateETA = (batch) => {
        const remaining = batch.total_units - batch.completed_units;
        if (!batch.hourly_velocity || batch.hourly_velocity <= 0 || remaining <= 0) return "---";
        const hoursLeft = remaining / batch.hourly_velocity;
        return hoursLeft < 1 ? `${Math.round(hoursLeft * 60)}m` : `${hoursLeft.toFixed(1)}h`;
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-12 h-12 animate-spin text-indigo-600" /></div>;

    return (
        <div className="min-h-screen bg-[#F1F5F9] p-4 md:p-8 font-inter text-slate-900">
            {isSearching && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[500] flex items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>}

            <div className="max-w-[1600px] mx-auto">
                {/* --- SMART HEADER --- */}
                <header className="mb-10 flex flex-col xl:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-slate-900 text-white rounded-3xl shadow-xl"><Activity size={32} /></div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight">{data.workstation?.line_name || 'Assembly'} Monitor</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="flex items-center text-[10px] font-black bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse" /> Live Line Feed
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-1 max-w-2xl w-full gap-3">
                        <form onSubmit={handleGlobalSearch} className="relative flex-1">
                            <SearchCode className="absolute left-4 top-4 text-slate-400" size={20}/>
                            <input 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Trace DNA by Serial Number..."
                                className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-2xl focus:border-indigo-500 outline-none font-bold shadow-sm transition-all"
                            />
                        </form>
                        <button onClick={refreshData} className="p-4 bg-white rounded-2xl shadow-sm border hover:bg-slate-50 transition-colors group">
                            <RefreshCw size={24} className="text-slate-400 group-hover:text-indigo-600 transition-all"/>
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                    
                    {/* --- COLUMN 1: ACTIVE BATCHES (MASTER LIST) --- */}
                    <div className="xl:col-span-1 space-y-6">
                        <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest flex items-center">
                            <Zap className="mr-2 w-4 h-4 text-amber-500" /> Active Assignments
                        </h3>
                        
                        {data.activeBatches.map(batch => (
                            <div 
                                key={batch.batch_id} 
                                onClick={() => openBatchDeepDive(batch)}
                                className={`rounded-[2.5rem] p-8 relative overflow-hidden group transition-all cursor-pointer transform hover:-translate-y-1 ${
                                    activeBatch?.batch_id === batch.batch_id 
                                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 ring-4 ring-indigo-300 border-none' 
                                    : 'bg-white text-slate-900 shadow-sm border border-slate-200 hover:shadow-lg'
                                }`}
                            >
                                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp size={80} /></div>
                                
                                <div className="flex justify-between items-start mb-6">
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase ${activeBatch?.batch_id === batch.batch_id ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                                        Batch {batch.batch_code}
                                    </span>
                                </div>

                                <h4 className="font-black text-2xl leading-tight mb-6">{batch.product_name}</h4>
                                
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    <div className={`p-4 rounded-2xl ${activeBatch?.batch_id === batch.batch_id ? 'bg-white/10' : 'bg-slate-50'}`}>
                                        <span className={`text-[10px] font-black uppercase block mb-1 ${activeBatch?.batch_id === batch.batch_id ? 'text-indigo-200' : 'text-slate-400'}`}>Flow Rate</span>
                                        <span className="text-xl font-black">{batch.hourly_velocity || 0}/hr</span>
                                    </div>
                                    <div className={`p-4 rounded-2xl ${activeBatch?.batch_id === batch.batch_id ? 'bg-white/10' : 'bg-slate-50'}`}>
                                        <span className={`text-[10px] font-black uppercase block mb-1 ${activeBatch?.batch_id === batch.batch_id ? 'text-indigo-200' : 'text-slate-400'}`}>Finish ETA</span>
                                        <span className="text-xl font-black">{calculateETA(batch)}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase">
                                        <span className={activeBatch?.batch_id === batch.batch_id ? 'text-indigo-200' : 'text-slate-400'}>Yield Progress</span>
                                        <span>{batch.completed_units} / {batch.total_units}</span>
                                    </div>
                                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                                        <div className={`${activeBatch?.batch_id === batch.batch_id ? 'bg-white' : 'bg-indigo-500'} h-full transition-all duration-700`} style={{ width: `${(batch.completed_units/batch.total_units)*100}%` }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* --- COLUMN 2-4: DETAIL PANE (HISTORY OR DEEP DIVE) --- */}
                    <div className="xl:col-span-3 space-y-6">
                        
                        {/* CONDITIONAL RENDER: BATCH DEEP DIVE */}
                        {activeBatch ? (
                            <div className="bg-white rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-right-8">
                                {/* Header */}
                                <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <Layers className="text-indigo-400" size={24}/>
                                            <h2 className="text-2xl font-black">Batch {activeBatch.batch_code} Deep Dive</h2>
                                        </div>
                                        <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">{activeBatch.product_name}</p>
                                    </div>
                                    <button onClick={() => setActiveBatch(null)} className="p-3 bg-white/10 rounded-full hover:bg-rose-600 transition-all"><X size={20}/></button>
                                </div>

                                {/* Interactive KPI Filter Cards */}
                                <div className="p-8 bg-slate-50 border-b border-slate-200">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center"><Filter size={14} className="mr-2"/> Filter by Output Status</h4>
                                    <div className="grid grid-cols-4 gap-4">
                                        <button 
                                            onClick={() => setKpiFilter('ALL')}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all ${kpiFilter === 'ALL' ? 'bg-slate-800 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-200 hover:border-slate-400 text-slate-700'}`}
                                        >
                                            <span className="block text-2xl font-black">{batchGarments.length}</span>
                                            <span className={`text-[10px] uppercase font-bold mt-1 block ${kpiFilter === 'ALL' ? 'text-slate-300' : 'text-slate-400'}`}>Total Scanned</span>
                                        </button>
                                        
                                        <button 
                                            onClick={() => setKpiFilter('APPROVED')}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all ${kpiFilter === 'APPROVED' ? 'bg-emerald-600 border-emerald-700 text-white shadow-lg' : 'bg-white border-emerald-100 hover:border-emerald-300 text-emerald-700'}`}
                                        >
                                            <span className="block text-2xl font-black">{batchGarments.filter(g => g.status === 'APPROVED').length}</span>
                                            <span className={`text-[10px] uppercase font-bold mt-1 block ${kpiFilter === 'APPROVED' ? 'text-emerald-200' : 'text-emerald-500'}`}>Approved</span>
                                        </button>

                                        <button 
                                            onClick={() => setKpiFilter('NEEDS_REWORK')}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all ${kpiFilter === 'NEEDS_REWORK' ? 'bg-amber-500 border-amber-600 text-white shadow-lg' : 'bg-white border-amber-100 hover:border-amber-300 text-amber-700'}`}
                                        >
                                            <span className="block text-2xl font-black">{batchGarments.filter(g => g.status === 'NEEDS_REWORK').length}</span>
                                            <span className={`text-[10px] uppercase font-bold mt-1 block ${kpiFilter === 'NEEDS_REWORK' ? 'text-amber-100' : 'text-amber-500'}`}>Rework</span>
                                        </button>

                                        <button 
                                            onClick={() => setKpiFilter('QC_REJECTED')}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all ${kpiFilter === 'QC_REJECTED' ? 'bg-rose-600 border-rose-700 text-white shadow-lg' : 'bg-white border-rose-100 hover:border-rose-300 text-rose-700'}`}
                                        >
                                            <span className="block text-2xl font-black">{batchGarments.filter(g => g.status === 'QC_REJECTED').length}</span>
                                            <span className={`text-[10px] uppercase font-bold mt-1 block ${kpiFilter === 'QC_REJECTED' ? 'text-rose-200' : 'text-rose-500'}`}>Rejected</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Filtered Garment List */}
                                <div className="max-h-[600px] overflow-y-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-white sticky top-0 border-b shadow-sm z-10">
                                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                <th className="px-8 py-4">UID</th>
                                                <th className="px-8 py-4 text-center">Status</th>
                                                <th className="px-8 py-4">Processed At</th>
                                                <th className="px-8 py-4 text-right">Audit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {filteredGarments.map(g => (
                                                <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-8 py-4 font-mono font-black text-slate-700">{g.garment_uid}</td>
                                                    <td className="px-8 py-4 text-center">
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-md text-[10px] font-black uppercase ${
                                                            g.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600' : 
                                                            g.status === 'NEEDS_REWORK' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                                                        }`}>
                                                            {g.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-4 text-xs font-medium text-slate-500">
                                                        {new Date(g.assembled_at || g.updated_at).toLocaleString()}
                                                    </td>
                                                    <td className="px-8 py-4 text-right">
                                                        <button onClick={() => viewDetails(g.id)} className="p-2 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors">
                                                            <Search size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {filteredGarments.length === 0 && (
                                        <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest">No garments match this filter.</div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* CONDITIONAL RENDER: GLOBAL HISTORY (Default View) */
                            <div className="animate-in fade-in">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-widest flex items-center">
                                        <History className="mr-2 w-4 h-4 text-emerald-500" /> Station Scan History (Descending)
                                    </h3>
                                    <span className="text-[10px] font-bold text-slate-400 bg-white px-3 py-1 rounded-full border shadow-sm">Auto-Refresh Active</span>
                                </div>

                                <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50/50 border-b">
                                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                <th className="px-8 py-6">Garment UID</th>
                                                <th className="px-8 py-6 text-center">Status</th>
                                                <th className="px-8 py-6">Operator</th>
                                                <th className="px-8 py-6">Time</th>
                                                <th className="px-8 py-6 text-right">Audit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {data.recentScans.map(scan => (
                                                <tr key={scan.id} className="hover:bg-indigo-50/30 transition-all group">
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-slate-100 rounded-xl text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all"><Box size={16} /></div>
                                                            <div>
                                                                <span className="block font-mono font-black text-slate-700">{scan.garment_uid}</span>
                                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Size {scan.size}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${
                                                            scan.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                            scan.status === 'NEEDS_REWORK' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                                        }`}>
                                                            {scan.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5"><span className="text-sm font-bold text-slate-600">{scan.operator_name || 'System'}</span></td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex items-center text-slate-400 text-xs font-medium">
                                                            <Clock size={14} className="mr-2" />
                                                            {new Date(scan.assembled_at || scan.updated_at).toLocaleTimeString()}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <button onClick={() => viewDetails(scan.id)} className="p-3 hover:bg-indigo-600 hover:text-white text-indigo-600 bg-indigo-50 rounded-2xl transition-all shadow-sm active:scale-90">
                                                            <Search size={18} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {data.recentScans.length === 0 && (
                                        <div className="p-20 text-center text-slate-300 font-black uppercase tracking-widest flex flex-col items-center">
                                            <AlertTriangle size={40} className="mb-4 text-slate-200" />
                                            No scans detected on this line yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- DNA TRACEABILITY MODAL (Unchanged - Keeps Timeline Logic) --- */}
            {selectedGarment && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[600] flex items-center justify-center p-6 animate-in fade-in">
                    {/* ... (Keep your existing selectedGarment modal code here) ... */}
                    <div className="bg-white w-full max-w-5xl rounded-[4rem] overflow-hidden shadow-2xl border border-white/20">
                        <div className="p-10 bg-slate-900 text-white flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase">Verified DNA Lineage</span>
                                    <h2 className="text-3xl font-black tracking-tight">{selectedGarment.garment_uid}</h2>
                                </div>
                                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">{selectedGarment.product_name} • BATCH {selectedGarment.batch_code}</p>
                            </div>
                            <button onClick={() => setSelectedGarment(null)} className="p-4 bg-white/10 rounded-full hover:bg-rose-600 transition-all"><X size={24}/></button>
                        </div>
                        
                        <div className="p-10 grid grid-cols-1 xl:grid-cols-2 gap-10">
                            <div className="max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center sticky top-0 bg-white py-2 z-10">
                                    <Box className="mr-2 w-4 h-4"/> Multi-Stage Component History
                                </h5>
                                <div className="space-y-6">
                                    {selectedGarment.components?.map((c, i) => (
                                        <div key={i} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl group hover:border-indigo-200 transition-colors">
                                            <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-4">
                                                <div>
                                                    <span className="block text-sm font-black text-slate-800 uppercase">{c.part_name}</span>
                                                    <span className="text-[10px] font-mono text-slate-400">{c.uid}</span>
                                                </div>
                                                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${c.status === 'CUT' ? 'bg-slate-200' : 'bg-indigo-100 text-indigo-600'}`}>{c.status}</span>
                                            </div>
                                            <div className="space-y-3 pl-2 border-l-2 border-slate-200 ml-2">
                                                {c.history && c.history.map((step, idx) => (
                                                    <div key={idx} className="relative pl-6">
                                                        <div className="absolute -left-[21px] top-1 w-3 h-3 bg-white border-2 border-indigo-400 rounded-full"></div>
                                                        <span className="text-xs font-black text-slate-600 block">{step.stage}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{new Date(step.time).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 rounded-[3rem] p-8 border-2 border-slate-100">
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Assembly Execution Metrics</h5>
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100"><Timer className="text-indigo-600"/></div>
                                        <div>
                                            <span className="block text-[10px] font-black text-slate-400 uppercase">Final Assembly Time</span>
                                            <span className="text-sm font-bold text-slate-700">{selectedGarment.assembled_at ? new Date(selectedGarment.assembled_at).toLocaleString() : 'Processing...'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100"><User className="text-indigo-600"/></div>
                                        <div>
                                            <span className="block text-[10px] font-black text-slate-400 uppercase">Assembly Operator</span>
                                            <span className="text-sm font-bold text-slate-700">{selectedGarment.operator_name || 'System Auto'}</span>
                                        </div>
                                    </div>
                                </div>

                                {selectedGarment.defects && selectedGarment.defects.length > 0 && (
                                    <div className="mt-8 pt-8 border-t border-slate-200">
                                        <h5 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4">Component Defect History</h5>
                                        <div className="space-y-2">
                                            {selectedGarment.defects.map((d, i) => (
                                                <div key={i} className="text-xs font-bold text-rose-600 bg-rose-50 p-4 rounded-2xl border-2 border-rose-100 flex items-center shadow-sm">
                                                    <AlertTriangle className="mr-3 w-5 h-5 shrink-0"/> {d.description || `Incident Ref #${d.defect_code_id} on Line ${d.detected_at_line_id}`}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssemblyMonitor;
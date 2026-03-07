import React, { useState, useEffect, useMemo } from 'react';
import { 
    CalendarDays, FileBox, Layers, Plus, Search, Filter, 
    Clock, AlertTriangle, Calendar as CalendarIcon, Edit, 
    Save, X, CheckSquare, Loader2, ArrowRight, Settings, Users
} from 'lucide-react';
import { maintenanceApi } from '../../api/maintenanceApi';

const Spinner = () => <Loader2 className="animate-spin text-indigo-600 w-8 h-8 mx-auto" />;

// --- TAB 1: CALENDAR & FORECAST ---
const ForecastView = ({ tasks }) => {
    const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimated_minutes || 60), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    
    // Configurable capacity: e.g. 2 mechanics * 8 hours = 16 hours/day
    const isOverCapacity = totalMinutes / 60 > 16; 

    // Date reset to midnight for accurate comparisons
    const todayZero = new Date(new Date().setHours(0,0,0,0));

    const overdue = tasks.filter(t => {
        const tDate = new Date(t.next_due_date);
        tDate.setHours(0,0,0,0);
        return tDate < todayZero;
    });

    const upcoming = tasks.filter(t => {
        const tDate = new Date(t.next_due_date);
        tDate.setHours(0,0,0,0);
        return tDate >= todayZero;
    }).sort((a,b) => new Date(a.next_due_date) - new Date(b.next_due_date));

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Capacity Card */}
            <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between shadow-sm ${isOverCapacity ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-100'}`}>
                <div className="flex items-center gap-4 mb-4 md:mb-0">
                    <div className={`p-4 rounded-xl ${isOverCapacity ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {isOverCapacity ? <AlertTriangle size={28}/> : <Users size={28}/>}
                    </div>
                    <div>
                        <h3 className={`text-lg font-bold ${isOverCapacity ? 'text-red-900' : 'text-indigo-900'}`}>
                            Workload Forecast
                        </h3>
                        <p className={`text-sm font-medium ${isOverCapacity ? 'text-red-700' : 'text-indigo-700'}`}>
                            {tasks.length} PM tasks scheduled.
                        </p>
                    </div>
                </div>
                <div className="flex gap-6">
                    <div className="text-center bg-white p-3 rounded-xl shadow-sm border border-gray-100 min-w-[120px]">
                        <span className="block text-2xl font-black text-gray-800">{totalHours}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Est. Hours Required</span>
                    </div>
                    <div className="text-center bg-white p-3 rounded-xl shadow-sm border border-gray-100 min-w-[120px]">
                        <span className="block text-2xl font-black text-gray-800">16.0</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mechanic Capacity</span>
                    </div>
                </div>
            </div>

            {/* Agenda List */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overdue */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-[600px]">
                    <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-red-900 flex items-center"><AlertTriangle className="w-5 h-5 mr-2"/> Overdue PMs ({overdue.length})</h3>
                    </div>
                    <div className="overflow-y-auto p-4 space-y-3">
                        {overdue.length === 0 ? <p className="text-sm text-gray-500 text-center py-10">No overdue tasks.</p> : overdue.map(task => (
                            <div key={task.id} className="p-4 border border-red-100 bg-white rounded-xl shadow-sm hover:border-red-300 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-900">{task.asset_name}</h4>
                                    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">Due: {new Date(task.next_due_date).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm text-gray-600 font-medium">{task.task_name}</p>
                                <div className="mt-3 flex items-center text-xs text-gray-500 font-bold bg-gray-50 w-max px-2 py-1 rounded-md border border-gray-200">
                                    <Clock className="w-3 h-3 mr-1"/> {task.estimated_minutes} min
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Upcoming */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-[600px]">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-gray-800 flex items-center"><CalendarIcon className="w-5 h-5 mr-2 text-indigo-600"/> Upcoming Schedule</h3>
                    </div>
                    <div className="overflow-y-auto p-4 space-y-3">
                        {upcoming.length === 0 ? <p className="text-sm text-gray-500 text-center py-10">No upcoming tasks.</p> : upcoming.map(task => {
                            const isToday = new Date(task.next_due_date).toDateString() === new Date().toDateString();
                            return (
                                <div key={task.id} className={`p-4 border rounded-xl shadow-sm transition-colors ${isToday ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100 bg-white hover:border-indigo-200'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-gray-900">{task.asset_name}</h4>
                                        <span className={`text-xs font-bold px-2 py-1 rounded ${isToday ? 'text-orange-700 bg-orange-100' : 'text-gray-600 bg-gray-100'}`}>
                                            {isToday ? 'Today' : new Date(task.next_due_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 font-medium">{task.task_name}</p>
                                    <div className="mt-3 flex items-center text-xs text-gray-500 font-bold bg-gray-50 w-max px-2 py-1 rounded-md border border-gray-200">
                                        <Clock className="w-3 h-3 mr-1"/> {task.estimated_minutes} min
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- TAB 2: TEMPLATE LIBRARY ---
const TemplateLibraryView = ({ templates, fetchTemplates }) => {
    const [editingTemplate, setEditingTemplate] = useState(null); // null = list mode, object = edit mode, {} = new mode
    const [formData, setFormData] = useState({ name: '', description: '', frequency_days: 30, estimated_minutes: 60 });
    const [isSaving, setIsSaving] = useState(false);

    const handleEdit = (tmpl) => {
        setFormData(tmpl);
        setEditingTemplate(tmpl);
    };

    const handleNew = () => {
        setFormData({ name: '', description: '', frequency_days: 30, estimated_minutes: 60 });
        setEditingTemplate({});
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (formData.id) {
                // Update existing (Endpoint logic needed if not implemented, using create as placeholder if API missing)
                // In a true enterprise setup, add an updatePMTemplate to maintenanceApi
                await maintenanceApi.updatePMTemplate(formData); 
            } else {
                await maintenanceApi.createPMTemplate(formData);
            }
            await fetchTemplates();
            setEditingTemplate(null);
        } catch (err) {
            alert("Failed to save template.");
        } finally {
            setIsSaving(false);
        }
    };

    if (editingTemplate !== null) {
        return (
            <div className="max-w-2xl mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center">
                        <Settings className="w-6 h-6 mr-2 text-indigo-600"/> 
                        {formData.id ? 'Edit SOP Template' : 'Create New SOP Template'}
                    </h2>
                    <button onClick={() => setEditingTemplate(null)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"><X size={20}/></button>
                </div>
                
                <form onSubmit={handleSave} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Template / SOP Name *</label>
                        <input required type="text" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium" placeholder="e.g. Standard Monthly Service" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Detailed Checklist / Instructions</label>
                        <textarea className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" rows="4" placeholder="1. Clean lint&#10;2. Check oil level..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center"><CalendarIcon className="w-4 h-4 mr-1"/> Frequency (Days) *</label>
                            <input required type="number" min="1" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold" value={formData.frequency_days} onChange={e => setFormData({...formData, frequency_days: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center"><Clock className="w-4 h-4 mr-1"/> Est. Time (Minutes) *</label>
                            <input required type="number" min="1" className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold" value={formData.estimated_minutes} onChange={e => setFormData({...formData, estimated_minutes: e.target.value})} />
                        </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                        <button type="button" onClick={() => setEditingTemplate(null)} className="px-6 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-md hover:bg-indigo-700 transition-colors flex items-center disabled:opacity-70">
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Save className="w-5 h-5 mr-2"/>} Save Template
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 animate-in fade-in duration-300 flex flex-col">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
                <div>
                    <h2 className="text-xl font-extrabold text-gray-800">Master Template Library</h2>
                    <p className="text-sm text-gray-500 font-medium">Standard Operating Procedures for Maintenance</p>
                </div>
                <button onClick={handleNew} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-sm flex items-center transition-transform active:scale-95 text-sm">
                    <Plus className="w-4 h-4 mr-2"/> Create Template
                </button>
            </div>
            
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {templates.map(tmpl => (
                    <div key={tmpl.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow relative group bg-white">
                        <button onClick={() => handleEdit(tmpl)} className="absolute top-4 right-4 p-2 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-gray-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                            <Edit className="w-4 h-4"/>
                        </button>
                        <h3 className="font-bold text-gray-900 text-lg mb-2 pr-8 leading-tight">{tmpl.name}</h3>
                        <div className="flex gap-3 mb-4">
                            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 flex items-center"><CalendarIcon className="w-3 h-3 mr-1"/> Every {tmpl.frequency_days} Days</span>
                            <span className="text-[10px] font-bold bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100 flex items-center"><Clock className="w-3 h-3 mr-1"/> {tmpl.estimated_minutes || 60} Min</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            {tmpl.description || 'No detailed instructions provided.'}
                        </p>
                    </div>
                ))}
                {templates.length === 0 && <div className="col-span-full py-16 text-center text-gray-400">No templates found. Create one to standardize maintenance.</div>}
            </div>
        </div>
    );
};

// --- TAB 3: BULK ASSIGNMENT ---
const BulkScheduleView = ({ templates }) => {
    const [assets, setAssets] = useState([]);
    const [loadingAssets, setLoadingAssets] = useState(false);
    
    // Filters
    const [filterType, setFilterType] = useState('');
    const [filterLine, setFilterLine] = useState('');
    
    // Selections
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [selectedAssetIds, setSelectedAssetIds] = useState([]);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [staggerDays, setStaggerDays] = useState(0); // 0 = all on start date
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        setLoadingAssets(true);
        maintenanceApi.getAssetsForBulk().then(res => {
            setAssets(res.data);
            setLoadingAssets(false);
        }).catch(err => {
            console.error("Failed to load assets", err);
            setLoadingAssets(false);
        });
    }, []);

    // Unique filter options
    const assetTypes = [...new Set(assets.map(a => a.type_name).filter(Boolean))];
    const lines = [...new Set(assets.map(a => a.current_line).filter(Boolean))];

    // Filter logic
    const filteredAssets = assets.filter(a => {
        if (filterType && a.type_name !== filterType) return false;
        if (filterLine && a.current_line !== filterLine) return false;
        return true;
    });

    const toggleAsset = (id) => {
        setSelectedAssetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (selectedAssetIds.length === filteredAssets.length) setSelectedAssetIds([]);
        else setSelectedAssetIds(filteredAssets.map(a => a.id));
    };

    const handleSchedule = async () => {
        if (!selectedTemplateId) return alert("Select a PM Template.");
        if (selectedAssetIds.length === 0) return alert("Select at least one machine.");
        if (!startDate) return alert("Select a start date.");

        setIsSubmitting(true);
        try {
            await maintenanceApi.bulkSchedule({
                templateId: selectedTemplateId,
                assetIds: selectedAssetIds,
                startDate,
                staggerDays: parseInt(staggerDays)
            });
            alert(`Successfully scheduled PM for ${selectedAssetIds.length} machines!`);
            setSelectedAssetIds([]);
        } catch (err) {
            alert("Bulk scheduling failed.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 animate-in fade-in duration-300 flex flex-col lg:flex-row min-h-[600px] overflow-hidden">
            
            {/* Left Col: Setup & Config */}
            <div className="w-full lg:w-1/3 bg-gray-50 p-6 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col shrink-0">
                <h2 className="text-xl font-black text-gray-800 mb-6 flex items-center">
                    <Layers className="w-6 h-6 mr-2 text-blue-600"/> Mass Scheduling
                </h2>

                <div className="space-y-6 flex-1">
                    {/* Step 1 */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">1. Select PM Template *</label>
                        <select className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>
                            <option value="">-- Choose Standard Operating Procedure --</option>
                            {templates.map(t => <option key={t.id} value={t.id}>{t.name} (Every {t.frequency_days}d)</option>)}
                        </select>
                    </div>

                    {/* Step 2 */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">2. Configuration</label>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Start Date *</label>
                            <input type="date" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Stagger Scheduling (Optional)</label>
                            <select className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={staggerDays} onChange={e => setStaggerDays(e.target.value)}>
                                <option value="0">All on Start Date</option>
                                <option value="1">Spread evenly (1 per day)</option>
                                <option value="2">Spread evenly (1 every 2 days)</option>
                                <option value="5">Spread evenly (1 every 5 days)</option>
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1 leading-tight">Prevents taking entire lines offline simultaneously.</p>
                        </div>
                    </div>
                </div>

                <div className="pt-6 mt-6 border-t border-gray-200">
                    <button 
                        onClick={handleSchedule} 
                        disabled={isSubmitting || selectedAssetIds.length === 0 || !selectedTemplateId}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold shadow-md flex items-center justify-center transition-all disabled:opacity-50 active:scale-95"
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <ArrowRight className="w-5 h-5 mr-2"/>}
                        Schedule {selectedAssetIds.length} Machines
                    </button>
                </div>
            </div>

            {/* Right Col: Machine Selection */}
            <div className="flex-1 p-6 flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">3. Target Assets</h3>
                        <p className="text-sm text-gray-500">{filteredAssets.length} machines match criteria.</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <select className="flex-1 sm:flex-none p-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option value="">All Types</option>
                            {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select className="flex-1 sm:flex-none p-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" value={filterLine} onChange={e => setFilterLine(e.target.value)}>
                            <option value="">All Lines</option>
                            {lines.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                </div>

                {loadingAssets ? <div className="flex-1 flex items-center justify-center"><Spinner/></div> : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col flex-1 max-h-[500px]">
                        <div className="bg-gray-100 p-3 border-b border-gray-200 flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                checked={selectedAssetIds.length > 0 && selectedAssetIds.length === filteredAssets.length}
                                onChange={toggleAll}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-gray-600 uppercase">Select All</span>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-1">
                            {filteredAssets.length === 0 && <p className="text-center text-gray-400 py-10">No assets match your filters.</p>}
                            {filteredAssets.map(asset => (
                                <label key={asset.id} className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-colors ${selectedAssetIds.includes(asset.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent hover:bg-gray-50'}`}>
                                    <input 
                                        type="checkbox" 
                                        checked={selectedAssetIds.includes(asset.id)}
                                        onChange={() => toggleAsset(asset.id)}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800 text-sm">{asset.name} <span className="text-[10px] font-mono text-gray-400 ml-2">{asset.asset_qr_id}</span></p>
                                        <p className="text-xs text-gray-500 font-medium">{asset.type_name}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100/50 px-2 py-1 rounded uppercase tracking-wider">{asset.current_line}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN PAGE WRAPPER ---
const MaintenanceSchedulePage = () => {
    const [activeTab, setActiveTab] = useState('forecast'); // forecast, templates, bulk
    
    // Master State
    const [templates, setTemplates] = useState([]);
    const [upcomingTasks, setUpcomingTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadCoreData = async () => {
        setLoading(true);
        try {
            const [tmplRes, tasksRes] = await Promise.all([
                maintenanceApi.getPMTemplates(),
                maintenanceApi.getUpcomingTasks()
            ]);
            setTemplates(tmplRes?.data || []);
            setUpcomingTasks(tasksRes?.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadCoreData(); }, []);

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-screen font-inter pb-24 text-gray-900">
            {/* Header */}
            <header className="mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center tracking-tight mb-4">
                    <CalendarDays className="mr-3 text-indigo-600 h-6 w-6 md:h-8 md:w-8"/> Maintenance Planning
                </h1>

                {/* Tabs */}
                <div className="flex overflow-x-auto hide-scrollbar bg-gray-200/50 p-1.5 rounded-xl w-full sm:w-max snap-x">
                    <button 
                        onClick={() => setActiveTab('forecast')}
                        className={`snap-center shrink-0 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'forecast' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Forecast & Agenda
                    </button>
                    <button 
                        onClick={() => setActiveTab('templates')}
                        className={`snap-center shrink-0 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'templates' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Template Library (SOPs)
                    </button>
                    <button 
                        onClick={() => setActiveTab('bulk')}
                        className={`snap-center shrink-0 px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'bulk' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Mass Assignment
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center items-center h-64"><Spinner/></div>
            ) : (
                <main>
                    {activeTab === 'forecast' && <ForecastView tasks={upcomingTasks} />}
                    {activeTab === 'templates' && <TemplateLibraryView templates={templates} fetchTemplates={loadCoreData} />}
                    {activeTab === 'bulk' && <BulkScheduleView templates={templates} />}
                </main>
            )}
        </div>
    );
};

export default MaintenanceSchedulePage;
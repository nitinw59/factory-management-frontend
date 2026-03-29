import React, { useState, useEffect, useCallback } from 'react';
import { hrApi } from '../../api/hrApi';
import { 
    Clock, AlertTriangle, CheckCircle, Edit2, 
    Plus, X, Save, Loader2, Moon, Sun
} from 'lucide-react';

// Helper to format "18:00:00" into "06:00 PM"
const formatTime = (timeStr) => {
    if (!timeStr) return '--:--';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const formattedHour = h % 12 || 12;
    return `${formattedHour.toString().padStart(2, '0')}:${minutes} ${ampm}`;
};

export default function ShiftConfigurationPage() {
    const [shifts, setShifts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [formData, setFormData] = useState({
        name: '', start_time: '', end_time: '', grace_time_minutes: 15
    });

    const fetchShifts = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await hrApi.getShifts();
            setShifts(res.data);
        } catch (err) {
            setError('Failed to load shift configurations.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchShifts(); }, [fetchShifts]);

    const openCreateModal = () => {
        setEditingShift(null);
        setFormData({ name: '', start_time: '', end_time: '', grace_time_minutes: 15 });
        setIsModalOpen(true);
    };

    const openEditModal = (shift) => {
        setEditingShift(shift);
        setFormData({
            name: shift.name,
            start_time: shift.start_time || '',
            end_time: shift.end_time || '',
            grace_time_minutes: shift.grace_time_minutes || 15
        });
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (editingShift) {
                await hrApi.updateShift(editingShift.id, formData);
            } else {
                await hrApi.createShift(formData);
            }
            fetchShifts();
            setIsModalOpen(false);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to save shift.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

    // Calculate quick stats
    const pendingSetup = shifts.filter(s => !s.start_time || !s.end_time).length;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto bg-slate-50 min-h-screen">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 flex items-center">
                        <Clock className="mr-3 text-indigo-600" size={28}/> 
                        Shift Master Configuration
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">Define working hours and grace periods for attendance tracking.</p>
                </div>
                <button 
                    onClick={openCreateModal}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center shadow-md transition-all active:scale-95"
                >
                    <Plus className="mr-2" size={20} /> ADD NEW SHIFT
                </button>
            </div>

            {error && <div className="bg-rose-50 text-rose-700 p-4 rounded-xl mb-6 border border-rose-200 font-bold">{error}</div>}

            {/* Alerts */}
            {pendingSetup > 0 && (
                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl mb-8 flex items-start shadow-sm">
                    <AlertTriangle className="text-amber-500 mr-3 shrink-0 mt-0.5" size={20}/>
                    <div>
                        <h3 className="font-bold text-amber-800">Pending Configurations Detected</h3>
                        <p className="text-amber-700 text-sm mt-1">
                            {pendingSetup} shift(s) were auto-discovered during the Excel import but do not have Start or End times. 
                            Please configure them below so the system can calculate late arrivals and overtime.
                        </p>
                    </div>
                </div>
            )}

            {/* Shift Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {shifts.map(shift => {
                    const isConfigured = shift.start_time && shift.end_time;
                    
                    // Simple heuristic to guess if it's a night shift for the icon
                    const isNightShift = shift.start_time && parseInt(shift.start_time.split(':')[0]) >= 17;

                    return (
                        <div key={shift.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                            
                            {/* Card Header */}
                            <div className="p-5 border-b border-slate-100 flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-xl ${isNightShift ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {isNightShift ? <Moon size={20}/> : <Sun size={20}/>}
                                    </div>
                                    <h3 className="font-black text-lg text-slate-800 leading-tight">
                                        {shift.name}
                                    </h3>
                                </div>
                                <button 
                                    onClick={() => openEditModal(shift)}
                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Edit Shift"
                                >
                                    <Edit2 size={18}/>
                                </button>
                            </div>

                            {/* Card Body */}
                            <div className="p-5 flex-1 bg-slate-50/50">
                                {isConfigured ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Timing</span>
                                            <span className="font-mono font-black text-slate-700">
                                                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Grace Period</span>
                                            <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                                {shift.grace_time_minutes} Mins
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-2">
                                        <AlertTriangle size={28} className="text-amber-400 opacity-50"/>
                                        <span className="text-sm font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                                            Requires Setup
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Card Footer Status Bar */}
                            <div className={`h-1.5 w-full ${isConfigured ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                        </div>
                    );
                })}
            </div>

            {shifts.length === 0 && !isLoading && (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 mt-6">
                    <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4"/>
                    <h3 className="text-xl font-bold text-slate-700">No Shifts Configured</h3>
                    <p className="text-slate-400 mt-2">Upload an assignment sheet or create one manually.</p>
                </div>
            )}

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        
                        <div className="bg-slate-50 px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-800">
                                {editingShift ? 'Edit Shift Details' : 'Create New Shift'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-6 sm:p-8">
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-black text-slate-700 mb-2">Shift Name / Code</label>
                                    <input 
                                        type="text" required placeholder="e.g. 6PM SHIFT"
                                        value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                                    />
                                    <p className="text-xs text-slate-500 mt-1.5 font-medium">Must exactly match the name used in Excel uploads.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-black text-slate-700 mb-2">Start Time</label>
                                        <input 
                                            type="time" required
                                            value={formData.start_time} onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                                            className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-black text-slate-700 mb-2">End Time</label>
                                        <input 
                                            type="time" required
                                            value={formData.end_time} onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                                            className="w-full border border-slate-300 rounded-xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-slate-700 mb-2">Late Grace Period</label>
                                    <div className="flex items-center shadow-sm rounded-xl overflow-hidden border border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                                        <input 
                                            type="number" min="0" required
                                            value={formData.grace_time_minutes} onChange={(e) => setFormData({...formData, grace_time_minutes: parseInt(e.target.value) || 0})}
                                            className="w-full p-3 font-bold text-slate-800 border-none outline-none bg-white"
                                        />
                                        <div className="bg-slate-50 border-l border-slate-200 px-4 py-3 text-slate-500 font-bold text-sm">
                                            Minutes
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-8 flex gap-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3.5 border-2 border-slate-200 text-slate-600 rounded-xl font-black hover:bg-slate-50 transition-colors">
                                    CANCEL
                                </button>
                                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-3.5 bg-indigo-600 disabled:bg-indigo-400 text-white rounded-xl font-black hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex justify-center items-center">
                                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : 'SAVE SHIFT'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
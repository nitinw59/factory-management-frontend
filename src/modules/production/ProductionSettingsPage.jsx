import React, { useState, useEffect } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuClock, LuPlus, LuTrash2, LuSave } from 'react-icons/lu';

export default function ProductionSettingsPage() {
    const [timeSlots, setTimeSlots] = useState([]);
    const [newTime, setNewTime] = useState('09:00');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        productionManagerApi.getFactorySettings().then(res => setTimeSlots(res.data.timeSlots || []));
    }, []);

    const handleAddSlot = () => {
        if (!timeSlots.includes(newTime)) {
            const updated = [...timeSlots, newTime].sort(); // Keeps times in chronological order
            setTimeSlots(updated);
        }
    };

    const handleRemoveSlot = (slot) => {
        setTimeSlots(timeSlots.filter(t => t !== slot));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await productionManagerApi.updateFactorySettings({ timeSlots });
            alert("Shift timings updated successfully for all lines.");
        } catch (err) {
            alert("Failed to save settings.");
        } finally {
            setIsSaving(false);
        }
    };

    // Helper to format "14:30" to "02:30 PM"
    const formatTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const formattedHour = h % 12 || 12;
        return `${formattedHour}:${minutes} ${ampm}`;
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-6">Factory Shift Configurations</h1>
            
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-lg font-bold text-slate-800 flex items-center mb-4">
                    <LuClock className="mr-2 text-indigo-500" /> Production Log Cut-off Times
                </h2>
                <p className="text-sm text-slate-500 mb-6">Define the exact times when Line Managers are expected to log their production output (e.g., before lunch break, end of shift).</p>

                <div className="flex gap-4 mb-6">
                    <input 
                        type="time" 
                        value={newTime} 
                        onChange={(e) => setNewTime(e.target.value)}
                        className="border border-slate-300 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button onClick={handleAddSlot} className="bg-slate-100 text-slate-700 font-bold px-4 rounded-lg hover:bg-slate-200 flex items-center">
                        <LuPlus className="mr-1"/> Add Slot
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                    {timeSlots.map(slot => (
                        <div key={slot} className="flex justify-between items-center bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-lg">
                            <span className="font-bold text-indigo-800">{formatTime(slot)}</span>
                            <button onClick={() => handleRemoveSlot(slot)} className="text-indigo-400 hover:text-rose-500"><LuTrash2 size={16}/></button>
                        </div>
                    ))}
                </div>

                <button onClick={handleSave} disabled={isSaving} className="bg-indigo-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-indigo-700 flex items-center">
                    <LuSave className="mr-2"/> {isSaving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </div>
    );
}
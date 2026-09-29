import React, { useState, useEffect } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuClock, LuPlus, LuTrash2, LuSave, LuShieldAlert } from 'react-icons/lu';

export default function ProductionSettingsPage() {
    const [timeSlots, setTimeSlots] = useState([]);
    const [newTime, setNewTime] = useState('09:00');
    const [isSaving, setIsSaving] = useState(false);

    const [warningThreshold, setWarningThreshold] = useState(10);
    const [blockThreshold, setBlockThreshold] = useState(20);
    const [isSavingThresholds, setIsSavingThresholds] = useState(false);

    useEffect(() => {
        productionManagerApi.getFactorySettings().then(res => setTimeSlots(res.data.timeSlots || []));
        productionManagerApi.getReworkThresholds().then(res => {
            setWarningThreshold(res.data.warning_threshold);
            setBlockThreshold(res.data.block_threshold);
        });
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

    const handleSaveThresholds = async () => {
        if (blockThreshold < warningThreshold) {
            alert('Block threshold cannot be lower than the warning threshold.');
            return;
        }
        setIsSavingThresholds(true);
        try {
            await productionManagerApi.setReworkThresholds({ warning_threshold: warningThreshold, block_threshold: blockThreshold });
            alert('Rework backlog thresholds updated.');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to save thresholds.');
        } finally {
            setIsSavingThresholds(false);
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

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-6">
                <h2 className="text-lg font-bold text-slate-800 flex items-center mb-4">
                    <LuShieldAlert className="mr-2 text-rose-500" /> Rework Backlog Thresholds
                </h2>
                <p className="text-sm text-slate-500 mb-6">
                    Applies per checking line, based on how many pieces are currently sitting unresolved in Pending
                    Rework on that line. Below the warning number, checking works as normal. At or above the warning
                    number, the checker sees a full-screen interrupt every time they submit a check. Above the block
                    number, the server itself refuses any further plain Approve on that line — only repairing a
                    reworked piece or rejecting one is still accepted, until the backlog is brought back down.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-amber-600 mb-1.5">Warning threshold</label>
                        <input
                            type="number"
                            min={1}
                            value={warningThreshold}
                            onChange={(e) => setWarningThreshold(parseInt(e.target.value, 10) || 0)}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <p className="text-xs text-slate-400 mt-1">Pending rework count that triggers the full-screen warning.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-rose-600 mb-1.5">Block threshold</label>
                        <input
                            type="number"
                            min={1}
                            value={blockThreshold}
                            onChange={(e) => setBlockThreshold(parseInt(e.target.value, 10) || 0)}
                            className="w-full border border-slate-300 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                        />
                        <p className="text-xs text-slate-400 mt-1">Pending rework count beyond which plain Approve is disabled.</p>
                    </div>
                </div>

                <button onClick={handleSaveThresholds} disabled={isSavingThresholds} className="bg-rose-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-rose-700 flex items-center">
                    <LuSave className="mr-2"/> {isSavingThresholds ? 'Saving...' : 'Save Thresholds'}
                </button>
            </div>
        </div>
    );
}
import React, { useState } from 'react';
import Modal from '../../../shared/Modal';
import { Loader2 } from 'lucide-react';

const EditFabricRollModal = ({ roll, onSave, onClose }) => {
    const [meter, setMeter] = useState(roll.meter);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        await onSave({ ...roll, meter: parseFloat(meter) });
        setIsSaving(false);
        onClose();
    };

    return (
        <Modal title={`Edit Roll #${roll.id}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Meters</label>
                    <input 
                        type="number" 
                        step="0.01" 
                        value={meter} 
                        onChange={e => setMeter(e.target.value)} 
                        className="mt-1 block w-full p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        required
                    />
                </div>
                <div className="flex justify-end space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 flex items-center">
                        {isSaving && <Loader2 className="animate-spin mr-2 h-4 w-4" />} Save
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EditFabricRollModal;
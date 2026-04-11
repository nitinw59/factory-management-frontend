import { useState, useEffect } from 'react';
import Modal from '../../../shared/Modal';
import { Loader2, Trash2, AlertCircle } from 'lucide-react';
import { storeManagerApi } from '../../../api/storeManagerApi';

const EditFabricRollModal = ({ roll, onSave, onDelete, onClose }) => {
    const [meter, setMeter] = useState(roll.meter);
    const [uom, setUom] = useState(roll.uom || 'meter');
    const [fabricColorId, setFabricColorId] = useState(String(roll.fabric_color_id || ''));
    const [fabricColors, setFabricColors] = useState([]);
    const [loadingColors, setLoadingColors] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        storeManagerApi.getFabricColors()
            .then(res => setFabricColors(res.data || []))
            .catch(() => {})
            .finally(() => setLoadingColors(false));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            await onSave({ ...roll, meter: parseFloat(meter), uom, fabric_color_id: fabricColorId });
        } catch (err) {
            setError('Failed to save changes.');
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await onDelete(roll.id);
        } catch (err) {
            setError('Failed to delete roll.');
            setIsDeleting(false);
        }
    };

    return (
        <Modal title={`Edit Roll R-${roll.id}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center border border-red-200">
                        <AlertCircle className="mr-2 shrink-0" size={16} /> {error}
                    </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-500">
                    <span className="font-bold text-gray-700">Fabric Type:</span> {roll.fabric_type}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                    {loadingColors ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Loader2 className="animate-spin h-4 w-4" /> Loading colors...
                        </div>
                    ) : (
                        <select
                            value={fabricColorId}
                            onChange={e => setFabricColorId(e.target.value)}
                            required
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">Select Color</option>
                            {fabricColors.map(fc => (
                                <option key={fc.id} value={String(fc.id)}>
                                    {fc.color_number}{fc.name ? ` (${fc.name})` : ''}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                        <input
                            type="number"
                            step="0.01"
                            value={meter}
                            onChange={e => setMeter(e.target.value)}
                            required
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                        <select
                            value={uom}
                            onChange={e => setUom(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="meter">Meters</option>
                            <option value="yard">Yards</option>
                            <option value="kg">Kgs</option>
                        </select>
                    </div>
                </div>

                {confirmDelete ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-700 font-medium mb-3">
                            Delete Roll R-{roll.id}? This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="flex-1 flex items-center justify-center px-3 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                            >
                                {isDeleting ? <Loader2 className="animate-spin h-4 w-4" /> : 'Yes, Delete'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md text-sm font-medium transition-colors"
                        >
                            <Trash2 size={15} /> Delete Roll
                        </button>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50 text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || loadingColors}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 flex items-center text-sm font-bold"
                            >
                                {isSaving && <Loader2 className="animate-spin mr-2 h-4 w-4" />} Save Changes
                            </button>
                        </div>
                    </div>
                )}
            </form>
        </Modal>
    );
};

export default EditFabricRollModal;

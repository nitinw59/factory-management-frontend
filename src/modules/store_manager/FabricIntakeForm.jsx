import React, { useState, useEffect } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>;

const FabricIntakeForm = ({ onSave, onClose }) => {
    const [suppliers, setSuppliers] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [supplierId, setSupplierId] = useState('');
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    // New state for Reference Number
    const [referenceNumber, setReferenceNumber] = useState('');
    const [rolls, setRolls] = useState([{ fabric_type_id: '', fabric_color_id: '', meter: '' }]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchFormData = async () => {
            try {
                const [suppliersRes, typesRes, colorsRes] = await Promise.all([
                    storeManagerApi.getSuppliers(),
                    storeManagerApi.getFabricTypes(),
                    storeManagerApi.getFabricColors()
                ]);
                setSuppliers(suppliersRes.data || []);
                setFabricTypes(typesRes.data || []);
                setFabricColors(colorsRes.data || []);    
            } catch (error) {
                console.error("Failed to load form data", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchFormData();
    }, []);

    const handleRollChange = (index, field, value) => {
        const newRolls = [...rolls];
        newRolls[index][field] = value;
        setRolls(newRolls);
    };

    const addRoll = () => {
        setRolls([...rolls, { fabric_type_id: '', fabric_color_id: '', meter: '' }]);
    };
    
    const removeRoll = (index) => {
        setRolls(rolls.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            // Include reference_number in the payload
            await onSave({ supplier_id: supplierId, bill_date: billDate, reference_number: referenceNumber, rolls });
        } catch (error) {
            alert('Failed to submit request.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required className="w-full p-2 border rounded">
                        <option value="">Select Supplier</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bill/Intake Date</label>
                    <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className="w-full p-2 border rounded" required />
                </div>
            </div>
            
            {/* New Reference Number Input */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number / Challan No. / PO </label>
                <input 
                    type="text" 
                    value={referenceNumber} 
                    onChange={e => setReferenceNumber(e.target.value)} 
                    placeholder="Enter Challan or Reference Number (Optional)" 
                    className="w-full p-2 border rounded" 
                />
            </div>

            <div className="space-y-2 pt-4 border-t">
                <h3 className="font-semibold text-gray-800">Fabric Rolls Received</h3>
                
                <div className="max-h-[40vh] overflow-y-auto space-y-2 p-2 border rounded-md bg-gray-50">
                    {rolls.map((roll, index) => (
                        <div key={index} className="flex items-center space-x-2">
                            <select value={roll.fabric_type_id} onChange={e => handleRollChange(index, 'fabric_type_id', e.target.value)} required className="p-2 border rounded flex-1">
                                <option value="">Select Fabric Type</option>
                                {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                            </select>
                             <select value={roll.fabric_color_id} onChange={e => handleRollChange(index, 'fabric_color_id', e.target.value)} required className="p-2 border rounded flex-1">
                                <option value="">Select Color</option>
                                {fabricColors.map(fc => <option key={fc.id} value={fc.id}>{fc.color_number} ({fc.name})</option>)}
                            </select>
                            <input type="number" step="0.01" placeholder="Meters" value={roll.meter} onChange={e => handleRollChange(index, 'meter', e.target.value)} required className="p-2 border rounded w-32" />
                            <button type="button" onClick={() => removeRoll(index)} className="p-2 text-red-500 hover:text-red-700 transition-colors"><LuTrash2 /></button>
                        </div>
                    ))}
                </div>
            </div>
            <button type="button" onClick={addRoll} className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center"><LuPlus size={16} className="mr-1"/> Add Another Roll</button>
            <div className="flex justify-end space-x-2 pt-4 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 hover:bg-blue-700 transition-colors shadow-sm">
                    {isSaving ? 'Saving...' : 'Save Intake'}
                </button>
            </div>
        </form>
    );
};

export default FabricIntakeForm;
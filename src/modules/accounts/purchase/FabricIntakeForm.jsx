import React, { useState, useEffect } from 'react';
import { storeManagerApi } from '../../../api/storeManagerApi';
import { Plus, Trash2, Loader2, AlertCircle, CheckSquare } from 'lucide-react';

const Spinner = () => (
    <div className="flex justify-center p-2">
        <Loader2 className="animate-spin h-6 w-6 text-blue-600" />
    </div>
);

const FabricIntakeForm = ({ onSave, onClose, purchaseOrder }) => {
    // --- State ---
    const [suppliers, setSuppliers] = useState([]);
    const [fabricTypes, setFabricTypes] = useState([]);
    const [fabricColors, setFabricColors] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [supplierId, setSupplierId] = useState('');
    const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
    const [referenceNumber, setReferenceNumber] = useState('');
    
    // Updated rolls state to include 'uom'
    const [rolls, setRolls] = useState([
        { fabric_type_id: '', fabric_color_id: '', meter: '', uom: 'meter' }
    ]);
    
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    // --- 1. Load Dropdown Options ---
    useEffect(() => {
        const loadFormData = async () => {
            setIsLoadingData(true);
            try {
                const res = await storeManagerApi.getFabricIntakeFormData();
                if (res.data) {
                    setSuppliers(res.data.suppliers || []);
                    setFabricTypes(res.data.fabricTypes || []);
                    setFabricColors(res.data.fabricColors || []);
                }
            } catch (err) {
                console.error("Failed to load form data:", err);
                setError("Failed to load dropdown options. Please check your connection.");
            } finally {
                setIsLoadingData(false);
            }
        };
        loadFormData();
    }, []);

    // --- 2. Initialize from Purchase Order (if provided) ---
    useEffect(() => {
        if (purchaseOrder) {
            setSupplierId(purchaseOrder.supplier_id || '');
            // Use PO Code as the reference number by default
            setReferenceNumber(purchaseOrder.po_code || purchaseOrder.po_number || '');
        }
    }, [purchaseOrder]);

    // --- Handlers ---

    const handleRollChange = (index, field, value) => {
        const newRolls = [...rolls];
        newRolls[index][field] = value;
        setRolls(newRolls);
    };

    const addRoll = () => {
        // Default new rolls to 'meter'
        setRolls([...rolls, { fabric_type_id: '', fabric_color_id: '', meter: '', uom: 'meter' }]);
    };

    const removeRoll = (index) => {
        if (rolls.length > 1) {
            setRolls(rolls.filter((_, i) => i !== index));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!supplierId) {
            setError("Please select a supplier.");
            return;
        }

        const invalidRolls = rolls.some(r => 
            !r.fabric_type_id || !r.fabric_color_id || !r.meter || parseFloat(r.meter) <= 0 || !r.uom
        );
        
        if (invalidRolls) {
            setError("Please ensure all rolls have a valid Type, Color, Quantity, and Unit.");
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                supplier_id: supplierId,
                bill_date: billDate,
                reference_number: referenceNumber,
                purchase_order_id: purchaseOrder?.id || null, 
                rolls: rolls.map(r => ({
                    ...r,
                    meter: parseFloat(r.meter),
                    uom: r.uom // Send UOM to backend
                }))
            };

            await onSave(payload);
        } catch (err) {
            console.error("Submission error:", err);
            setError(err.response?.data?.error || "Failed to submit fabric intake.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoadingData) return <Spinner />;

    return (
        <form onSubmit={handleSubmit} className="space-y-5 text-gray-800">
            {/* Context Header for PO linking */}
            {purchaseOrder ? (
                <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                    <CheckSquare className="text-indigo-600 mt-0.5 shrink-0" size={18} />
                    <div>
                        <h4 className="text-sm font-bold text-indigo-900">Receiving against PO: {purchaseOrder.po_code}</h4>
                        <p className="text-xs text-indigo-700">Supplier: {purchaseOrder.supplier_name}</p>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">General Stock Intake (Not linked to specific PO)</p>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center border border-red-200">
                    <AlertCircle className="mr-2 shrink-0" size={16}/> {error}
                </div>
            )}

            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Supplier</label>
                    <select 
                        value={supplierId} 
                        onChange={e => setSupplierId(e.target.value)} 
                        required 
                        disabled={!!purchaseOrder} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    >
                        <option value="">Select Supplier</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Intake Date</label>
                    <input 
                        type="date" 
                        value={billDate} 
                        onChange={e => setBillDate(e.target.value)} 
                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                        required 
                    />
                </div>
            </div>
            
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reference / Challan No.</label>
                <input 
                    type="text" 
                    value={referenceNumber} 
                    onChange={e => setReferenceNumber(e.target.value)} 
                    placeholder="Enter Bill No, Challan No, or PO Code" 
                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                />
            </div>

            <hr className="border-gray-100" />

            {/* Rolls List */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-gray-700">Fabric Rolls</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Total: {rolls.length}</span>
                </div>
                
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                    {rolls.map((roll, index) => (
                        <div key={index} className="flex flex-col md:flex-row gap-2 items-start md:items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex-1 w-full">
                                <select 
                                    value={roll.fabric_type_id} 
                                    onChange={e => handleRollChange(index, 'fabric_type_id', e.target.value)} 
                                    required 
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 outline-none bg-white"
                                >
                                    <option value="">Select Type</option>
                                    {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 w-full">
                                <select 
                                    value={roll.fabric_color_id} 
                                    onChange={e => handleRollChange(index, 'fabric_color_id', e.target.value)} 
                                    required 
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 outline-none bg-white"
                                >
                                    <option value="">Select Color</option>
                                    {fabricColors.map(fc => <option key={fc.id} value={fc.id}>{fc.name} {fc.color_number ? `(${fc.color_number})` : ''}</option>)}
                                </select>
                            </div>
                            
                            {/* Quantity Input */}
                            <div className="w-full md:w-32">
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    placeholder="Qty" 
                                    value={roll.meter} 
                                    onChange={e => handleRollChange(index, 'meter', e.target.value)} 
                                    required 
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 outline-none" 
                                />
                            </div>

                            {/* UOM Dropdown */}
                            <div className="w-full md:w-24">
                                <select 
                                    value={roll.uom} 
                                    onChange={e => handleRollChange(index, 'uom', e.target.value)} 
                                    required 
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 outline-none bg-white font-medium text-gray-600"
                                >
                                    <option value="meter">Meters</option>
                                    <option value="yard">Yards</option>
                                    <option value="kg">Kgs</option>
                                </select>
                            </div>

                            <button 
                                type="button" 
                                onClick={() => removeRoll(index)} 
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Remove Roll"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>

                <button 
                    type="button" 
                    onClick={addRoll} 
                    className="mt-3 text-sm text-blue-600 font-semibold flex items-center hover:text-blue-800 transition-colors"
                >
                    <Plus size={16} className="mr-1"/> Add Another Roll
                </button>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button 
                    type="button" 
                    onClick={onClose} 
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                >
                    Cancel
                </button>
                <button 
                    type="submit" 
                    disabled={isSaving} 
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed shadow-md transition-all flex items-center"
                >
                    {isSaving && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                    {isSaving ? 'Saving...' : 'Confirm Intake'}
                </button>
            </div>
        </form>
    );
};

export default FabricIntakeForm;
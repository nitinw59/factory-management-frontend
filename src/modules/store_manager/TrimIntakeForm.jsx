import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. Import useNavigate
import { storeManagerApi } from '../../api/storeManagerApi';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>;

const TrimIntakeForm = ({ onSaveSuccess }) => {
    // 2. Initialize the navigate function
    const navigate = useNavigate();
    
    const [suppliers, setSuppliers] = useState([]);
    const [trimVariants, setTrimVariants] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [supplierId, setSupplierId] = useState('');
    const [challanNumber, setChallanNumber] = useState('');
    const [items, setItems] = useState([{ trim_item_variant_id: '', packs_received: '', units_per_pack: '' }]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        storeManagerApi.getTrimIntakeFormData()
            .then(res => {
                setSuppliers(res.data.suppliers);
                setTrimVariants(res.data.trimVariants);
            })
            .finally(() => setIsLoading(false));
    }, []);

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { trim_item_variant_id: '', packs_received: '', units_per_pack: '' }]);
    };
    
    const removeItem = (index) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await storeManagerApi.createTrimIntake({ supplier_id: supplierId, challan_number: challanNumber, items });
            alert('Trim intake recorded successfully!');
            
            // 3. Redirect to the trim management page
            navigate('/store-manager/trim-management');

        } catch (error) {
            console.error(error);
            alert('Failed to submit request.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
         <div>
            <h1 className="text-3xl font-bold mb-6">Record New Trim Purchase</h1>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl mx-auto bg-white p-8 rounded-lg shadow">
                 <div className="grid grid-cols-2 gap-4">
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required className="p-2 border rounded">
                        <option value="">Select Supplier</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input type="text" placeholder="Challan / Bill Number" value={challanNumber} onChange={e => setChallanNumber(e.target.value)} className="p-2 border rounded" required />
                </div>
                <div className="space-y-2 pt-4 border-t">
                    <h3 className="font-semibold">Items Received</h3>
                    {items.map((item, index) => (
                        <div key={index} className="grid grid-cols-4 gap-2 items-center">
                            <select value={item.trim_item_variant_id} onChange={e => handleItemChange(index, 'trim_item_variant_id', e.target.value)} required className="col-span-2 p-2 border rounded">
                                <option value="">Select Trim Variant</option>
                                {trimVariants.map(v => <option key={v.id} value={v.id}>{v.variant_name}</option>)}
                            </select>
                            <input type="number" placeholder="Packs" value={item.packs_received} onChange={e => handleItemChange(index, 'packs_received', e.target.value)} required className="p-2 border rounded" />
                            <input type="number" placeholder="Units/Pack" value={item.units_per_pack} onChange={e => handleItemChange(index, 'units_per_pack', e.target.value)} required className="p-2 border rounded" />
                            <button type="button" onClick={() => removeItem(index)} className="p-2 text-red-500 justify-self-start"><LuTrash2 /></button>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={addItem} className="text-sm text-blue-600 flex items-center"><LuPlus size={16} className="mr-1"/> Add Another Item</button>
                <div className="flex justify-end pt-4"><button type="submit" disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400">{isSaving ? 'Saving...' : 'Save Intake'}</button></div>
            </form>
        </div>
    );
};

export default TrimIntakeForm;
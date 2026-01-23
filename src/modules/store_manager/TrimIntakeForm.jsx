import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';
import { Plus, Trash2, UploadCloud, FileImage, X, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression'; 

const Spinner = () => <div className="flex justify-center p-4"><Loader2 className="animate-spin h-6 w-6 text-blue-600" /></div>;

const TrimIntakeForm = () => {
    const navigate = useNavigate();
    
    // Dropdown Data
    const [suppliers, setSuppliers] = useState([]);
    const [trimVariants, setTrimVariants] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Form State
    const [supplierId, setSupplierId] = useState('');
    const [challanNumber, setChallanNumber] = useState('');
    const [items, setItems] = useState([{ trim_item_variant_id: '', packs_received: '', units_per_pack: '' }]);
    
    // Image State
    const [challanImage, setChallanImage] = useState(null); // The compressed file
    const [imagePreview, setImagePreview] = useState(null); // URL for display
    const [isCompressing, setIsCompressing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 1. Fetch Dropdown Data
    useEffect(() => {
        storeManagerApi.getTrimIntakeFormData()
            .then(res => {
                setSuppliers(res.data.suppliers || []);
                setTrimVariants(res.data.trimVariants || []);
            })
            .catch(err => console.error("Failed to load form data:", err))
            .finally(() => setIsLoading(false));
    }, []);

    // 2. Image Compression Logic (Strict Requirement)
    const handleImageUpload = async (event) => {
        const imageFile = event.target.files[0];
        if (!imageFile) return;

        setIsCompressing(true);
        
        const options = {
            maxSizeMB: 0.5,       // Limit to 500KB
            maxWidthOrHeight: 1200, // Limit dimensions
            useWebWorker: true,
            fileType: "image/jpeg"
        };

        try {
            const compressedFile = await imageCompression(imageFile, options);
            
            // Create a local preview URL
            const previewUrl = URL.createObjectURL(compressedFile);
            setImagePreview(previewUrl);
            setChallanImage(compressedFile); // Store the compressed file
        } catch (error) {
            console.error("Image compression failed:", error);
            alert("Failed to compress image. Please try another file.");
        } finally {
            setIsCompressing(false);
        }
    };

    const removeImage = () => {
        setChallanImage(null);
        setImagePreview(null);
    };

    // 3. Item List Management
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

    // 4. Submit Handler (Matches your snippet)
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Strict Check: Image is mandatory
        if (!challanImage) {
            alert("Strict Requirement: You must upload a Challan/Bill image.");
            return;
        }

        // Strict Check: Items validation
        const isValid = items.every(item => item.trim_item_variant_id && item.packs_received > 0 && item.units_per_pack > 0);
        if (!isValid) {
            alert("Please fill in all item details correctly.");
            return;
        }

        setIsSaving(true);
        try {
            // Prepare FormData for Multipart Upload
            const formData = new FormData();
            formData.append('supplier_id', supplierId);
            formData.append('challan_number', challanNumber);
            
            // Append the compressed file
            const fileName = `challan_${Date.now()}.jpg`;
            formData.append('challan_image', challanImage, fileName);
            
            // Serialize items array because FormData only accepts strings
            formData.append('items', JSON.stringify(items));

            // Call API
            await storeManagerApi.createTrimIntake(formData);
            
            alert('Trim intake recorded successfully!');
            navigate('/store-manager/trim-management'); // Redirect to inventory
        } catch (error) {
            console.error("Submission error:", error);
            alert('Failed to submit request. Please check your connection.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
         <div className="p-6 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Record New Trim Purchase</h1>
            <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto bg-white p-8 rounded-xl shadow-md border border-gray-200">
                 
                 {/* Top Row: Supplier & Challan */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                        <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">Select Supplier</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Challan / Bill Number</label>
                        <input type="text" placeholder="e.g. INV-2023-001" value={challanNumber} onChange={e => setChallanNumber(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                    </div>
                </div>

                {/* Image Upload Section */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Upload Challan Image (Required)</label>
                    
                    {isCompressing ? (
                        <div className="text-blue-600 flex items-center font-medium"><Loader2 className="animate-spin mr-2"/> Compressing Image...</div>
                    ) : imagePreview ? (
                        <div className="relative group">
                            <img src={imagePreview} alt="Challan Preview" className="h-48 object-contain rounded-lg shadow-sm border bg-white" />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-lg"></div>
                            <button type="button" onClick={removeImage} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-md transform hover:scale-110 transition-all">
                                <X size={16} />
                            </button>
                            <p className="text-xs text-center text-green-600 mt-2 font-bold flex items-center justify-center">
                                <FileImage size={12} className="mr-1"/> Ready to upload
                            </p>
                        </div>
                    ) : (
                        <label className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
                            <UploadCloud size={40} className="text-gray-400 mb-2" />
                            <span className="text-sm text-blue-600 font-medium hover:underline">Click to upload</span>
                            <span className="text-xs text-gray-500 mt-1">JPG, PNG (Max compressed 500KB)</span>
                            <input 
                                type="file" 
                                accept="image/*" 
                                onChange={handleImageUpload} 
                                className="hidden" 
                                required // Browser validation
                            />
                        </label>
                    )}
                </div>

                {/* Items Section */}
                <div className="space-y-4 pt-4 border-t border-gray-200">
                    <h3 className="font-semibold text-lg text-gray-800 flex items-center"><FileImage className="mr-2 text-gray-400" size={20}/> Items Received</h3>
                    
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div className="md:col-span-5">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Variant</label>
                                    <select value={item.trim_item_variant_id} onChange={e => handleItemChange(index, 'trim_item_variant_id', e.target.value)} required className="w-full p-2 border rounded bg-white focus:ring-1 focus:ring-blue-500 outline-none">
                                        <option value="">Select Trim Variant</option>
                                        {trimVariants.map(v => <option key={v.id} value={v.id}>{v.variant_name}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Packs</label>
                                    <input type="number" min="0" placeholder="0" value={item.packs_received} onChange={e => handleItemChange(index, 'packs_received', e.target.value)} required className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Units/Pack</label>
                                    <input type="number" min="0" placeholder="0" value={item.units_per_pack} onChange={e => handleItemChange(index, 'units_per_pack', e.target.value)} required className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                                <div className="md:col-span-1 flex justify-center pb-1">
                                    <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:bg-red-100 p-2 rounded transition-colors" title="Remove Item"><Trash2 size={18} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <button type="button" onClick={addItem} className="text-sm font-semibold text-blue-600 flex items-center hover:bg-blue-50 px-3 py-2 rounded transition-colors w-full md:w-auto justify-center md:justify-start">
                        <Plus size={18} className="mr-1.5"/> Add Another Item
                    </button>
                </div>

                {/* Footer */}
                <div className="flex justify-end pt-6 border-t border-gray-200">
                    <button 
                        type="submit" 
                        disabled={isSaving || isCompressing} 
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all flex items-center justify-center min-w-[160px]"
                    >
                        {isSaving ? <Loader2 className="animate-spin mr-2"/> : null}
                        {isSaving ? 'Saving...' : 'Save & Upload Intake'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default TrimIntakeForm;
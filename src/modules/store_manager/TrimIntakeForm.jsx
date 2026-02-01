import React, { useState, useEffect,useRef} from 'react';
import { useNavigate } from 'react-router-dom';
import { storeManagerApi } from '../../api/storeManagerApi';

import { Plus, Trash2, UploadCloud, FileImage, X, Loader2, ChevronDown, Search } from 'lucide-react';

import imageCompression from 'browser-image-compression'; 

const Spinner = () => <div className="flex justify-center p-4"><Loader2 className="animate-spin h-6 w-6 text-blue-600" /></div>;


// --- Searchable Dropdown Component ---
const SearchableDropdown = ({ options = [], value, onChange, placeholder, disabled, labelKey = 'name' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options based on search term
    const filteredOptions = options.filter(option => 
        (option[labelKey] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // FIX: Robust comparison for selected option (handle string vs number)
    // Also ensures we don't try to find 'undefined' or '' values
    const selectedOption = options.find(opt => 
        value !== '' && value !== null && value !== undefined && String(opt.id) === String(value)
    );

    const handleSelect = (option) => {
        onChange(option.id);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full p-2 border rounded bg-white text-left flex justify-between items-center focus:ring-1 focus:ring-blue-500 outline-none ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:border-gray-400'}`}
            >
                <span className={`block truncate ${!selectedOption ? 'text-gray-500' : 'text-gray-800'}`}>
                    {selectedOption ? selectedOption[labelKey] : placeholder}
                </span>
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-60 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-blue-500"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-blue-50 ${String(option.id) === String(value) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                                >
                                    {option[labelKey]}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">No results found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const TrimIntakeForm = () => {
    // FIXED: Hook called unconditionally
    const navigate = useNavigate();
    
    const [suppliers, setSuppliers] = useState([]);
    const [trimItems, setTrimItems] = useState([]); // Master list of items
    const [isLoading, setIsLoading] = useState(true);
    
    // Form State
    const [supplierId, setSupplierId] = useState('');
    const [challanNumber, setChallanNumber] = useState('');
    
    // Items State - Includes 'trim_item_id' for the first dropdown and 'available_variants' for the second
    const [items, setItems] = useState([{ 
        trim_item_id: '', 
        trim_item_variant_id: '', 
        packs_received: '', 
        units_per_pack: '',
        available_variants: [] 
    }]);
    
    // Image State
    const [challanImage, setChallanImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 1. Fetch Initial Dropdown Data
    useEffect(() => {
        storeManagerApi.getInitialFormData()
            .then(res => {
                setSuppliers(res.data.suppliers || []);
                // Add a formatted label for the dropdown
                const formattedItems = (res.data.trimItems || []).map(item => ({
                    ...item,
                    dropdownLabel: `${item.name} - ${item.brand}`
                }));
                setTrimItems(formattedItems);
            })
            .catch(err => console.error("Failed to load form data:", err))
            .finally(() => setIsLoading(false));
    }, []);

    // --- Image Handling ---
    const handleImageUpload = async (event) => {
        const imageFile = event.target.files[0];
        if (!imageFile) return;

        setIsCompressing(true);
        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1200, useWebWorker: true, fileType: "image/jpeg" };

        try {
            const compressedFile = await imageCompression(imageFile, options);
            const previewUrl = URL.createObjectURL(compressedFile);
            setImagePreview(previewUrl);
            setChallanImage(compressedFile);
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

    // --- Item Handlers ---
    
    // Handle changes for simple fields (Packs, Units)
    const handleItemChange = (index, field, value) => {
        setItems(prevItems => {
            const newItems = [...prevItems];
            newItems[index] = { ...newItems[index], [field]: value };
            return newItems;
        });
    };

    // Special handler for Master Item selection (Dropdown 1)
    const handleMasterItemChange = async (index, itemId) => {
        // Optimistic update: Set ID, reset variant, clear options
        setItems(prevItems => {
            const newItems = [...prevItems];
            newItems[index] = { 
                ...newItems[index], 
                trim_item_id: itemId, 
                trim_item_variant_id: '', 
                available_variants: [] 
            };
            return newItems;
        });

        if (itemId) {
            try {
                // Fetch variants for this specific item
                const res = await storeManagerApi.getVariantsByItem(itemId);
                
                // Update state with fetched variants
                setItems(prevItems => {
                    const newItems = [...prevItems];
                    // Ensure the row exists before updating
                    if (newItems[index]) {
                        newItems[index] = { 
                            ...newItems[index], 
                            available_variants: res.data || [] 
                        };
                    }
                    return newItems;
                });
            } catch (err) {
                console.error("Failed to load variants", err);
            }
        }
    };

    const addItem = () => {
        setItems(prev => [...prev, { trim_item_id: '', trim_item_variant_id: '', packs_received: '', units_per_pack: '', available_variants: [] }]);
    };
    
    const removeItem = (index) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    // --- Submit Logic ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!challanImage) {
            alert("Strict Requirement: You must upload a Challan/Bill image.");
            return;
        }

        const isValid = items.every(item => item.trim_item_variant_id && item.packs_received > 0 && item.units_per_pack > 0);
        if (!isValid) {
            alert("Please fill in all item details correctly.");
            return;
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('supplier_id', supplierId);
            formData.append('challan_number', challanNumber);
            const fileName = `challan_${Date.now()}.jpg`;
            formData.append('challan_image', challanImage, fileName);
            
            // Clean up items before sending (remove UI-only fields)
            const cleanItems = items.map(({ trim_item_variant_id, packs_received, units_per_pack }) => ({
                trim_item_variant_id, packs_received, units_per_pack
            }));
            formData.append('items', JSON.stringify(cleanItems));

            await storeManagerApi.createTrimIntake(formData);
            
            alert('Trim intake recorded successfully!');
            navigate('/store-manager/trim-management'); 
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
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                        <SearchableDropdown 
                            options={suppliers}
                            value={supplierId}
                            onChange={(val) => setSupplierId(val)}
                            placeholder="Select Supplier"
                            labelKey="name"
                        />
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
                                required 
                            />
                        </label>
                    )}
                </div>

                {/* Items Section */}
                <div className="space-y-4 pt-4 border-t border-gray-200">
                    <h3 className="font-semibold text-lg text-gray-800 flex items-center"><FileImage className="mr-2 text-gray-400" size={20}/> Items Received</h3>
                    
                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start bg-gray-50 p-3 rounded-lg border border-gray-100">
                                {/* Dropdown 1: Select Master Item */}
                                <div className="md:col-span-3">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Item Category</label>
                                    <SearchableDropdown 
                                        options={trimItems}
                                        value={item.trim_item_id}
                                        onChange={(val) => handleMasterItemChange(index, val)}
                                        placeholder="Select Item..."
                                        labelKey="dropdownLabel"
                                    />
                                </div>

                                {/* Dropdown 2: Select Variant (Filtered) */}
                                <div className="md:col-span-3">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Variant / Color</label>
                                    <SearchableDropdown 
                                        options={item.available_variants}
                                        value={item.trim_item_variant_id}
                                        onChange={(val) => handleItemChange(index, 'trim_item_variant_id', val)}
                                        placeholder="Select Variant..."
                                        disabled={!item.trim_item_id}
                                        labelKey="variant_name"
                                    />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Packs</label>
                                    <input type="number" min="0" placeholder="0" value={item.packs_received} onChange={e => handleItemChange(index, 'packs_received', e.target.value)} required className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                                <div className="md:col-span-3">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Units/Pack</label>
                                    <input type="number" min="0" placeholder="0" value={item.units_per_pack} onChange={e => handleItemChange(index, 'units_per_pack', e.target.value)} required className="w-full p-2 border rounded focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                                <div className="md:col-span-1 flex justify-center items-center pt-6">
                                    <button type="button" onClick={() => removeItem(index)} className="text-red-500 hover:bg-red-100 p-2 rounded transition-colors" title="Remove Item"><Trash2 size={18} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <button type="button" onClick={addItem} className="text-sm font-semibold text-blue-600 flex items-center hover:bg-blue-50 px-3 py-2 rounded transition-colors w-full md:w-auto justify-center md:justify-start">
                        <Plus size={18} className="mr-1.5"/> Add Another Item
                    </button>
                </div>

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
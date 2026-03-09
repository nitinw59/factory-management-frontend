import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, UploadCloud, FileImage, X, Loader2, ChevronDown, Search, Wrench, Scissors } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { storeManagerApi } from '../../api/storeManagerApi';
import { sparesApi } from '../../api/sparesApi';


const imageCompression = async (file, options) => {
    return new Promise(resolve => setTimeout(() => resolve(file), 800)); 
};



const Spinner = () => <div className="flex justify-center p-4"><Loader2 className="animate-spin h-6 w-6 text-blue-600" /></div>;

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h2 className="text-lg font-black text-gray-800">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:bg-gray-200 p-1.5 rounded-md transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);

// --- Searchable Dropdown Component (Upgraded with Quick Add) ---
const SearchableDropdown = ({ options = [], value, onChange, placeholder, disabled, labelKey = 'name', onAddNew }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(option => 
        (option[labelKey] || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                className={`w-full p-2.5 border rounded-lg bg-white text-left flex justify-between items-center focus:ring-2 focus:ring-blue-500 outline-none transition-all ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'hover:border-gray-400 border-gray-300'}`}
            >
                <span className={`block truncate ${!selectedOption ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
                    {selectedOption ? selectedOption[labelKey] : placeholder}
                </span>
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1 max-h-48">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.id}
                                    onClick={() => handleSelect(option)}
                                    className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${String(option.id) === String(value) ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 font-medium'}`}
                                >
                                    {option[labelKey]}
                                </div>
                            ))
                        ) : (
                            <div className="px-4 py-4 text-sm text-gray-500 text-center italic">No existing parts match your search.</div>
                        )}
                    </div>
                    {onAddNew && (
                        <div className="p-2 border-t border-gray-200 bg-gray-50 sticky bottom-0">
                            <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); onAddNew(searchTerm); }}
                                className="w-full py-2 bg-white border border-dashed border-blue-400 text-blue-700 rounded-md text-sm font-bold hover:bg-blue-50 transition-colors flex items-center justify-center shadow-sm"
                            >
                                <Plus size={16} className="mr-1.5"/> Add "{searchTerm || 'New Part'}"
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- Quick Add Spare Part Modal (Updated with extra fields) ---
const QuickAddSpareModal = ({ onClose, onSave, categories, initialName }) => {
    const [formData, setFormData] = useState({ 
        name: initialName || '', 
        part_number: '', 
        category_id: '',
        location: '',
        min_stock_threshold: 5
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave(formData);
        setIsSubmitting(false);
    };

    return (
        <Modal title="Create New Spare Part" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Part Name *</label>
                    <input required type="text" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. V-Belt Multi-ribbed" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Part Number / SKU *</label>
                        <input required type="text" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" value={formData.part_number} onChange={e => setFormData({...formData, part_number: e.target.value})} placeholder="e.g. VB-1234" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Category *</label>
                        <select required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm" value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}>
                            <option value="">Select...</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Location / Shelf</label>
                        <input type="text" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. Aisle 3, Bin B" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Min Limit Alert</label>
                        <input type="number" min="0" className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.min_stock_threshold} onChange={e => setFormData({...formData, min_stock_threshold: e.target.value})} />
                    </div>
                </div>
                
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mt-2">
                    <p className="text-xs text-blue-700 font-medium">
                        <span className="font-bold uppercase tracking-wider">Note:</span> Initial stock and unit cost will be automatically set based on this GRN intake transaction.
                    </p>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold transition-colors">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-70 flex items-center transition-all">
                        {isSubmitting ? <Loader2 className="animate-spin w-4 h-4 mr-2"/> : <Plus className="w-4 h-4 mr-2"/>} Create & Select
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// --- Main Unified Intake Component ---
export default function UnifiedIntakeForm() {
    const navigate = useNavigate();
    
    const [isLoading, setIsLoading] = useState(true);
    const [suppliers, setSuppliers] = useState([]);
    const [trimItemsCatalog, setTrimItemsCatalog] = useState([]); 
    const [sparePartsCatalog, setSparePartsCatalog] = useState([]);
    
    // Quick Add Spare states
    const [spareCategories, setSpareCategories] = useState([]);
    const [isAddSpareModalOpen, setIsAddSpareModalOpen] = useState(false);
    const [targetRowIndex, setTargetRowIndex] = useState(null);
    const [initialNewSpareName, setInitialNewSpareName] = useState('');
    
    const [intakeCategory, setIntakeCategory] = useState('TRIMS'); 

    const [supplierId, setSupplierId] = useState('');
    const [challanNumber, setChallanNumber] = useState('');
    
    const [trimItems, setTrimItems] = useState([{ 
        trim_item_id: '', trim_item_variant_id: '', packs_received: '', units_per_pack: '', unit_price: '', available_variants: [] 
    }]);
    
    const [spareItems, setSpareItems] = useState([{ 
        spare_part_id: '', quantity: '', unit_price: '' 
    }]);
    
    const [challanImage, setChallanImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            storeManagerApi.getInventoryIntakeFormData(),
            sparesApi.getCategories()
        ])
        .then(([intakeRes, catRes]) => {
            setSuppliers(intakeRes.data.suppliers || []);
            setTrimItemsCatalog((intakeRes.data.trimItems || []).map(item => ({
                ...item, dropdownLabel: `${item.name} ${item.brand ? `- ${item.brand}` : ''}`
            })));
            setSparePartsCatalog((intakeRes.data.spareParts || []).map(part => ({
                ...part, dropdownLabel: `${part.name} (SKU: ${part.part_number})`
            })));
            setSpareCategories(catRes || []);
        })
        .catch(err => console.error("Failed to load initial data", err))
        .finally(() => setIsLoading(false));
    }, []);

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

    const handleTrimChange = (index, field, value) => {
        setTrimItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], [field]: value };
            return newItems;
        });
    };

    const handleTrimMasterChange = async (index, itemId) => {
        setTrimItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], trim_item_id: itemId, trim_item_variant_id: '', available_variants: [] };
            return newItems;
        });

        if (itemId) {
            try {
                const res = await storeManagerApi.getVariantsByItem(itemId);
                const formattedVariants = (res.data || []).map(v => ({
                    ...v, id: v.variant_id, variant_name: `${v.color_name} - ${v.color_number}`
                }));
                setTrimItems(prev => {
                    const newItems = [...prev];
                    if (newItems[index]) newItems[index] = { ...newItems[index], available_variants: formattedVariants };
                    return newItems;
                });
            } catch (err) { console.error("Failed to load variants", err); }
        }
    };

    const handleSpareChange = (index, field, value) => {
        setSpareItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], [field]: value };
            return newItems;
        });
    };

    // Triggered by the "Add New" button in the Spares Searchable Dropdown
    const handleOpenAddSpareModal = (rowIndex, searchString) => {
        setTargetRowIndex(rowIndex);
        setInitialNewSpareName(searchString);
        setIsAddSpareModalOpen(true);
    };

    // Handles the submission of the Quick Add modal
    const handleSaveNewSpare = async (formData) => {
        try {
            // Note: Sending defaults for stock and cost as they will be updated by the GRN intake process
            const res = await sparesApi.createSparePart({
                ...formData,
                current_stock: 0,
                unit_cost: 0
            });
            const newPart = res.data;
            const formattedPart = { ...newPart, dropdownLabel: `${newPart.name} (SKU: ${newPart.part_number})` };
            
            // Add to our dropdown catalog instantly
            setSparePartsCatalog(prev => [...prev, formattedPart]);
            
            // Auto-select this newly created part in the row that initiated it
            handleSpareChange(targetRowIndex, 'spare_part_id', formattedPart.id);
            
            setIsAddSpareModalOpen(false);
            setTargetRowIndex(null);
            setInitialNewSpareName('');
        } catch (err) {
            console.error("Error adding spare:", err);
            alert("Failed to create new spare part.");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!challanImage) return alert("Strict Requirement: You must upload a Challan/Bill image.");

        let cleanItems = [];
        let isValid = false;

        if (intakeCategory === 'TRIMS') {
            isValid = trimItems.every(item => item.trim_item_variant_id && item.packs_received > 0 && item.units_per_pack > 0 && item.unit_price >= 0);
            if (!isValid) return alert("Please fill in all Trim item details correctly, including Unit Price.");
            cleanItems = trimItems.map(({ trim_item_variant_id, packs_received, units_per_pack, unit_price }) => ({
                trim_item_variant_id, packs_received, units_per_pack, unit_price
            }));
        } else {
            isValid = spareItems.every(item => item.spare_part_id && item.quantity > 0 && item.unit_price >= 0);
            if (!isValid) return alert("Please fill in all Spare Part details correctly, including Unit Price.");
            cleanItems = spareItems.map(({ spare_part_id, quantity, unit_price }) => ({
                spare_part_id, quantity, unit_price
            }));
        }

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('inventory_category', intakeCategory);
            formData.append('supplier_id', supplierId);
            formData.append('challan_number', challanNumber);
            formData.append('challan_image', challanImage, `challan_${Date.now()}.jpg`);
            formData.append('items', JSON.stringify(cleanItems));

            await storeManagerApi.createInventoryIntake(formData);
            
            alert(`${intakeCategory} intake recorded and stock updated successfully!`);
            navigate('/store-manager/intakes'); 
            
            setChallanNumber('');
            setChallanImage(null);
            setImagePreview(null);
            setTrimItems([{ trim_item_id: '', trim_item_variant_id: '', packs_received: '', units_per_pack: '', unit_price: '', available_variants: [] }]);
            setSpareItems([{ spare_part_id: '', quantity: '', unit_price: '' }]);
            
        } catch (error) {
            console.error("Submission error:", error);
            alert('Failed to submit request. Please check your connection.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
         <div className="p-4 md:p-6 bg-gray-50 min-h-screen font-sans text-gray-900">
            <div className="max-w-5xl mx-auto mb-6">
                <h1 className="text-3xl font-black text-gray-800 tracking-tight">Record Goods Receipt (GRN)</h1>
                <p className="text-gray-500 font-medium mt-1">Intake new stock into the main inventory and update moving average costs.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200">
                 
                {/* Category Toggle Tabs */}
                <div className="flex bg-gray-100 p-1.5 rounded-xl w-full sm:w-max mx-auto md:mx-0 mb-8">
                    <button 
                        type="button"
                        onClick={() => setIntakeCategory('TRIMS')}
                        className={`flex items-center px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${intakeCategory === 'TRIMS' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Scissors className="w-4 h-4 mr-2"/> Trims & Accessories
                    </button>
                    <button 
                        type="button"
                        onClick={() => setIntakeCategory('SPARES')}
                        className={`flex items-center px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${intakeCategory === 'SPARES' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Wrench className="w-4 h-4 mr-2"/> Machine Spare Parts
                    </button>
                </div>

                {/* Common Header Details */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier *</label>
                        <SearchableDropdown 
                            options={suppliers}
                            value={supplierId}
                            onChange={(val) => setSupplierId(val)}
                            placeholder="Select Supplier..."
                            labelKey="name"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Challan / Bill Number *</label>
                        <input type="text" placeholder="e.g. INV-2023-001" value={challanNumber} onChange={e => setChallanNumber(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" required />
                    </div>
                </div>

                {/* Image Upload Section */}
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100/50 transition-colors">
                    {isCompressing ? (
                        <div className="text-blue-600 flex items-center font-bold"><Loader2 className="animate-spin mr-2"/> Compressing Image...</div>
                    ) : imagePreview ? (
                        <div className="relative group w-full flex flex-col items-center">
                            <img src={imagePreview} alt="Challan Preview" className="h-48 md:h-64 object-contain rounded-lg shadow-sm border bg-white" />
                            <button type="button" onClick={() => {setChallanImage(null); setImagePreview(null);}} className="absolute top-0 right-1/4 translate-x-12 -translate-y-3 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 shadow-md transform hover:scale-110 transition-all">
                                <X size={16} />
                            </button>
                            <p className="text-sm text-center text-green-600 mt-4 font-bold flex items-center justify-center bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
                                <FileImage size={14} className="mr-1.5"/> Valid Image Attached
                            </p>
                        </div>
                    ) : (
                        <label className="cursor-pointer flex flex-col items-center w-full h-full justify-center text-center">
                            <div className="bg-white p-4 rounded-full shadow-sm mb-3">
                                <UploadCloud size={32} className="text-blue-500" />
                            </div>
                            <span className="text-base text-gray-800 font-bold mb-1">Upload Challan Image (Required)</span>
                            <span className="text-sm text-blue-600 font-medium hover:underline mb-1">Browse files</span>
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">JPG, PNG (Auto-compressed)</span>
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" required />
                        </label>
                    )}
                </div>

                {/* --- TRIMS SECTION --- */}
                {intakeCategory === 'TRIMS' && (
                    <div className="space-y-4 pt-6">
                        <h3 className="font-black text-lg text-gray-800 flex items-center">
                            <Scissors className="mr-2 text-blue-500" size={20}/> Trim Line Items
                        </h3>
                        
                        <div className="space-y-4">
                            {trimItems.map((item, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-blue-50/30 p-4 rounded-xl border border-blue-100">
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Item Category</label>
                                        <SearchableDropdown options={trimItemsCatalog} value={item.trim_item_id} onChange={(val) => handleTrimMasterChange(index, val)} placeholder="Select Item..." labelKey="dropdownLabel" />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Variant / Color</label>
                                        <SearchableDropdown options={item.available_variants} value={item.trim_item_variant_id} onChange={(val) => handleTrimChange(index, 'trim_item_variant_id', val)} placeholder="Select Variant..." disabled={!item.trim_item_id} labelKey="variant_name" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Packs</label>
                                        <input type="number" min="0" placeholder="0" value={item.packs_received} onChange={e => handleTrimChange(index, 'packs_received', e.target.value)} required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Units/Pack</label>
                                        <input type="number" min="0" placeholder="0" value={item.units_per_pack} onChange={e => handleTrimChange(index, 'units_per_pack', e.target.value)} required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                                    </div>
                                    <div className="md:col-span-2 relative">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Price/Unit ($)</label>
                                        <input type="number" min="0" step="0.01" placeholder="0.00" value={item.unit_price} onChange={e => handleTrimChange(index, 'unit_price', e.target.value)} required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-blue-700 bg-white" />
                                    </div>
                                    
                                    {trimItems.length > 1 && (
                                        <div className="md:col-span-12 flex justify-end pt-2 border-t border-blue-100/50 mt-2">
                                            <button type="button" onClick={() => setTrimItems(prev => prev.filter((_, i) => i !== index))} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center"><Trash2 size={14} className="mr-1"/> Remove Row</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => setTrimItems(prev => [...prev, { trim_item_id: '', trim_item_variant_id: '', packs_received: '', units_per_pack: '', unit_price: '', available_variants: [] }])} className="text-sm font-bold text-blue-600 flex items-center hover:bg-blue-50 px-4 py-2.5 rounded-lg border border-blue-100 border-dashed transition-colors w-full md:w-auto justify-center">
                            <Plus size={18} className="mr-1.5"/> Add Another Trim
                        </button>
                    </div>
                )}

                {/* --- SPARES SECTION --- */}
                {intakeCategory === 'SPARES' && (
                    <div className="space-y-4 pt-6">
                        <h3 className="font-black text-lg text-gray-800 flex items-center">
                            <Wrench className="mr-2 text-orange-500" size={20}/> Spare Part Line Items
                        </h3>
                        
                        <div className="space-y-4">
                            {spareItems.map((item, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-orange-50/30 p-4 rounded-xl border border-orange-100">
                                    <div className="md:col-span-6">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Spare Part Details</label>
                                        <SearchableDropdown 
                                            options={sparePartsCatalog} 
                                            value={item.spare_part_id} 
                                            onChange={(val) => handleSpareChange(index, 'spare_part_id', val)} 
                                            placeholder="Search Parts Catalog..." 
                                            labelKey="dropdownLabel" 
                                            onAddNew={(searchString) => handleOpenAddSpareModal(index, searchString)}
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Total Qty Received</label>
                                        <input type="number" min="0" placeholder="0" value={item.quantity} onChange={e => handleSpareChange(index, 'quantity', e.target.value)} required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono" />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Price/Unit ($)</label>
                                        <input type="number" min="0" step="0.01" placeholder="0.00" value={item.unit_price} onChange={e => handleSpareChange(index, 'unit_price', e.target.value)} required className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono font-bold text-orange-700 bg-white" />
                                    </div>
                                    
                                    {spareItems.length > 1 && (
                                        <div className="md:col-span-12 flex justify-end pt-2 border-t border-orange-100/50 mt-2">
                                            <button type="button" onClick={() => setSpareItems(prev => prev.filter((_, i) => i !== index))} className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center"><Trash2 size={14} className="mr-1"/> Remove Row</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => setSpareItems(prev => [...prev, { spare_part_id: '', quantity: '', unit_price: '' }])} className="text-sm font-bold text-orange-600 flex items-center hover:bg-orange-50 px-4 py-2.5 rounded-lg border border-orange-100 border-dashed transition-colors w-full md:w-auto justify-center">
                            <Plus size={18} className="mr-1.5"/> Add Another Part
                        </button>
                    </div>
                )}

                <div className="flex justify-end pt-8 mt-4 border-t border-gray-200">
                    <button 
                        type="submit" 
                        disabled={isSaving || isCompressing} 
                        className={`px-8 py-3.5 text-white rounded-xl font-bold shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed transition-all flex items-center justify-center min-w-[200px] ${intakeCategory === 'TRIMS' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                    >
                        {isSaving ? <Loader2 className="animate-spin mr-2"/> : null}
                        {isSaving ? 'Processing Intake...' : `Save ${intakeCategory} Intake`}
                    </button>
                </div>
            </form>

            {/* Quick Add Spare Modal */}
            {isAddSpareModalOpen && (
                <QuickAddSpareModal 
                    onClose={() => setIsAddSpareModalOpen(false)}
                    onSave={handleSaveNewSpare}
                    categories={spareCategories}
                    initialName={initialNewSpareName}
                />
            )}
        </div>
    );
}
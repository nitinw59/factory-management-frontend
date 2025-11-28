import React, { useState, useEffect, useCallback } from 'react';
import { FiPlus, FiEdit3, FiTrash2, FiChevronRight, FiSearch, FiPackage, FiLayers, FiRepeat } from 'react-icons/fi';
import { trimsApi } from '../../api/trimsApi';
import { useAuth } from '../../context/AuthContext';

// --- UI Components ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div></div>;
const Placeholder = ({ text }) => <div className="p-8 text-center bg-gray-50 rounded-lg h-full flex items-center justify-center"><p className="text-gray-500">{text}</p></div>;
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b"><h2 className="text-lg font-semibold">{title}</h2></div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);


// --- Form Modals ---
const ItemFormModal = ({ onSave, onClose, initialData = {} }) => {
    const [formData, setFormData] = useState({ 
        name: '', brand: '', description: '', item_code: '', unit_of_measure: 'pieces', is_color_agnostic: false, 
        ...initialData 
    });
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <input name="name" value={formData.name} onChange={handleChange} placeholder="Item Name" required className="w-full p-2 border rounded" />
                <input name="brand" value={formData.brand} onChange={handleChange} placeholder="Brand" required className="w-full p-2 border rounded" />
            </div>
            <input name="item_code" value={formData.item_code} onChange={handleChange} placeholder="Item Code / SKU" className="w-full p-2 border rounded" />
            <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description" className="w-full p-2 border rounded" rows="3"></textarea>
            <select name="unit_of_measure" value={formData.unit_of_measure} onChange={handleChange} className="w-full p-2 border rounded">
                <option value="pieces">pieces</option>
                <option value="meters">meters</option>
                <option value="spools">spools</option>
                <option value="packets">packets</option>
            </select>
            <label className="flex items-center space-x-2">
                <input type="checkbox" name="is_color_agnostic" checked={formData.is_color_agnostic} onChange={handleChange} />
                <span>Common across all colors (e.g., Wash Care Label)</span>
            </label>
            <div className="flex justify-end space-x-2 pt-4 border-t"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save Item</button></div>
        </form>
    );
};

const VariantFormModal = ({ onSave, onClose, initialData = {}, isColorAgnostic, colors, userRole }) => {
    const [formData, setFormData] = useState({ fabric_color_id: '', main_store_stock: 0, low_stock_threshold: 10, ...initialData });
    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSave = { ...formData };
        if (isColorAgnostic || dataToSave.fabric_color_id === '') {
            dataToSave.fabric_color_id = null;
        }
        onSave(dataToSave);
    };
    
    const isDefinitionDisabled = userRole === 'store_manager' && initialData.id;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="text-sm font-medium">Color</label>
                <select name="fabric_color_id" value={formData.fabric_color_id || ''} onChange={handleChange} disabled={isColorAgnostic || isDefinitionDisabled} required={!isColorAgnostic} className="w-full p-2 border rounded disabled:bg-gray-200 disabled:cursor-not-allowed">
                    <option value="">{isColorAgnostic ? 'N/A - Color Agnostic' : 'Select Color'}</option>
                    {colors.map(c => <option key={c.id} value={c.id}>{c.color_number}-{c.name}</option>)}
                </select>
                {isDefinitionDisabled && <p className="text-xs text-gray-500 mt-1">Only admins can change the color of an existing variant.</p>}
            </div>
             <div>
                <label className="text-sm font-medium">Current Stock</label>
                <input type="number" name="main_store_stock" value={formData.main_store_stock} onChange={handleChange} placeholder="Current Stock" required className="w-full p-2 border rounded" />
            </div>
             <div>
                <label className="text-sm font-medium">Low Stock Threshold</label>
                <input type="number" name="low_stock_threshold" value={formData.low_stock_threshold} onChange={handleChange} placeholder="Low Stock Threshold" required className="w-full p-2 border rounded" />
            </div>
            <div className="flex justify-end space-x-2 pt-4 border-t"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Save Variant</button></div>
        </form>
    );
};

const SubstituteFormModal = ({ onSave, onClose, variants, currentVariantId, existingSubstitutes, parentItemName, parentItemBrand }) => {
    console.log("SubstituteFormModal rendered", variants);
    const [substituteId, setSubstituteId] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSave({ substitute_variant_id: substituteId }); };

    // Filter out the current variant itself and any that are already substitutes
    const availableOptions = variants.filter(v => 
        v.id !== currentVariantId && !existingSubstitutes.some(s => s.substitute_variant_id === v.id)
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700 mb-2">
                Showing variants for <strong>{parentItemName} - {parentItemBrand}</strong> only.
            </div>
            <select value={substituteId} onChange={e => setSubstituteId(e.target.value)} required className="w-full p-2 border rounded">
                <option value="">Select a variant to use as a substitute</option>
                {availableOptions.map(v => (
                    <option key={v.id} value={v.id}> 
                        {/* Use item_name if available (global list), else fallback to parent name (scoped list) */}
                        {v.item_name || parentItemName} - {v.item_brand || parentItemBrand} - {v.color_name || 'Generic'}
                    </option>
                ))}
            </select>
            <div className="flex justify-end space-x-2 pt-4 border-t"><button type="button" onClick={onClose}>Cancel</button><button type="submit">Add Substitute</button></div>
        </form>
    );
};


// --- Main Page Component ---
const TrimManagementPage = () => {
    const { user } = useAuth(); 

    const [items, setItems] = useState([]);
    const [variants, setVariants] = useState([]);
    const [substitutes, setSubstitutes] = useState([]);

    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedVariant, setSelectedVariant] = useState(null);
    
    // --- Search Filter States ---
    const [itemFilter, setItemFilter] = useState('');
    const [variantFilter, setVariantFilter] = useState('');
    const [substituteFilter, setSubstituteFilter] = useState('');

    const [loading, setLoading] = useState({ items: true, variants: false, substitutes: false });
    const [modal, setModal] = useState({ type: null, data: null });

    const [colors, setColors] = useState([]);
    // We can keep allVariants if needed for other features, but Substitute modal will use scoped `variants`
    // const [allVariants, setAllVariants] = useState([]); 

    const fetchData = useCallback(async () => {
        setLoading(p => ({ ...p, items: true }));
        try {
            const [itemsRes, colorsRes] = await Promise.all([
                trimsApi.getItems(),
                trimsApi.getColors(),
                // trimsApi.getAllVariants(), // Removed if not strictly needed elsewhere, or keep for global features
            ]);
            setItems(itemsRes.data);
            setColors(colorsRes.data);
            // setAllVariants(allVariantsRes.data);
        } catch (error) { console.error("Failed to fetch initial data", error); }
        finally { setLoading(p => ({ ...p, items: false })); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (selectedItem) {
            setLoading(p => ({ ...p, variants: true }));
            trimsApi.getVariants(selectedItem.id)
                .then(res => setVariants(res.data))
                .catch(err => console.error("Failed to fetch variants", err))
                .finally(() => setLoading(p => ({ ...p, variants: false })));
        } else {
            setVariants([]);
        }
    }, [selectedItem]);

    useEffect(() => {
        if (selectedVariant) {
            setLoading(p => ({ ...p, substitutes: true }));
            trimsApi.getSubstitutes(selectedVariant.id)
                .then(res => setSubstitutes(res.data))
                .catch(err => console.error("Failed to fetch substitutes", err))
                .finally(() => setLoading(p => ({ ...p, substitutes: false })));
        } else {
            setSubstitutes([]);
        }
    }, [selectedVariant]);

    const handleSelectItem = (item) => {
        setSelectedItem(item);
        setSelectedVariant(null);
        // Reset sub-filters when main selection changes
        setVariantFilter(''); 
        setSubstituteFilter('');
    };
    
    const handleSelectVariant = (variant) => {
        setSelectedVariant(variant);
        setSubstituteFilter('');
    };

    const handleSave = async (type, data) => {
        try {
            switch (type) {
                case 'item':
                    data.id ? await trimsApi.updateItem(data.id, data) : await trimsApi.createItem(data);
                    fetchData();
                    break;
                case 'variant':
                    const variantData = { ...data, trim_item_id: selectedItem.id };
                    data.id ? await trimsApi.updateVariant(data.id, variantData) : await trimsApi.createVariant(variantData);
                    if (selectedItem) {
                        const res = await trimsApi.getVariants(selectedItem.id);
                        setVariants(res.data);
                    }
                    break;
                case 'substitute':
                    const subData = { ...data, original_variant_id: selectedVariant.id };
                    await trimsApi.createSubstitute(subData);
                     if (selectedVariant) {
                        const res = await trimsApi.getSubstitutes(selectedVariant.id);
                        setSubstitutes(res.data);
                    }
                    break;
                default: break;
            }
        } catch (error) {
            alert(`Failed to save ${type}: ${error.response?.data?.error || error.message}`);
        }
        setModal({ type: null, data: null });
    };

    const handleDelete = async (type, id) => {
        if (window.confirm(`Are you sure you want to delete this ${type}?`)) {
            try {
                switch(type) {
                    case 'item': await trimsApi.deleteItem(id); fetchData(); break;
                    case 'variant': await trimsApi.deleteVariant(id); if(selectedItem) { const res = await trimsApi.getVariants(selectedItem.id); setVariants(res.data); } break;
                    case 'substitute': await trimsApi.deleteSubstitute(id); if(selectedVariant) { const res = await trimsApi.getSubstitutes(selectedVariant.id); setSubstitutes(res.data); } break;
                    default: break;
                }
            } catch (error) {
                 alert(`Failed to delete ${type}`);
            }
        }
    };

    // --- Filter Logic ---
    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(itemFilter.toLowerCase()) || 
        item.brand?.toLowerCase().includes(itemFilter.toLowerCase()) ||
        item.item_code?.toLowerCase().includes(itemFilter.toLowerCase())
    );

    const filteredVariants = variants.filter(variant => {
        const name = variant.color_name || 'Generic (Color Agnostic)';
        return name.toLowerCase().includes(variantFilter.toLowerCase());
    });

    const filteredSubstitutes = substitutes.filter(sub => {
        const name = `${sub.substitute_item_name} ${sub.substitute_color_name || 'Generic'}`;
        return name.toLowerCase().includes(substituteFilter.toLowerCase());
    });


    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Trim Management & Substitutions</h1>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Column 1: Trim Items */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <div className="p-1.5 bg-gray-100 rounded-md">
                                    <FiPackage className="text-gray-500" />
                                </div>
                                Trim Items
                            </h2>
                            {(user.role === 'factory_admin' || user.role === 'store_manager') && (
                                <button 
                                    onClick={() => setModal({ type: 'item' })} 
                                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                >
                                    <FiPlus size={18} />
                                </button>
                            )}
                        </header>
                        
                        {/* Filter Input */}
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                <input 
                                    type="text" 
                                    placeholder="Filter items..." 
                                    value={itemFilter}
                                    onChange={(e) => setItemFilter(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.items ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : (
                            filteredItems.map(item => (
                                <div 
                                    key={item.id} 
                                    onClick={() => handleSelectItem(item)} 
                                    className={`group flex justify-between items-center p-3 rounded-lg cursor-pointer border transition-all duration-200 
                                    ${selectedItem?.id === item.id 
                                        ? 'border-blue-200 bg-blue-50/80 ring-1 ring-blue-200' 
                                        : 'border-transparent hover:bg-gray-50 hover:border-gray-100'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-sm font-semibold ${selectedItem?.id === item.id ? 'text-blue-900' : 'text-gray-700'}`}>
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {item.brand} {item.is_color_agnostic && <span className="text-purple-600 font-medium ml-1 text-[10px] bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-100">Generic</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {user.role === 'factory_admin' && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'item', data: item }); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-gray-200">
                                                    <FiEdit3 size={12}/>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete('item', item.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200">
                                                    <FiTrash2 size={12}/>
                                                </button>
                                            </>
                                        )}
                                        <FiChevronRight className={`text-gray-300 ${selectedItem?.id === item.id ? 'text-blue-400' : ''}`}/>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Column 2: Variants */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <div className="p-1.5 bg-gray-100 rounded-md">
                                    <FiLayers className="text-gray-500" />
                                </div>
                                Variants
                            </h2>
                            {selectedItem && (user.role === 'factory_admin' || user.role === 'store_manager') && (
                                <button 
                                    onClick={() => setModal({ type: 'variant' })} 
                                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                >
                                    <FiPlus size={18} />
                                </button>
                            )}
                        </header>

                        {/* Filter Input */}
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                <input 
                                    type="text" 
                                    placeholder="Filter variants..." 
                                    disabled={!selectedItem}
                                    value={variantFilter}
                                    onChange={(e) => setVariantFilter(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.variants ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : !selectedItem ? (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-60">
                                <FiPackage className="text-4xl text-gray-300 mb-2" />
                                <Placeholder text="Select an item to view variants." />
                            </div>
                        ) : (
                            filteredVariants.map(variant => (
                                <div 
                                    key={variant.id} 
                                    onClick={() => handleSelectVariant(variant)} 
                                    className={`group flex justify-between items-center p-3 rounded-lg cursor-pointer border transition-all duration-200 
                                    ${selectedVariant?.id === variant.id 
                                        ? 'border-blue-200 bg-blue-50/80 ring-1 ring-blue-200' 
                                        : 'border-transparent hover:bg-gray-50 hover:border-gray-100'
                                    }`}
                                >
                                    <div>
                                        <p className={`text-sm font-semibold ${selectedVariant?.id === variant.id ? 'text-blue-900' : 'text-gray-700'}`}>
                                            {variant.color_name || 'Generic (Color Agnostic)'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5 font-mono bg-gray-100 inline-block px-1 rounded">
                                            Stock: {variant.main_store_stock}
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {user.role === 'factory_admin' && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'variant', data: variant }); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-gray-200">
                                                    <FiEdit3 size={12}/>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete('variant', variant.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200">
                                                    <FiTrash2 size={12}/>
                                                </button>
                                            </>
                                        )}
                                        <FiChevronRight className={`text-gray-300 ${selectedVariant?.id === variant.id ? 'text-blue-400' : ''}`}/>
                                    </div>
                                </div>
                            ))
                        )}
                        {filteredVariants.length === 0 && selectedItem && !loading.variants && (
                            <p className="text-sm text-center text-gray-400 p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200 m-2">No variants found.</p>
                        )}
                    </div>
                </div>

                {/* Column 3: Substitutes */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <div className="p-1.5 bg-gray-100 rounded-md">
                                    <FiRepeat className="text-gray-500" />
                                </div>
                                Substitutes
                            </h2>
                            {selectedVariant && (
                                <button 
                                    onClick={() => setModal({ type: 'substitute' })} 
                                    className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                                >
                                    <FiPlus size={18} />
                                </button>
                            )}
                        </header>

                        {/* Filter Input */}
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                                <input 
                                    type="text" 
                                    placeholder="Filter substitutes..." 
                                    disabled={!selectedVariant}
                                    value={substituteFilter}
                                    onChange={(e) => setSubstituteFilter(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.substitutes ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : !selectedVariant ? (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-60">
                                <FiLayers className="text-4xl text-gray-300 mb-2" />
                                <Placeholder text="Select a variant to manage substitutes." />
                            </div>
                        ) : (
                            filteredSubstitutes.map(sub => (
                                <div 
                                    key={sub.id} 
                                    className="group flex justify-between items-center p-3 rounded-lg border border-transparent hover:bg-gray-50 hover:border-gray-100 transition-all duration-200"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700">
                                            {sub.substitute_item_name} <span className="text-gray-400 font-normal mx-1">/</span> {sub.substitute_color_name || 'Generic'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5 font-mono bg-gray-100 inline-block px-1 rounded">
                                            Stock: {sub.substitute_stock}
                                        </p>
                                    </div>
                                    {user.role === 'factory_admin' && (
                                        <button 
                                            onClick={() => handleDelete('substitute', sub.id)} 
                                            className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <FiTrash2 size={12}/>
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                        {filteredSubstitutes.length === 0 && selectedVariant && !loading.substitutes && (
                             <p className="text-sm text-center text-gray-400 p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200 m-2">No substitutes found.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Rendering */}
            {modal.type === 'item' && <Modal title={modal.data ? 'Edit Item' : 'Add New Item'} onClose={() => setModal({type: null})}><ItemFormModal onSave={(data) => handleSave('item', data)} onClose={() => setModal({type: null})} initialData={modal.data} /></Modal>}
            {modal.type === 'variant' && <Modal title={modal.data ? 'Edit Variant' : 'Add New Variant'} onClose={() => setModal({type: null})}><VariantFormModal onSave={(data) => handleSave('variant', data)} onClose={() => setModal({type: null})} initialData={modal.data} isColorAgnostic={selectedItem?.is_color_agnostic} colors={colors} userRole={user.role} /></Modal>}
            
            {/* Updated Substitute Modal usage */}
            {modal.type === 'substitute' && (
                <Modal title="Add Substitute" onClose={() => setModal({type: null})}>
                    <SubstituteFormModal 
                        onSave={(data) => handleSave('substitute', data)} 
                        onClose={() => setModal({type: null})} 
                        variants={variants} // Passing scoped variants instead of global
                        parentItemName={selectedItem?.name} // Passing parent name for display
                        parentItemBrand={selectedItem?.brand} // Passing parent brand for display
                        currentVariantId={selectedVariant?.id} 
                        existingSubstitutes={substitutes} 
                    />
                </Modal>
            )}
        </div>
    );
};

export default TrimManagementPage;
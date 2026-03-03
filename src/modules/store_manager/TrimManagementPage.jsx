import React, { useState, useEffect, useCallback, useRef } from 'react';
import { trimsApi } from '../../api/trimsApi';
import { useAuth } from '../../context/AuthContext';
import { 
    Plus, Edit2, Trash2, ChevronRight, Search, Package, Layers, Repeat, 
    FileSpreadsheet, Loader2, Upload
} from 'lucide-react';

const downloadAsExcel = (data, fileName = 'trim_inventory.csv') => {
    if (!data || !data.length) return alert("No data available to export.");
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','), 
        ...data.map(row => 
            headers.map(fieldName => {
                const val = row[fieldName] === null || row[fieldName] === undefined ? '' : row[fieldName].toString();
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// Robust CSV Parser that handles commas inside quotes
const parseCSVRow = (str) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
        if (inQuote) {
            if (str[i] === '"') {
                if (i < str.length - 1 && str[i + 1] === '"') { cur += '"'; i++; } 
                else { inQuote = false; }
            } else { cur += str[i]; }
        } else {
            if (str[i] === '"') { inQuote = true; }
            else if (str[i] === ',') { result.push(cur); cur = ''; }
            else { cur += str[i]; }
        }
    }
    result.push(cur);
    return result;
};

const parseCSV = (csvText) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    
    const headers = parseCSVRow(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = parseCSVRow(line);
        return headers.reduce((obj, header, index) => {
            obj[header] = values[index];
            return obj;
        }, {});
    });
};

const Spinner = () => <div className="flex justify-center items-center p-8"><Loader2 className="animate-spin h-6 w-6 text-gray-500" /></div>;
const Placeholder = ({ text }) => <div className="p-8 text-center bg-gray-50 rounded-lg h-full flex items-center justify-center"><p className="text-gray-500">{text}</p></div>;
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b"><h2 className="text-lg font-semibold">{title}</h2></div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

// --- ITEM FORM ---
const ItemFormModal = ({ onSave, onClose, initialData = {} }) => {
    const [formData, setFormData] = useState({ 
        name: '', brand: '', description: '', item_code: '', unit_of_measure: 'pieces', is_color_agnostic: false, 
        ...initialData 
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = (e) => { 
        e.preventDefault(); 
        onSave(formData); 
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-medium text-gray-500">Name</label>
                    <input name="name" value={formData.name} onChange={handleChange} placeholder="Item Name" required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500">Brand</label>
                    <input name="brand" value={formData.brand} onChange={handleChange} placeholder="Brand" required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            <div>
                <label className="text-xs font-medium text-gray-500">Item Code / SKU</label>
                <input name="item_code" value={formData.item_code} onChange={handleChange} placeholder="Item Code" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" rows="3"></textarea>
            
            <select name="unit_of_measure" value={formData.unit_of_measure} onChange={handleChange} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="pieces">pieces</option>
                <option value="meters">meters</option>
                <option value="spools">spools</option>
                <option value="packets">packets</option>
            </select>

            <label className="flex items-center space-x-2 bg-gray-50 p-3 rounded-lg border border-gray-200 cursor-pointer">
                <input type="checkbox" name="is_color_agnostic" checked={formData.is_color_agnostic} onChange={handleChange} className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                <span className="text-sm text-gray-700">Common across all colors (e.g., Wash Care Label)</span>
            </label>

            <div className="flex justify-end space-x-3 pt-4 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-colors">Save Item</button>
            </div>
        </form>
    );
};

// --- VARIANT FORM ---
const VariantFormModal = ({ onSave, onClose, initialData = {}, isColorAgnostic, colors, userRole }) => {
    const [formData, setFormData] = useState({ 
        fabric_color_id: '', main_store_stock: 0, low_stock_threshold: 10, 
        cost_price: '', selling_price: '',
        ...initialData 
    });
    
    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSave = { 
            ...formData,
            cost_price: parseFloat(formData.cost_price) || 0,
            selling_price: parseFloat(formData.selling_price) || 0
        };
        if (isColorAgnostic || dataToSave.fabric_color_id === '') {
            dataToSave.fabric_color_id = null;
        }
        onSave(dataToSave);
    };
    
    const isDefinitionDisabled = userRole === 'store_manager' && initialData.id;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="text-sm font-medium text-gray-700">Color</label>
                <select name="fabric_color_id" value={formData.fabric_color_id || ''} onChange={handleChange} disabled={isColorAgnostic || isDefinitionDisabled} required={!isColorAgnostic} className="w-full p-2 border rounded disabled:bg-gray-200 disabled:cursor-not-allowed">
                    <option value="">{isColorAgnostic ? 'N/A - Color Agnostic' : 'Select Color'}</option>
                    {colors.map(c => <option key={c.id} value={c.id}>{c.color_number}-{c.name}</option>)}
                </select>
                {isDefinitionDisabled && <p className="text-xs text-gray-500 mt-1">Only admins can change the color of an existing variant.</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-gray-700">Cost Price</label>
                    <input type="number" step="0.01" name="cost_price" value={formData.cost_price} onChange={handleChange} placeholder="0.00" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Selling Price</label>
                    <input type="number" step="0.01" name="selling_price" value={formData.selling_price} onChange={handleChange} placeholder="0.00" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-gray-700">Current Stock</label>
                    <input type="number" name="main_store_stock" value={formData.main_store_stock} onChange={handleChange} placeholder="Current Stock" required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-700">Low Stock Threshold</label>
                    <input type="number" name="low_stock_threshold" value={formData.low_stock_threshold} onChange={handleChange} placeholder="Low Stock Threshold" required className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
            </div>
            <div className="flex justify-end space-x-2 pt-4 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded">Save Variant</button>
            </div>
        </form>
    );
};

const SubstituteFormModal = ({ onSave, onClose, variants, currentVariantId, existingSubstitutes, parentItemName, parentItemBrand }) => {
    const [substituteId, setSubstituteId] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onSave({ substitute_variant_id: substituteId }); };

    const availableOptions = variants.filter(v => 
        v.id !== currentVariantId && !existingSubstitutes.some(s => s.substitute_variant_id === v.id)
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700 mb-2 border border-blue-100">
                <p>Showing variants for <strong>{parentItemName} - {parentItemBrand}</strong> only.</p>
            </div>
            <div>
                <label className="text-sm font-medium mb-1 block">Select Substitute</label>
                <select value={substituteId} onChange={e => setSubstituteId(e.target.value)} required className="w-full p-2 border rounded">
                    <option value="">Choose a variant...</option>
                    {availableOptions.map(v => (
                        <option key={v.id} value={v.id}> 
                            {v.color_name || 'Generic (Color Agnostic)'} (Stock: {v.main_store_stock})
                        </option>
                    ))}
                </select>
                {availableOptions.length === 0 && (
                    <p className="text-xs text-orange-500 mt-1">No other variants available to substitute.</p>
                )}
            </div>
            <div className="flex justify-end space-x-2 pt-4 border-t"><button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded">Cancel</button><button type="submit" disabled={!substituteId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:bg-gray-400">Add Substitute</button></div>
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
    
    const [itemFilter, setItemFilter] = useState('');
    const [variantFilter, setVariantFilter] = useState('');
    const [substituteFilter, setSubstituteFilter] = useState('');
    
    const [loading, setLoading] = useState({ items: true, variants: false, substitutes: false });
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [modal, setModal] = useState({ type: null, data: null });

    const fileInputRef = useRef(null);
    const [colors, setColors] = useState([]);

    const fetchData = useCallback(async () => {
        setLoading(p => ({ ...p, items: true }));
        try {
            const [itemsRes, colorsRes] = await Promise.all([
                trimsApi.getItems(),
                trimsApi.getColors(),
            ]);
            setItems(itemsRes.data);
            setColors(colorsRes.data);
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
        setVariantFilter(''); 
        setSubstituteFilter('');
    };
    
    const handleSelectVariant = (variant) => {
        setSelectedVariant(variant);
        setSubstituteFilter('');
    };

    // --- Export / Import Logic ---
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await trimsApi.exportInventory();
            const date = new Date().toISOString().split('T')[0];
            downloadAsExcel(res.data, `Trim_Catalog_Export_${date}.csv`);
        } catch (error) {
            console.error("Export failed", error);
            alert("Export failed.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current.click();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const parsedData = parseCSV(text);

                if (parsedData.length === 0) throw new Error("The CSV file is empty or invalid.");
                if (!parsedData[0]["Variant ID"]) throw new Error("The CSV must contain a 'Variant ID' column. Please download the template via Export first.");

                // Map parsed data to the expected backend payload
                const updates = parsedData.map(row => ({
                    variant_id: parseInt(row["Variant ID"], 10),
                    stock: row["Current Stock"] !== "" ? parseInt(row["Current Stock"], 10) : undefined,
                    cost_price: row["Cost Price"] !== "" ? parseFloat(row["Cost Price"]) : undefined,
                    selling_price: row["Selling Price"] !== "" ? parseFloat(row["Selling Price"]) : undefined,
                    threshold: row["Low Stock Alert Limit"] !== "" ? parseInt(row["Low Stock Alert Limit"], 10) : undefined
                })).filter(u => !isNaN(u.variant_id));

                if (updates.length === 0) throw new Error("No valid variant IDs found to update.");

                const res = await trimsApi.bulkUpdateInventory({ updates });
                alert(res.data.message || `Successfully imported updates for ${updates.length} items.`);
                
                // Refresh data to show updates
                if (selectedItem) {
                    const variantsRes = await trimsApi.getVariants(selectedItem.id);
                    setVariants(variantsRes.data);
                }
            } catch (err) {
                console.error("Import failed", err);
                alert(`Import failed: ${err.message}`);
            } finally {
                setIsImporting(false);
                e.target.value = null; // reset input
            }
        };

        reader.onerror = () => {
            alert("Failed to read the file.");
            setIsImporting(false);
        };

        reader.readAsText(file);
    };

    // --- Save / Delete Logic ---
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
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Trim Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage definitions, stock variants, and substitutes.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Hidden File Input */}
                    <input 
                        type="file" 
                        accept=".csv" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        className="hidden" 
                    />
                    
                    {/* IMPORT BUTTON */}
                    {(user.role === 'factory_admin') && (
                    <button 
                        onClick={handleImportClick} 
                        disabled={isImporting}
                        className="flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isImporting ? <Loader2 className="animate-spin w-4 h-4"/> : <Upload className="w-4 h-4"/>}
                        <span className="font-semibold">{isImporting ? 'Importing...' : 'Import Excel / CSV'}</span>
                    </button>
                    )}
                    {/* EXPORT BUTTON */}
                    <button 
                        onClick={handleExport} 
                        disabled={isExporting}
                        className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isExporting ? <Loader2 className="animate-spin w-4 h-4"/> : <FileSpreadsheet className="w-4 h-4"/>}
                        <span className="font-semibold">{isExporting ? 'Exporting...' : 'Export Inventory'}</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Column 1: Trim Items */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <div className="p-1.5 bg-gray-100 rounded-md"><Package className="text-gray-500 w-5 h-5" /></div>
                                Trim Items
                            </h2>
                            {(user.role === 'factory_admin' || user.role === 'store_manager') && (
                                <button onClick={() => setModal({ type: 'item' })} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"><Plus size={18} /></button>
                            )}
                        </header>
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input type="text" placeholder="Filter items..." value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white" />
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
                                    ${selectedItem?.id === item.id ? 'border-blue-200 bg-blue-50/80 ring-1 ring-blue-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-100'}`}
                                >
                                    <div className="w-full pr-2">
                                        <p className={`text-sm font-semibold truncate ${selectedItem?.id === item.id ? 'text-blue-900' : 'text-gray-700'}`}>{item.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {item.brand}
                                            {item.is_color_agnostic && <span className="text-purple-600 font-medium ml-1 text-[10px] bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-100">Generic</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {user.role === 'factory_admin' && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'item', data: item }); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-gray-200"><Edit2 size={12}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete('item', item.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200"><Trash2 size={12}/></button>
                                            </>
                                        )}
                                        <ChevronRight className={`w-4 h-4 text-gray-300 ${selectedItem?.id === item.id ? 'text-blue-400' : ''}`}/>
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
                                <div className="p-1.5 bg-gray-100 rounded-md"><Layers className="text-gray-500 w-5 h-5" /></div>
                                Variants
                            </h2>
                            {selectedItem && (user.role === 'factory_admin' || user.role === 'store_manager') && (
                                <button onClick={() => setModal({ type: 'variant' })} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"><Plus size={18} /></button>
                            )}
                        </header>
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input type="text" placeholder="Filter variants..." disabled={!selectedItem} value={variantFilter} onChange={(e) => setVariantFilter(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.variants ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : !selectedItem ? (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-60"><Package className="w-10 h-10 text-gray-300 mb-2" /><Placeholder text="Select an item to view variants." /></div>
                        ) : (
                            filteredVariants.map(variant => (
                                <div 
                                    key={variant.id} 
                                    onClick={() => handleSelectVariant(variant)} 
                                    className={`group flex justify-between items-center p-3 rounded-lg cursor-pointer border transition-all duration-200 
                                    ${selectedVariant?.id === variant.id ? 'border-blue-200 bg-blue-50/80 ring-1 ring-blue-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-100'}`}
                                >
                                    <div>
                                        <p className={`text-sm font-semibold ${selectedVariant?.id === variant.id ? 'text-blue-900' : 'text-gray-700'}`}>
                                            {variant.color_name || 'Generic (Color Agnostic)'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">Stock: {variant.main_store_stock}</span>
                                            <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">SP: ₹{Number(variant.selling_price || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {user.role === 'factory_admin' && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'variant', data: variant }); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-gray-200"><Edit2 size={12}/></button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDelete('variant', variant.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200"><Trash2 size={12}/></button>
                                            </>
                                        )}
                                        <ChevronRight className={`w-4 h-4 text-gray-300 ${selectedVariant?.id === variant.id ? 'text-blue-400' : ''}`}/>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Column 3: Substitutes */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <div className="p-1.5 bg-gray-100 rounded-md"><Repeat className="text-gray-500 w-5 h-5" /></div>
                                Substitutes
                            </h2>
                            {selectedVariant && (
                                <button onClick={() => setModal({ type: 'substitute' })} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"><Plus size={18} /></button>
                            )}
                        </header>
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input type="text" placeholder="Filter substitutes..." disabled={!selectedVariant} value={substituteFilter} onChange={(e) => setSubstituteFilter(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.substitutes ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : !selectedVariant ? (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-60"><Layers className="w-10 h-10 text-gray-300 mb-2" /><Placeholder text="Select a variant to manage substitutes." /></div>
                        ) : (
                            filteredSubstitutes.map(sub => (
                                <div key={sub.id} className="group flex justify-between items-center p-3 rounded-lg border border-transparent hover:bg-gray-50 hover:border-gray-100 transition-all duration-200">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-700">{sub.substitute_item_name} <span className="text-gray-400 font-normal mx-1">/</span> {sub.substitute_color_name || 'Generic'}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 font-mono bg-gray-100 inline-block px-1 rounded">Stock: {sub.substitute_stock}</p>
                                    </div>
                                    {user.role === 'factory_admin' && (
                                        <button onClick={() => handleDelete('substitute', sub.id)} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12}/></button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {modal.type === 'item' && <Modal title={modal.data ? 'Edit Item' : 'Add New Item'} onClose={() => setModal({type: null})}><ItemFormModal onSave={(data) => handleSave('item', data)} onClose={() => setModal({type: null})} initialData={modal.data} /></Modal>}
            {modal.type === 'variant' && <Modal title={modal.data ? 'Edit Variant' : 'Add New Variant'} onClose={() => setModal({type: null})}><VariantFormModal onSave={(data) => handleSave('variant', data)} onClose={() => setModal({type: null})} initialData={modal.data} isColorAgnostic={selectedItem?.is_color_agnostic} colors={colors} userRole={user.role} /></Modal>}
            {modal.type === 'substitute' && <Modal title="Add Substitute" onClose={() => setModal({type: null})}><SubstituteFormModal onSave={(data) => handleSave('substitute', data)} onClose={() => setModal({type: null})} variants={variants} parentItemName={selectedItem?.name} parentItemBrand={selectedItem?.brand} currentVariantId={selectedVariant?.id} existingSubstitutes={substitutes} /></Modal>}
        </div>
    );
};

export default TrimManagementPage;
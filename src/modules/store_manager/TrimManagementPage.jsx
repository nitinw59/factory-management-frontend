import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { trimsApi } from '../../api/trimsApi';
import { useAuth } from '../../context/AuthContext';
import {
    Plus, Edit2, Trash2, Archive, ChevronRight, Search, Package, Layers, Repeat,
    FileSpreadsheet, Loader2, Upload, X, Check, AlertCircle, CheckCircle2,
    Palette, RefreshCw, GitMerge,
} from 'lucide-react';
import ApplyClusterModal from './ApplyClusterModal';

// ── Stock-tone helper: emerald (healthy) / amber (low) / red (out) ────────────
const stockTone = (stock, threshold = 0) => {
    const s = Number(stock ?? 0);
    const t = Number(threshold ?? 0);
    if (s <= 0)              return { key: 'out', cls: 'bg-red-50 text-red-700 border-red-200',         dotCls: 'bg-red-500'    };
    if (t > 0 && s < t)      return { key: 'low', cls: 'bg-amber-50 text-amber-700 border-amber-200',   dotCls: 'bg-amber-500'  };
    return                          { key: 'ok',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotCls: 'bg-emerald-500' };
};

// ── Stable swatch color from any string seed (color_number / color_name / id) ──
const swatchFromVariant = (v = {}) => {
    const raw = String(v.color_number ?? '').replace('#', '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw}`;
    const seed = (v.color_name || v.color_number || String(v.fabric_color_id ?? v.id ?? 'x'));
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return `hsl(${Math.abs(hash) % 360}, 55%, 60%)`;
};

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

    const isEditing = !!initialData.id;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : value;
        setFormData(prev => {
            const next = { ...prev, [name]: newValue };
            if (!isEditing && (name === 'name' || name === 'brand')) {
                const n = name === 'name'  ? newValue : prev.name;
                const b = name === 'brand' ? newValue : prev.brand;
                next.item_code   = [b, n].filter(Boolean).join(' ').trim().toUpperCase().replace(/\s+/g, '-');
                next.description = n && b ? `${n} by ${b}` : n || '';
            }
            return next;
        });
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
                <input name="item_code" value={formData.item_code} onChange={handleChange} placeholder="e.g. YKK-METAL-BUTTON" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
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
        fabric_color_id: '', variant_size: '', main_store_stock: 0, low_stock_threshold: 10,
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

            <div>
                <label className="text-sm font-medium text-gray-700">Size <span className="text-gray-400 font-normal">(optional)</span></label>
                <input name="variant_size" value={formData.variant_size || ''} onChange={handleChange} placeholder="e.g. S, M, L, XL, 38, 40" className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" />
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
                    <input type="number" name="main_store_stock" value={formData.main_store_stock} onChange={handleChange} placeholder="Current Stock" required disabled={isDefinitionDisabled} className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-200 disabled:cursor-not-allowed" />
                    {isDefinitionDisabled && <p className="text-xs text-gray-500 mt-1">Only admins can edit stock quantity.</p>}
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
    const [substituteId, setSubstituteId]   = useState('');
    const [search,       setSearch]         = useState('');
    const [inStockOnly,  setInStockOnly]    = useState(false);

    const availableOptions = variants.filter(v =>
        v.id !== currentVariantId && !existingSubstitutes.some(s => s.substitute_variant_id === v.id)
    );

    const q = search.toLowerCase();
    const filteredOptions = availableOptions.filter(v => {
        if (inStockOnly && Number(v.main_store_stock || 0) <= 0) return false;
        if (!q) return true;
        return (v.color_name || 'generic').toLowerCase().includes(q)
            || String(v.color_number ?? '').toLowerCase().includes(q)
            || (v.variant_size || '').toLowerCase().includes(q);
    });

    const handleSubmit = (e) => { e.preventDefault(); onSave({ substitute_variant_id: substituteId }); };

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700 border border-blue-100">
                Showing variants for <strong>{parentItemName} – {parentItemBrand}</strong>.
            </div>

            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search by color, number, or size…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-gray-50 focus:bg-white"
                    />
                </div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap">
                    <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                    In stock only
                </label>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1 bg-gray-50">
                {availableOptions.length === 0 ? (
                    <p className="text-xs text-orange-500 italic text-center py-6">No other variants available to substitute.</p>
                ) : filteredOptions.length === 0 ? (
                    <p className="text-xs text-gray-400 italic text-center py-6">No variants match your filter.</p>
                ) : filteredOptions.map(v => {
                    const tone = stockTone(v.main_store_stock, v.low_stock_threshold);
                    const sel = String(substituteId) === String(v.id);
                    return (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => setSubstituteId(String(v.id))}
                            className={`w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md border transition-all ${
                                sel
                                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                                    : 'border-transparent bg-white hover:border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <span
                                className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                                style={{ backgroundColor: swatchFromVariant(v) }}
                            />
                            <span className={`w-3 h-3 rounded-full border shrink-0 ${sel ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                                {sel && <span className="block w-1 h-1 m-auto mt-1 bg-white rounded-full" />}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">
                                    {v.color_name || 'Generic'}
                                    {v.color_number && <span className="ml-1.5 text-[10px] font-mono text-gray-400">{v.color_number}</span>}
                                    {v.variant_size && <span className="ml-1.5 text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Sz: {v.variant_size}</span>}
                                </p>
                            </div>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tone.cls}`}>
                                {v.main_store_stock} stock
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded">Cancel</button>
                <button type="submit" disabled={!substituteId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:bg-gray-400">Add Substitute</button>
            </div>
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

    // Phase 1 additions
    const [variantsByItem,   setVariantsByItem]   = useState({});  // { [trim_item_id]: variants[] } for summary badges
    const [quickFilter,      setQuickFilter]      = useState('all');  // 'all' | 'low' | 'out'
    const [toast,            setToast]            = useState(null);   // { kind, message }
    const [confirmDelete,    setConfirmDelete]    = useState(null);   // { type, id }
    const [confirmArchive,   setConfirmArchive]   = useState(null);   // item id
    const [editing,          setEditing]          = useState(null);   // { variantId, field, value }
    const [savingEdit,       setSavingEdit]       = useState(false);
    // Phase 2 additions
    const [showColors,       setShowColors]       = useState(false);
    const [colorFilter,      setColorFilter]      = useState('');
    const [selectedVariants, setSelectedVariants] = useState(new Set());
    const [bulkThreshold,    setBulkThreshold]    = useState('');
    const [bulkBusy,         setBulkBusy]         = useState(false);
    const [importPreview,    setImportPreview]    = useState(null);   // { updates: [...] } | null
    // Phase 3 additions: keyboard-driven column navigation
    const [activeColumn,     setActiveColumn]     = useState('items'); // 'items' | 'variants' | 'substitutes'
    const itemFilterRef        = useRef(null);
    const variantFilterRef     = useRef(null);
    const substituteFilterRef  = useRef(null);
    const [isSyncing,        setIsSyncing]        = useState(false);
    // Substitute clusters
    const [clusterModalOpen,  setClusterModalOpen]  = useState(false);
    const [appliedClusters,   setAppliedClusters]   = useState([]);   // [{cluster_id, cluster_name, row_count, is_stale}]
    const [unapplyBusyId,     setUnapplyBusyId]     = useState(null);

    const showToast = (kind, message) => {
        setToast({ kind, message });
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => setToast(null), 3500);
    };

    // Compute per-item summary { total, low, out } from the cached variants.
    const itemSummary = (itemId) => {
        const vs = variantsByItem[itemId] || [];
        let low = 0, out = 0;
        vs.forEach(v => {
            const tone = stockTone(v.main_store_stock, v.low_stock_threshold);
            if (tone.key === 'out') out++;
            else if (tone.key === 'low') low++;
        });
        return { total: vs.length, low, out };
    };

    // Inline-edit helpers
    const startEdit = (variant, field) =>
        setEditing({ variantId: variant.id, field, value: String(variant[field] ?? '') });
    const cancelEdit = () => setEditing(null);
    const commitEdit = async () => {
        if (!editing) return;
        const { variantId, field, value } = editing;
        const num = parseInt(value, 10);
        if (Number.isNaN(num) || num < 0) {
            showToast('error', 'Enter a valid non-negative number.');
            return;
        }
        setSavingEdit(true);
        try {
            await trimsApi.updateVariant(variantId, { [field]: num });
            // Update both the active variants column and the summary cache.
            setVariants(prev => prev.map(v => v.id === variantId ? { ...v, [field]: num } : v));
            setVariantsByItem(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(k => {
                    next[k] = next[k].map(v => v.id === variantId ? { ...v, [field]: num } : v);
                });
                return next;
            });
            showToast('success', 'Updated.');
            setEditing(null);
        } catch (e) {
            showToast('error', e?.response?.data?.error || 'Update failed.');
        } finally {
            setSavingEdit(false);
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(p => ({ ...p, items: true }));
        try {
            const [itemsRes, colorsRes] = await Promise.all([
                trimsApi.getItems(),
                trimsApi.getColors(),
            ]);
            setItems(itemsRes.data);
            setColors(colorsRes.data);
            // Populate per-item variant summaries (for stock-health badges).
            try {
                const allRes = await trimsApi.getAllVariants();
                const flat = Array.isArray(allRes.data) ? allRes.data : (allRes.data?.data || []);
                const map = {};
                flat.forEach(v => {
                    const id = v.trim_item_id ?? v.item_id;
                    if (id == null) return;
                    if (!map[id]) map[id] = [];
                    map[id].push(v);
                });
                setVariantsByItem(map);
            } catch (err) {
                console.warn('Variant summary fetch failed; badges will be hidden.', err);
            }
        } catch (error) { console.error("Failed to fetch initial data", error); }
        finally { setLoading(p => ({ ...p, items: false })); }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (selectedItem) {
            setLoading(p => ({ ...p, variants: true }));
            trimsApi.getVariants(selectedItem.id)
                .then(res => {
                    setVariants(res.data);
                    // Refresh the cached summary for this item.
                    setVariantsByItem(prev => ({ ...prev, [selectedItem.id]: res.data }));
                })
                .catch(err => console.error("Failed to fetch variants", err))
                .finally(() => setLoading(p => ({ ...p, variants: false })));
        } else {
            setVariants([]);
        }
    }, [selectedItem]);

    // Pull applied clusters for the currently-selected trim (factory_admin only).
    const refreshAppliedClusters = useCallback(async () => {
        if (!selectedItem || user.role !== 'factory_admin') { setAppliedClusters([]); return; }
        try {
            const res = await trimsApi.clustersOnTrim(selectedItem.id);
            setAppliedClusters(res.data?.data ?? res.data ?? []);
        } catch {
            setAppliedClusters([]);
        }
    }, [selectedItem, user.role]);
    useEffect(() => { refreshAppliedClusters(); }, [refreshAppliedClusters]);

    const handleUnapplyCluster = async (cluster) => {
        if (!selectedItem) return;
        if (!window.confirm(`Unapply "${cluster.cluster_name}" from ${selectedItem.name}? This removes only the substitute rows it created; manual substitutes stay.`)) return;
        setUnapplyBusyId(cluster.cluster_id);
        try {
            await trimsApi.unapplyCluster(selectedItem.id, cluster.cluster_id);
            await refreshAppliedClusters();
            if (selectedVariant) {
                const subs = await trimsApi.getSubstitutes(selectedVariant.id);
                setSubstitutes(subs.data);
            }
        } catch (e) {
            showToast('error', e?.response?.data?.error || 'Unapply failed.');
        } finally {
            setUnapplyBusyId(null);
        }
    };

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
        setActiveColumn('items');
    };

    const handleSelectVariant = (variant) => {
        setSelectedVariant(variant);
        setSubstituteFilter('');
        setActiveColumn('variants');
    };

    // --- Export / Import Logic ---
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await trimsApi.exportInventory();
            const date = new Date().toISOString().split('T')[0];
            downloadAsExcel(res.data, `Trim_Catalog_Export_${date}.csv`);
            showToast('success', 'Inventory exported.');
        } catch (error) {
            console.error("Export failed", error);
            showToast('error', 'Export failed.');
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

                // Stage as a preview rather than applying immediately. The user reviews
                // the diff and clicks Apply in the preview modal.
                setImportPreview({ updates, fileName: file.name, totalRows: parsedData.length });
                showToast('success', `Parsed ${updates.length} row${updates.length === 1 ? '' : 's'}. Review and apply.`);
            } catch (err) {
                console.error("Import failed", err);
                showToast('error', `Import failed: ${err.message}`);
            } finally {
                setIsImporting(false);
                e.target.value = null; // reset input
            }
        };

        reader.onerror = () => {
            showToast('error', 'Failed to read the file.');
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
            showToast('error', `Failed to save ${type}: ${error.response?.data?.error || error.message}`);
        }
        setModal({ type: null, data: null });
    };

    // Performs the delete after the inline confirm has been accepted.
    const performDelete = async (type, id) => {
        try {
            switch(type) {
                case 'item':       await trimsApi.deleteItem(id); fetchData(); break;
                case 'variant':    await trimsApi.deleteVariant(id); if (selectedItem) { const res = await trimsApi.getVariants(selectedItem.id); setVariants(res.data); } break;
                case 'substitute': await trimsApi.deleteSubstitute(id); if (selectedVariant) { const res = await trimsApi.getSubstitutes(selectedVariant.id); setSubstitutes(res.data); } break;
                default: break;
            }
            showToast('success', `${type[0].toUpperCase()}${type.slice(1)} deleted.`);
        } catch (error) {
            showToast('error', `Failed to delete ${type}.`);
        } finally {
            setConfirmDelete(null);
        }
    };
    // Trigger the inline confirm popover instead of window.confirm.
    const handleDelete = (type, id) => setConfirmDelete({ type, id });

    const handleArchive = async (id) => {
        try {
            await trimsApi.archiveItem(id);
            fetchData();
            showToast('success', 'Item archived.');
        } catch {
            showToast('error', 'Failed to archive item.');
        } finally {
            setConfirmArchive(null);
        }
    };

    // ── Phase 2: bulk operations on variants ──
    const toggleVariantSelected = (id) => {
        setSelectedVariants(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const clearSelection = () => setSelectedVariants(new Set());

    const applyBulkThreshold = async () => {
        const t = parseInt(bulkThreshold, 10);
        if (Number.isNaN(t) || t < 0) {
            showToast('error', 'Enter a valid threshold (≥ 0).');
            return;
        }
        setBulkBusy(true);
        try {
            const ids = [...selectedVariants];
            for (const id of ids) {
                await trimsApi.updateVariant(id, { low_stock_threshold: t });
            }
            // Refresh active list + summary cache
            if (selectedItem) {
                const res = await trimsApi.getVariants(selectedItem.id);
                setVariants(res.data);
                setVariantsByItem(p => ({ ...p, [selectedItem.id]: res.data }));
            }
            showToast('success', `Updated threshold for ${ids.length} variant${ids.length === 1 ? '' : 's'}.`);
            clearSelection();
            setBulkThreshold('');
        } catch (e) {
            showToast('error', e?.response?.data?.error || 'Bulk threshold update failed.');
        } finally {
            setBulkBusy(false);
        }
    };

    const applyBulkDelete = async () => {
        setBulkBusy(true);
        try {
            const ids = [...selectedVariants];
            for (const id of ids) {
                await trimsApi.deleteVariant(id);
            }
            if (selectedItem) {
                const res = await trimsApi.getVariants(selectedItem.id);
                setVariants(res.data);
                setVariantsByItem(p => ({ ...p, [selectedItem.id]: res.data }));
            }
            showToast('success', `Deleted ${ids.length} variant${ids.length === 1 ? '' : 's'}.`);
            clearSelection();
        } catch (e) {
            showToast('error', e?.response?.data?.error || 'Bulk delete failed.');
        } finally {
            setBulkBusy(false);
        }
    };

    // ── Manual variant sync (server endpoint fills missing trim × color cells) ──
    const handleSyncVariants = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const res = await trimsApi.syncVariants({});
            const inserted = res.data?.inserted ?? 0;
            const message  = res.data?.message  ?? (inserted
                ? `Created ${inserted} missing variant(s).`
                : 'Already in sync — nothing to insert.');
            showToast(inserted > 0 ? 'success' : 'success', message);
            if (inserted > 0) {
                fetchData();
                if (selectedItem) {
                    const variantsRes = await trimsApi.getVariants(selectedItem.id);
                    setVariants(variantsRes.data);
                }
            }
        } catch (e) {
            showToast('error', e?.response?.data?.error || 'Sync failed.');
        } finally {
            setIsSyncing(false);
        }
    };

    // ── Phase 2: colors export ──
    const handleExportColors = () => {
        if (!colors?.length) { showToast('error', 'No colors to export.'); return; }
        const data = colors.map(c => ({
            'Color Number': c.color_number ?? '',
            'Name':         c.name || c.color_name || '',
            'ID':           c.id,
        }));
        downloadAsExcel(data, `Fabric_Colors_${new Date().toISOString().split('T')[0]}.csv`);
        showToast('success', `Exported ${data.length} colors.`);
    };

    // ── Phase 2: import preview / dry-run ──
    const applyImportPreview = async () => {
        if (!importPreview?.updates?.length) return;
        setIsImporting(true);
        try {
            const res = await trimsApi.bulkUpdateInventory({ updates: importPreview.updates });
            showToast('success', res.data.message || `Applied ${importPreview.updates.length} update(s).`);
            setImportPreview(null);
            fetchData();
            if (selectedItem) {
                const variantsRes = await trimsApi.getVariants(selectedItem.id);
                setVariants(variantsRes.data);
            }
        } catch (e) {
            showToast('error', `Import failed: ${e?.response?.data?.error || e.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const filteredItems = useMemo(() => items.filter(item => {
        const q = itemFilter.toLowerCase();
        const matchText =
            item.name.toLowerCase().includes(q)
            || item.brand?.toLowerCase().includes(q)
            || item.item_code?.toLowerCase().includes(q);
        if (!matchText) return false;
        if (quickFilter === 'all') return true;
        const vs = variantsByItem[item.id] || [];
        let low = 0, out = 0;
        vs.forEach(v => {
            const tone = stockTone(v.main_store_stock, v.low_stock_threshold);
            if (tone.key === 'out') out++;
            else if (tone.key === 'low') low++;
        });
        if (quickFilter === 'low') return low > 0 || out > 0;
        if (quickFilter === 'out') return out > 0;
        return true;
    }), [items, itemFilter, quickFilter, variantsByItem]);

    const filteredVariants = useMemo(() => variants.filter(variant => {
        const q = variantFilter.toLowerCase();
        return (variant.color_name || 'Generic').toLowerCase().includes(q)
            || (variant.variant_size || '').toLowerCase().includes(q)
            || String(variant.color_number ?? '').toLowerCase().includes(q);
    }), [variants, variantFilter]);

    const filteredSubstitutes = useMemo(() => substitutes.filter(sub => {
        const name = `${sub.substitute_item_name} ${sub.substitute_color_name || 'Generic'}`;
        return name.toLowerCase().includes(substituteFilter.toLowerCase());
    }), [substitutes, substituteFilter]);

    // Variant summary for the currently-selected item (for the count chip on the Variants card).
    const currentVariantSummary = useMemo(() => {
        let low = 0, out = 0;
        variants.forEach(v => {
            const tone = stockTone(v.main_store_stock, v.low_stock_threshold);
            if (tone.key === 'out') out++;
            else if (tone.key === 'low') low++;
        });
        return { total: variants.length, low, out };
    }, [variants]);

    // ── Phase 3: keyboard navigation across the three columns ──
    useEffect(() => {
        const refMap = { items: itemFilterRef, variants: variantFilterRef, substitutes: substituteFilterRef };
        const onKey = (e) => {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';
            if (e.key === 'Escape' && isTyping) { document.activeElement.blur(); return; }
            if (isTyping) return;

            const list = activeColumn === 'items' ? filteredItems
                       : activeColumn === 'variants' ? filteredVariants
                       : filteredSubstitutes;
            const selectedId = activeColumn === 'items' ? selectedItem?.id
                             : activeColumn === 'variants' ? selectedVariant?.id
                             : null;

            if (e.key === '/' || e.key === '?') {
                e.preventDefault();
                refMap[activeColumn]?.current?.focus();
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!list?.length || activeColumn === 'substitutes') return;
                e.preventDefault();
                const idx = selectedId != null ? list.findIndex(r => r.id === selectedId) : -1;
                let next = idx === -1 ? 0 : idx + (e.key === 'ArrowDown' ? 1 : -1);
                if (next < 0) next = 0;
                if (next >= list.length) next = list.length - 1;
                const target = list[next];
                if (activeColumn === 'items') handleSelectItem(target);
                else                          handleSelectVariant(target);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (activeColumn === 'items')         setActiveColumn('variants');
                else if (activeColumn === 'variants') setActiveColumn('substitutes');
                return;
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (activeColumn === 'substitutes') setActiveColumn('variants');
                else if (activeColumn === 'variants') setActiveColumn('items');
                return;
            }
            if (e.key === 'e' && !e.metaKey && !e.ctrlKey) {
                if (activeColumn === 'items' && selectedItem) {
                    e.preventDefault();
                    setModal({ type: 'item', data: selectedItem });
                } else if (activeColumn === 'variants' && selectedVariant) {
                    e.preventDefault();
                    setModal({ type: 'variant', data: selectedVariant });
                }
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && user.role === 'factory_admin') {
                if (activeColumn === 'items' && selectedItem) {
                    e.preventDefault();
                    setConfirmDelete({ type: 'item', id: selectedItem.id });
                } else if (activeColumn === 'variants' && selectedVariant) {
                    e.preventDefault();
                    setConfirmDelete({ type: 'variant', id: selectedVariant.id });
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [activeColumn, filteredItems, filteredVariants, filteredSubstitutes, selectedItem, selectedVariant, user.role]);  // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            {/* Toast notifications */}
            {toast && (
                <div className="fixed top-4 right-4 z-[100] animate-in fade-in slide-in-from-top-2">
                    <div className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-lg border max-w-sm ${
                        toast.kind === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                        {toast.kind === 'success'
                            ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                            : <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />}
                        <p className="text-sm font-medium">{toast.message}</p>
                        <button onClick={() => setToast(null)} className="ml-2 text-current opacity-50 hover:opacity-100">
                            <X size={14}/>
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Trim Management</h1>
                    <p className="text-gray-500 text-sm mt-1">Manage definitions, stock variants, and substitutes.</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 hidden md:block">
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px]">↑</kbd>
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px] ml-0.5">↓</kbd>
                        <span className="mx-1">navigate</span>
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px]">←</kbd>
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px] ml-0.5">→</kbd>
                        <span className="mx-1">switch column</span>
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px]">/</kbd>
                        <span className="mx-1">filter</span>
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px]">e</kbd>
                        <span className="mx-1">edit</span>
                        <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded font-mono text-[10px]">Del</kbd>
                        <span className="mx-1">delete</span>
                    </p>
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

                    {/* COLORS COUNT — click to view list + export */}
                    <button
                        onClick={() => setShowColors(true)}
                        className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-2 rounded-lg shadow-sm transition-all"
                        title="View all fabric colors"
                    >
                        <Palette className="w-4 h-4" />
                        <span className="font-semibold text-sm">Colors</span>
                        <span className="text-xs font-bold bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full tabular-nums">{colors.length}</span>
                    </button>

                    {/* SYNC VARIANTS — manual fill of missing trim × color cells */}
                    {(user.role === 'factory_admin' || user.role === 'store_manager') && (
                        <button
                            onClick={handleSyncVariants}
                            disabled={isSyncing}
                            className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-2 rounded-lg shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Create one variant per fabric color for every non-agnostic trim that's missing some"
                        >
                            {isSyncing
                                ? <Loader2 className="animate-spin w-4 h-4" />
                                : <RefreshCw className="w-4 h-4" />}
                            <span className="font-semibold text-sm">{isSyncing ? 'Syncing…' : 'Sync variants'}</span>
                        </button>
                    )}

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
                <div onClick={() => setActiveColumn('items')} className={`bg-white rounded-xl shadow-sm border flex flex-col h-[70vh] transition ${activeColumn === 'items' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className={`font-bold text-lg flex items-center gap-2 ${activeColumn === 'items' ? 'text-blue-700' : 'text-gray-800'}`}>
                                <div className={`p-1.5 rounded-md ${activeColumn === 'items' ? 'bg-blue-100' : 'bg-gray-100'}`}><Package className={`w-5 h-5 ${activeColumn === 'items' ? 'text-blue-600' : 'text-gray-500'}`} /></div>
                                Trim Items
                                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full tabular-nums">{filteredItems.length}{filteredItems.length !== items.length ? ` of ${items.length}` : ''}</span>
                            </h2>
                            {(user.role === 'factory_admin' || user.role === 'store_manager') && (
                                <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'item' }); }} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"><Plus size={18} /></button>
                            )}
                        </header>
                        <div className="px-4 pb-3 space-y-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input ref={itemFilterRef} type="text" placeholder="Name, brand, or code…  (press / )" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white" />
                            </div>
                            <div className="flex gap-1">
                                {['all', 'low', 'out'].map(k => {
                                    const active = quickFilter === k;
                                    const cls = active
                                        ? (k === 'low' ? 'bg-amber-500 text-white border-amber-500'
                                          : k === 'out' ? 'bg-red-500 text-white border-red-500'
                                          : 'bg-gray-700 text-white border-gray-700')
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300';
                                    const label = k === 'all' ? 'All' : k === 'low' ? 'Low stock' : 'Out of stock';
                                    return (
                                        <button key={k} onClick={() => setQuickFilter(k)}
                                            className={`flex-1 text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border transition ${cls}`}>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.items ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : filteredItems.length === 0 ? (
                            <p className="text-xs text-gray-400 italic text-center py-6">
                                {quickFilter !== 'all' ? `No items match "${quickFilter === 'low' ? 'Low stock' : 'Out of stock'}".` : 'No items found.'}
                            </p>
                        ) : (
                            filteredItems.map(item => {
                                const summary = itemSummary(item.id);
                                const isConfirming = confirmDelete?.type === 'item' && confirmDelete.id === item.id;
                                const isArchiving = confirmArchive === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectItem(item)}
                                        className={`group flex justify-between items-center p-3 rounded-lg cursor-pointer border transition-all duration-200
                                        ${selectedItem?.id === item.id ? 'border-blue-200 bg-blue-50/80 ring-1 ring-blue-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-100'}`}
                                    >
                                        <div className="w-full pr-2 min-w-0">
                                            <p className={`text-sm font-semibold truncate ${selectedItem?.id === item.id ? 'text-blue-900' : 'text-gray-700'}`}>{item.name}</p>
                                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                <span className="text-xs text-gray-500">{item.brand}</span>
                                                {item.is_color_agnostic && <span className="text-purple-600 font-medium text-[10px] bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-100">Generic</span>}
                                                {summary.total > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                                                        <span className="font-bold text-gray-700">{summary.total}</span> variant{summary.total === 1 ? '' : 's'}
                                                        {summary.low > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold">
                                                                · <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {summary.low} low
                                                            </span>
                                                        )}
                                                        {summary.out > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-red-700 font-bold">
                                                                · <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {summary.out} out
                                                            </span>
                                                        )}
                                                        {summary.low === 0 && summary.out === 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold">
                                                                · <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> healthy
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            {isConfirming ? (
                                                <span className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-md px-1 py-0.5">
                                                    <span className="text-[10px] font-bold text-red-700 px-1">Delete?</span>
                                                    <button onClick={(e) => { e.stopPropagation(); performDelete('item', item.id); }} className="p-1 bg-red-500 hover:bg-red-600 text-white rounded"><Check size={11}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }} className="p-1 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded"><X size={11}/></button>
                                                </span>
                                            ) : isArchiving ? (
                                                <span className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-md px-1 py-0.5">
                                                    <span className="text-[10px] font-bold text-amber-700 px-1">Archive?</span>
                                                    <button onClick={(e) => { e.stopPropagation(); handleArchive(item.id); }} className="p-1 bg-amber-500 hover:bg-amber-600 text-white rounded"><Check size={11}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setConfirmArchive(null); }} className="p-1 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded"><X size={11}/></button>
                                                </span>
                                            ) : (
                                                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {user.role === 'factory_admin' && (
                                                        <>
                                                            <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'item', data: item }); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-gray-200"><Edit2 size={12}/></button>
                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmArchive(item.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-amber-600 shadow-sm border border-transparent hover:border-gray-200"><Archive size={12}/></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDelete('item', item.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200"><Trash2 size={12}/></button>
                                                        </>
                                                    )}
                                                    <ChevronRight className={`w-4 h-4 text-gray-300 ${selectedItem?.id === item.id ? 'text-blue-400' : ''}`}/>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Column 2: Variants */}
                <div onClick={() => setActiveColumn('variants')} className={`bg-white rounded-xl shadow-sm border flex flex-col h-[70vh] transition ${activeColumn === 'variants' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className={`font-bold text-lg flex items-center gap-2 flex-wrap ${activeColumn === 'variants' ? 'text-blue-700' : 'text-gray-800'}`}>
                                <div className={`p-1.5 rounded-md ${activeColumn === 'variants' ? 'bg-blue-100' : 'bg-gray-100'}`}><Layers className={`w-5 h-5 ${activeColumn === 'variants' ? 'text-blue-600' : 'text-gray-500'}`} /></div>
                                Variants
                                {selectedItem && (
                                    <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full tabular-nums">
                                        {filteredVariants.length}{filteredVariants.length !== variants.length ? ` of ${variants.length}` : ''}
                                    </span>
                                )}
                                {selectedItem && currentVariantSummary.total > 0 && (currentVariantSummary.low > 0 || currentVariantSummary.out > 0) && (
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                        {currentVariantSummary.low > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-amber-700">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {currentVariantSummary.low} low
                                            </span>
                                        )}
                                        {currentVariantSummary.out > 0 && (
                                            <span className="inline-flex items-center gap-0.5 text-red-700">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {currentVariantSummary.out} out
                                            </span>
                                        )}
                                    </span>
                                )}
                                {selectedVariants.size > 0 && (
                                    <span className="text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                        {selectedVariants.size} selected
                                    </span>
                                )}
                            </h2>
                            <div className="flex items-center gap-1.5">
                                {selectedItem && user.role === 'factory_admin' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setClusterModalOpen(true); }}
                                        title="Apply a substitute cluster to this trim"
                                        className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-md transition-colors"
                                    >
                                        <GitMerge size={13} /> Apply Cluster
                                    </button>
                                )}
                                {selectedItem && (user.role === 'factory_admin' || user.role === 'store_manager') && (
                                    <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'variant' }); }} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"><Plus size={18} /></button>
                                )}
                            </div>
                        </header>

                        {/* Applied clusters strip */}
                        {selectedItem && appliedClusters.length > 0 && (
                            <div className="px-4 pb-2 pt-1 flex flex-wrap items-center gap-1.5 border-t border-indigo-100 bg-indigo-50/40">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700">Applied:</span>
                                {appliedClusters.map(c => {
                                    const stale = !!c.is_stale;
                                    return (
                                        <span key={c.cluster_id}
                                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${stale ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                                            title={stale ? 'Stale — re-apply to bring back in sync' : `${c.row_count} substitute row${c.row_count === 1 ? '' : 's'}`}
                                        >
                                            {c.cluster_name}
                                            <span className="text-[9px] font-normal opacity-80">· {c.row_count}</span>
                                            {stale && <span>⚠</span>}
                                            {user.role === 'factory_admin' && (
                                                <button onClick={(e) => { e.stopPropagation(); handleUnapplyCluster(c); }}
                                                    disabled={unapplyBusyId === c.cluster_id}
                                                    className="ml-0.5 hover:text-red-600 disabled:opacity-40" title="Unapply">
                                                    {unapplyBusyId === c.cluster_id ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                                                </button>
                                            )}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        {/* Bulk action bar — appears when ≥1 variant is selected */}
                        {selectedVariants.size > 0 && user.role === 'factory_admin' && (
                            confirmDelete?.type === 'variant-bulk' ? (
                                <div className="px-4 pb-2 pt-1 flex flex-wrap items-center gap-2 bg-red-50 border-t border-red-200">
                                    <span className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                                        <AlertCircle size={13}/> Delete {selectedVariants.size} variant{selectedVariants.size === 1 ? '' : 's'}?
                                    </span>
                                    <button onClick={applyBulkDelete} disabled={bulkBusy}
                                        className="flex items-center gap-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-2.5 py-1 rounded transition">
                                        {bulkBusy ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>}
                                        Confirm
                                    </button>
                                    <button onClick={() => setConfirmDelete(null)} disabled={bulkBusy}
                                        className="text-xs font-medium text-gray-600 hover:text-gray-800 px-2 py-1 rounded transition">
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <div className="px-4 pb-2 pt-1 flex flex-wrap items-center gap-2 bg-blue-50/40 border-t border-blue-100">
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="0"
                                            value={bulkThreshold}
                                            onChange={e => setBulkThreshold(e.target.value)}
                                            placeholder="Threshold"
                                            className="w-24 text-xs border border-blue-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                        />
                                        <button
                                            onClick={applyBulkThreshold}
                                            disabled={bulkBusy || !bulkThreshold}
                                            className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-2.5 py-1 rounded transition"
                                        >
                                            {bulkBusy ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>}
                                            Apply threshold
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setConfirmDelete({ type: 'variant-bulk' })}
                                        disabled={bulkBusy}
                                        className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-40 px-2.5 py-1 rounded transition ml-auto"
                                    >
                                        <Trash2 size={11}/> Delete {selectedVariants.size}
                                    </button>
                                    <button
                                        onClick={clearSelection}
                                        disabled={bulkBusy}
                                        className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )
                        )}
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input ref={variantFilterRef} type="text" placeholder="Filter variants…  (press / )" disabled={!selectedItem} value={variantFilter} onChange={(e) => setVariantFilter(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.variants ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : !selectedItem ? (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-60"><Package className="w-10 h-10 text-gray-300 mb-2" /><Placeholder text="Select an item to view variants." /></div>
                        ) : (
                            filteredVariants.map(variant => {
                                const stockNum     = Number(variant.main_store_stock || 0);
                                const reservedNum  = Number(variant.quantity_reserved || 0);
                                const netStock     = stockNum - reservedNum;
                                const tone         = stockTone(stockNum, variant.low_stock_threshold);
                                const netTone      = stockTone(netStock, variant.low_stock_threshold);
                                const isEditingStock = editing?.variantId === variant.id && editing.field === 'main_store_stock';
                                const isConfirming = confirmDelete?.type === 'variant' && confirmDelete.id === variant.id;
                                const isPicked = selectedVariants.has(variant.id);
                                const missingCost = !variant.cost_price || Number(variant.cost_price) === 0;
                                return (
                                    <div
                                        key={variant.id}
                                        onClick={() => { if (!isEditingStock) handleSelectVariant(variant); }}
                                        className={`group flex justify-between items-center p-3 rounded-lg cursor-pointer border transition-all duration-200
                                        ${isPicked ? 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-300'
                                          : selectedVariant?.id === variant.id ? 'border-blue-200 bg-blue-50/80 ring-1 ring-blue-200'
                                          : missingCost ? 'border-red-200 bg-red-50/60 hover:bg-red-50 hover:border-red-300'
                                          : 'border-transparent hover:bg-gray-50 hover:border-gray-100'}`}
                                    >
                                        <div className="flex items-start gap-2 min-w-0 flex-1">
                                            {user.role === 'factory_admin' && (
                                                <input
                                                    type="checkbox"
                                                    checked={isPicked}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={() => toggleVariantSelected(variant.id)}
                                                    className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 shrink-0"
                                                    title="Select for bulk operations"
                                                />
                                            )}
                                            <span
                                                aria-hidden
                                                className="mt-1 w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0"
                                                style={{ backgroundColor: swatchFromVariant(variant) }}
                                                title={`${variant.color_name || 'Generic'}${variant.color_number ? ` · ${variant.color_number}` : ''}`}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm font-semibold ${selectedVariant?.id === variant.id ? 'text-blue-900' : 'text-gray-700'}`}>
                                                    {variant.color_name || 'Generic (Color Agnostic)'}
                                                    {variant.color_number && <span className="ml-1.5 text-[10px] font-mono text-gray-400">{variant.color_number}</span>}
                                                    {variant.variant_size && (
                                                        <span className="ml-1.5 text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Sz: {variant.variant_size}</span>
                                                    )}
                                                </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {isEditingStock ? (
                                                    <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                        <span className="text-[10px] font-mono text-gray-500">Stock</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            autoFocus
                                                            value={editing.value}
                                                            onChange={e => setEditing(p => ({ ...p, value: e.target.value }))}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                                                                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                                                            }}
                                                            disabled={savingEdit}
                                                            className="w-16 text-[11px] font-mono border border-blue-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                                        />
                                                        <button onClick={commitEdit} disabled={savingEdit} className="p-0.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded">
                                                            {savingEdit ? <Loader2 size={10} className="animate-spin"/> : <Check size={10}/>}
                                                        </button>
                                                        <button onClick={cancelEdit} disabled={savingEdit} className="p-0.5 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded"><X size={10}/></button>
                                                    </span>
                                                ) : user.role === 'factory_admin' ? (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); startEdit(variant, 'main_store_stock'); }}
                                                        title="Click to edit stock"
                                                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tone.cls} hover:brightness-95 transition`}
                                                    >
                                                        Stock: <span className="font-bold">{variant.main_store_stock}</span>
                                                        {tone.key !== 'ok' && <span className="ml-1 uppercase text-[9px] font-bold">{tone.key}</span>}
                                                    </button>
                                                ) : (
                                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tone.cls}`}>
                                                        Stock: <span className="font-bold">{variant.main_store_stock}</span>
                                                        {tone.key !== 'ok' && <span className="ml-1 uppercase text-[9px] font-bold">{tone.key}</span>}
                                                    </span>
                                                )}
                                                {reservedNum > 0 && (
                                                    <span
                                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200"
                                                        title="Reserved against open plan requirements"
                                                    >
                                                        Reserved: <span className="font-bold">{reservedNum}</span>
                                                    </span>
                                                )}
                                                <span
                                                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${netTone.cls}`}
                                                    title="Net = main_store_stock − reserved"
                                                >
                                                    Net: <span className="font-bold">{netStock}</span>
                                                    {netTone.key !== 'ok' && <span className="ml-1 uppercase text-[9px] font-bold">{netTone.key}</span>}
                                                </span>
                                                {variant.low_stock_threshold != null && (
                                                    <span className="text-[10px] text-gray-400" title="Low-stock threshold">≥ {variant.low_stock_threshold}</span>
                                                )}
                                                <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">SP: ₹{Number(variant.selling_price || 0).toFixed(2)}</span>
                                            </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            {isConfirming ? (
                                                <span className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-md px-1 py-0.5" onClick={e => e.stopPropagation()}>
                                                    <span className="text-[10px] font-bold text-red-700 px-1">Delete?</span>
                                                    <button onClick={() => performDelete('variant', variant.id)} className="p-1 bg-red-500 hover:bg-red-600 text-white rounded"><Check size={11}/></button>
                                                    <button onClick={() => setConfirmDelete(null)} className="p-1 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded"><X size={11}/></button>
                                                </span>
                                            ) : (
                                                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {user.role === 'factory_admin' && (
                                                        <>
                                                            <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'variant', data: variant }); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-blue-600 shadow-sm border border-transparent hover:border-gray-200"><Edit2 size={12}/></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDelete('variant', variant.id); }} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200"><Trash2 size={12}/></button>
                                                        </>
                                                    )}
                                                    <ChevronRight className={`w-4 h-4 text-gray-300 ${selectedVariant?.id === variant.id ? 'text-blue-400' : ''}`}/>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Column 3: Substitutes */}
                <div onClick={() => setActiveColumn('substitutes')} className={`bg-white rounded-xl shadow-sm border flex flex-col h-[70vh] transition ${activeColumn === 'substitutes' ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'}`}>
                    <div className="border-b border-gray-100 bg-white rounded-t-xl z-10">
                        <header className="flex justify-between items-center p-4 pb-2">
                            <h2 className={`font-bold text-lg flex items-center gap-2 ${activeColumn === 'substitutes' ? 'text-blue-700' : 'text-gray-800'}`}>
                                <div className={`p-1.5 rounded-md ${activeColumn === 'substitutes' ? 'bg-blue-100' : 'bg-gray-100'}`}><Repeat className={`w-5 h-5 ${activeColumn === 'substitutes' ? 'text-blue-600' : 'text-gray-500'}`} /></div>
                                Substitutes
                                {selectedVariant && (
                                    <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full tabular-nums">
                                        {filteredSubstitutes.length}{filteredSubstitutes.length !== substitutes.length ? ` of ${substitutes.length}` : ''}
                                    </span>
                                )}
                            </h2>
                            {selectedVariant && (
                                <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'substitute' }); }} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"><Plus size={18} /></button>
                            )}
                        </header>
                        <div className="px-4 pb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input ref={substituteFilterRef} type="text" placeholder="Filter substitutes…  (press / )" disabled={!selectedVariant} value={substituteFilter} onChange={(e) => setSubstituteFilter(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white disabled:bg-gray-100 disabled:text-gray-400" />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading.substitutes ? (
                            <div className="flex justify-center p-8"><Spinner /></div>
                        ) : !selectedVariant ? (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-center opacity-60"><Layers className="w-10 h-10 text-gray-300 mb-2" /><Placeholder text="Select a variant to manage substitutes." /></div>
                        ) : (
                            filteredSubstitutes.map(sub => {
                                const subTone = stockTone(sub.substitute_stock, 0);
                                const isConfirming = confirmDelete?.type === 'substitute' && confirmDelete.id === sub.id;
                                return (
                                    <div key={sub.id} className="group flex justify-between items-center p-3 rounded-lg border border-transparent hover:bg-gray-50 hover:border-gray-100 transition-all duration-200">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-700">
                                                {sub.substitute_item_name}
                                                <span className="text-gray-400 font-normal mx-1">/</span>
                                                {sub.substitute_color_name || 'Generic'}
                                                {sub.substitute_color_number && (
                                                    <span className="ml-1.5 text-[10px] font-mono text-gray-400">{sub.substitute_color_number}</span>
                                                )}
                                                {sub.variant_size && (
                                                    <span className="ml-1.5 text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Sz: {sub.variant_size}</span>
                                                )}
                                            </p>
                                            <span className={`text-[10px] font-mono mt-0.5 inline-block px-1.5 py-0.5 rounded border ${subTone.cls}`}>Stock: {sub.substitute_stock}</span>
                                        </div>
                                        {isConfirming ? (
                                            <span className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-md px-1 py-0.5">
                                                <span className="text-[10px] font-bold text-red-700 px-1">Remove?</span>
                                                <button onClick={() => performDelete('substitute', sub.id)} className="p-1 bg-red-500 hover:bg-red-600 text-white rounded"><Check size={11}/></button>
                                                <button onClick={() => setConfirmDelete(null)} className="p-1 bg-white hover:bg-gray-100 text-gray-500 border border-gray-200 rounded"><X size={11}/></button>
                                            </span>
                                        ) : user.role === 'factory_admin' && (
                                            <button onClick={() => handleDelete('substitute', sub.id)} className="p-1.5 hover:bg-white rounded-md text-gray-400 hover:text-red-600 shadow-sm border border-transparent hover:border-gray-200 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12}/></button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {modal.type === 'item' && <Modal title={modal.data ? 'Edit Item' : 'Add New Item'} onClose={() => setModal({type: null})}><ItemFormModal onSave={(data) => handleSave('item', data)} onClose={() => setModal({type: null})} initialData={modal.data} /></Modal>}
            {modal.type === 'variant' && <Modal title={modal.data ? 'Edit Variant' : 'Add New Variant'} onClose={() => setModal({type: null})}><VariantFormModal onSave={(data) => handleSave('variant', data)} onClose={() => setModal({type: null})} initialData={modal.data} isColorAgnostic={selectedItem?.is_color_agnostic} colors={colors} userRole={user.role} /></Modal>}
            {modal.type === 'substitute' && <Modal title="Add Substitute" onClose={() => setModal({type: null})}><SubstituteFormModal onSave={(data) => handleSave('substitute', data)} onClose={() => setModal({type: null})} variants={variants} parentItemName={selectedItem?.name} parentItemBrand={selectedItem?.brand} currentVariantId={selectedVariant?.id} existingSubstitutes={substitutes} /></Modal>}

            {/* Colors list + export modal */}
            {showColors && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={() => setShowColors(false)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Palette size={18} className="text-purple-600" />
                                    Fabric Colors
                                    <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full tabular-nums">{colors.length}</span>
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">Master color palette used across trim variants and fabrics.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={handleExportColors}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition shadow-sm">
                                    <FileSpreadsheet size={13}/> Export Excel
                                </button>
                                <button onClick={() => setShowColors(false)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-700">
                                    <X size={16}/>
                                </button>
                            </div>
                        </div>
                        <div className="px-5 py-3 border-b">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Search by name or color number…"
                                    value={colorFilter}
                                    onChange={e => setColorFilter(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 bg-gray-50 focus:bg-white"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {(() => {
                                const q = colorFilter.toLowerCase();
                                const list = q
                                    ? colors.filter(c =>
                                        (c.name || c.color_name || '').toLowerCase().includes(q)
                                        || String(c.color_number ?? '').toLowerCase().includes(q))
                                    : colors;
                                if (list.length === 0) return <p className="text-sm text-gray-400 italic text-center py-6">No colors match "{colorFilter}".</p>;
                                return (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {list.map(c => (
                                            <div key={c.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                                                <span
                                                    className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
                                                    style={{ backgroundColor: swatchFromVariant({ color_number: c.color_number, color_name: c.name || c.color_name, fabric_color_id: c.id }) }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{c.name || c.color_name || `Color #${c.id}`}</p>
                                                </div>
                                                {c.color_number && <span className="text-[10px] font-mono text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded">{c.color_number}</span>}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Import preview / dry-run modal */}
            {importPreview && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={() => !isImporting && setImportPreview(null)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b">
                            <h2 className="text-lg font-semibold">Review Import</h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                <span className="font-mono">{importPreview.fileName}</span> · parsed {importPreview.totalRows} row{importPreview.totalRows === 1 ? '' : 's'} · <span className="font-bold text-blue-600">{importPreview.updates.length}</span> valid update{importPreview.updates.length === 1 ? '' : 's'}.
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-3">
                            <table className="w-full text-xs">
                                <thead className="text-[10px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 bg-white border-b">
                                    <tr>
                                        <th className="text-left py-2">Variant ID</th>
                                        <th className="text-right py-2">Stock</th>
                                        <th className="text-right py-2">Threshold</th>
                                        <th className="text-right py-2">Cost</th>
                                        <th className="text-right py-2">Selling</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {importPreview.updates.slice(0, 100).map((u, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="py-1.5 font-mono">{u.variant_id}</td>
                                            <td className="py-1.5 text-right tabular-nums">{u.stock ?? <span className="text-gray-300">—</span>}</td>
                                            <td className="py-1.5 text-right tabular-nums">{u.threshold ?? <span className="text-gray-300">—</span>}</td>
                                            <td className="py-1.5 text-right tabular-nums">{u.cost_price != null ? Number(u.cost_price).toFixed(2) : <span className="text-gray-300">—</span>}</td>
                                            <td className="py-1.5 text-right tabular-nums">{u.selling_price != null ? Number(u.selling_price).toFixed(2) : <span className="text-gray-300">—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {importPreview.updates.length > 100 && (
                                <p className="text-[10px] text-gray-400 italic text-center py-2">
                                    Showing first 100 rows. {importPreview.updates.length - 100} more will be applied.
                                </p>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t flex justify-end gap-2">
                            <button onClick={() => setImportPreview(null)} disabled={isImporting} className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition disabled:opacity-40">Cancel</button>
                            <button onClick={applyImportPreview} disabled={isImporting}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition shadow-sm">
                                {isImporting ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
                                Apply {importPreview.updates.length} update{importPreview.updates.length === 1 ? '' : 's'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {clusterModalOpen && selectedItem && (
                <ApplyClusterModal
                    trimItem={selectedItem}
                    onClose={() => setClusterModalOpen(false)}
                    onApplied={async () => {
                        await refreshAppliedClusters();
                        if (selectedVariant) {
                            const subs = await trimsApi.getSubstitutes(selectedVariant.id);
                            setSubstitutes(subs.data);
                        }
                    }}
                />
            )}
        </div>
    );
};

export default TrimManagementPage;
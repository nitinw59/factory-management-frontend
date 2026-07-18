
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Package, Search, Plus, AlertTriangle,
    Filter, X, Loader2, CheckCircle2,
    FileSpreadsheet, Upload, Check,
} from 'lucide-react';

import { sparesApi } from '../../api/sparesApi';
import { sparesErrorMessage } from '../../utils/sparesErrors';
import { useAuth } from '../../context/AuthContext';

// ─── CSV helpers (mirror GeneralItemsMasterPage export/import) ────────────────
const downloadAsExcel = (data, fileName = 'spares.csv') => {
    if (!data || !data.length) return alert('No data available to export.');
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row =>
            headers.map(fieldName => {
                const val = row[fieldName] === null || row[fieldName] === undefined ? '' : row[fieldName].toString();
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',')
        ),
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

// Robust CSV parser that handles commas/quotes inside a cell.
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

// Cell is "present" when it has a non-empty value — empty cells leave the field alone.
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /></div>;

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 text-lg">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

// --- SUB-COMPONENT: Create Part Form ---
const CreatePartForm = ({ categories, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        name: '', part_number: '', category_id: '', 
        location: '', min_stock_threshold: 5, 
        current_stock: 0, unit_cost: 0
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSave(formData);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part Name</label>
                <input required type="text" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Sewing Needle Size 11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Part Number (SKU)</label>
                    <input required type="text" className="w-full p-2 border rounded-lg" value={formData.part_number} onChange={e => setFormData({...formData, part_number: e.target.value})} placeholder="e.g. SN-11" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select required className="w-full p-2 border rounded-lg bg-white" value={formData.category_id} onChange={e => setFormData({...formData, category_id: e.target.value})}>
                        <option value="">Select...</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location / Shelf</label>
                <input type="text" className="w-full p-2 border rounded-lg" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. Aisle 3, Bin B" />
            </div>
            <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Min Limit</label>
                    <input type="number" className="w-full p-1 border rounded text-sm" value={formData.min_stock_threshold} onChange={e => setFormData({...formData, min_stock_threshold: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Opening Stock</label>
                    <input type="number" className="w-full p-1 border rounded text-sm" value={formData.current_stock} onChange={e => setFormData({...formData, current_stock: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit Cost</label>
                    <input type="number" step="0.01" className="w-full p-1 border rounded text-sm" value={formData.unit_cost} onChange={e => setFormData({...formData, unit_cost: e.target.value})} />
                </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-70">
                    {isSubmitting ? 'Saving...' : 'Create Part'}
                </button>
            </div>
        </form>
    );
};

// --- MAIN PAGE COMPONENT ---
const SparePartsPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'factory_admin';
    const isStoreManager = user?.role === 'store_manager';

    const [spares, setSpares] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    // Modal States
    const [activeModal, setActiveModal] = useState(null); // 'create'

    // Export / Import
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importPreview, setImportPreview] = useState(null); // { updates, fileName, totalRows } | null
    const fileInputRef = useRef(null);

    // Toast
    const [toast, setToast] = useState(null); // { kind: 'success' | 'error', message }
    useEffect(() => {
        if (!toast) return undefined;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    // Load Data
    const fetchData = async () => {
        setLoading(true);
        try {
            const [sparesData, catsData] = await Promise.all([
                sparesApi.getAllSpares(),
                sparesApi.getCategories()
            ]);
            setSpares(sparesData || []);
            setCategories(catsData || []);
        } catch (error) {
            console.error("Failed to load inventory", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Handlers
    const handleCreate = async (data) => {
        try {
            await sparesApi.createSparePart(data);
            fetchData();
            setActiveModal(null);
        } catch (err) {
            setToast({ kind: 'error', message: sparesErrorMessage(err, 'Failed to create spare part.') });
        }
    };

    // --- Export / Import ---
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await sparesApi.exportInventory();
            const rows = res.data?.data ?? res.data ?? [];
            const date = new Date().toISOString().split('T')[0];
            downloadAsExcel(rows, `Spares_Export_${date}.csv`);
            setToast({ kind: 'success', message: 'Inventory exported.' });
        } catch (e) {
            setToast({ kind: 'error', message: e?.response?.data?.error || 'Export failed.' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const parsed = parseCSV(event.target.result);
                if (parsed.length === 0) throw new Error('The CSV file is empty or invalid.');
                if (!('ID' in parsed[0])) throw new Error("The CSV must contain an 'ID' column. Download the template via Export first.");

                // Map human-readable columns back to the bulk-update payload. Only
                // non-empty cells become fields — omit a column → left alone. Master
                // fields only: Current Stock / Est. Value / Category are ignored.
                const updates = parsed.map(row => {
                    const u = { id: parseInt(row['ID'], 10) };
                    if (has(row['Name']))                u.name = row['Name'].trim();
                    if (has(row['Part Number']))         u.part_number = row['Part Number'].trim();
                    if (has(row['Category ID']))         u.category_id = parseInt(row['Category ID'], 10);
                    if (has(row['Location']))            u.location = row['Location'].trim();
                    if (has(row['Unit Cost']))           u.unit_cost = parseFloat(row['Unit Cost']);
                    if (has(row['Min Stock Threshold'])) u.min_stock_threshold = parseFloat(row['Min Stock Threshold']);
                    return u;
                }).filter(u => !isNaN(u.id));

                if (updates.length === 0) throw new Error('No valid spare IDs found to update.');

                // Stage as a preview — the user reviews and clicks Apply.
                setImportPreview({ updates, fileName: file.name, totalRows: parsed.length });
                setToast({ kind: 'success', message: `Parsed ${updates.length} row${updates.length === 1 ? '' : 's'}. Review and apply.` });
            } catch (err) {
                setToast({ kind: 'error', message: `Import failed: ${err.message}` });
            } finally {
                setIsImporting(false);
                e.target.value = null;
            }
        };
        reader.onerror = () => {
            setToast({ kind: 'error', message: 'Failed to read the file.' });
            setIsImporting(false);
        };
        reader.readAsText(file);
    };

    const applyImportPreview = async () => {
        if (!importPreview?.updates?.length) return;
        setIsImporting(true);
        try {
            const res = await sparesApi.bulkUpdateInventory({ updates: importPreview.updates });
            setToast({ kind: 'success', message: res.data?.message || `Applied ${importPreview.updates.length} update(s).` });
            setImportPreview(null);
            fetchData();
        } catch (e) {
            setToast({ kind: 'error', message: `Import failed: ${e?.response?.data?.error || e.message}` });
        } finally {
            setIsImporting(false);
        }
    };

    // Filtering
    const filteredSpares = useMemo(() => {
        return spares.filter(s => {
            const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                s.part_number.toLowerCase().includes(searchTerm.toLowerCase());
            const matchCat = filterCategory ? s.category_id === parseInt(filterCategory) : true;
            return matchSearch && matchCat;
        });
    }, [spares, searchTerm, filterCategory]);

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-inter text-gray-900">
            <div className="max-w-6xl mx-auto">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-800 flex items-center">
                            <Package className="mr-3 text-indigo-600"/> Parts Inventory
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Manage spare parts, stock levels, and purchases.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <input
                                type="file"
                                accept=".csv"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        )}
                        {(isAdmin || isStoreManager) && (
                            <button
                                onClick={handleExport}
                                disabled={isExporting}
                                title="Export the parts master to CSV"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg shadow-md font-bold flex items-center transition-all disabled:opacity-50"
                            >
                                {isExporting ? <Loader2 size={18} className="mr-2 animate-spin"/> : <FileSpreadsheet size={18} className="mr-2"/>}
                                {isExporting ? 'Exporting…' : 'Export'}
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                onClick={handleImportClick}
                                disabled={isImporting}
                                title="Bulk-update parts from a CSV (rows matched by ID)"
                                className="bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 px-5 py-2.5 rounded-lg shadow-sm font-bold flex items-center transition-all disabled:opacity-50"
                            >
                                {isImporting ? <Loader2 size={18} className="mr-2 animate-spin"/> : <Upload size={18} className="mr-2"/>}
                                {isImporting ? 'Importing…' : 'Import CSV'}
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                onClick={() => setActiveModal('create')}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow-md font-bold flex items-center transition-all"
                            >
                                <Plus size={18} className="mr-2"/> Add New Part
                            </button>
                        )}
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5"/>
                        <input 
                            type="text" 
                            placeholder="Search by Name or SKU..." 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative md:w-64">
                        <Filter className="absolute left-3 top-2.5 text-gray-400 w-5 h-5"/>
                        <select 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                        >
                            <option value="">All Categories</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Inventory Table */}
                {loading ? <Spinner /> : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 font-semibold text-gray-700">Part Details</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 hidden sm:table-cell">Location</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 text-right">Stock Level</th>
                                    <th className="px-6 py-3 font-semibold text-gray-700 text-right">Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredSpares.length === 0 && (
                                    <tr><td colSpan="4" className="p-8 text-center text-gray-400 italic">No parts found matching your search.</td></tr>
                                )}
                                {filteredSpares.map(part => {
                                    const isLowStock = part.current_stock <= part.min_stock_threshold;
                                    return (
                                        <tr key={part.id} className={`group hover:bg-gray-50 transition-colors ${isLowStock ? 'bg-red-50/30' : ''}`}>
                                            <td className="px-6 py-3">
                                                <div className="font-bold text-gray-900">{part.name}</div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{part.part_number}</span>
                                                    <span className="text-xs text-gray-500">{part.category_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 hidden sm:table-cell text-gray-600">
                                                {part.location || '-'}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className={`font-bold text-lg ${isLowStock ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {part.current_stock}
                                                </div>
                                                {isLowStock && <span className="text-[10px] font-bold text-red-500 uppercase flex items-center justify-end"><AlertTriangle size={10} className="mr-1"/> Low Stock</span>}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="font-medium text-gray-900">₹{parseFloat(part.unit_cost).toFixed(2)}</div>
                                                <div className="text-xs text-gray-400">per unit</div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODALS */}
            {activeModal === 'create' && (
                <Modal title="Add New Spare Part" onClose={() => setActiveModal(null)}>
                    <CreatePartForm categories={categories} onSave={handleCreate} onCancel={() => setActiveModal(null)} />
                </Modal>
            )}

            {/* Import preview */}
            {importPreview && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={() => !isImporting && setImportPreview(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-800">Review Import</h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                <span className="font-mono">{importPreview.fileName}</span> · parsed {importPreview.totalRows} row{importPreview.totalRows === 1 ? '' : 's'} · <span className="font-bold text-indigo-600">{importPreview.updates.length}</span> valid update{importPreview.updates.length === 1 ? '' : 's'}. Empty cells are left unchanged. Stock is not importable — it stays owned by inwards and issuance.
                            </p>
                        </div>
                        <div className="flex-1 overflow-auto px-5 py-3">
                            <table className="w-full text-xs">
                                <thead className="text-[10px] font-bold text-gray-400 uppercase tracking-wider sticky top-0 bg-white border-b border-gray-100">
                                    <tr>
                                        <th className="text-left py-2 pr-3">ID</th>
                                        <th className="text-left py-2 pr-3">Name</th>
                                        <th className="text-left py-2 pr-3">Part Number</th>
                                        <th className="text-right py-2 pr-3">Cat ID</th>
                                        <th className="text-left py-2 pr-3">Location</th>
                                        <th className="text-right py-2 pr-3">Unit Cost</th>
                                        <th className="text-right py-2">Min Threshold</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {importPreview.updates.slice(0, 100).map((u, i) => {
                                        const dash = <span className="text-gray-300">—</span>;
                                        return (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="py-1.5 pr-3 font-mono">{u.id}</td>
                                                <td className="py-1.5 pr-3">{u.name ?? dash}</td>
                                                <td className="py-1.5 pr-3 font-mono">{u.part_number ?? dash}</td>
                                                <td className="py-1.5 pr-3 text-right tabular-nums">{u.category_id ?? dash}</td>
                                                <td className="py-1.5 pr-3">{u.location ?? dash}</td>
                                                <td className="py-1.5 pr-3 text-right tabular-nums">{u.unit_cost != null ? Number(u.unit_cost).toFixed(2) : dash}</td>
                                                <td className="py-1.5 text-right tabular-nums">{u.min_stock_threshold ?? dash}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {importPreview.updates.length > 100 && (
                                <p className="text-[10px] text-gray-400 italic text-center py-2">
                                    Showing first 100 rows. {importPreview.updates.length - 100} more will be applied.
                                </p>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
                            <button onClick={() => setImportPreview(null)} disabled={isImporting} className="px-4 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition disabled:opacity-40">Cancel</button>
                            <button onClick={applyImportPreview} disabled={isImporting}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl transition shadow-sm">
                                {isImporting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                Apply {importPreview.updates.length} update{importPreview.updates.length === 1 ? '' : 's'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-bold ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                    {toast.kind === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{toast.message}</span>
                </div>
            )}
        </div>
    );
};

export default SparePartsPage;
import React, { useState, useEffect, useCallback } from 'react';
import { 
    Camera, Plus, ArrowLeft, Clipboard, 
    X, Download, Upload, Edit2, AlertCircle, Check, Calendar, Shield,
    HardHat, Loader2, Trash2, Filter, Info, IndianRupee, ChevronDown, ChevronUp 
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

import { assetApi } from '../../api/assetApi';  
import { maintenanceApi } from '../../api/maintenanceApi';

// --- Enterprise Helper Components ---
const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

const Toast = ({ message, type = 'success', onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
    return (
        <div className={`fixed bottom-6 right-6 ${bg} text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-3 z-50 animate-fade-in-up`}>
            {type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
            <span className="font-medium">{message}</span>
            <button onClick={onClose} className="ml-4 hover:text-gray-200"><X size={16} /></button>
        </div>
    );
};

const Modal = ({ title, children, onClose, size = "max-w-md" }) => (
    <div className="fixed inset-0 bg-gray-900/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm transition-opacity" onClick={onClose}>
        <div className={`bg-white rounded-xl shadow-2xl w-full ${size} flex flex-col max-h-[90vh] overflow-hidden`} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center bg-gray-50/80">
                <h2 className="text-xl font-bold text-gray-800">{title}</h2>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);

// --- CSV UTILS ---
const downloadAsCSV = (data, fileName = 'assets_export.csv') => {
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(fieldName => {
            const val = row[fieldName] === null || row[fieldName] === undefined ? '' : row[fieldName].toString();
            return `"${val.replace(/"/g, '""')}"`;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const parseCSV = (text) => {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/(^"|"$)/g, '').trim());
    return lines.slice(1).filter(line => line.trim()).map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        let obj = {};
        headers.forEach((h, i) => obj[h] = values[i] ? values[i].replace(/(^"|"$)/g, '').trim() : null);
        return obj;
    });
};

// --- Modals ---
const QrScannerModal = ({ onScanSuccess, onClose }) => {
    const [manualCode, setManualCode] = useState('');
    
    return (
        <Modal title="Scan Asset QR Code" onClose={onClose}>
            <div className="flex flex-col items-center">
                <div className="w-64 h-64 bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center mb-6 rounded-2xl relative overflow-hidden">
                    <Camera size={48} className="text-gray-300 mb-2" />
                    <span className="text-gray-400 text-sm font-medium">Scanner Active...</span>
                    <div className="absolute top-0 w-full h-1 bg-blue-500 opacity-70 animate-pulse"></div>
                </div>
                <div className="w-full flex gap-3">
                    <input 
                        type="text" 
                        value={manualCode} 
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Or enter QR code manually"
                        className="flex-1 p-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 outline-none transition-colors"
                        autoFocus
                    />
                    <button 
                        onClick={() => manualCode.trim() && onScanSuccess(manualCode.trim())}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        Process
                    </button>
                </div>
            </div>
        </Modal>
    );
};

const AddAssetTypeModal = ({ onClose, onSaveSuccess, showToast }) => {
    const [typeName, setTypeName] = useState('');
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await assetApi.createAssetType({ type_name: typeName, description });
            showToast('Asset type created successfully', 'success');
            onSaveSuccess(res.data);
        } catch (err) {
            showToast('Failed to create asset type', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title="Create New Asset Type" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Type Name*</label>
                    <input type="text" value={typeName} onChange={(e) => setTypeName(e.target.value)} required placeholder="e.g. Single Needle Machine" className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-colors" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-colors" rows="3"></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg font-semibold transition-colors">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-bold transition-colors flex items-center">
                        {isSaving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null} Save Type
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const ImportConfirmationModal = ({ parsedData, onConfirm, onClose, showToast }) => {
    const [isImporting, setIsImporting] = useState(false);

    const handleConfirm = async () => {
        setIsImporting(true);
        try {
            const res = await assetApi.bulkImportAssets(parsedData);
            showToast(`Import Successful! Inserted: ${res.data.inserted || 0}, Updated: ${res.data.updated || 0}`, 'success');
            onConfirm();
        } catch (err) {
            showToast(err.response?.data?.error || "Bulk import failed", 'error');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Modal title="Confirm Bulk Import" onClose={onClose} size="max-w-4xl">
            <div className="space-y-5">
                <div className="bg-yellow-50 p-5 rounded-xl border border-yellow-200 text-yellow-800 flex items-start">
                    <AlertCircle className="w-6 h-6 mr-3 shrink-0 text-yellow-600" />
                    <div>
                        <p className="font-bold text-lg">You are about to import {parsedData.length} records.</p>
                        <p className="text-sm mt-1 font-medium text-yellow-700">If a System QR ID exists, the equipment profile will be updated. Otherwise, a new record will be generated.</p>
                    </div>
                </div>
                
                <h4 className="font-bold text-gray-700">Data Preview (First 5 records)</h4>
                <div className="overflow-x-auto border-2 border-gray-100 rounded-xl">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="p-3 font-bold">QR ID</th>
                                <th className="p-3 font-bold">Asset Name</th>
                                <th className="p-3 font-bold">Brand</th>
                                <th className="p-3 font-bold">Purchase Cost</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {parsedData.slice(0, 5).map((row, i) => (
                                <tr key={i} className="bg-white">
                                    <td className="p-3 font-mono text-xs font-bold text-gray-600">{row["QR ID"] || row["asset_qr_id"] || '-'}</td>
                                    <td className="p-3 font-medium">{row["Asset Name"] || row["name"]}</td>
                                    <td className="p-3 text-gray-600">{row["Brand"] || row["brand"] || '-'}</td>
                                    <td className="p-3 text-gray-600">{row["Purchase Cost"] || row["purchase_cost"] || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t-2 border-gray-100">
                    <button onClick={onClose} disabled={isImporting} className="px-6 py-2.5 bg-gray-100 text-gray-800 rounded-xl font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                    <button onClick={handleConfirm} disabled={isImporting} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center shadow-sm">
                        {isImporting ? <Loader2 className="animate-spin mr-2 w-5 h-5"/> : <Check className="mr-2 w-5 h-5"/>} 
                        {isImporting ? 'Processing...' : 'Confirm Bulk Sync'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

/**
 * Main Asset Management Page
 */
const AssetManagementPage = () => {
    const [viewMode, setViewMode] = useState('list'); // 'list', 'form', 'details'
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [editingData, setEditingData] = useState(null); 
    
    const [assets, setAssets] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [pmTemplates, setPmTemplates] = useState([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isScanModalOpen, setIsScanModalOpen] = useState(false); 
    const [importData, setImportData] = useState(null);
    
    const [qrSearchTerm, setQrSearchTerm] = useState('');
    const [unregisteredQr, setUnregisteredQr] = useState(null);
    
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [assetsRes, typesRes, supRes, pmRes] = await Promise.all([
                assetApi.getAllAssets(),
                assetApi.getAllAssetTypes(),
                assetApi.getSuppliers ? assetApi.getSuppliers() : Promise.resolve({ data: [] }),
                maintenanceApi.getPMTemplates ? maintenanceApi.getPMTemplates() : Promise.resolve({ data: [] })
            ]);
            setAssets(assetsRes.data || []);
            setAssetTypes(typesRes.data || []);
            setSuppliers(supRes.data || []);
            setPmTemplates(pmRes.data || []);
        } catch (err) {
            showToast('Failed to connect to system databases.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewMode === 'list') {
            fetchAllData();
            setEditingData(null);
            setUnregisteredQr(null);
        }
    }, [viewMode, fetchAllData]);

    const processQrId = async (qrId) => {
        if (!qrId) return;
        setIsLoading(true);
        setUnregisteredQr(null);
        
        try {
            const res = await assetApi.getAssetByQrId(qrId);
            setSelectedAsset(res.data);
            setViewMode('details');
            setQrSearchTerm('');
            showToast(`Asset loaded: ${res.data.name}`, 'success');
        } catch (err) {
            setUnregisteredQr(qrId);
            setQrSearchTerm('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        processQrId(qrSearchTerm);
    };

    const handleFileImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            const parsed = parseCSV(text);
            if(parsed && parsed.length > 0) {
                setImportData(parsed);
            } else {
                showToast("Invalid or empty CSV file.", "error");
            }
        };
        reader.readAsText(file);
        e.target.value = null; 
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <header className="mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
                        <HardHat className="mr-3 w-8 h-8 text-blue-600"/> Asset Command Center
                    </h1>
                    <p className="text-gray-500 mt-1 font-medium ml-11">NIITN TRADERS / MATRIX OVERSEAS LLP</p>
                </div>
                
                {viewMode === 'list' && (
                    <div className="flex gap-3">
                        <label className="cursor-pointer px-5 py-2.5 bg-white text-gray-700 border-2 border-gray-200 font-bold rounded-xl hover:bg-gray-50 flex items-center transition-colors shadow-sm">
                            <Upload className="mr-2 w-4 h-4 text-blue-600"/> Import CSV
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileImport} />
                        </label>
                        <button onClick={() => downloadAsCSV(assets)} className="px-5 py-2.5 bg-white text-gray-700 border-2 border-gray-200 font-bold rounded-xl hover:bg-gray-50 flex items-center transition-colors shadow-sm">
                            <Download className="mr-2 w-4 h-4 text-green-600"/> Export Report
                        </button>
                    </div>
                )}
            </header>

            {viewMode === 'list' && (
                <div className="mb-8 max-w-3xl">
                    <form onSubmit={handleSearchSubmit} className="relative shadow-sm rounded-xl">
                        <input
                            type="text"
                            value={qrSearchTerm}
                            onChange={(e) => setQrSearchTerm(e.target.value)}
                            placeholder="Scan or type Asset QR ID to inspect or register..."
                            className="w-full pl-14 pr-6 py-4 border-2 border-gray-300 rounded-xl text-lg focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none transition-all font-medium text-gray-800 placeholder-gray-400"
                            autoFocus
                        />
                        <button 
                            type="button" 
                            onClick={() => setIsScanModalOpen(true)} 
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                            title="Open Camera Scanner"
                        >
                            <Camera className="w-6 h-6"/>
                        </button>
                    </form>

                    {unregisteredQr && (
                        <div className="mt-4 p-5 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between animate-fade-in-up">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-yellow-100 text-yellow-700 rounded-full"><Info size={24}/></div>
                                <div>
                                    <h4 className="font-bold text-yellow-900 text-lg">Unregistered Asset Detected</h4>
                                    <p className="text-yellow-800 text-sm mt-0.5">QR Code <span className="font-mono font-bold bg-yellow-100 px-1 py-0.5 rounded">{unregisteredQr}</span> is not linked to any equipment.</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    setEditingData(null);
                                    setViewMode('form');
                                }} 
                                className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-lg shadow-sm transition-colors flex items-center"
                            >
                                <Plus className="mr-2 w-5 h-5"/> Register Asset
                            </button>
                        </div>
                    )}
                </div>
            )}

            <main className="bg-transparent">
                {isLoading && <Spinner />}

                {!isLoading && viewMode === 'list' && !unregisteredQr && (
                    <AssetList assets={assets} onSelect={(asset) => processQrId(asset.asset_qr_id)} />
                )}
                
                {!isLoading && viewMode === 'details' && (
                    <AssetDetails 
                        asset={selectedAsset} 
                        onBack={() => { setViewMode('list'); setSelectedAsset(null); }} 
                        onEdit={() => { setEditingData(selectedAsset); setViewMode('form'); }}
                        onRefetch={() => processQrId(selectedAsset.asset_qr_id)} 
                        showToast={showToast}
                    />
                )}
                
                {!isLoading && viewMode === 'form' && (
                    <AssetForm 
                        assetTypes={assetTypes} 
                        pmTemplates={pmTemplates}
                        initialData={editingData}
                        initialQrId={unregisteredQr || ''}
                        onSaveSuccess={() => { setViewMode('list'); setEditingData(null); setUnregisteredQr(null); showToast('Asset saved successfully'); }} 
                        onCancel={() => { setViewMode(editingData ? 'details' : 'list'); setEditingData(null); setUnregisteredQr(null); }}
                        onAssetTypeCreated={(newType) => setAssetTypes(prev => [...prev, newType])} 
                        showToast={showToast}
                    />
                )}
            </main>

            {isScanModalOpen && <QrScannerModal onClose={() => setIsScanModalOpen(false)} onScanSuccess={(id) => { setIsScanModalOpen(false); processQrId(id); }} />}
            {importData && <ImportConfirmationModal parsedData={importData} onConfirm={() => { setImportData(null); fetchAllData(); }} onClose={() => setImportData(null)} showToast={showToast} />}
        </div>
    );
};

// --- Asset List View ---
const AssetList = ({ assets, onSelect }) => {
    const [filterText, setFilterText] = useState('');

    const filtered = assets.filter(a => 
        (a.name?.toLowerCase().includes(filterText.toLowerCase())) ||
        (a.asset_qr_id?.toLowerCase().includes(filterText.toLowerCase())) ||
        (a.current_line?.toLowerCase().includes(filterText.toLowerCase()))
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-bold text-gray-700">Equipment Directory ({filtered.length})</h3>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4"/>
                    <input 
                        type="text" 
                        placeholder="Filter list..." 
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead className="bg-white border-b border-gray-200">
                        <tr>
                            <th className="py-4 px-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Asset Info</th>
                            <th className="py-4 px-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">System ID</th>
                            <th className="py-4 px-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Assignment</th>
                            <th className="py-4 px-6 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filtered.length === 0 && <tr><td colSpan="4" className="text-center p-12 text-gray-500 font-medium">No assets match your search criteria.</td></tr>}
                        {filtered.map(asset => {
                            const isGreen = asset.status === 'ACTIVE';
                            const isRed = asset.status === 'OUT_OF_SERVICE';
                            return (
                                <tr key={asset.id} onClick={() => onSelect(asset)} className="hover:bg-blue-50/60 cursor-pointer transition-colors group">
                                    <td className="py-4 px-6">
                                        <p className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{asset.name}</p>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">{asset.type_name}</p>
                                    </td>
                                    <td className="py-4 px-6 font-mono text-sm font-bold text-gray-600">{asset.asset_qr_id}</td>
                                    <td className="py-4 px-6 text-sm text-gray-700 font-medium">{asset.current_line || asset.location || 'Unassigned'}</td>
                                    <td className="py-4 px-6">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${isGreen ? 'text-green-700 bg-green-50 border-green-200' : isRed ? 'text-red-700 bg-red-50 border-red-200' : 'text-yellow-700 bg-yellow-50 border-yellow-200'}`}>
                                            {asset.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Asset Form (With Inline Type Addition and Fixed Deletion) ---
const AssetForm = ({ assetTypes, pmTemplates = [], onSaveSuccess, onCancel, initialData, initialQrId = '', onAssetTypeCreated, showToast }) => {
    const isEditMode = Boolean(initialData);

    const [formData, setFormData] = useState({
        asset_qr_id: initialQrId,
        name: '', asset_type_id: '', brand: '', model: '', serial_number: '',
        purchase_date: '', purchase_cost: '', current_line: '', location: '', status: 'ACTIVE', warranty_expiry_date: '', expected_lifespan_years: ''
    });
    
    const [pmSchedules, setPmSchedules] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [showTypeModal, setShowTypeModal] = useState(false);

    useEffect(() => {
        if (initialData) {
            const fmtDate = (d) => d ? new Date(d).toISOString().split('T')[0] : '';
            setFormData({
                ...initialData,
                purchase_date: fmtDate(initialData.purchase_date),
                warranty_expiry_date: fmtDate(initialData.warranty_expiry_date)
            });
            if (initialData.pm_schedules && Array.isArray(initialData.pm_schedules)) {
                setPmSchedules(initialData.pm_schedules.map(pm => ({
                    id: pm.id, 
                    _uid: pm.id, // Use database ID as unique key if it exists
                    template_id: pm.template_id || pmTemplates.find(t => t.name === pm.task_name)?.id || '',
                    next_due_date: fmtDate(pm.next_due_date), 
                    is_active: pm.is_active !== false
                })));
            }
        }
    }, [initialData, pmTemplates]);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleTypeChange = (e) => {
        if (e.target.value === 'CREATE_NEW') {
            setShowTypeModal(true);
        } else {
            handleChange(e);
        }
    };

    const addPmSchedule = () => setPmSchedules(prev => [
        ...prev, 
        { _uid: Math.random().toString(36).substr(2, 9), template_id: '', next_due_date: '', is_active: true }
    ]);

    const updatePmSchedule = (index, field, value) => {
        setPmSchedules(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    };

    const removePmSchedule = (index) => {
        setPmSchedules(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const payload = { ...formData, pm_schedules: pmSchedules };
            if (isEditMode) await assetApi.updateAsset(initialData.id, payload);
            else await assetApi.createAsset(payload);
            onSaveSuccess();
        } catch (err) {
            showToast(err.response?.data?.error || `Failed to ${isEditMode ? 'update' : 'create'} asset.`, 'error');
            setIsSaving(false);
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-4xl mx-auto">
                <button type="button" onClick={onCancel} className="text-sm font-bold text-gray-500 hover:text-gray-800 flex items-center mb-6 transition-colors">
                     <ArrowLeft className="mr-2 w-4 h-4"/> Cancel & Return
                </button>
                
                <h2 className="text-2xl font-extrabold text-gray-900 border-b-2 border-gray-100 pb-4 mb-8">
                    {isEditMode ? 'Modify Equipment Profile' : 'Onboard New Equipment'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Asset QR ID <span className="text-red-500">*</span></label>
                        <input type="text" name="asset_qr_id" value={formData.asset_qr_id} onChange={handleChange} required readOnly={!isEditMode && initialQrId} className={`p-3 w-full border-2 rounded-lg font-mono outline-none ${!isEditMode && initialQrId ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-200 focus:border-blue-500'}`} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Equipment Classification <span className="text-red-500">*</span></label>
                        <select name="asset_type_id" value={formData.asset_type_id} onChange={handleTypeChange} required className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium bg-white">
                            <option value="" disabled>Select categorization...</option>
                            {assetTypes.map(t => <option key={t.id} value={t.id}>{t.type_name}</option>)}
                            <option disabled>──────────</option>
                            <option value="CREATE_NEW" className="font-bold text-blue-600">➕ Create New Type...</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Asset Identification Name <span className="text-red-500">*</span></label>
                        <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="e.g. Juki DDL-8700 Industrial Machine" className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none transition-all" />
                    </div>
                </div>
                
                <h3 className="font-bold text-gray-800 bg-gray-50/50 p-3 rounded-lg border border-gray-100 mb-4">Operational Placement</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Production Line</label>
                        <input type="text" name="current_line" value={formData.current_line} onChange={handleChange} placeholder="e.g. Sewing Line 4" className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Facility Location</label>
                        <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g. Matrix Overseas - Block A" className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none" />
                    </div>
                </div>

                <h3 className="font-bold text-gray-800 bg-gray-50/50 p-3 rounded-lg border border-gray-100 mb-4">Hardware Specifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Manufacturer Brand</label><input type="text" name="brand" value={formData.brand} onChange={handleChange} className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none" /></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Model Number</label><input type="text" name="model" value={formData.model} onChange={handleChange} className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none" /></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Serial Number</label><input type="text" name="serial_number" value={formData.serial_number} onChange={handleChange} className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-mono text-sm" /></div>
                </div>

                <h3 className="font-bold text-gray-800 bg-gray-50/50 p-3 rounded-lg border border-gray-100 mb-4">Financial & Acquisition</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Date of Purchase</label>
                        <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className="p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none text-gray-700 font-medium" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Procurement Cost</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold">₹</span>
                            <input type="number" step="0.01" name="purchase_cost" value={formData.purchase_cost} onChange={handleChange} placeholder="0.00" className="pl-8 p-3 w-full border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-mono" />
                        </div>
                    </div>
                </div>

                <h3 className="font-bold text-gray-800 bg-gray-50/50 p-3 rounded-lg border border-gray-100 mb-4">Maintenance Workflows</h3>
                <div className="space-y-4 mb-8">
                    {pmSchedules.map((schedule, idx) => (
                        <div key={schedule.id || schedule._uid} className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl border-2 border-gray-100 shadow-sm">
                            <div className="flex-1 w-full">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Standard Operating Procedure</label>
                                <select className="w-full p-2.5 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-medium bg-white" value={schedule.template_id} onChange={e => updatePmSchedule(idx, 'template_id', e.target.value)} required >
                                    <option value="" disabled>Select maintenance template...</option>
                                    {pmTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.frequency_days}d cycle)</option>)}
                                </select>
                            </div>
                            <div className="w-full md:w-auto">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Target Action Date</label>
                                <input type="date" className="w-full p-2.5 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-medium text-gray-700 bg-white" value={schedule.next_due_date} onChange={e => updatePmSchedule(idx, 'next_due_date', e.target.value)} required />
                            </div>
                            <div className="flex items-center gap-2 mt-4 md:mt-0 md:pt-5">
                                <button type="button" onClick={() => removePmSchedule(idx)} className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Workflow">
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    ))}
                    <button type="button" onClick={addPmSchedule} className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold rounded-lg transition-colors flex items-center border border-blue-200">
                        <Plus size={18} className="mr-2"/> Assign Maintenance Routine
                    </button>
                </div>

                <div className="flex justify-end gap-4 pt-6 border-t-2 border-gray-100">
                    <button type="button" onClick={onCancel} className="px-6 py-3 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl font-bold transition-all shadow-sm">Discard</button>
                    <button type="submit" disabled={isSaving} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center">
                        {isSaving && <Loader2 className="animate-spin mr-3 h-5 w-5" />}
                        {isSaving ? 'Synchronizing...' : 'Finalize & Save Asset'}
                    </button>
                </div>
            </form>
            
            {showTypeModal && (
                <AddAssetTypeModal 
                    onClose={() => {
                        setShowTypeModal(false);
                        setFormData(prev => ({...prev, asset_type_id: ''})); 
                    }}
                    onSaveSuccess={(newType) => {
                        setShowTypeModal(false);
                        onAssetTypeCreated(newType); 
                        setFormData(prev => ({...prev, asset_type_id: newType.id})); 
                    }}
                    showToast={showToast}
                />
            )}
        </>
    );
};

// --- Asset Details View ---
const AssetDetails = ({ asset, onBack, onEdit, onRefetch, showToast }) => { 
    const [showMaintForm, setShowMaintForm] = useState(false);
    
    // Track which cards are expanded
    const [expandedPmId, setExpandedPmId] = useState(null);
    const [expandedLogId, setExpandedLogId] = useState(null);

    const history = asset.history || [];
    const pmSchedules = asset.pm_schedules || [];
    const isUnderWarranty = asset.warranty_expiry_date && new Date(asset.warranty_expiry_date) > new Date();

    return (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-5xl mx-auto animate-fade-in-up">
            <div className="flex justify-between items-center mb-8 pb-6 border-b-2 border-gray-100">
                <button type="button" onClick={onBack} className="text-sm font-bold text-gray-500 hover:text-gray-800 flex items-center transition-colors">
                    <ArrowLeft className="mr-2 w-4 h-4"/> Back to Directory
                </button>
                <button onClick={onEdit} className="px-5 py-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-bold text-sm flex items-center shadow-sm transition-colors">
                    <Edit2 className="mr-2 w-4 h-4"/> Manage Asset Details
                </button>
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6">
                <div>
                    <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">{asset.name}</h2>
                    <p className="text-xl text-gray-500 font-medium mt-1">{asset.type_name}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="inline-flex px-4 py-1.5 text-xs font-bold rounded-lg bg-gray-100 text-gray-800 border border-gray-200">{asset.status.replace('_', ' ')}</span>
                        {isUnderWarranty && (
                            <span className="inline-flex items-center px-4 py-1.5 text-xs font-bold rounded-lg bg-green-50 text-green-700 border border-green-200">
                                <Shield className="mr-1.5 w-3.5 h-3.5"/> Protected by Warranty
                            </span>
                        )}
                    </div>
                </div>
                <div className="bg-gray-50 p-5 rounded-2xl border-2 border-gray-100 min-w-[200px] text-center">
                     <p className="font-mono text-2xl font-bold text-gray-900">{asset.asset_qr_id}</p>
                     <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-2">Active Database Key</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-t-2 border-gray-100 bg-gray-50/30 px-6 rounded-t-xl">
                <div><span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Assigned Unit</span><p className="font-bold text-lg text-gray-800">{asset.current_line || 'Float / Pool'}</p></div>
                <div><span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Physical Sector</span><p className="font-bold text-lg text-gray-800">{asset.location || 'Not Specified'}</p></div>
                <div><span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Hardware Core</span><p className="font-bold text-lg text-gray-800">{asset.brand} {asset.model}</p></div>
                <div><span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">S/N Tracking</span><p className="font-bold text-lg font-mono text-gray-600">{asset.serial_number || 'N/A'}</p></div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-6 border-b-2 border-gray-100 bg-gray-50/30 px-6 rounded-b-xl mb-10 border-t border-gray-200">
                <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Acquisition Date</span>
                    <p className="font-bold text-gray-800">{asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : 'Unrecorded'}</p>
                </div>
                <div>
                    <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Procurement Cost</span>
                    <p className="font-bold text-gray-800 flex items-center">
                        {asset.purchase_cost ? <><IndianRupee className="w-4 h-4 text-gray-500 mr-0.5" />{parseFloat(asset.purchase_cost).toLocaleString('en-IN')}</> : 'Unrecorded'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* --- SCHEDULED PROCEDURES SECTION --- */}
                <div>
                    <h3 className="text-xl font-extrabold text-gray-900 flex items-center mb-6"><Calendar className="mr-3 w-6 h-6 text-blue-600"/> Scheduled Procedures</h3>
                    <div className="space-y-4">
                        {pmSchedules.length === 0 ? (
                            <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center">
                                <p className="text-gray-500 font-medium">No preventative routines assigned.</p>
                            </div>
                        ) : pmSchedules.map(pm => {
                            const isOverdue = new Date(pm.next_due_date) < new Date();
                            const isExpanded = expandedPmId === pm.id;
                            
                            return (
                                <div 
                                    key={pm.id} 
                                    onClick={() => setExpandedPmId(isExpanded ? null : pm.id)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isOverdue ? 'bg-red-50 border-red-100 hover:bg-red-100/70' : 'bg-white border-gray-100 shadow-sm hover:border-blue-100'}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-bold text-gray-900 text-base flex items-center">
                                            {pm.task_name}
                                            {isExpanded ? <ChevronUp className="w-4 h-4 ml-2 text-gray-400"/> : <ChevronDown className="w-4 h-4 ml-2 text-gray-400"/>}
                                        </p>
                                        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">Cycle: {pm.frequency_days}d</span>
                                    </div>
                                    <p className={`text-sm font-bold ${isOverdue ? 'text-red-600' : 'text-blue-600'}`}>
                                        Target Execution: {new Date(pm.next_due_date).toLocaleDateString()}
                                        {isOverdue && ' — OVERDUE'}
                                    </p>
                                    
                                    {/* Expanded PM Content */}
                                    {isExpanded && (
                                        <div className="mt-4 pt-4 border-t border-gray-200/60 animate-fade-in-up text-sm text-gray-700">
                                            <p className="mb-2"><strong>Status:</strong> {pm.is_active !== false ? 'Active Routine' : 'Paused'}</p>
                                            <p className="mb-2"><strong>Template Reference:</strong> #{pm.template_id}</p>
                                            <p><strong>Notes:</strong> Follow standard operating procedure for {pm.task_name}. Log all replacement parts used during this cycle.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* --- INTERVENTION LOGS SECTION --- */}
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-extrabold text-gray-900 flex items-center"><Clipboard className="mr-3 w-6 h-6 text-indigo-600"/> Intervention Logs</h3>
                        <button onClick={() => setShowMaintForm(!showMaintForm)} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            {showMaintForm ? 'Cancel Entry' : '+ Append Record'}
                        </button>
                    </div>
                    
                    {showMaintForm && <MaintenanceLogForm assetId={asset.id} onLogSaved={() => {setShowMaintForm(false); showToast('Maintenance log appended'); onRefetch();}} />}
                    
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {history.length === 0 && !showMaintForm && (
                            <div className="p-6 border-2 border-dashed border-gray-200 rounded-xl text-center">
                                <p className="text-gray-500 font-medium">Lifecycle history is empty.</p>
                            </div>
                        )}
                        {history.map(log => {
                            const isExpanded = expandedLogId === log.id;
                            
                            return (
                                <div 
                                    key={log.id} 
                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                    className="p-4 border-2 border-gray-100 rounded-xl bg-white shadow-sm hover:border-indigo-100 cursor-pointer transition-colors"
                                >
                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-50">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-[10px] px-2.5 py-1 bg-gray-100 rounded text-gray-700 uppercase tracking-wider">{log.maintenance_type}</span>
                                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
                                        </div>
                                        <span className="text-xs font-bold text-gray-400">{new Date(log.maintenance_date).toLocaleDateString()}</span>
                                    </div>
                                    <p className={`text-sm text-gray-800 font-medium leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}>
                                        "{log.description}"
                                    </p>
                                    
                                    {/* Expanded Log Content */}
                                    {isExpanded && (
                                        <div className="mt-3 pt-3 border-t border-gray-50 text-sm text-gray-600 animate-fade-in-up">
                                            <p className="mb-1"><strong>Log Entry ID:</strong> #{log.id}</p>
                                            <p className="mb-1"><strong>Logged on:</strong> {new Date(log.created_at || log.maintenance_date).toLocaleString()}</p>
                                            <p><strong>System Note:</strong> The equipment was processed under the {log.maintenance_type.toLowerCase()} workflow and returned to service.</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MaintenanceLogForm = ({ assetId, onLogSaved }) => {
    const [formData, setFormData] = useState({ maintenance_date: new Date().toISOString().split('T')[0], maintenance_type: 'PREVENTATIVE', description: '' });
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await maintenanceApi.addMaintenanceLog({ ...formData, asset_id: assetId });
            onLogSaved();
        } catch (err) {
            alert('Failed to save log.');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <form onSubmit={handleSubmit} className="p-5 border-2 border-indigo-100 rounded-xl bg-indigo-50/30 mb-6 shadow-sm">
            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">Intervention Type</label>
            <select name="maintenance_type" value={formData.maintenance_type} onChange={e => setFormData({...formData, maintenance_type: e.target.value})} className="mb-4 p-3 w-full text-sm border-2 border-indigo-100 rounded-lg outline-none font-bold text-gray-700 bg-white focus:border-indigo-400">
                <option value="PREVENTATIVE">Routine Maintenance</option>
                <option value="REPAIR">Corrective Repair</option>
            </select>
            
            <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">Technician Notes</label>
            <textarea name="description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required placeholder="Detail the procedures executed..." className="mb-4 p-3 w-full text-sm border-2 border-indigo-100 rounded-lg outline-none focus:border-indigo-400 min-h-[80px]"></textarea>
            
            <button type="submit" disabled={isSaving} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm flex justify-center items-center shadow-sm transition-colors">
                {isSaving ? <Loader2 className="animate-spin w-4 h-4 mr-2"/> : null}
                {isSaving ? 'Writing to Ledger...' : 'Commit Record'}
            </button>
        </form>
    );
};

export default AssetManagementPage;
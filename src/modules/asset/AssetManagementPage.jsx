import React, { useState, useEffect, useCallback } from 'react';
import { 
    FiCamera, FiSearch, FiPlus, FiArrowLeft, FiClipboard, 
    FiX, FiDownload, FiUpload, FiEdit, FiAlertCircle, FiCheck 
} from 'react-icons/fi';
import { LuHardHat,LuAirplay } from 'react-icons/lu';
import { assetApi } from '../../api/assetApi'; 
import { Html5QrcodeScanner } from 'html5-qrcode';

// --- Helper Components ---
const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message, onClear }) => (
    <div className="p-3 bg-red-100 text-red-700 rounded-lg flex justify-between items-center mb-4">
        <span className="text-sm font-medium flex items-center"><FiAlertCircle className="mr-2"/> {message}</span>
        {onClear && <button onClick={onClear} className="font-bold text-lg text-red-700 hover:text-red-900">&times;</button>}
    </div>
);
const Modal = ({ title, children, onClose, size = "max-w-md" }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className={`bg-white rounded-lg shadow-xl w-full ${size} flex flex-col max-h-[90vh]`} onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FiX size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);

// --- CSV UTILS ---
const downloadAsCSV = (data, fileName = 'assets_export.csv') => {
    if (!data || !data.length) return alert("No data to export.");
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
        // Regex handles commas inside quotes
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        let obj = {};
        headers.forEach((h, i) => obj[h] = values[i] ? values[i].replace(/(^"|"$)/g, '').trim() : null);
        return obj;
    });
};

// --- Modals ---
const QrScannerModal = ({ onScanSuccess, onClose }) => {
    useEffect(() => {
        let scanner;
        try {
            scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
            scanner.render((decodedText) => {
                scanner.clear().then(() => onScanSuccess(decodedText)).catch(() => onScanSuccess(decodedText));
            }, () => {});
        } catch (err) { console.error(err); }
        return () => { if (scanner) scanner.clear().catch(e => console.error(e)); };
    }, [onScanSuccess]);

    return (
        <Modal title="Scan Asset QR Code" onClose={onClose}>
            <div id="qr-reader" className="w-full max-w-sm mx-auto"></div>
        </Modal>
    );
};

const AddAssetTypeModal = ({ onClose, onSaveSuccess }) => {
    const [typeName, setTypeName] = useState('');
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await assetApi.createAssetType({ type_name: typeName, description });
            onSaveSuccess(res.data);
        } catch (err) {
            alert('Failed to create asset type.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title="Add New Asset Type" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium">Type Name*</label><input type="text" value={typeName} onChange={(e) => setTypeName(e.target.value)} required className="mt-1 p-2 w-full border rounded-md" /></div>
                <div><label className="block text-sm font-medium">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 p-2 w-full border rounded-md" rows="2"></textarea></div>
                <div className="flex justify-end space-x-3 pt-4 border-t"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cancel</button><button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md">{isSaving ? 'Saving...' : 'Save Type'}</button></div>
            </form>
        </Modal>
    );
};

const ImportConfirmationModal = ({ parsedData, onConfirm, onClose }) => {
    const [isImporting, setIsImporting] = useState(false);

    const handleConfirm = async () => {
        setIsImporting(true);
        try {
            const res = await assetApi.bulkImportAssets(parsedData);
            alert(`Import Successful! \nInserted: ${res.data.inserted} \nUpdated: ${res.data.updated}`);
            onConfirm();
        } catch (err) {
            alert(err.response?.data?.error || "Import failed");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Modal title="Confirm Bulk Import" onClose={onClose} size="max-w-4xl">
            <div className="space-y-4">
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-yellow-800 flex items-start">
                    <FiAlertCircle className="w-5 h-5 mr-2 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-bold">You are about to import/update {parsedData.length} assets.</p>
                        <p className="text-sm mt-1">If the QR ID exists, the asset will be updated. If it does not exist, a new asset will be created.</p>
                    </div>
                </div>
                
                <h4 className="font-bold text-gray-700">Data Preview (First 5 rows)</h4>
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-gray-600">
                            <tr>
                                <th className="p-2">QR ID</th>
                                <th className="p-2">Asset Name</th>
                                <th className="p-2">Type</th>
                                <th className="p-2">Brand</th>
                                <th className="p-2">Supplier</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {parsedData.slice(0, 5).map((row, i) => (
                                <tr key={i}>
                                    <td className="p-2 font-mono text-xs">{row["QR ID"] || '-'}</td>
                                    <td className="p-2">{row["Asset Name"]}</td>
                                    <td className="p-2">{row["Type"]}</td>
                                    <td className="p-2">{row["Brand"]}</td>
                                    <td className="p-2">{row["Supplier"]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button onClick={onClose} disabled={isImporting} className="px-5 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300">Cancel</button>
                    <button onClick={handleConfirm} disabled={isImporting} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center">
                        {isImporting ? <Spinner /> : <><FiCheck className="mr-2"/> Confirm Bulk Update</>}
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
    const [editingData, setEditingData] = useState(null); // Holds data when editing
    
    const [assets, setAssets] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isScanModalOpen, setIsScanModalOpen] = useState(false); 
    const [importData, setImportData] = useState(null);
    
    const [error, setError] = useState(null);
    const [qrSearchTerm, setQrSearchTerm] = useState('');

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [assetsRes, typesRes, supRes] = await Promise.all([
                assetApi.getAllAssets(),
                assetApi.getAllAssetTypes(),
                assetApi.getSuppliers ? assetApi.getSuppliers() : Promise.resolve({ data: [] })
            ]);
            setAssets(assetsRes.data || []);
            setAssetTypes(typesRes.data || []);
            setSuppliers(supRes.data || []);
        } catch (err) {
            setError('Could not load asset data.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewMode === 'list') {
            fetchAllData();
            setEditingData(null);
        }
    }, [viewMode, fetchAllData]);

    const findAssetByQr = async (qrId) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await assetApi.getAssetByQrId(qrId);
            setSelectedAsset(res.data);
            setViewMode('details');
        } catch (err) {
            setError(err.response?.data?.error || `No asset found with ID: ${qrId}`);
        } finally {
            setIsLoading(false);
            setQrSearchTerm('');
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (!qrSearchTerm) return;
        findAssetByQr(qrSearchTerm);
    };

    const handleExport = async () => {
        try {
            const res = await assetApi.exportAssets();
            downloadAsCSV(res.data, `Assets_Export_${new Date().toISOString().split('T')[0]}.csv`);
        } catch (error) {
            alert("Failed to export assets");
        }
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
                alert("Invalid or empty CSV file.");
            }
        };
        reader.readAsText(file);
        e.target.value = null; // reset input
    };

    const handleEditAsset = (asset) => {
        setEditingData(asset);
        setViewMode('form');
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center"><LuHardHat className="mr-3 text-blue-500"/>Asset Management</h1>
                
                {viewMode === 'list' && (
                    <div className="flex gap-2">
                        <label className="cursor-pointer px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg shadow-sm hover:bg-gray-50 flex items-center transition-colors">
                            <FiUpload className="mr-2"/> Import CSV
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileImport} />
                        </label>
                        <button onClick={handleExport} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-sm hover:bg-green-700 flex items-center transition-colors">
                            <FiDownload className="mr-2"/> Export Excel
                        </button>
                    </div>
                )}
            </header>

            {/* Main Search Bar */}
            {viewMode === 'list' && (
                <form onSubmit={handleSearch} className="mb-6 flex gap-2">
                    <input
                        type="text"
                        value={qrSearchTerm}
                        onChange={(e) => setQrSearchTerm(e.target.value)}
                        placeholder="Scan or enter Asset QR ID..."
                        className="flex-grow p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button type="button" onClick={() => { setError(null); setIsScanModalOpen(true); }} className="px-4 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-sm hover:bg-gray-800 flex items-center">
                        <FiCamera className="mr-2"/> Scan
                    </button>
                    <button type="submit" className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700 flex items-center">
                        <FiSearch className="mr-2"/> Search
                    </button>
                    <button type="button" onClick={() => { setEditingData(null); setViewMode('form'); setQrSearchTerm(''); }} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 flex items-center">
                        <FiPlus className="mr-2"/> Add New
                    </button>
                </form>
            )}
            
            {(error && !isLoading) && <ErrorDisplay message={error} onClear={() => setError(null)} />}

            <div className="mt-6">
                {isLoading && <Spinner />}

                {!isLoading && viewMode === 'list' && (
                    <AssetList assets={assets} onSelect={(asset) => findAssetByQr(asset.asset_qr_id)} />
                )}
                
                {!isLoading && viewMode === 'details' && (
                    <AssetDetails 
                        asset={selectedAsset} 
                        onBack={() => { setViewMode('list'); setSelectedAsset(null); }} 
                        onEdit={() => handleEditAsset(selectedAsset)}
                        onRefetch={() => findAssetByQr(selectedAsset.asset_qr_id)} 
                    />
                )}
                
                {!isLoading && viewMode === 'form' && (
                    <AssetForm 
                        assetTypes={assetTypes} 
                        suppliers={suppliers}
                        initialData={editingData}
                        onSaveSuccess={() => { setViewMode('list'); setEditingData(null); }} 
                        onCancel={() => { setViewMode('list'); setEditingData(null); }}
                        initialQrId={qrSearchTerm}
                        onAssetTypeCreated={(newType) => setAssetTypes(prev => [...prev, newType])} 
                    />
                )}
            </div>

            {isScanModalOpen && <QrScannerModal onClose={() => setIsScanModalOpen(false)} onScanSuccess={(id) => { setIsScanModalOpen(false); findAssetByQr(id); }} />}
            {importData && <ImportConfirmationModal parsedData={importData} onConfirm={() => { setImportData(null); fetchAllData(); }} onClose={() => setImportData(null)} />}
        </div>
    );
};

// --- Asset List View ---
const AssetList = ({ assets, onSelect }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Asset Name</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">QR ID</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {assets.length === 0 && <tr><td colSpan="5" className="text-center p-8 text-gray-500">No assets found.</td></tr>}
                {assets.map(asset => {
                    const statusColor = asset.status === 'ACTIVE' ? 'text-green-600 bg-green-50' : asset.status === 'IN_REPAIR' ? 'text-yellow-700 bg-yellow-50' : 'text-red-600 bg-red-50';
                    return (
                        <tr key={asset.id} onClick={() => onSelect(asset)} className="hover:bg-blue-50/50 cursor-pointer transition-colors">
                            <td className="py-3 px-4 font-bold text-gray-800">{asset.name}</td>
                            <td className="py-3 px-4 font-mono text-sm text-gray-600">{asset.asset_qr_id}</td>
                            <td className="py-3 px-4 text-gray-600">{asset.type_name}</td>
                            <td className="py-3 px-4 text-gray-600">{asset.location || '-'}</td>
                            <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-xs font-bold ${statusColor}`}>{asset.status.replace('_', ' ')}</span></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// --- Asset Form (Handles both Create and Edit) ---
const AssetForm = ({ assetTypes, suppliers, onSaveSuccess, onCancel, initialData, initialQrId = '', onAssetTypeCreated }) => {
    const isEditMode = Boolean(initialData);

    const [formData, setFormData] = useState({
        asset_qr_id: initialQrId,
        name: '', asset_type_id: '', brand: '', model: '', serial_number: '',
        purchase_date: '', purchase_cost: '', supplier_id: '', invoice_number: '', location: '', status: 'ACTIVE',
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [isScanModalOpen, setIsFormScanModalOpen] = useState(false);
    const [error, setError] = useState(null);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);

    useEffect(() => {
        if (initialData) {
            // Pre-fill form for editing. Format dates properly for input[type="date"]
            const formattedDate = initialData.purchase_date ? new Date(initialData.purchase_date).toISOString().split('T')[0] : '';
            setFormData({
                ...initialData,
                purchase_date: formattedDate
            });
        }
    }, [initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            if (isEditMode) {
                await assetApi.updateAsset(initialData.id, formData);
            } else {
                await assetApi.createAsset(formData);
            }
            onSaveSuccess();
        } catch (err) {
            setError(err.response?.data?.error || `Failed to ${isEditMode ? 'update' : 'create'} asset.`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6 max-w-4xl mx-auto">
                <button type="button" onClick={onCancel} className="text-sm text-blue-600 hover:underline flex items-center">
                     <FiArrowLeft className="mr-1"/> Back to List
                </button>
                
                {error && <ErrorDisplay message={error} onClear={() => setError(null)} />}
                
                <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">{isEditMode ? 'Edit Asset Details' : 'Onboard New Asset'}</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Asset QR ID*</label>
                        <div className="flex gap-2">
                            <input type="text" name="asset_qr_id" value={formData.asset_qr_id} onChange={handleChange} required placeholder="Scan or enter ID" className="flex-grow p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                            <button type="button" onClick={() => setIsFormScanModalOpen(true)} className="p-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors">
                                <FiCamera/>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Asset Type*</label>
                        <div className="flex gap-2">
                            <select name="asset_type_id" value={formData.asset_type_id} onChange={handleChange} required className="flex-grow p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                <option value="">Select a type...</option>
                                {assetTypes.map(type => <option key={type.id} value={type.id}>{type.type_name}</option>)}
                            </select>
                            <button type="button" onClick={() => setIsTypeModalOpen(true)} className="p-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors" title="Add New Type">
                                <FiPlus/>
                            </button>
                        </div>
                    </div>
                </div>
                
                 <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Asset Name / Title*</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Juki Overlock (Floor 1, Station 5)" className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                
                {/* Manufacturer Details */}
                <h3 className="font-semibold text-gray-800 bg-gray-50 p-2 rounded">Hardware Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                        <input type="text" name="brand" value={formData.brand} onChange={handleChange} placeholder="e.g., Juki" className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                        <input type="text" name="model" value={formData.model} onChange={handleChange} placeholder="e.g., DDL-8700" className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                        <input type="text" name="serial_number" value={formData.serial_number} onChange={handleChange} className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                </div>
                
                {/* Purchase & Location Details */}
                <h3 className="font-semibold text-gray-800 bg-gray-50 p-2 rounded">Purchase & Location</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                        <select name="supplier_id" value={formData.supplier_id} onChange={handleChange} className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                            <option value="">Select Supplier (Optional)</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                        <input type="text" name="invoice_number" value={formData.invoice_number} onChange={handleChange} placeholder="Invoice Ref" className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                        <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Cost ($)</label>
                        <input type="number" step="0.01" name="purchase_cost" value={formData.purchase_cost} onChange={handleChange} className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Physical Location</label>
                        <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g., Cutting Floor" className="p-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
                    <button type="button" onClick={onCancel} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold transition-colors">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-md transition-all disabled:opacity-70">
                        {isSaving ? <LuAirplay className="animate-spin inline w-5 h-5"/> : (isEditMode ? 'Save Changes' : 'Create Asset')}
                    </button>
                </div>
            </form>
            
            {isTypeModalOpen && <AddAssetTypeModal onClose={() => setIsTypeModalOpen(false)} onSaveSuccess={(nt) => { onAssetTypeCreated(nt); setFormData(p => ({...p, asset_type_id: nt.id})); setIsTypeModalOpen(false); }} />}
            {isScanModalOpen && <QrScannerModal onClose={() => setIsFormScanModalOpen(false)} onScanSuccess={(id) => { setFormData(p => ({...p, asset_qr_id: id})); setIsFormScanModalOpen(false); }} />}
        </>
    );
};

// --- Asset Details View ---
const AssetDetails = ({ asset, onBack, onEdit, onRefetch }) => { 
    const [showMaintForm, setShowMaintForm] = useState(false);
    const [history, setHistory] = useState(asset.history || []);
    
    const handleLogSaved = (newLog) => {
        setHistory([newLog, ...history]);
        setShowMaintForm(false);
        if (onRefetch) onRefetch(); 
    };
    
    const statusColor = asset.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : asset.status === 'IN_REPAIR' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <button type="button" onClick={onBack} className="text-sm text-blue-600 hover:underline flex items-center font-medium">
                    <FiArrowLeft className="mr-1"/> Back to Directory
                </button>
                <button onClick={onEdit} className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg font-bold text-sm flex items-center transition-colors">
                    <FiEdit className="mr-2"/> Edit Asset Info
                </button>
            </div>
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-900">{asset.name}</h2>
                    <p className="text-lg text-gray-500 font-medium mt-1">{asset.type_name}</p>
                    <span className={`mt-3 inline-flex px-3 py-1 text-xs font-bold rounded-full border ${statusColor}`}>{asset.status.replace('_', ' ')}</span>
                </div>
                <div className="mt-4 md:mt-0 text-left md:text-right bg-gray-50 p-4 rounded-xl border border-gray-100">
                     <p className="font-mono text-xl font-bold text-indigo-700">{asset.asset_qr_id}</p>
                     <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">System QR ID</p>
                </div>
            </div>
            
            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y border-gray-100">
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Brand</span><p className="font-semibold text-gray-800">{asset.brand || 'N/A'}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Model</span><p className="font-semibold text-gray-800">{asset.model || 'N/A'}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Serial #</span><p className="font-semibold text-gray-800">{asset.serial_number || 'N/A'}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Location</span><p className="font-semibold text-gray-800">{asset.location || 'N/A'}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Purchase Date</span><p className="font-medium text-gray-700">{asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : 'N/A'}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Purchase Cost</span><p className="font-mono font-bold text-green-700">${parseFloat(asset.purchase_cost || 0).toFixed(2)}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Supplier</span><p className="font-medium text-gray-700">{asset.supplier_name || 'N/A'}</p></div>
                <div><span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">Invoice Number</span><p className="font-mono text-gray-700">{asset.invoice_number || 'N/A'}</p></div>
            </div>

            {/* Maintenance Section */}
            <div className="mt-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center"><FiClipboard className="mr-2 text-blue-600"/> Maintenance History</h3>
                    <button onClick={() => setShowMaintForm(!showMaintForm)} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm hover:bg-blue-700 transition-colors shadow-sm">
                        {showMaintForm ? 'Cancel Log' : '+ Add Log Entry'}
                    </button>
                </div>
                
                {showMaintForm && <MaintenanceLogForm assetId={asset.id} onLogSaved={handleLogSaved} />}

                <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-2">
                    {history.length === 0 && <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300"><p className="text-gray-500 font-medium">No maintenance history recorded.</p></div>}
                    {history.map(log => (
                        <div key={log.id} className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm hover:border-blue-200 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-xs px-2 py-1 bg-gray-100 rounded text-gray-700 uppercase tracking-wider">{log.maintenance_type}</span>
                                <span className="text-sm font-bold text-gray-600">{new Date(log.maintenance_date).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-gray-800 leading-relaxed">"{log.description}"</p>
                            <div className="flex justify-between items-end mt-4 pt-3 border-t border-gray-100">
                                <span className="text-xs font-medium text-gray-500">Mechanic: <span className="text-gray-800">{log.performed_by_name || 'System'}</span></span>
                                <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">Cost: ${parseFloat(log.cost || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Maintenance Log Form (Sub-component) ---
const MaintenanceLogForm = ({ assetId, onLogSaved }) => {
    const [formData, setFormData] = useState({ maintenance_date: new Date().toISOString().split('T')[0], maintenance_type: 'PREVENTATIVE', description: '', cost: '', next_scheduled_date: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await assetApi.addMaintenanceLog({ ...formData, asset_id: assetId });
            onLogSaved(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save log.');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <form onSubmit={handleSubmit} className="p-5 border border-blue-200 rounded-xl bg-blue-50/30 space-y-4 mb-6 shadow-sm">
            {error && <ErrorDisplay message={error} onClear={() => setError(null)} />}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Maintenance Date*</label>
                    <input type="date" name="maintenance_date" value={formData.maintenance_date} onChange={handleChange} required className="p-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Maintenance Type*</label>
                    <select name="maintenance_type" value={formData.maintenance_type} onChange={handleChange} required className="p-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                        <option value="PREVENTATIVE">Preventative</option><option value="REPAIR">Repair</option><option value="CALIBRATION">Calibration</option><option value="INSPECTION">Inspection</option>
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description*</label>
                <textarea name="description" value={formData.description} onChange={handleChange} required placeholder="Describe the work performed..." className="p-3 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" rows="3"></textarea>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Total Cost ($)</label>
                    <input type="number" step="0.01" name="cost" value={formData.cost} onChange={handleChange} placeholder="0.00" className="p-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Next Scheduled Date (Optional)</label>
                    <input type="date" name="next_scheduled_date" value={formData.next_scheduled_date} onChange={handleChange} className="p-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                </div>
            </div>
            <div className="flex justify-end pt-2">
                 <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-bold shadow-md hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center">
                    {isSaving ? <LuAirplay className="animate-spin mr-2"/> : null}
                    Save Log
                </button>
            </div>
        </form>
    );
};

export default AssetManagementPage;
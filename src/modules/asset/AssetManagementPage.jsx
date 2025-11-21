import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Corrected icon import path to resolve compilation errors
import { FiPackage, FiSearch, FiPlus, FiArrowLeft, FiTool,  FiClipboard, FiAlertCircle, FiCheckCircle, FiArchive, FiCamera, FiPlusCircle, FiX, FiWrench } from 'react-icons/fi';
import { LuHardHat } from 'react-icons/lu';
// Import the real API (assuming this path)
import { assetApi } from '../../api/assetApi'; 
// Import the QR Scanner library
import { Html5QrcodeScanner } from 'html5-qrcode';

// --- Helper Components ---
const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message, onClear }) => (
    <div className="p-3 bg-red-100 text-red-700 rounded-lg flex justify-between items-center">
        <span className="text-sm font-medium">{message}</span>
        {onClear && <button onClick={onClear} className="font-bold text-lg text-red-700 hover:text-red-900">&times;</button>}
    </div>
);
// Standard Modal Component
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FiX size={20}/></button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

// --- NEW: QR Code Scanner Modal ---
const QrScannerModal = ({ onScanSuccess, onClose }) => {
    useEffect(() => {
        let scanner;
        try {
            scanner = new Html5QrcodeScanner(
                "qr-reader", // ID of the div to mount on
                { 
                    fps: 10, 
                    qrbox: { width: 250, height: 250 },
                    supportedScanTypes: [0] // 0 for CAMERA
                },
                false // verbose
            );

            const handleSuccess = (decodedText, decodedResult) => {
                console.log("Scan Success:", decodedText);
                scanner.clear().then(() => {
                    onScanSuccess(decodedText);
                }).catch(err => {
                    console.error("Error clearing scanner after success:", err);
                    onScanSuccess(decodedText); // Still pass success back
                });
            };

            const handleError = (errorMessage) => {
                // Ignore "QR code not found" errors
            };

            scanner.render(handleSuccess, handleError);

        } catch (err) {
            console.error("Failed to initialize Html5QrcodeScanner:", err);
        }

        // Cleanup function
        return () => {
            if (scanner) {
                scanner.clear().catch(err => {
                    console.error("Failed to clear scanner on unmount:", err);
                });
            }
        };
    }, [onScanSuccess, onClose]);

    return (
        <Modal title="Scan Asset QR Code" onClose={onClose}>
            <div id="qr-reader" style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}></div>
            <p className="text-center text-sm text-gray-500 mt-2">Place the QR code inside the box.</p>
        </Modal>
    );
};


// --- Modal for adding a new Asset Type ---
const AddAssetTypeModal = ({ onClose, onSaveSuccess }) => {
    const [typeName, setTypeName] = useState('');
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            const res = await assetApi.createAssetType({ type_name: typeName, description });
            onSaveSuccess(res.data); // Pass the new type back
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create asset type.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal title="Add New Asset Type" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <ErrorDisplay message={error} onClear={() => setError(null)} />}
                <div>
                    <label className="block text-sm font-medium">Type Name*</label>
                    <input type="text" value={typeName} onChange={(e) => setTypeName(e.target.value)} required placeholder="e.g., Sewing Machine" className="mt-1 p-2 w-full border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="mt-1 p-2 w-full border rounded-md" rows="3"></textarea>
                </div>
                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md font-semibold">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-300">
                        {isSaving ? 'Saving...' : 'Save Type'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};


/**
 * Main Asset Management Page
 */
const AssetManagementPage = () => {
    const [viewMode, setViewMode] = useState('list');
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [assets, setAssets] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isScanModalOpen, setIsScanModalOpen] = useState(false); // For scan
    const [error, setError] = useState(null);
    const [qrSearchTerm, setQrSearchTerm] = useState('');

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [assetsRes, typesRes] = await Promise.all([
                assetApi.getAllAssets(),
                assetApi.getAllAssetTypes()
            ]);
            setAssets(assetsRes.data || []);
            setAssetTypes(typesRes.data || []);
        } catch (err) {
            setError('Could not load asset data.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (viewMode === 'list') {
            fetchAllData();
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

    // --- UPDATED: Open scan modal ---
    const handleScanSearch = () => {
        setError(null);
        setIsScanModalOpen(true);
    };
    
    // --- NEW: Callback for successful scan from search bar ---
    const handleScanSuccessSearch = (qrId) => {
        setIsScanModalOpen(false);
        findAssetByQr(qrId);
    };
    
    const handleBackToList = () => {
        setViewMode('list');
        setSelectedAsset(null);
        setError(null);
    };

    const handleSaveSuccess = () => {
        setViewMode('list');
    };
    
    const handleAssetTypeCreated = (newType) => {
        setAssetTypes(prev => [...prev, newType].sort((a,b) => a.type_name.localeCompare(b.type_name)));
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center"><LuHardHat className="mr-3 text-blue-500"/>Asset Management</h1>
            </header>

            {/* --- Main Search / Scan Bar (UPDATED) --- */}
            <form onSubmit={handleSearch} className="mb-6 flex gap-2">
                <input
                    type="text"
                    value={qrSearchTerm}
                    onChange={(e) => setQrSearchTerm(e.target.value)}
                    placeholder="Scan or enter Asset QR ID..."
                    className="flex-grow p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500"
                />
                <button 
                    type="button" 
                    onClick={handleScanSearch}
                    disabled={isLoading}
                    className="px-4 py-3 bg-gray-700 text-white font-semibold rounded-lg shadow-sm hover:bg-gray-800 flex items-center disabled:bg-gray-400"
                >
                    <FiCamera className="mr-2"/> Scan
                </button>
                <button type="submit" disabled={isLoading} className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700 flex items-center disabled:bg-gray-400">
                    <FiSearch className="mr-2"/> Search
                </button>
                <button type="button" onClick={() => { setViewMode('form'); setQrSearchTerm(''); }} className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-sm hover:bg-green-700 flex items-center">
                    <FiPlus className="mr-2"/> Add New
                </button>
            </form>
            
            {(error && !isLoading) && <ErrorDisplay message={error} onClear={() => setError(null)} />}

            {/* --- Dynamic Content Area --- */}
            <div className="mt-6">
                {isLoading && <Spinner />}

                {!isLoading && viewMode === 'list' && (
                    <AssetList assets={assets} onSelect={(asset) => { findAssetByQr(asset.asset_qr_id); }} />
                )}
                
                {!isLoading && viewMode === 'details' && (
                    <AssetDetails asset={selectedAsset} onBack={handleBackToList} onRefetch={() => findAssetByQr(selectedAsset.asset_qr_id)} />
                )}
                
                {!isLoading && viewMode === 'form' && (
                    <AssetForm 
                        assetTypes={assetTypes} 
                        onSaveSuccess={handleSaveSuccess} 
                        onCancel={handleBackToList}
                        initialQrId={qrSearchTerm}
                        onAssetTypeCreated={handleAssetTypeCreated} 
                    />
                )}
            </div>

            {/* --- Render Scan Modal --- */}
            {isScanModalOpen && (
                <QrScannerModal 
                    onClose={() => setIsScanModalOpen(false)}
                    onScanSuccess={handleScanSuccessSearch}
                />
            )}
        </div>
    );
};

// --- Asset List View ---
const AssetList = ({ assets, onSelect }) => (
    <div className="bg-white rounded-lg shadow border overflow-hidden">
        <table className="min-w-full">
            <thead className="bg-gray-50">
                <tr>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase">Asset Name</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase">QR ID</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {assets.length === 0 && (
                    <tr><td colSpan="5" className="text-center p-8 text-gray-500">No assets found.</td></tr>
                )}
                {assets.map(asset => {
                    const statusColor = asset.status === 'ACTIVE' ? 'text-green-600' : asset.status === 'IN_REPAIR' ? 'text-yellow-600' : 'text-red-600';
                    return (
                        <tr key={asset.id} onClick={() => onSelect(asset)} className="hover:bg-gray-50 cursor-pointer">
                            <td className="py-3 px-4 font-medium text-gray-800">{asset.name}</td>
                            <td className="py-3 px-4 font-mono text-sm text-gray-600">{asset.asset_qr_id}</td>
                            <td className="py-3 px-4 text-gray-600">{asset.type_name}</td>
                            <td className="py-3 px-4 text-gray-600">{asset.location}</td>
                            <td className={`py-3 px-4 font-semibold ${statusColor}`}>{asset.status.replace('_', ' ')}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// --- Asset Form (UPDATED) ---
const AssetForm = ({ assetTypes, onSaveSuccess, onCancel, initialQrId = '', onAssetTypeCreated }) => {
    const [formData, setFormData] = useState({
        asset_qr_id: initialQrId,
        name: '', asset_type_id: '', brand: '', model: '', serial_number: '',
        purchase_date: '', purchase_cost: '', supplier_id: '', location: '', status: 'ACTIVE',
    });
    const [isSaving, setIsSaving] =useState(false);
    const [isScanModalOpen, setIsFormScanModalOpen] = useState(false); // Local scanning state
    const [error, setError] = useState(null);
    const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // --- NEW: Callback for successful scan from form ---
    const handleScanSuccessForm = (qrId) => {
        setIsFormScanModalOpen(false);
        setFormData(prev => ({ ...prev, asset_qr_id: qrId }));
    };
    
    const handleTypeSaveSuccess = (newType) => {
        onAssetTypeCreated(newType);
        setFormData(prev => ({ ...prev, asset_type_id: newType.id }));
        setIsTypeModalOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            await assetApi.createAsset(formData);
            onSaveSuccess();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create asset.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow border space-y-6">
                <button type="button" onClick={onCancel} className="text-sm text-blue-600 hover:underline flex items-center">
                     <FiArrowLeft className="mr-1"/> Back to List
                </button>
                
                {error && <ErrorDisplay message={error} onClear={() => setError(null)} />}
                
                <h2 className="text-xl font-bold text-gray-800">Add New Asset</h2>

                {/* Core Details (UPDATED) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Asset QR ID*</label>
                        <div className="flex gap-2">
                            <input type="text" name="asset_qr_id" value={formData.asset_qr_id} onChange={handleChange} required placeholder="Scan or enter 14-digit ID" className="flex-grow p-2 w-full border rounded-md" />
                            <button type="button" onClick={() => setIsFormScanModalOpen(true)} disabled={isSaving} className="p-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400">
                                <FiCamera/>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Asset Type*</label>
                        <div className="flex gap-2">
                            <select name="asset_type_id" value={formData.asset_type_id} onChange={handleChange} required className="flex-grow p-2 w-full border rounded-md">
                                <option value="">Select a type...</option>
                                {assetTypes.map(type => <option key={type.id} value={type.id}>{type.type_name}</option>)}
                            </select>
                            <button type="button" onClick={() => setIsTypeModalOpen(true)} className="p-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200" title="Add New Type">
                                <FiPlusCircle/>
                            </button>
                        </div>
                    </div>
                </div>
                
                 <div>
                    <label className="block text-sm font-medium">Asset Name*</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="e.g., Juki Overlock (Floor 1, Station 5)" className="mt-1 p-2 w-full border rounded-md" />
                </div>
                {/* Manufacturer Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Brand</label>
                        <input type="text" name="brand" value={formData.brand} onChange={handleChange} placeholder="e.g., Juki" className="mt-1 p-2 w-full border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Model</label>
                        <input type="text" name="model" value={formData.model} onChange={handleChange} placeholder="e.g., DDL-8700" className="mt-1 p-2 w-full border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Serial Number</label>
                        <input type="text" name="serial_number" value={formData.serial_number} onChange={handleChange} className="mt-1 p-2 w-full border rounded-md" />
                    </div>
                </div>
                {/* Purchase Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-sm font-medium">Purchase Date</label>
                        <input type="date" name="purchase_date" value={formData.purchase_date} onChange={handleChange} className="mt-1 p-2 w-full border rounded-md" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium">Purchase Cost</label>
                        <input type="number" step="0.01" name="purchase_cost" value={formData.purchase_cost} onChange={handleChange} className="mt-1 p-2 w-full border rounded-md" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Location</label>
                        <input type="text" name="location" value={formData.location} onChange={handleChange} placeholder="e.g., Cutting Floor" className="mt-1 p-2 w-full border rounded-md" />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <button type="button" onClick={onCancel} className="px-6 py-2 bg-gray-200 rounded-md font-semibold">Cancel</button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 bg-green-600 text-white rounded-md font-semibold disabled:bg-gray-300">
                        {isSaving ? 'Saving...' : 'Save Asset'}
                    </button>
                </div>
            </form>
            
            {isTypeModalOpen && (
                <AddAssetTypeModal
                    onClose={() => setIsTypeModalOpen(false)}
                    onSaveSuccess={handleTypeSaveSuccess}
                />
            )}

            {isScanModalOpen && (
                <QrScannerModal
                    onClose={() => setIsFormScanModalOpen(false)}
                    onScanSuccess={handleScanSuccessForm}
                />
            )}
        </>
    );
};

// --- Asset Details View ---
const AssetDetails = ({ asset, onBack, onRefetch }) => { // Added onRefetch
    const [showMaintForm, setShowMaintForm] = useState(false);
    const [history, setHistory] = useState(asset.history || []);
    
    const handleLogSaved = (newLog) => {
        setHistory([newLog, ...history]);
        setShowMaintForm(false);
        // We call onRefetch to update the asset's main status
        // (e.g., if a REPAIR moved it from IN_REPAIR to ACTIVE)
        if (onRefetch) onRefetch(); 
    };
    
    const statusColor = asset.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : asset.status === 'IN_REPAIR' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';

    return (
        <div className="bg-white p-6 rounded-lg shadow border">
             <button type="button" onClick={onBack} className="text-sm text-blue-600 hover:underline flex items-center mb-4">
                 <FiArrowLeft className="mr-1"/> Back to List
            </button>
            
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800">{asset.name}</h2>
                    <p className="text-lg text-gray-500">{asset.type_name}</p>
                    <span className={`mt-2 inline-block px-3 py-1 text-sm font-bold rounded-full ${statusColor}`}>{asset.status.replace('_', ' ')}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                     <p className="font-mono text-lg text-gray-700">{asset.asset_qr_id}</p>
                     <p className="text-sm text-gray-500">QR Asset ID</p>
                </div>
            </div>
            
            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-b">
                <div><span className="text-sm text-gray-500">Brand</span><p className="font-semibold">{asset.brand || 'N/A'}</p></div>
                <div><span className="text-sm text-gray-500">Model</span><p className="font-semibold">{asset.model || 'N/A'}</p></div>
                <div><span className="text-sm text-gray-500">Serial #</span><p className="font-semibold">{asset.serial_number || 'N/A'}</p></div>
                <div><span className="text-sm text-gray-500">Location</span><p className="font-semibold">{asset.location || 'N/A'}</p></div>
                <div><span className="text-sm text-gray-500">Purchase Date</span><p className="font-semibold">{asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : 'N/A'}</p></div>
                <div><span className="text-sm text-gray-500">Purchase Cost</span><p className="font-semibold">${parseFloat(asset.purchase_cost || 0).toFixed(2)}</p></div>
                <div><span className="text-sm text-gray-500">Supplier</span><p className="font-semibold">{asset.supplier_name || 'N/A'}</p></div>
            </div>

            {/* Maintenance Section */}
            <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center"><FiClipboard className="mr-2"/> Maintenance History</h3>
                    <button onClick={() => setShowMaintForm(!showMaintForm)} className="px-4 py-2 bg-blue-100 text-blue-700 font-semibold rounded-lg text-sm hover:bg-blue-200">
                        {showMaintForm ? 'Cancel' : 'Add Log Entry'}
                    </button>
                </div>
                
                {showMaintForm && (
                    <MaintenanceLogForm assetId={asset.id} onLogSaved={handleLogSaved} />
                )}

                <div className="mt-4 space-y-3 max-h-64 overflow-y-auto">
                    {history.length === 0 && <p className="text-gray-500">No maintenance history recorded.</p>}
                    {history.map(log => (
                        <div key={log.id} className="p-3 border rounded-lg bg-gray-50">
                            <div className="flex justify-between items-center">
                                <p className="font-bold text-gray-700 capitalize">{log.maintenance_type.toLowerCase()}</p>
                                <p className="text-sm font-medium">{new Date(log.maintenance_date).toLocaleDateString()}</p>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{log.description}</p>
                            <p className="text-xs text-gray-500 mt-2">Performed by: {log.performed_by_name || 'N/A'} | Cost: ${parseFloat(log.cost || 0).toFixed(2)}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Maintenance Log Form (Sub-component) ---
const MaintenanceLogForm = ({ assetId, onLogSaved }) => {
    const [formData, setFormData] = useState({
        maintenance_date: new Date().toISOString().split('T')[0],
        maintenance_type: 'PREVENTATIVE',
        description: '',
        cost: '',
        next_scheduled_date: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const payload = { ...formData, asset_id: assetId };
            const res = await assetApi.addMaintenanceLog(payload);
            onLogSaved(res.data); // Pass the new log up
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save log.');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-white space-y-4 shadow-inner">
            {error && <ErrorDisplay message={error} onClear={() => setError(null)} />}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium">Maintenance Date*</label>
                    <input type="date" name="maintenance_date" value={formData.maintenance_date} onChange={handleChange} required className="mt-1 p-2 w-full border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Maintenance Type*</label>
                    <select name="maintenance_type" value={formData.maintenance_type} onChange={handleChange} required className="mt-1 p-2 w-full border rounded-md">
                        <option value="PREVENTATIVE">Preventative</option>
                        <option value="REPAIR">Repair</option>
                        <option value="CALIBRATION">Calibration</option>
                        <option value="INSPECTION">Inspection</option>
                    </select>
                </div>
            </div>
            <div>
                 {/* ✅ FIXED TYPO: Changed </Ulabel> to </label> */}
                <label className="block text-sm font-medium">Description*</label>
                <textarea name="description" value={formData.description} onChange={handleChange} required placeholder="Describe the work performed..." className="mt-1 p-2 w-full border rounded-md" rows="3"></textarea>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium">Cost</label>
                    <input type="number" step="0.01" name="cost" value={formData.cost} onChange={handleChange} placeholder="0.00" className="mt-1 p-2 w-full border rounded-md" />
                </div>
                <div>
                    <label className="block text-sm font-medium">Next Scheduled Date (Optional)</label>
                    <input type="date" name="next_scheduled_date" value={formData.next_scheduled_date} onChange={handleChange} className="mt-1 p-2 w-full border rounded-md" />
                </div>
            </div>
            <div className="flex justify-end">
                 <button type="submit" disabled={isSaving} className="px-5 py-2 bg-blue-600 text-white rounded-md font-semibold text-sm disabled:bg-gray-300">
                    {isSaving ? <Spinner /> : 'Save Log'}
                </button>
            </div>
        </form>
    );
};


export default AssetManagementPage;
import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Make sure to import your api
import { productionManagerApi } from '../../api/productionManagerApi'; 
import { useNavigate, Link, useParams } from 'react-router-dom';
import { LuPackage, LuRuler, LuLayers, LuArrowLeft, LuInfo } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md border border-red-200">{message}</div>;

const TabButton = ({ label, icon: Icon, isActive, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex items-center space-x-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors duration-200 ${
            isActive
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-800'
        }`}
    >
        <Icon size={16} />
        <span>{label}</span>
    </button>
);


const CreateProductionBatchForm = () => {
    const navigate = useNavigate();
    const { batchId } = useParams();
    const isEditMode = Boolean(batchId);

    // --- State ---
    const [productId, setProductId] = useState('');
    const [productionLineId, setProductionLineId] = useState('');
    const [layerLength, setLayerLength] = useState('');
    const [notes, setNotes] = useState('');
    const SIZES = useMemo(() => [
       { key: '28', value: '28' }, { key: '30', value: '30' }, { key: '32', value: '32' },
       { key: '34', value: '34' }, { key: '36', value: '36' }, { key: '38', value: '38' },
       { key: '40', value: '40' }, { key: '42', value: '42' }, { key: '44', value: '44' },
    ], []);
    const [sizeRatios, setSizeRatios] = useState( SIZES.map(s => ({ size: s.key, ratio: '' })) );
    const [selectedRolls, setSelectedRolls] = useState([]);
    // MODIFIED: 'productionLines' will now hold the new loader/line data
    const [options, setOptions] = useState({ products: [], availableRolls: [], fabricTypes: [], fabricColors: [], productionLines: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [fabricTypeFilter, setFabricTypeFilter] = useState('');
    const [fabricColorFilter, setFabricColorFilter] = useState('');
    const [activeTab, setActiveTab] = useState('details');

    // --- Data Fetching ---
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // --- MODIFIED: Fetch common dropdown data first ---
                // This ensures the dropdowns are populated consistently in both modes.
                const [typesRes, colorsRes, linesRes] = await Promise.all([
                    productionManagerApi.getFabricTypes(),
                    productionManagerApi.getFabricColors(),
                    productionManagerApi.getLinesWithLoaders(), // Always fetch the correct lines list
                ]);

                console.log("Fetched fabric types, colors, and lines:", typesRes, colorsRes, linesRes);
                
                const commonOptions = {
                    fabricTypes: typesRes.data || [],
                    fabricColors: colorsRes.data || [],
                    productionLines: linesRes.data || [], // This is now consistent
                };

                if (isEditMode) {
                    // --- EDIT MODE ---
                    // Fetch the specific batch data
                    const res = await productionManagerApi.getBatchForEdit(batchId);
                    const data = res.data;
                    if (!data || !data.batchDetails) throw new Error("Batch data not found.");

                    // Set batch-specific details
                    setProductId(data.batchDetails.product_id || '');
                    setProductionLineId(data.batchDetails.assigned_production_line_id || ''); 
                    setLayerLength(data.batchDetails.length_of_layer_inches || '');
                    setNotes(data.batchDetails.notes || '');
                    
                    const initialRatios = SIZES.map(s => {
                        const foundRatio = (data.size_ratios || []).find(r => r.size === s.value);
                        return { size: s.key, ratio: foundRatio ? foundRatio.ratio : '' };
                    });
                    setSizeRatios(initialRatios);
                    setSelectedRolls(data.assigned_roll_ids || []);
                    
                    // Combine common options with batch-specific options
                    setOptions({
                        ...commonOptions,
                        products: data.products || [], // getBatchForEdit must return this
                        availableRolls: data.available_rolls || [], // getBatchForEdit must return this
                    });
                } else {
                    // --- CREATE MODE ---
                    // Fetch remaining form data (products and rolls)
                    const formDataRes = await productionManagerApi.getFormData(); 
                    
                    setOptions({
                        ...commonOptions,
                        products: formDataRes.data.products || [],
                        availableRolls: formDataRes.data.fabricRolls || [],
                    });

                     // Reset form fields
                     setSizeRatios(SIZES.map(s => ({ size: s.key, ratio: '' })));
                     setSelectedRolls([]);
                     setProductId('');
                     setProductionLineId('');
                     setLayerLength('');
                     setNotes('');
                }
            } catch (err) {
                 console.error("Error loading form data:", err);
                 setError(err.response?.data?.error || err.message || `Could not load data for ${isEditMode ? 'editing' : 'creating'} batch.`);
            } finally { setIsLoading(false); }
        };
        loadData();
    }, [batchId, isEditMode, SIZES]);

    // --- Filtered Rolls Logic ---
    const filteredFabricRolls = useMemo(() => {
         return (options.availableRolls || []).filter(roll => {
            console.log("Filtering roll:", roll, "with typeFilter:", fabricTypeFilter, "and colorFilter:", fabricColorFilter);
            const typeMatch = !fabricTypeFilter || roll.type === fabricTypeFilter;
            const colorMatch = !fabricColorFilter || roll.color === fabricColorFilter;
            return typeMatch && colorMatch;
        });
    }, [options.availableRolls, fabricTypeFilter, fabricColorFilter]);

    // --- Selected Rolls Details ---
    const selectedRollDetails = useMemo(() => {
        return (options.availableRolls || []).filter(roll => selectedRolls.includes(roll.id));
    }, [selectedRolls, options.availableRolls]);

    // --- Handlers ---
     const handleRatioChange = (index, value) => {
        if (value === '' || /^[0-9]+$/.test(value)) {
            const newRatios = [...sizeRatios];
            newRatios[index].ratio = value;
            setSizeRatios(newRatios);
        }
     };

     const handleRollSelection = (rollId) => {
        setSelectedRolls(prev =>
          prev.includes(rollId) ? prev.filter(id => id !== rollId) : [...prev, rollId]
        );
     };

    // --- Submit Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!productId) { setError("Product selection is required."); return; }
        if (!productionLineId) { setError("Production Line assignment is required."); return; }
        if (selectedRolls.length === 0) { setError("At least one fabric roll must be selected."); return; }

        setIsSaving(true);
        setError(null);
        try {
            const payload = {
                product_id: productId,
                // MODIFIED: Send the correct field name
                assigned_production_line_id: productionLineId, 
                length_of_layer_inches: layerLength || null,
                notes,
                size_ratios: sizeRatios
                    .map(r => ({ ...r, ratio: parseInt(r.ratio, 10) }))
                    .filter(r => !isNaN(r.ratio) && r.ratio > 0),
                rolls: selectedRolls,
            };

            if (isEditMode) {
                await productionManagerApi.updateBatch(batchId, payload);
            } else {
                await productionManagerApi.create(payload);
            }
            navigate('/production-manager/dashboard');
        } catch (err) {
             setError(err.response?.data?.error || err.message || 'An unexpected error occurred.');
             setIsSaving(false); 
        }
    };

    const handleCancel = () => { navigate('/production-manager/dashboard'); };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <Link to="/production-manager/dashboard" className="text-sm text-blue-600 hover:underline flex items-center mb-4">
                 <LuArrowLeft className="mr-2" /> Back to Planning Dashboard
            </Link>
            <form onSubmit={handleSubmit} className="flex flex-col bg-white rounded-lg shadow border overflow-hidden">
                {/* Form Header */}
                <div className="p-4 border-b">
                     <h1 className="text-2xl font-bold text-gray-800">{isEditMode ? 'Edit Production Batch' : 'Create New Production Batch'}</h1>
                     <p className="text-sm text-gray-500">{isEditMode ? `Updating Batch ID: ${batchId}` : 'Fill in the details and assign fabric.'}</p>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b">
                     <TabButton label="Details" icon={LuPackage} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                     <TabButton label="Size Ratios" icon={LuRuler} isActive={activeTab === 'ratios'} onClick={() => setActiveTab('ratios')} />
                     <TabButton label="Fabric Rolls" icon={LuLayers} isActive={activeTab === 'rolls'} onClick={() => setActiveTab('rolls')} />
                </div>

                {/* Content Area */}
                <div className="p-6">
                    {error && <ErrorDisplay message={error} />}

                    {/* Details Tab */}
                    {activeTab === 'details' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Product & Specifications</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Product Select */}
                                <div><label className="block text-sm font-medium">Product*</label><select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required><option value="">Select Product</option>{(options.products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>

                                {/* MODIFIED: Production Line Select */}
                                <div>
                                     <label className="block text-sm font-medium">Assign to Line*</label>
                                     <select value={productionLineId} onChange={e => setProductionLineId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required>
                                         <option value="">Select a Line (Loader)</option>
                                         {(options.productionLines || []).map(line => (
                                            <option key={line.line_id} value={line.line_id}>
                                                {line.line_name} (Loader: {line.loader_name})
                                            </option>
                                         ))}
                                     </select>
                                </div>

                                {/* Layer Length */}
                                <div><label className="block text-sm font-medium">Layer Length (inches)</label><input type="number" step="0.01" value={layerLength} onChange={e => setLayerLength(e.target.value)} className="mt-1 p-2 w-full border rounded-md" /></div>
                                {/* Notes */}
                                <div className="md:col-span-2"><label className="block text-sm font-medium">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1 p-2 w-full border rounded-md"></textarea></div>
                            </div>
                        </div>
                    )}

                    {/* Size Ratios Tab */}
                    {activeTab === 'ratios' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Size Ratios</h3>
                            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                                {sizeRatios.map((ratio, index) => (
                                    <div key={ratio.size}><label className="block text-sm font-medium text-center">{ratio.size}</label><input type="number" placeholder="0" min="0" value={ratio.ratio} onChange={e => handleRatioChange(index, e.target.value)} className="mt-1 block w-full p-2 border rounded-md text-center" /></div>
                                ))}
                            </div>
                        </div>
                    )}


                    {/* Fabric Rolls Tab */}
                    {activeTab === 'rolls' && (
                        <div className="space-y-6">
                             <div>
                                 <h3 className="text-lg font-semibold text-gray-800 mb-4">Assign Fabric Rolls*</h3>
                                 <div className="grid grid-cols-2 gap-4 mb-4">
                                     <select value={fabricTypeFilter} onChange={e => setFabricTypeFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Type</option>{(options.fabricTypes || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
                                     <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Color</option>{(options.fabricColors || []).map(c => <option key={c.id} value={`${c.color_number} ${c.name}`}>{c.color_number}-{c.name}</option>)}</select>
                                 </div>
                                 <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-3 border rounded-md bg-gray-50">
                                     {filteredFabricRolls.length > 0 ? filteredFabricRolls.map(roll => (
                                        <label key={roll.id} htmlFor={`roll-${roll.id}`} className="flex items-center p-2 bg-white border rounded-md hover:bg-blue-50 cursor-pointer">
                                            <input type="checkbox" id={`roll-${roll.id}`} checked={selectedRolls.includes(roll.id)} onChange={() => handleRollSelection(roll.id)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
                                            <span className="ml-3 text-sm font-medium text-gray-700">{roll.type} - {roll.color || 'Generic'} ({roll.meter}m)</span>
                                            {isEditMode && selectedRolls.includes(roll.id) && <span className="ml-auto text-xs text-green-600 font-semibold">(Assigned)</span>}
                                        </label>
                                    )) : <p className="col-span-full text-center text-gray-500 py-4">No rolls match filters or available.</p>}
                                 </div>
                             </div>

                             <div>
                                <h3 className="text-lg font-semibold text-gray-800 mb-2">Selected Rolls ({selectedRollDetails.length})</h3>
                                {selectedRollDetails.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">No rolls selected yet.</p>
                                ) : (
                                    <div className="overflow-x-auto border rounded-md max-h-48">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-100 sticky top-0">
                                                <tr>
                                                    <th className="p-2 text-left font-medium">Roll ID</th>
                                                    <th className="p-2 text-left font-medium">Type</th>
                                                    <th className="p-2 text-left font-medium">Color</th>
                                                    <th className="p-2 text-right font-medium">Meters</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {selectedRollDetails.map(roll => (
                                                    <tr key={roll.id}>
                                                        <td className="p-2 font-mono text-xs">R-{roll.id}</td>
                                                        <td className="p-2">{roll.type}</td>
                                                        <td className="p-2">{roll.color || 'Generic'}</td>
                                                        <td className="p-2 text-right font-semibold">{roll.meter}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {selectedRolls.length === 0 && <p className="mt-2 text-xs text-red-600 flex items-center"><LuInfo className="mr-1"/> Selection required.</p>}
                             </div>
                        </div>
                    )}

                </div>

                {/* Action Buttons Footer */}
                <div className="flex justify-end space-x-4 p-4 border-t bg-gray-50">
                    <button type="button" onClick={handleCancel} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md font-semibold hover:bg-gray-300">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700" disabled={isSaving || isLoading}>
                        {isSaving ? (isEditMode ? 'Saving Changes...' : 'Creating...') : (isEditMode ? 'Save Changes' : 'Create Batch')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateProductionBatchForm;

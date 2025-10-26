import React, { useState, useEffect, useMemo } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
// NEW: Import icons for the tabs and section headers

import { useNavigate, Link, useParams } from 'react-router-dom';
import { LuPackage, LuRuler, LuLayers, LuArrowLeft } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md">{message}</div>; // Added specific error display

// --- A reusable, visually enhanced Tab Button component ---
// Corrected syntax: removed semicolon at the end of arrow function definition
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


const CreateProductionBatchForm = () => { // Removed onClose prop
  const navigate = useNavigate(); // Hook for navigation
  const { batchId } = useParams(); // Get batchId from URL if editing
  const isEditMode = Boolean(batchId); // Determine if we are in edit mode

  // --- State variables ---
  const [productId, setProductId] = useState('');
  const [layerLength, setLayerLength] = useState('');
  const [notes, setNotes] = useState('');
   // Assuming SIZES constant is defined elsewhere or imported
   const SIZES = [ // Define SIZES if not imported
       { key: '28', value: '28' }, { key: '30', value: '30' }, { key: '32', value: '32' },
       { key: '34', value: '34' }, { key: '36', value: '36' }, { key: '38', value: '38' },
       { key: '40', value: '40' }, { key: '42', value: '42' }, { key: '44', value: '44' },
   ];
  const [sizeRatios, setSizeRatios] = useState(
    SIZES.map(s => ({ size: s.key, ratio: '' })) // Initialize based on SIZES
  );
  const [selectedRolls, setSelectedRolls] = useState([]);
  const [options, setOptions] = useState({ products: [], availableRolls: [], fabricTypes: [], fabricColors: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fabricTypeFilter, setFabricTypeFilter] = useState('');
  const [fabricColorFilter, setFabricColorFilter] = useState('');
  const [activeTab, setActiveTab] = useState('details');

    // --- Fetch Data for Create OR Edit ---
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                if (isEditMode) {
                    const res = await productionManagerApi.getBatchForEdit(batchId);
                    const data = res.data;

                    setProductId(data.batchDetails.product_id || '');
                    setLayerLength(data.batchDetails.length_of_layer_inches || '');
                    setNotes(data.batchDetails.notes || '');

                    const initialRatios = SIZES.map(s => {
                        const foundRatio = (data.size_ratios || []).find(r => r.size === s.value);
                        return { size: s.key, ratio: foundRatio ? foundRatio.ratio : '' };
                    });
                    setSizeRatios(initialRatios);

                    setSelectedRolls(data.assigned_roll_ids || []);

                    setOptions({
                        products: data.products || [],
                        availableRolls: data.available_rolls || [],
                        fabricTypes: data.fabricTypes || [],
                        fabricColors: data.fabricColors || [],
                    });

                } else {
                    const [formDataRes, typesRes, colorsRes] = await Promise.all([
                        productionManagerApi.getFormData(),
                        productionManagerApi.getFabricTypes(),
                        productionManagerApi.getFabricColors()
                    ]);
                    setOptions({
                        products: formDataRes.data.products || [],
                        availableRolls: formDataRes.data.fabricRolls || [],
                        fabricTypes: typesRes.data || [],
                        fabricColors: colorsRes.data || []
                    });
                     // Reset size ratios for create mode based on SIZES
                     setSizeRatios(SIZES.map(s => ({ size: s.key, ratio: '' })));
                     setSelectedRolls([]); // Ensure rolls are empty for create mode
                     setProductId('');
                     setLayerLength('');
                     setNotes('');
                }
            } catch (err) {
                console.error("Error loading form data:", err);
                setError(err.response?.data?.error || `Could not load data for ${isEditMode ? 'editing' : 'creating'} batch.`);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [batchId, isEditMode]); // Rerun if batchId changes

    // --- Filtered Rolls Logic ---
    const filteredFabricRolls = useMemo(() => {
        return (options.availableRolls || []).filter(roll => {
            const typeMatch = !fabricTypeFilter || roll.type === fabricTypeFilter;
            const colorMatch = !fabricColorFilter || roll.color === fabricColorFilter;
            return typeMatch && colorMatch;
        });
    }, [options.availableRolls, fabricTypeFilter, fabricColorFilter]);

    // --- Handlers ---
     const handleRatioChange = (index, value) => {
        // Allow only non-negative integers or empty string
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
        setIsSaving(true);
        setError(null);
        try {
            const payload = {
                product_id: productId,
                length_of_layer_inches: layerLength || null, // Send null if empty
                notes,
                 // Ensure ratios are numbers and greater than 0
                size_ratios: sizeRatios
                    .map(r => ({ ...r, ratio: parseInt(r.ratio, 10) })) // Convert to number
                    .filter(r => !isNaN(r.ratio) && r.ratio > 0), // Filter out invalid/zero
                rolls: selectedRolls,
            };
            if (!payload.product_id) throw new Error("Product selection is required.");
            if (payload.rolls.length === 0) throw new Error("At least one fabric roll must be selected.");
            if (payload.size_ratios.length === 0) throw new Error("At least one size ratio must be greater than zero.");

            if (isEditMode) {
                await productionManagerApi.updateBatch(batchId, payload);
            } else {
                await productionManagerApi.create(payload);
            }
            navigate('/production-manager/dashboard'); // Navigate back on success
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'An unexpected error occurred.');
            setIsSaving(false); // Keep form enabled on error
        }
    };

    const handleCancel = () => {
        navigate('/production-manager/dashboard'); // Navigate back
    };

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
                                <div><label className="block text-sm font-medium">Product to Manufacture</label><select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required><option value="">Select Product</option>{(options.products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">Layer Length (inches)</label><input type="number" step="0.01" value={layerLength} onChange={e => setLayerLength(e.target.value)} className="mt-1 p-2 w-full border rounded-md" /></div>
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
                        <div className="space-y-4">
                             <h3 className="text-lg font-semibold text-gray-800 mb-4">Assign Fabric Rolls</h3>
                             <div className="grid grid-cols-2 gap-4 mb-4">
                                 <select value={fabricTypeFilter} onChange={e => setFabricTypeFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Type</option>{(options.fabricTypes || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
                                 <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Color</option>{(options.fabricColors || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
                             </div>
                             <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-3 border rounded-md bg-gray-50">
                                {filteredFabricRolls.length > 0 ? filteredFabricRolls.map(roll => (
                                    <label key={roll.id} htmlFor={`roll-${roll.id}`} className="flex items-center p-2 bg-white border rounded-md hover:bg-blue-50 cursor-pointer">
                                        <input type="checkbox" id={`roll-${roll.id}`} checked={selectedRolls.includes(roll.id)} onChange={() => handleRollSelection(roll.id)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
                                        <span className="ml-3 text-sm font-medium text-gray-700">{roll.type} - {roll.color || 'Generic'} ({roll.meter}m)</span>
                                         {/* Indicate if currently assigned in edit mode */}
                                         {isEditMode && (options.availableRolls.find(r => r.id === roll.id) && selectedRolls.includes(roll.id)) && <span className="ml-auto text-xs text-green-600 font-semibold">(Assigned)</span>}
                                    </label>
                                )) : <p className="col-span-full text-center text-gray-500 py-4">No rolls match filters or available.</p>}
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

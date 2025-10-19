import React, { useState, useEffect, useMemo } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
// NEW: Import icons for the tabs and section headers
import { LuPlus, LuPackage, LuRuler, LuLayers } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- A reusable, visually enhanced Tab Button component ---
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


const CreateProductionBatchForm = ({ onClose }) => {
  // ==================================================================
  // --- All of your existing logic remains completely unchanged ---
  // ==================================================================
  const [productId, setProductId] = useState('');
  const [layerLength, setLayerLength] = useState('');
  const [notes, setNotes] = useState('');
  const [sizeRatios, setSizeRatios] = useState([
    { size: '28', ratio: '' }, { size: '30', ratio: '' }, { size: '32', ratio: '' },
    { size: '34', ratio: '' }, { size: '36', ratio: '' }, { size: '38', ratio: '' },
    { size: '40', ratio: '' }, { size: '42', ratio: '' }, { size: '44', ratio: '' },
  ]);
  const [selectedRolls, setSelectedRolls] = useState([]);
  const [options, setOptions] = useState({ products: [], fabricRolls: [], fabricTypes: [], fabricColors: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fabricTypeFilter, setFabricTypeFilter] = useState('');
  const [fabricColorFilter, setFabricColorFilter] = useState('');
  
  // NEW: State to manage the active tab
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    const fetchFormData = async () => {
        try {
            const [formDataRes, typesRes, colorsRes] = await Promise.all([
                productionManagerApi.getFormData(),
                productionManagerApi.getFabricTypes(),
                productionManagerApi.getFabricColors()
            ]);
            setOptions({
                ...formDataRes.data,
                fabricTypes: typesRes.data || [],
                fabricColors: colorsRes.data || []
            });
        } catch (err) {
            setError("Could not load form data.");
        } finally {
            setIsLoading(false);
        }
    };
    fetchFormData();
  }, []);

  const filteredFabricRolls = useMemo(() => {
    return (options.fabricRolls || []).filter(roll => {
        const typeMatch = !fabricTypeFilter || roll.type === fabricTypeFilter;
        const colorMatch = !fabricColorFilter || roll.color === fabricColorFilter;
        return typeMatch && colorMatch;
    });
  }, [options.fabricRolls, fabricTypeFilter, fabricColorFilter]);
  
  const handleRatioChange = (index, value) => {
    const newRatios = [...sizeRatios];
    newRatios[index].ratio = value;
    setSizeRatios(newRatios);
  };
  
  const handleRollSelection = (rollId) => {
    setSelectedRolls(prev => 
      prev.includes(rollId) ? prev.filter(id => id !== rollId) : [...prev, rollId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        product_id: productId,
        length_of_layer_inches: layerLength,
        notes,
        size_ratios: sizeRatios.filter(r => r.ratio && parseInt(r.ratio) > 0),
        rolls: selectedRolls,
      };
      await productionManagerApi.create(payload);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Spinner />;
  
  // ==================================================================
  // --- The UI rewrite starts here ---
  // ==================================================================
  return (
    // The form is now a flex container that fills the height of the modal
    <form onSubmit={handleSubmit} className="flex flex-col h-[50vh] bg-gray-50">
      
      {/* Form Header */}
      <div className="p-4 border-b bg-white">
        <h2 className="text-xl font-bold text-gray-800">Create New Production Batch</h2>
        <p className="text-sm text-gray-500">Fill in the details for the new batch.</p>
      </div>
      
      {/* Tab Navigation */}
      <div className="flex border-b bg-white">
        <TabButton label="Details" icon={LuPackage} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
        <TabButton label="Size Ratios" icon={LuRuler} isActive={activeTab === 'ratios'} onClick={() => setActiveTab('ratios')} />
        <TabButton label="Fabric Rolls" icon={LuLayers} isActive={activeTab === 'rolls'} onClick={() => setActiveTab('rolls')} />
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md">{error}</div>}

        {/* --- Details Tab Content --- */}
        {activeTab === 'details' && (
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4">Product & Specifications</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><label className="block text-sm font-medium">Product to Manufacture</label><select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required><option value="">Select Product</option>{options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium">Layer Length (inches)</label><input type="number" step="0.01" value={layerLength} onChange={e => setLayerLength(e.target.value)} className="mt-1 p-2 w-full border rounded-md" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1 p-2 w-full border rounded-md"></textarea></div>
            </div>
          </div>
        )}

        {/* --- Size Ratios Tab Content --- */}
        {activeTab === 'ratios' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4">Size Ratios</h3>
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                    {sizeRatios.map((ratio, index) => (
                        <div key={ratio.size}><label className="block text-sm font-medium text-center">{ratio.size}</label><input type="number" placeholder="0" value={ratio.ratio} onChange={e => handleRatioChange(index, e.target.value)} className="mt-1 block w-full p-2 border rounded-md text-center" /></div>
                    ))}
                </div>
            </div>
        )}

        {/* --- Fabric Rolls Tab Content --- */}
        {activeTab === 'rolls' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-3 mb-4">Assign Fabric Rolls</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <select value={fabricTypeFilter} onChange={e => setFabricTypeFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Type</option>{(options.fabricTypes || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
                    <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Color</option>{(options.fabricColors || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-3 border rounded-md bg-gray-50">
                    {filteredFabricRolls.map(roll => (
                        <label key={roll.id} htmlFor={`roll-${roll.id}`} className="flex items-center p-2 bg-white border rounded-md hover:bg-blue-50 cursor-pointer">
                            <input type="checkbox" id={`roll-${roll.id}`} checked={selectedRolls.includes(roll.id)} onChange={() => handleRollSelection(roll.id)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" />
                            <span className="ml-3 text-sm font-medium text-gray-700">{roll.type} - {roll.color} ({roll.meter}m)</span>
                        </label>
                    ))}
                </div>
            </div>
        )}
      </div>

      {/* Action Buttons Footer (Always Visible) */}
      <div className="flex justify-end space-x-4 p-4 bg-white border-t">
        <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md font-semibold hover:bg-gray-300">Cancel</button>
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700" disabled={isSaving}>
          {isSaving ? 'Creating...' : 'Create Batch'}
        </button>
      </div>
    </form>
  );
};

export default CreateProductionBatchForm;
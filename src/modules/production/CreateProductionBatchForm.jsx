import React, { useState, useEffect, useMemo } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuPlus } from 'react-icons/lu';


const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

const CreateProductionBatchForm = ({ onClose }) => {
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
  
  // --- NEW: State for the fabric roll filters ---
  const [fabricTypeFilter, setFabricTypeFilter] = useState('');
  const [fabricColorFilter, setFabricColorFilter] = useState('');

  useEffect(() => {
    // Fetch all necessary data for the form's dropdowns
    const fetchFormData = async () => {
        try {
            // We now also fetch fabric types and colors to populate the filter dropdowns
            const [formDataRes, typesRes, colorsRes] = await Promise.all([
                productionManagerApi.getFormData(),
                productionManagerApi.getFabricTypes(), // Assuming an API function for this
                productionManagerApi.getFabricColors() // And this
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

  // --- NEW: Memoized filtering logic for the fabric rolls list ---
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
    setIsSaving(true); // Disable button immediately
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
      onClose(); // Close modal on success
    } catch (err) {
      setError(err.response?.data?.error || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false); // Re-enable button after API call is complete
    }
  };

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product and Spec Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium">Product to Manufacture</label><select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required><option value="">Select Product</option>{options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="block text-sm font-medium">Layer Length (inches)</label><input type="number" step="0.01" value={layerLength} onChange={e => setLayerLength(e.target.value)} className="mt-1 p-2 w-full border rounded-md" /></div>
        <div className="md:col-span-2"><label className="block text-sm font-medium">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 p-2 w-full border rounded-md"></textarea></div>
      </div>

      {/* Size Ratios */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-semibold">Size Ratios</h3>
        <div className="mt-2 grid grid-cols-3 md:grid-cols-5 gap-4">
          {sizeRatios.map((ratio, index) => (
            <div key={ratio.size}><label className="block text-sm font-medium text-center">{ratio.size}</label><input type="number" placeholder="Ratio" value={ratio.ratio} onChange={e => handleRatioChange(index, e.target.value)} className="mt-1 block w-full p-2 border rounded-md text-center" /></div>
          ))}
        </div>
      </div>
      
      {/* Fabric Roll Selection with Filters */}
      <div className="pt-4 border-t">
        <h3 className="text-lg font-semibold">Assign Fabric Rolls</h3>
        {/* --- NEW: Filter Controls --- */}
        <div className="mt-2 grid grid-cols-2 gap-4 mb-4">
            <select value={fabricTypeFilter} onChange={e => setFabricTypeFilter(e.target.value)} className="p-2 border rounded-md">
                <option value="">Filter by Type</option>
                {(options.fabricTypes || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md">
                <option value="">Filter by Color</option>
                {(options.fabricColors || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
        </div>
        {/* --- The list now uses the filtered array --- */}
        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
          {filteredFabricRolls.map(roll => (
            <div key={roll.id} className="flex items-center p-1 bg-gray-50 rounded">
              <input type="checkbox" id={`roll-${roll.id}`} checked={selectedRolls.includes(roll.id)} onChange={() => handleRollSelection(roll.id)} className="h-4 w-4 rounded" />
              <label htmlFor={`roll-${roll.id}`} className="ml-2 text-sm">{roll.type} - {roll.color} ({roll.meter}m)</label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-6 border-t">
        <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-md">Cancel</button>
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed" disabled={isSaving}>
          {isSaving ? 'Creating...' : 'Create Batch'}
        </button>
      </div>
    </form>
  );
};

export default CreateProductionBatchForm;


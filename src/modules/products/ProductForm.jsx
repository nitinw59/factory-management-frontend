import React, { useState, useEffect } from 'react';
import { productApi } from '../../api/productApi';
import { LuPlus, LuTrash2, LuGripVertical } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

// --- A reusable Tab Button component for the form ---
const TabButton = ({ label, isActive, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            isActive 
            ? 'bg-white border-b-0 border-t border-l border-r' 
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
    >
        {label}
    </button>
);


const ProductForm = ({ onSave, onClose, initialData = null }) => {
  const [product, setProduct] = useState({});
  const [materials, setMaterials] = useState([{ trim_item_id: '', quantity: '1' }]);
  const [pieceParts, setPieceParts] = useState([{ part_name: '', part_type: 'PRIMARY' }]);
  const [cycleFlow, setCycleFlow] = useState([]);
  const [options, setOptions] = useState({ brands: [], types: [], trimItems: [], lineTypes: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // --- NEW: State to manage the active tab ---
  const [activeTab, setActiveTab] = useState('details');
  
  const [draggedItem, setDraggedItem] = useState(null);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const optionsRes = await productApi.getFormData();
        setOptions(optionsRes.data);

        if (initialData && initialData.id) {
          const productRes = await productApi.getById(initialData.id);
          const { materials: initialMaterials, cycleFlow: initialCycle, piece_parts: initialParts, ...productDetails } = productRes.data;
          setProduct(productDetails);
          setMaterials(initialMaterials && initialMaterials.length > 0 ? initialMaterials : [{ trim_item_id: '', quantity: '1' }]);
          setPieceParts(initialParts && initialParts.length > 0 ? initialParts : [{ part_name: '', part_type: 'PRIMARY' }]);
          setCycleFlow(initialCycle || []);
        } else {
          setProduct({ product_brand_id: '', product_type_id: '', name: '', description: '', sku: '' });
        }
      } catch (err) {
        setError("Could not load form data.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [initialData]);

  // All handler functions remain the same
  const handleProductChange = (e) => setProduct(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleMaterialChange = (index, field, value) => {
    const newMaterials = [...materials];
    newMaterials[index][field] = value;
    setMaterials(newMaterials);
  };
  const addMaterialRow = () => setMaterials([...materials, { trim_item_id: '', quantity: '1' }]);
  const removeMaterialRow = (index) => setMaterials(materials.filter((_, i) => i !== index));
  const handlePiecePartChange = (index, field, value) => {
    const newParts = [...pieceParts];
    newParts[index][field] = value;
    setPieceParts(newParts);
  };
  const addPiecePartRow = () => setPieceParts([...pieceParts, { part_name: '', part_type: 'PRIMARY' }]);
  const removePiecePartRow = (index) => setPieceParts(pieceParts.filter((_, i) => i !== index));
  const addCycleStep = (lineTypeId) => {
      if (lineTypeId && !cycleFlow.some(step => step.production_line_type_id.toString() === lineTypeId.toString())) {
          const lineType = options.lineTypes.find(lt => lt.id.toString() === lineTypeId.toString());
          if(lineType) setCycleFlow([...cycleFlow, { production_line_type_id: lineType.id, name: lineType.name }]);
      }
  };
  const removeCycleStep = (idToRemove) => setCycleFlow(cycleFlow.filter(step => step.production_line_type_id !== idToRemove));
  const handleDragStart = (e, index) => setDraggedItem(cycleFlow[index]);
  const handleDragOver = (e, index) => {
    e.preventDefault();
    const draggedOverItem = cycleFlow[index];
    if (draggedItem === draggedOverItem) return;
    let items = cycleFlow.filter(item => item !== draggedItem);
    items.splice(index, 0, draggedItem);
    setCycleFlow(items);
  };
  const handleDragEnd = () => setDraggedItem(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        ...product,
        materials: materials.filter(m => m.trim_item_id && m.quantity),
        pieceParts: pieceParts.filter(p => p.part_name),
        cycleFlow: cycleFlow.map((step, index) => ({
            production_line_type_id: step.production_line_type_id,
            sequence_no: index + 1
        })),
        id: initialData?.id
      };
      await onSave(payload);
    } catch (err) {
      setError(err.response?.data?.error || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;
  
  const availableLineTypes = (options.lineTypes || []).filter(
      opt => !cycleFlow.some(step => step.production_line_type_id.toString() === opt.id.toString())
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md">{error}</div>}
      
      {/* --- Tab Navigation --- */}
      <div className="flex border-b">
        <TabButton label="Details" isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
        <TabButton label="Materials" isActive={activeTab === 'materials'} onClick={() => setActiveTab('materials')} />
        <TabButton label="Piece Parts" isActive={activeTab === 'parts'} onClick={() => setActiveTab('parts')} />
        <TabButton label="Production Flow" isActive={activeTab === 'flow'} onClick={() => setActiveTab('flow')} />
      </div>

      {/* --- Tab Content --- */}
      <div className="flex-1 py-6 overflow-y-auto">
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium">Product Name</label><input type="text" name="name" value={product.name || ''} onChange={handleProductChange} className="mt-1 p-2 w-full border rounded-md" required /></div>
              <div><label className="block text-sm font-medium">SKU</label><input type="text" name="sku" value={product.sku || ''} onChange={handleProductChange} className="mt-1 p-2 w-full border rounded-md" /></div>
              <div><label className="block text-sm font-medium">Brand</label><select name="product_brand_id" value={product.product_brand_id || ''} onChange={handleProductChange} className="mt-1 p-2 w-full border rounded-md" required><option value="">Select Brand</option>{(options.brands || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium">Type</label><select name="product_type_id" value={product.product_type_id || ''} onChange={handleProductChange} className="mt-1 p-2 w-full border rounded-md" required><option value="">Select Type</option>{(options.types || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium">Description</label><textarea name="description" value={product.description || ''} onChange={handleProductChange} className="mt-1 p-2 w-full border rounded-md"></textarea></div>
            </div>
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Materials Required</h3>
            <div className="max-h-[40vh] overflow-y-auto space-y-4 p-2 border rounded-md">
            {materials.map((material, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div className="flex-1"><label className="text-xs">Trim / Accessory</label><select value={material.trim_item_id} onChange={e => handleMaterialChange(index, 'trim_item_id', e.target.value)} className="p-2 w-full border rounded-md" required><option value="">Select an item</option>{(options.trimItems || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div className="w-24"><label className="text-xs">Quantity</label><input type="number" value={material.quantity} onChange={e => handleMaterialChange(index, 'quantity', e.target.value)} className="p-2 w-full border rounded-md" required /></div>
                <button type="button" onClick={() => removeMaterialRow(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full mt-4"><LuTrash2 /></button>
              </div>
            ))}
            </div>
            
            <button type="button" onClick={addMaterialRow} className="flex items-center text-sm text-blue-600 hover:underline"><LuPlus className="mr-1" /> Add Material</button>
          </div>
        )}

        {activeTab === 'parts' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Product Piece Parts</h3>
            <p className="text-sm text-gray-500">Define the components cut from fabric to construct this product.</p>
            <div className="max-h-[40vh] overflow-y-auto space-y-4 p-2 border rounded-md">
            {pieceParts.map((part, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div className="flex-1"><label className="text-xs">Part Name</label><input type="text" placeholder="e.g., Front Panel, Pocket" value={part.part_name} onChange={e => handlePiecePartChange(index, 'part_name', e.target.value)} className="p-2 w-full border rounded-md" required /></div>
                <div className="w-48"><label className="text-xs">Part Type</label><select value={part.part_type} onChange={e => handlePiecePartChange(index, 'part_type', e.target.value)} className="p-2 w-full border rounded-md" required><option value="PRIMARY">Primary</option><option value="SUPPORTING">Supporting</option></select></div>
                <button type="button" onClick={() => removePiecePartRow(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full mt-4"><LuTrash2 /></button>
              </div>
            ))}
            </div>  
            <button type="button" onClick={addPiecePartRow} className="flex items-center text-sm text-blue-600 hover:underline"><LuPlus className="mr-1" /> Add Piece Part</button>
          </div>
        )}

        {activeTab === 'flow' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Production Cycle Flow</h3>
            <p className="text-sm text-gray-500">Define the sequence of production line types. Drag to reorder.</p>
            <div className="bg-gray-50 p-2 rounded-lg min-h-[100px] border">
              {cycleFlow.map((step, index) => (
                <div key={step.production_line_type_id} className="flex items-center justify-between bg-white p-2 rounded shadow-sm mb-2" draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd}>
                  <div className="flex items-center"><LuGripVertical className="cursor-move text-gray-400 mr-2" /><span className="font-medium">{index + 1}. {step.name}</span></div>
                  <button type="button" onClick={() => removeCycleStep(step.production_line_type_id)} className="p-1 text-red-500 hover:bg-red-100 rounded-full"><LuTrash2 size={16} /></button>
                </div>
              ))}
              {cycleFlow.length === 0 && <p className="text-center text-gray-400 text-sm p-4">Add production steps below.</p>}
            </div>
            <div className="flex items-center space-x-2">
                <select onChange={(e) => addCycleStep(e.target.value)} value="" className="flex-1 p-2 border rounded-md">
                    <option value="">Add a new production step...</option>
                    {availableLineTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
            </div>
          </div>
        )}
      </div>

      {/* --- Action Buttons --- */}
      <div className="flex justify-end space-x-4 pt-6 border-t">
        <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-200 rounded-md">Cancel</button>
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </form>
  );
};

export default ProductForm;


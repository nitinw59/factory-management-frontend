import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Layers, Palette } from 'lucide-react';
import { accountingApi } from '../../../api/accountingApi';

const CreateSalesOrder = () => {
  const navigate = useNavigate();
  const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

  // --- State ---
  const [options, setOptions] = useState({ customers: [], products: [], fabricTypes: [], fabricColors: [] });
  const [header, setHeader] = useState({ customerId: '', orderNumber: '', deliveryDate: '' });
  
  // Revised Items State: Array of Groups
  const [productGroups, setProductGroups] = useState([
    {
      productId: '',
      fabricTypeId: '',
      sizeRatio: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
      colors: [ 
        { colorId: '', quantity: '', price: '' } // At least one color line per group
      ]
    }
  ]);

  // --- Handlers ---
  
  // 1. Add a new Product Group (The "Sub-Header")
  const addGroup = () => {
    setProductGroups([
      ...productGroups, 
      { 
        productId: '', 
        fabricTypeId: '', 
        sizeRatio: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }, 
        colors: [{ colorId: '', quantity: '', price: '' }] 
      }
    ]);
  };

  // 2. Add a Color Line to a specific Group
  const addColorToGroup = (groupIndex) => {
    const newGroups = [...productGroups];
    newGroups[groupIndex].colors.push({ colorId: '', quantity: '', price: '' });
    setProductGroups(newGroups);
  };

  // 3. Update Group Fields (Product, Fabric, Ratios)
  const updateGroup = (index, field, value) => {
    const newGroups = [...productGroups];
    newGroups[index][field] = value;
    setProductGroups(newGroups);
  };

  const updateRatio = (groupIndex, size, value) => {
    const newGroups = [...productGroups];
    newGroups[groupIndex].sizeRatio[size] = parseInt(value) || 0;
    setProductGroups(newGroups);
  };

  // 4. Update Color Fields
  const updateColor = (groupIndex, colorIndex, field, value) => {
    const newGroups = [...productGroups];
    newGroups[groupIndex].colors[colorIndex][field] = value;
    setProductGroups(newGroups);
  };

  // 5. Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await accountingApi.createSalesOrder({
        ...header,
        items: productGroups // Send the nested structure
      });
      alert('Order Created Successfully!');
      navigate('/accounts/sales/orders');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Load Data
  useEffect(() => {
    console.log (accountingApi.getSalesOrderFormData().then(res => setOptions(res.data)).catch(console.error));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Create Sales Order</h1>
      
      <form onSubmit={handleSubmit}>
        {/* Header Section */}
        <div className="bg-white p-6 rounded shadow mb-6 grid grid-cols-3 gap-4">
            <input 
              className="border p-2 rounded" 
              placeholder="Order Number (e.g. SO-100)" 
              value={header.orderNumber}
              onChange={e => setHeader({...header, orderNumber: e.target.value})}
              required 
            />
            <select 
              className="border p-2 rounded" 
              value={header.customerId}
              onChange={e => setHeader({...header, customerId: e.target.value})}
              required
            >
              <option value="">Select Customer</option>
              {options.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input 
              type="date" 
              className="border p-2 rounded" 
              value={header.deliveryDate}
              onChange={e => setHeader({...header, deliveryDate: e.target.value})}
              required 
            />
        </div>

        {/* Product Groups */}
        {productGroups.map((group, gIndex) => (
          <div key={gIndex} className="bg-white border-l-4 border-blue-600 rounded shadow mb-6 p-6 relative">
             <div className="flex items-center mb-4 text-blue-800">
                <Layers className="mr-2" size={20}/>
                <h3 className="font-bold text-lg">Product Line #{gIndex + 1}</h3>
             </div>

             {/* Group Settings (Product + Fabric + Ratios) */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4 p-4 bg-gray-50 rounded">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Product</label>
                  <select 
                    className="w-full p-2 border rounded"
                    value={group.productId}
                    onChange={e => updateGroup(gIndex, 'productId', e.target.value)}
                    required
                  >
                    <option value="">Select Product</option>
                    {options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Fabric Type</label>
                  <select 
                    className="w-full p-2 border rounded"
                    value={group.fabricTypeId}
                    onChange={e => updateGroup(gIndex, 'fabricTypeId', e.target.value)}
                    required
                  >
                    <option value="">Select Fabric</option>
                    {options.fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                
                {/* Size Ratios */}
                <div className="col-span-2">
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Size Ratio (Applies to all colors below)</label>
                   <div className="flex gap-2">
                      {SIZES.map(size => (
                         <div key={size} className="flex flex-col items-center">
                            <span className="text-xs font-bold text-gray-400">{size}</span>
                            <input 
                              type="number" 
                              className="w-12 p-1 text-center border rounded" 
                              placeholder="0"
                              value={group.sizeRatio[size]}
                              onChange={e => updateRatio(gIndex, size, e.target.value)}
                            />
                         </div>
                      ))}
                   </div>
                </div>
             </div>

             {/* Color Details Table */}
             <div className="pl-4 border-l-2 border-gray-200">
                <h4 className="text-sm font-bold text-gray-600 mb-2 flex items-center">
                   <Palette size={16} className="mr-2"/> Color Breakdown
                </h4>
                {group.colors.map((color, cIndex) => (
                   <div key={cIndex} className="flex gap-4 mb-2 items-center">
                      <select 
                        className="flex-1 p-2 border rounded text-sm"
                        value={color.colorId}
                        onChange={e => updateColor(gIndex, cIndex, 'colorId', e.target.value)}
                        required
                      >
                         <option value="">Select Color</option>
                         {options.fabricColors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input 
                        type="number" 
                        placeholder="Qty" 
                        className="w-24 p-2 border rounded text-sm"
                        value={color.quantity}
                        onChange={e => updateColor(gIndex, cIndex, 'quantity', e.target.value)}
                        required
                      />
                      <input 
                        type="number" 
                        placeholder="Price" 
                        className="w-24 p-2 border rounded text-sm"
                        value={color.price}
                        onChange={e => updateColor(gIndex, cIndex, 'price', e.target.value)}
                      />
                      {group.colors.length > 1 && (
                        <button type="button" onClick={() => {
                           const newGroups = [...productGroups];
                           newGroups[gIndex].colors = newGroups[gIndex].colors.filter((_, i) => i !== cIndex);
                           setProductGroups(newGroups);
                        }} className="text-red-500"><Trash2 size={16}/></button>
                      )}
                   </div>
                ))}
                <button 
                  type="button" 
                  onClick={() => addColorToGroup(gIndex)}
                  className="mt-2 text-xs font-bold text-blue-600 hover:underline flex items-center"
                >
                   <Plus size={12} className="mr-1"/> Add Color Variant
                </button>
             </div>
          </div>
        ))}

        <div className="flex justify-between mt-8">
           <button 
             type="button" 
             onClick={addGroup}
             className="bg-gray-200 text-gray-800 px-4 py-2 rounded font-semibold hover:bg-gray-300"
           >
              + Add Another Product Line
           </button>
           <button 
             type="submit" 
             className="bg-green-600 text-white px-8 py-2 rounded font-bold hover:bg-green-700 shadow-lg"
           >
              Create Sales Order
           </button>
        </div>
      </form>
    </div>
  );
};

export default CreateSalesOrder;
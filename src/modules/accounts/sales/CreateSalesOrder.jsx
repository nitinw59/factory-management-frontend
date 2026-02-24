import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Layers, Palette, Loader2, AlertCircle, DollarSign } from 'lucide-react';
import { accountingApi } from '../../../api/accountingApi'; // Corrected API import

const CreateSalesOrder = () => {
  const navigate = useNavigate();
  const SIZES = ['S', 'M', 'L', 'XL', 'XXL', `XXXL`, '4XL', '5XL', '6XL'];  

  // --- State ---
  const [options, setOptions] = useState({ customers: [], products: [], fabricTypes: [], fabricColors: [] });
  const [header, setHeader] = useState({ customerId: '', orderNumber: '', buyerPoNumber: '', deliveryDate: '', notes: '' });
  
  // Revised Items State: Array of Groups
  const [productGroups, setProductGroups] = useState([
    {
      productId: '',
      fabricTypeId: '',
      sizeRatio: { S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0, "4XL": 0, "5XL": 0, "6XL": 0 },
      colors: [ 
        { colorId: '', quantity: '', price: '' } 
      ]
    }
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // --- Load Data ---
  useEffect(() => {
    const fetchFormData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await accountingApi.getSalesOrderFormData();
        setOptions(res.data);
        
        // Auto-generate a default order number
        const year = new Date().getFullYear();
        const randomStr = Math.floor(1000 + Math.random() * 9000);
        setHeader(prev => ({ ...prev, orderNumber: `SO-${year}-${randomStr}` }));
      } catch (err) {
        console.error("Failed to load form options:", err);
        setError("Could not load form options. Please check your connection.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchFormData();
  }, []);

  // --- Handlers ---
  
  const addGroup = () => {
    setProductGroups([
      ...productGroups, 
      { 
        productId: '', 
        fabricTypeId: '', 
        sizeRatio: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 , XXXL: 0, "4XL": 0, "5XL": 0, "6XL": 0}, 
        colors: [{ colorId: '', quantity: '', price: '' }] 
      }
    ]);
  };

  const addColorToGroup = (groupIndex) => {
    const newGroups = [...productGroups];
    newGroups[groupIndex].colors.push({ colorId: '', quantity: '', price: '' });
    setProductGroups(newGroups);
  };

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

  const updateColor = (groupIndex, colorIndex, field, value) => {
    const newGroups = [...productGroups];
    newGroups[groupIndex].colors[colorIndex][field] = value;
    setProductGroups(newGroups);
  };

  // --- Calculations ---
  const calculateTotal = () => {
    let grandTotal = 0;
    let totalPieces = 0;
    productGroups.forEach(group => {
        group.colors.forEach(color => {
            const qty = parseFloat(color.quantity) || 0;
            const price = parseFloat(color.price) || 0;
            grandTotal += (qty * price);
            totalPieces += qty;
        });
    });
    return { grandTotal: grandTotal.toFixed(2), totalPieces };
  };

  const { grandTotal, totalPieces } = calculateTotal();

  // --- Submit ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Structure payload perfectly for the backend controller
      const payload = {
          customer_id: header.customerId,
          order_number: header.orderNumber,
          buyer_po_number: header.buyerPoNumber, // Ensure you add this column in DB if needed, or pass it inside notes
          delivery_date: header.deliveryDate,
          notes: header.notes || (header.buyerPoNumber ? `Buyer PO: ${header.buyerPoNumber}` : ''), 
          products: productGroups.map(group => ({
              product_id: group.productId,
              fabric_type_id: group.fabricTypeId,
              size_breakdown: group.sizeRatio,
              colors: group.colors.map(c => ({
                  fabric_color_id: c.colorId,
                  quantity: parseFloat(c.quantity) || 0,
                  unit_price: parseFloat(c.price) || 0
              }))
          }))
      };
      console.log("Submitting payload:", payload);
      await accountingApi.createSalesOrder(payload);
      
      // Assume routing to a generic sales order list or dashboard
      navigate('/accounts/sales/orders'); 
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || "Failed to create sales order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen font-inter text-gray-800">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Create Sales Order</h1>
        <p className="text-gray-500 mt-1">Fill in the required fields to map a new buyer order into production.</p>
      </header>

      {error && (
        <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 flex items-center shadow-sm">
            <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
            <p className="font-medium">{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Section */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Order Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Order Number *</label>
                    <input 
                    className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" 
                    placeholder="e.g. SO-100" 
                    value={header.orderNumber}
                    onChange={e => setHeader({...header, orderNumber: e.target.value})}
                    required 
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Buyer PO (Ref)</label>
                    <input 
                    className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" 
                    placeholder="e.g. PO-9982" 
                    value={header.buyerPoNumber}
                    onChange={e => setHeader({...header, buyerPoNumber: e.target.value})}
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Customer *</label>
                    <select 
                    className="w-full border border-gray-300 p-2.5 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" 
                    value={header.customerId}
                    onChange={e => setHeader({...header, customerId: e.target.value})}
                    required
                    >
                    <option value="">Select Customer</option>
                    {options.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Delivery Date *</label>
                    <input 
                    type="date" 
                    className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" 
                    value={header.deliveryDate}
                    onChange={e => setHeader({...header, deliveryDate: e.target.value})}
                    required 
                    />
                </div>
            </div>
            <div className="mt-4">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Order Notes</label>
                <textarea 
                    className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm" 
                    rows="2"
                    placeholder="Any special instructions or references..."
                    value={header.notes}
                    onChange={e => setHeader({...header, notes: e.target.value})}
                ></textarea>
            </div>
        </div>

        {/* Product Groups */}
        {productGroups.map((group, gIndex) => (
          <div key={gIndex} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden relative">
             {/* Left color bar indicator */}
             <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600"></div>

             <div className="p-6">
                 <div className="flex items-center mb-5 text-blue-800">
                    <Layers className="mr-2" size={20}/>
                    <h3 className="font-bold text-lg">Product Line #{gIndex + 1}</h3>
                 </div>

                 {/* Group Settings (Product + Fabric + Ratios) */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 p-5 bg-slate-50 border border-slate-100 rounded-xl">
                    <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Product Style *</label>
                    <select 
                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        value={group.productId}
                        onChange={e => updateGroup(gIndex, 'productId', e.target.value)}
                        required
                    >
                        <option value="">Select Product</option>
                        {options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    </div>
                    <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fabric Type *</label>
                    <select 
                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                        value={group.fabricTypeId}
                        onChange={e => updateGroup(gIndex, 'fabricTypeId', e.target.value)}
                        required
                    >
                        <option value="">Select Fabric</option>
                        {options.fabricTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    </div>
                    
                    {/* Size Ratios */}
                    <div className="col-span-1 md:col-span-2 pt-2 border-t border-gray-200 mt-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                        Size Ratio Breakdown <span className="normal-case text-gray-400 font-normal ml-2">(Applies to all colors in this block)</span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                        {SIZES.map(size => (
                            <div key={size} className="flex flex-col items-center bg-white border border-gray-200 rounded-lg p-2 shadow-sm min-w-[3.5rem]">
                                <span className="text-[10px] font-extrabold text-gray-400 mb-1">{size}</span>
                                <input 
                                type="number" 
                                min="0"
                                className="w-full p-1 text-center border-none font-bold text-gray-700 outline-none focus:ring-0" 
                                placeholder="0"
                                value={group.sizeRatio[size] === 0 ? '' : group.sizeRatio[size]}
                                onChange={e => updateRatio(gIndex, size, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                    </div>
                 </div>

                 {/* Color Details Table */}
                 <div>
                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                    <Palette size={16} className="mr-2 text-indigo-500"/> Order Quantities by Color
                    </h4>
                    
                    <div className="space-y-3">
                        {group.colors.map((color, cIndex) => (
                        <div key={cIndex} className="flex flex-wrap md:flex-nowrap gap-3 items-center bg-white p-2 border border-gray-200 rounded-lg shadow-sm">
                            <select 
                                className="flex-1 min-w-[200px] p-2 border-none bg-transparent text-sm font-medium outline-none focus:ring-0"
                                value={color.colorId}
                                onChange={e => updateColor(gIndex, cIndex, 'colorId', e.target.value)}
                                required
                            >
                                <option value="" disabled>Select Color Variation...</option>
                                {options.fabricColors.map(c => <option key={c.id} value={c.id}>{c.color_number} - {c.name}</option>)}
                            </select>
                            
                            <div className="w-full md:w-32 relative">
                                <span className="absolute left-3 top-2 text-gray-400 text-sm">Qty</span>
                                <input 
                                    type="number" 
                                    min="1"
                                    className="w-full p-2 pl-10 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                                    value={color.quantity}
                                    onChange={e => updateColor(gIndex, cIndex, 'quantity', e.target.value)}
                                    required
                                />
                            </div>

                            <div className="w-full md:w-32 relative">
                                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                                <input 
                                    type="number" 
                                    min="0"
                                    step="0.01"
                                    placeholder="Price" 
                                    className="w-full p-2 pl-7 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500"
                                    value={color.price}
                                    onChange={e => updateColor(gIndex, cIndex, 'price', e.target.value)}
                                    required
                                />
                            </div>

                            <div className="w-8 flex justify-center">
                                {group.colors.length > 1 && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            const newGroups = [...productGroups];
                                            newGroups[gIndex].colors = newGroups[gIndex].colors.filter((_, i) => i !== cIndex);
                                            setProductGroups(newGroups);
                                        }} 
                                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                                        title="Remove Color"
                                    >
                                        <Trash2 size={16}/>
                                    </button>
                                )}
                            </div>
                        </div>
                        ))}
                    </div>

                    <button 
                    type="button" 
                    onClick={() => addColorToGroup(gIndex)}
                    className="mt-3 text-sm font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center px-2 py-1 rounded hover:bg-blue-50"
                    >
                    <Plus size={14} className="mr-1"/> Add Color Variant
                    </button>
                 </div>
             </div>
          </div>
        ))}

        {/* Global Controls & Summary */}
        <div className="flex flex-col md:flex-row justify-between items-end bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-6 gap-6 sticky bottom-0 z-10">
           <div>
               <button 
                type="button" 
                onClick={addGroup}
                className="bg-slate-100 text-slate-700 border border-slate-300 px-5 py-2.5 rounded-lg font-bold hover:bg-slate-200 transition-colors flex items-center shadow-sm"
               >
                <Plus size={18} className="mr-2"/> Add Another Product Line
               </button>
           </div>
           
           <div className="flex flex-col items-end">
               <div className="flex gap-6 mb-4 px-4 py-3 bg-slate-50 rounded-lg border border-slate-100 w-full justify-end">
                   <div className="text-right">
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total Pieces</p>
                       <p className="text-lg font-bold text-gray-800">{totalPieces}</p>
                   </div>
                   <div className="border-l border-gray-300 pl-6 text-right">
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Grand Total</p>
                       <p className="text-2xl font-extrabold text-green-600 flex items-center">
                           <DollarSign size={20} className="mr-0.5" /> {grandTotal}
                       </p>
                   </div>
               </div>

               <button 
                type="submit" 
                disabled={isSubmitting || totalPieces === 0}
                className="flex w-full md:w-auto justify-center items-center bg-blue-600 text-white px-10 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed text-lg"
               >
                {isSubmitting ? (
                    <><Loader2 size={20} className="mr-2 animate-spin" /> Saving Order...</>
                ) : (
                    <><Save size={20} className="mr-2" /> Submit Sales Order</>
                )}
               </button>
           </div>
        </div>
      </form>
    </div>
  );
};

export default CreateSalesOrder;
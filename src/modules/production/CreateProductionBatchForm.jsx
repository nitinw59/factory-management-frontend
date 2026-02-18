import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link, useLocation } from 'react-router-dom';
import { Package, Ruler, Layers, ArrowLeft, Info, Loader2, ChevronDown, ChevronRight, Hash, ShoppingBag, FileText, User, List } from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { accountingApi } from '../../api/accountingApi'; 

const Spinner = () => <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;
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

// --- COLLAPSIBLE GROUP COMPONENT ---
const RollGroup = ({ referenceNumber, rolls, selectedRolls, onToggleRoll }) => {
    const [isOpen, setIsOpen] = useState(true);
    const allSelected = rolls.length > 0 && rolls.every(r => selectedRolls.includes(r.id));
    
    const handleGroupToggle = (e) => {
        e.stopPropagation();
        rolls.forEach(r => {
            if (allSelected) {
                if (selectedRolls.includes(r.id)) onToggleRoll(r.id);
            } else {
                if (!selectedRolls.includes(r.id)) onToggleRoll(r.id);
            }
        });
    };

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
            <div 
                className="bg-gray-100 px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-200 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center space-x-2">
                    {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    <span className="font-semibold text-sm text-gray-700 flex items-center">
                        <Hash size={14} className="mr-1 text-gray-500"/> 
                        {referenceNumber || 'No Reference / Unassigned'}
                    </span>
                    <span className="bg-white text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-500">
                        {rolls.length}
                    </span>
                </div>
                <button 
                    type="button"
                    onClick={handleGroupToggle}
                    className="text-xs text-blue-600 hover:underline font-medium"
                >
                    {allSelected ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            {isOpen && (
                <div className="p-2 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {rolls.map(roll => (
                        <label key={roll.id} className="flex items-center p-2 border border-gray-100 rounded hover:bg-blue-50 cursor-pointer transition-colors">
                            <input 
                                type="checkbox" 
                                checked={selectedRolls.includes(roll.id)} 
                                onChange={() => onToggleRoll(roll.id)} 
                                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" 
                            />
                            <div className="ml-3 flex flex-col">
                                <span className="text-sm font-medium text-gray-700">
                                    {roll.type || roll.fabric_type} - {roll.color || roll.fabric_color || 'Generic'}
                                </span>
                                <span className="text-xs text-gray-500">
                                    Roll #{roll.id} • {roll.meter}m
                                </span>
                            </div>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

const CreateProductionBatchForm = () => {
    const navigate = useNavigate();
    const location = useLocation(); 
    const { batchId } = useParams();
    const [searchParams] = useSearchParams();
    const prefillPoId = searchParams.get('poId');
    const isEditMode = Boolean(batchId);

    const isInitPortal = location.pathname.includes('/initialization-portal');
    const returnPath = isInitPortal ? '/initialization-portal/dashboard' : '/production-manager/dashboard';
    const returnLabel = isInitPortal ? 'Back to Dashboard' : 'Back to Workflow';

    // --- State ---
    const [purchaseOrderId, setPurchaseOrderId] = useState('');
    const [productId, setProductId] = useState('');
    const [productionLineId, setProductionLineId] = useState('');
    const [layerLength, setLayerLength] = useState('');
    const [notes, setNotes] = useState('');
    
    // Size Ratios State - Defined in Ascending Order
    const SIZES = useMemo(() => [
       { key: '28', value: '28' }, { key: '30', value: '30' }, { key: '32', value: '32' },
       { key: '34', value: '34' }, { key: '36', value: '36' }, { key: '38', value: '38' },
       { key: '40', value: '40' }, { key: '42', value: '42' }, { key: '44', value: '44' },
    ], []);
    const [sizeRatios, setSizeRatios] = useState( SIZES.map(s => ({ size: s.key, ratio: '' })) );
    
    const [selectedRolls, setSelectedRolls] = useState([]);
    
    // Combined options
    const [options, setOptions] = useState({ 
        products: [], 
        availableRolls: [], 
        fabricTypes: [], 
        fabricColors: [], 
        productionLines: [],
        purchaseOrders: []
    });
    
    // Sales Order Context
    const [linkedSO, setLinkedSO] = useState(null); // Stores full SO details

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [fabricTypeFilter, setFabricTypeFilter] = useState('');
    const [fabricColorFilter, setFabricColorFilter] = useState('');
    const [activeTab, setActiveTab] = useState('details');

    // --- 1. Initial Data Fetching ---
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [typesRes, colorsRes, linesRes, poRes] = await Promise.all([
                    productionManagerApi.getFabricTypes(),
                    productionManagerApi.getFabricColors(),
                    productionManagerApi.getLinesWithLoaders(),
                    accountingApi.getPurchaseOrders() 
                ]);
                
                const commonOptions = {
                    fabricTypes: typesRes.data || [],
                    fabricColors: colorsRes.data || [],
                    productionLines: linesRes.data || [],
                    purchaseOrders: poRes.data || []
                };

                if (isEditMode) {
                    const res = await productionManagerApi.getBatchForEdit(batchId);
                    const data = res.data;
                    if (!data || !data.batchDetails) throw new Error("Batch data not found.");

                    setProductId(String(data.batchDetails.product_id || ''));
                    // Ensure purchaseOrderId is set as a string for comparison consistency
                    console.log("Setting purchaseOrderId with value:", data.batchDetails.purchase_order_id);
                    setPurchaseOrderId(String(data.batchDetails.purchase_order_id || ''));
                    setProductionLineId(String(data.batchDetails.assigned_production_line_id || '')); 
                    setLayerLength(data.batchDetails.length_of_layer_inches || '');
                    setNotes(data.batchDetails.notes || '');
                    
                    const initialRatios = SIZES.map(s => {
                        const foundRatio = (data.size_ratios || []).find(r => r.size === s.value);
                        return { size: s.key, ratio: foundRatio ? foundRatio.ratio : '' };
                    });
                    setSizeRatios(initialRatios);
                    setSelectedRolls(data.assigned_roll_ids || []);
                    
                    setOptions({
                        ...commonOptions,
                        products: data.products || [],
                        availableRolls: data.available_rolls || [],
                    });
                } else {
                    const formDataRes = await productionManagerApi.getFormData(); 
                    setOptions({
                        ...commonOptions,
                        products: formDataRes.data.products || [],
                        availableRolls: formDataRes.data.fabricRolls || [],
                    });
                     // Reset form
                     setSizeRatios(SIZES.map(s => ({ size: s.key, ratio: '' })));
                     setSelectedRolls([]);
                     setProductId('');
                     setPurchaseOrderId(prefillPoId ? String(prefillPoId) : ''); 
                     setProductionLineId('');
                     setLayerLength('');
                     setNotes('');
                }
            } catch (err) {
                 console.error("Error loading form data:", err);
                 setError(err.response?.data?.error || err.message || `Could not load data.`);
            } finally { setIsLoading(false); }
        };
        loadData();
    }, [batchId, isEditMode, SIZES, prefillPoId]);

    // --- 2. Sales Order Lookup Effect ---
    useEffect(() => {
        const fetchSODetails = async () => {
            if (!purchaseOrderId) {
                setLinkedSO(null);
                return;
            }

            // Find the PO object from our options list
            // Ensure strict comparison by converting both to string
            const selectedPO = options.purchaseOrders.find(po => String(po.id) === String(purchaseOrderId));
            
            if (selectedPO && selectedPO.sales_order_id) {
                try {
                    const soRes = await accountingApi.getSalesOrderDetails(selectedPO.sales_order_id);
                    const soData = soRes.data;
                    setLinkedSO(soData);

                    // Auto-fill Data if in Create Mode
                    if (!isEditMode && soData.products && soData.products.length > 0) {
                        const primaryProduct = soData.products[0]; 
                        
                        // ✅ Auto-select Product
                        const matchingProduct = options.products.find(p => p.name === primaryProduct.product_name);
                        if (matchingProduct) {
                             setProductId(String(matchingProduct.id));
                        }

                        // Auto-fill Ratios
                        if (primaryProduct.size_breakdown) {
                            const newRatios = SIZES.map(s => ({
                                size: s.key,
                                ratio: primaryProduct.size_breakdown[s.key] || ''
                            }));
                            setSizeRatios(newRatios);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch linked SO details", err);
                }
            }
        };

        // Added options.products to dependency to ensure product list exists for matching
        fetchSODetails();
    }, [purchaseOrderId, options.purchaseOrders, options.products, isEditMode, SIZES]);


    // --- 3. Filter Logic (Updated to filter by PO) ---
    const filteredFabricRolls = useMemo(() => {
         // Identify current PO details
         const selectedPO = options.purchaseOrders.find(po => String(po.id) === String(purchaseOrderId));
         // Get the unique identifier (Code or Number) that links rolls to PO
         const poIdentifier = selectedPO ? (selectedPO.po_code || selectedPO.po_number) : null;

         return (options.availableRolls || []).filter(roll => {
            // Standard Filters
            const rollType = roll.type || roll.fabric_type;
            const rollColor = roll.color || roll.fabric_color;

            const typeMatch = !fabricTypeFilter || rollType === fabricTypeFilter;
            const colorMatch = !fabricColorFilter || rollColor === fabricColorFilter;

            // ✅ PO Filter: STRICTLY filter rolls matching PO Code
            let poMatch = true;
            if (purchaseOrderId && poIdentifier) {
                // Check against reference_number; ensure strict equality or includes depending on data
                // Assuming reference_number exactly matches PO Code for now based on previous context
                poMatch = roll.reference_number === poIdentifier;
            }
            
            return typeMatch && colorMatch && poMatch;
        });
    }, [options.availableRolls, fabricTypeFilter, fabricColorFilter, purchaseOrderId, options.purchaseOrders]);

    // --- Grouping Logic ---
    const groupedRolls = useMemo(() => {
        const groups = {};
        filteredFabricRolls.forEach(roll => {
            const ref = roll.reference_number || 'No Reference';
            if (!groups[ref]) groups[ref] = [];
            groups[ref].push(roll);
        });
        return groups;
    }, [filteredFabricRolls]);
    
    const sortedGroupKeys = Object.keys(groupedRolls).sort();

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
        // Ensure values are checked as strings or numbers appropriately
        if (!purchaseOrderId) { setError("Purchase Order selection is required for Batch Coding."); return; }
        if (!productId) { setError("Product selection is required."); return; }
        if (!productionLineId) { setError("Production Line assignment is required."); return; }
        if (selectedRolls.length === 0) { setError("At least one fabric roll must be selected."); return; }

        setIsSaving(true);
        setError(null);
        try {
            const payload = {
                purchase_order_id: purchaseOrderId, 
                product_id: productId,
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
            navigate(returnPath);
        } catch (err) {
             setError(err.response?.data?.error || err.message || 'An unexpected error occurred.');
             setIsSaving(false); 
        }
    };

    const handleCancel = () => { navigate(returnPath); };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* ✅ Dynamic Back Link */}
            <Link to={returnPath} className="text-sm text-blue-600 hover:underline flex items-center mb-4">
                 <ArrowLeft className="mr-2 h-4 w-4" /> {returnLabel}
            </Link>
            
            <form onSubmit={handleSubmit} className="flex flex-col bg-white rounded-lg shadow border overflow-hidden">
                <div className="p-4 border-b">
                     <h1 className="text-2xl font-bold text-gray-800">{isEditMode ? 'Edit Production Batch' : 'Create New Production Batch'}</h1>
                     <p className="text-sm text-gray-500">{isEditMode ? `Updating Batch ID: ${batchId}` : 'Define batch hierarchy (PO -> Batch) and assign resources.'}</p>
                </div>

                <div className="flex border-b">
                     <TabButton label="Details" icon={Package} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                     {/* ✅ NEW TAB */}
                     <TabButton label="Sales Order" icon={FileText} isActive={activeTab === 'sales_order'} onClick={() => setActiveTab('sales_order')} />
                     <TabButton label="Size Ratios" icon={Ruler} isActive={activeTab === 'ratios'} onClick={() => setActiveTab('ratios')} />
                     <TabButton label="Fabric Rolls" icon={Layers} isActive={activeTab === 'rolls'} onClick={() => setActiveTab('rolls')} />
                </div>

                <div className="p-6">
                    {error && <ErrorDisplay message={error} />}

                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            
                            {/* Hierarchy Section */}
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                <h4 className="text-sm font-bold text-indigo-800 mb-3 flex items-center"><ShoppingBag size={16} className="mr-2"/> Batch Context</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Purchase Order (Link)*</label>
                                        <select 
                                            value={purchaseOrderId} 
                                            onChange={e => setPurchaseOrderId(e.target.value)} 
                                            // ✅ DISABLED if coming from dashboard (prefill) OR editing
                                            disabled={!!prefillPoId || isEditMode}
                                            className={`mt-1 p-2 w-full border rounded-md focus:ring-2 focus:ring-indigo-500 outline-none ${!!prefillPoId || isEditMode ? 'bg-gray-200 text-gray-600 cursor-not-allowed' : ''}`}
                                            required
                                        >
                                            <option value="">Select Purchase Order...</option>
                                            {(options.purchaseOrders || []).map(po => (
                                                <option key={po.id} value={po.id}>
                                                    {po.po_code || `PO-${po.id}`} (Ref: {po.sales_order_number || 'N/A'})
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">Locked context: Create separate batches for different POs.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Product*</label>
                                        <select 
                                            value={productId} 
                                            onChange={e => setProductId(e.target.value)} 
                                            className="mt-1 p-2 w-full border rounded-md" 
                                            required
                                        >
                                            <option value="">Select Product</option>
                                            {(options.products || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <hr className="border-gray-200"/>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                <div><label className="block text-sm font-medium">Layer Length (inches)</label><input type="number" step="0.01" value={layerLength} onChange={e => setLayerLength(e.target.value)} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1 p-2 w-full border rounded-md"></textarea></div>
                            </div>
                        </div>
                    )}

                    {/* ✅ NEW TAB CONTENT: Sales Order Summary */}
                    {activeTab === 'sales_order' && (
                        <div className="space-y-6">
                            {linkedSO ? (
                                <div className="bg-white p-6 rounded-lg border border-blue-100 shadow-sm space-y-6">
                                    <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                                        <div>
                                            <h5 className="font-bold text-lg text-gray-800 flex items-center">
                                                <FileText size={20} className="text-blue-600 mr-2" />
                                                Sales Order: {linkedSO.order_number}
                                            </h5>
                                            <p className="text-sm text-gray-500 mt-1">Customer: <span className="font-medium text-gray-700">{linkedSO.customer_name}</span></p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-gray-400 font-bold uppercase">Date</span>
                                            <p className="text-sm font-medium text-gray-700">{new Date(linkedSO.order_date).toLocaleDateString()}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 uppercase mb-3 flex items-center">
                                            <List size={16} className="mr-2"/> Order Items Breakdown
                                        </h4>
                                        <div className="overflow-x-auto border rounded-lg">
                                            <table className="min-w-full text-sm text-left">
                                                <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                                                    <tr>
                                                        <th className="px-4 py-3">Product</th>
                                                        <th className="px-4 py-3">Fabric</th>
                                                        <th className="px-4 py-3">Color Info</th>
                                                        <th className="px-4 py-3 text-right">Qty</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {linkedSO.products.map((prod, idx) => (
                                                        <React.Fragment key={idx}>
                                                            {(prod.colors || []).map((color, cIdx) => (
                                                                <tr key={`${idx}-${cIdx}`} className="hover:bg-blue-50/30">
                                                                    <td className="px-4 py-3 font-medium text-gray-800">{prod.product_name}</td>
                                                                    <td className="px-4 py-3 text-gray-600">{prod.fabric_type}</td>
                                                                    <td className="px-4 py-3">
                                                                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-white border border-gray-200 shadow-sm">
                                                                            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: color.color_name.toLowerCase() }}></span>
                                                                            {color.color_name} ({color.color_number})
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-bold text-gray-800">{color.quantity}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <ShoppingBag className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                                    <p className="text-gray-500 font-medium">Select a Purchase Order in the "Details" tab to view Sales Order context.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'ratios' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-semibold text-gray-800">Size Ratios</h3>
                                {linkedSO && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center"><Info size={12} className="mr-1"/> Auto-filled from Sales Order</span>}
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                                {sizeRatios.map((ratio, index) => (
                                    <div key={ratio.size}><label className="block text-sm font-medium text-center">{ratio.size}</label><input type="number" placeholder="0" min="0" value={ratio.ratio} onChange={e => handleRatioChange(index, e.target.value)} className="mt-1 block w-full p-2 border rounded-md text-center" /></div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'rolls' && (
                        <div className="space-y-6">
                             <div>
                                 <h3 className="text-lg font-semibold text-gray-800 mb-4">Assign Fabric Rolls*</h3>
                                 <div className="grid grid-cols-2 gap-4 mb-4">
                                     <select value={fabricTypeFilter} onChange={e => setFabricTypeFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50">
                                         <option value="">Filter by Type</option>
                                         {(options.fabricTypes || []).map(t => (
                                             <option key={t.id} value={t.name}>{t.name}</option>
                                         ))}
                                     </select>
                                     <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50">
                                         <option value="">Filter by Color</option>
                                         {(options.fabricColors || []).map(c => (
                                             <option key={c.id} value={c.name}>{c.name}</option>
                                         ))}
                                     </select>
                                 </div>
                                 
                                 {/* Grouped Roll Display */}
                                 <div className="mt-2 max-h-96 overflow-y-auto p-2 border rounded-md bg-gray-50/50">
                                     {sortedGroupKeys.length > 0 ? sortedGroupKeys.map(refNum => (
                                         <RollGroup 
                                             key={refNum} 
                                             referenceNumber={refNum} 
                                             rolls={groupedRolls[refNum]} 
                                             selectedRolls={selectedRolls}
                                             onToggleRoll={handleRollSelection}
                                         />
                                     )) : <p className="text-center text-gray-500 py-6">
                                        {purchaseOrderId ? "No available rolls for this PO." : "Select a Purchase Order first."}
                                     </p>}
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
                                                    <th className="p-2 text-left font-medium">Ref #</th>
                                                    <th className="p-2 text-left font-medium">Roll ID</th>
                                                    <th className="p-2 text-left font-medium">Type</th>
                                                    <th className="p-2 text-left font-medium">Color</th>
                                                    <th className="p-2 text-right font-medium">Meters</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {selectedRollDetails.map(roll => (
                                                    <tr key={roll.id}>
                                                        <td className="p-2 font-mono text-xs text-gray-500">{roll.reference_number || '-'}</td>
                                                        <td className="p-2 font-mono text-xs">R-{roll.id}</td>
                                                        <td className="p-2">{roll.type || roll.fabric_type}</td>
                                                        <td className="p-2">{roll.color || roll.fabric_color || 'Generic'}</td>
                                                        <td className="p-2 text-right font-semibold">{roll.meter}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {selectedRolls.length === 0 && <p className="mt-2 text-xs text-red-600 flex items-center"><Info className="mr-1 h-4 w-4"/> Selection required.</p>}
                             </div>
                        </div>
                    )}
                </div>

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
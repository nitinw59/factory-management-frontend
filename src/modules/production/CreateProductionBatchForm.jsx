import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link, useLocation } from 'react-router-dom';
import { Package, Ruler, Layers, ArrowLeft, Info, Loader2, ChevronDown, ChevronRight, Hash, ShoppingBag, FileText, User, List, Scissors, CheckCircle, AlertTriangle, CheckSquare } from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { accountingApi } from '../../api/accountingApi'; 
import { initializationPortalApi } from '../../api/initializationPortalApi';

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
const RollGroup = ({ referenceNumber, rolls, selectedRolls, onToggleRoll, isInterlining = false }) => {
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
        <div className={`border rounded-lg overflow-hidden mb-3 ${isInterlining ? 'border-slate-200' : 'border-gray-200'}`}>
            <div 
                className={`px-3 py-2 flex justify-between items-center cursor-pointer transition-colors ${isInterlining ? 'bg-slate-50 hover:bg-slate-100' : 'bg-gray-100 hover:bg-gray-200'}`}
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
                        <label key={roll.id} className={`flex items-center p-2 border rounded cursor-pointer transition-colors ${isInterlining ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-100 hover:bg-blue-50'}`}>
                            <input 
                                type="checkbox" 
                                checked={selectedRolls.includes(roll.id)} 
                                onChange={() => onToggleRoll(roll.id)} 
                                className={`h-4 w-4 rounded focus:ring-blue-500 ${isInterlining ? 'text-slate-600' : 'text-blue-600'}`}
                            />
                            <div className="ml-3 flex flex-col">
                                <span className="text-sm font-medium text-gray-700">
                                    {roll.type || roll.fabric_type} - {roll.color || roll.fabric_color || 'Generic'}
                                </span>
                                <span className="text-xs text-gray-500">
                                    Roll #{roll.id} • {roll.meter} {roll.uom === 'yard' ? 'yd' : 'm'}
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
    const [plannedCutQty, setPlannedCutQty] = useState(''); 
    
    // Size Ratios State
    const SIZES = useMemo(() => [
       { key: '28', value: '28' }, { key: '30', value: '30' }, { key: '32', value: '32' },
       { key: '34', value: '34' }, { key: '36', value: '36' }, { key: '38', value: '38' },
       { key: '40', value: '40' }, { key: '42', value: '42' }, { key: '44', value: '44' },
    ], []);
    const [sizeRatios, setSizeRatios] = useState( SIZES.map(s => ({ size: s.key, ratio: '' })) );
    
    // Roll Selection (Only Shell Rolls now)
    const [selectedShellRolls, setSelectedShellRolls] = useState([]);
    
    // Interlining State
    const [interliningTemplates, setInterliningTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [interliningConfirmed, setInterliningConfirmed] = useState(false); // ✅ User approval state
    
    // Combined options
    const [options, setOptions] = useState({ 
        products: [], 
        availableRolls: [], 
        fabricTypes: [], 
        fabricColors: [], 
        productionLines: [],
        purchaseOrders: []
    });
    
    // Context
    const [linkedSO, setLinkedSO] = useState(null);

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
                const [typesRes, colorsRes, linesRes, poRes, templatesRes] = await Promise.all([
                    productionManagerApi.getFabricTypes(),
                    productionManagerApi.getFabricColors(),
                    productionManagerApi.getLinesWithLoaders(),
                    accountingApi.getPurchaseOrders(),
                    initializationPortalApi.getInterliningTemplates()
                ]);
                
                const commonOptions = {
                    fabricTypes: typesRes.data || [],
                    fabricColors: colorsRes.data || [],
                    productionLines: linesRes.data || [],
                    purchaseOrders: poRes.data || []
                };

                setInterliningTemplates(templatesRes.data || []);

                if (isEditMode) {
                    const res = await productionManagerApi.getBatchForEdit(batchId);
                    const data = res.data;
                    if (!data || !data.batchDetails) throw new Error("Batch data not found.");

                    setProductId(String(data.batchDetails.product_id || ''));
                    setPurchaseOrderId(String(data.batchDetails.purchase_order_id || ''));
                    setProductionLineId(String(data.batchDetails.assigned_production_line_id || '')); 
                    setLayerLength(data.batchDetails.length_of_layer_inches || '');
                    setNotes(data.batchDetails.notes || '');
                    setSelectedTemplateId(data.batchDetails.interlining_template_id ? String(data.batchDetails.interlining_template_id) : '');
                    
                    const notesMatch = (data.batchDetails.notes || '').match(/Planned Qty: (\d+)/);
                    if(notesMatch) setPlannedCutQty(notesMatch[1]);
                    
                    if (data.batchDetails.interlining_template_id) {
                        setInterliningConfirmed(true); // Assume confirmed if previously saved
                    }

                    const initialRatios = SIZES.map(s => {
                        const foundRatio = (data.size_ratios || []).find(r => r.size === s.value);
                        return { size: s.key, ratio: foundRatio ? foundRatio.ratio : '' };
                    });
                    setSizeRatios(initialRatios);

                    // Filter Assigned IDs for Shell Rolls
                    const assignedIds = data.assigned_roll_ids || [];
                    const available = data.available_rolls || [];
                    
                    const shellIds = [];

                    assignedIds.forEach(id => {
                         const roll = available.find(r => r.id === id);
                         // Keep only shell rolls (exclude interlining if any were previously mixed)
                         if(roll && !(roll.type || '').toLowerCase().includes('interlining')) {
                             shellIds.push(id);
                         }
                    });

                    setSelectedShellRolls(shellIds);
                    
                    setOptions({
                        ...commonOptions,
                        products: data.products || [],
                        availableRolls: available,
                    });
                } else {
                    const formDataRes = await productionManagerApi.getFormData(); 
                    console.log("Form ddata response:", formDataRes.data);
                    setOptions({
                        ...commonOptions,
                        products: formDataRes.data.products || [],
                        availableRolls: formDataRes.data.fabricRolls || [],
                    });
                     // Reset form
                     setSizeRatios(SIZES.map(s => ({ size: s.key, ratio: '' })));
                     setSelectedShellRolls([]);
                     setProductId('');
                     setPurchaseOrderId(prefillPoId || ''); 
                     setProductionLineId('');
                     setLayerLength('');
                     setNotes('');
                     setSelectedTemplateId('');
                     setInterliningConfirmed(false);
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
            const selectedPO = options.purchaseOrders.find(po => String(po.id) === String(purchaseOrderId));
            if (selectedPO && selectedPO.sales_order_id) {
                try {
                    const soRes = await accountingApi.getSalesOrderDetails(selectedPO.sales_order_id);
                    const soData = soRes.data;
                    setLinkedSO(soData);
                    if (!isEditMode && soData.products && soData.products.length > 0) {
                        const primaryProduct = soData.products[0]; 
                        const matchingProduct = options.products.find(p => p.name === primaryProduct.product_name);
                        if (matchingProduct) setProductId(String(matchingProduct.id));
                        if (primaryProduct.size_breakdown) {
                            const newRatios = SIZES.map(s => ({ size: s.key, ratio: primaryProduct.size_breakdown[s.key] || '' }));
                            setSizeRatios(newRatios);
                        }
                    }
                } catch (err) { console.error("Failed to fetch linked SO details", err); }
            }
        };
        fetchSODetails();
    }, [purchaseOrderId, options.purchaseOrders, options.products, isEditMode, SIZES]);

    // --- 3. Shell Filter Logic ---
    const filteredShellRolls = useMemo(() => {
         const selectedPO = options.purchaseOrders.find(po => String(po.id) === String(purchaseOrderId));
         const poIdentifier = selectedPO ? (selectedPO.po_code || selectedPO.po_number) : null;

         return (options.availableRolls || []).filter(roll => {
            const rollType = (roll.type || roll.fabric_type || '').toLowerCase();
            const rollColor = roll.color || roll.fabric_color;
            if (rollType.includes('interlining') || rollType.includes('fusing')) return false;

            const typeMatch = !fabricTypeFilter || rollType === fabricTypeFilter.toLowerCase();
            const colorMatch = !fabricColorFilter || rollColor === fabricColorFilter;
            let poMatch = true;
            if (purchaseOrderId && poIdentifier) poMatch = roll.reference_number === poIdentifier;
            
            return typeMatch && colorMatch && poMatch;
        });
    }, [options.availableRolls, fabricTypeFilter, fabricColorFilter, purchaseOrderId, options.purchaseOrders]);

    // --- 4. Interlining Logic ---
    const selectedTemplate = useMemo(() => 
        interliningTemplates.find(t => String(t.id) === String(selectedTemplateId)), 
    [interliningTemplates, selectedTemplateId]);
    
    // Reset confirmation if template changes
    useEffect(() => {
        setInterliningConfirmed(false);
    }, [selectedTemplateId]);

    const selectedShellDetails = useMemo(() => (options.availableRolls || []).filter(roll => selectedShellRolls.includes(roll.id)), [selectedShellRolls, options.availableRolls]);

    const interliningRequirements = useMemo(() => {
        // console.log("Calculating interlining requirements with:", { selectedTemplate, layerLength, sizeRatios, selectedShellDetails });
        if (!selectedTemplate || !layerLength || sizeRatios.length === 0 || selectedShellDetails.length === 0) return [];
        
        const totalRatio = sizeRatios.reduce((sum, r) => sum + (parseInt(r.ratio) || 0), 0);
        if (totalRatio === 0) return [];

        const requirementsByColor = {}; 
        
        selectedShellDetails.forEach(roll => {
            console.log("Processing roll for rr interlining calculation:", roll);
            const conversionFactor = (roll.uom === 'yard') ? 36 : 39.3701; 
            const rollInches = (parseFloat(roll.meter) || 0) * conversionFactor;
            
            const lays = Math.floor(rollInches / parseFloat(layerLength));
            const rollPieces = lays * totalRatio;

            const rollColorName = roll.color || roll.fabric_color;
            // const rollColorObj = options.fabricColors.find(c => 
            //     (c.display_name && c.display_name.includes(rollColorName)) || c.name === rollColorName
            // );

             const rollColorObj = options.fabricColors.find(c => String(c.id) === String(roll.color_id));

            console.log ("rollcolfffforobj:", rollColorObj, rollColorName, options.fabricColors);
            // console.log(`Processing Roll ID ${roll.id}: Type=${roll.type || roll.fabric_type}, Color=${rollColorName}, Inches=${rollInches.toFixed(2)}, Lays=${lays}, Pieces=${rollPieces}`);

            if (rollColorObj) {
                console.log("selected template:", selectedTemplate);
                const mapping = selectedTemplate.mappings.find(m => m.fabric_color_id == rollColorObj.id);
                if (mapping) {
                    const iColorId = mapping.interlining_color_id;
                    const consumption = parseFloat(selectedTemplate.consumption_per_piece);
                    const reqMeters = rollPieces * consumption;
                    console.log(`  Matched Template Mappingg : Fabric Color ID=${mapping.fabric_color_id} -> Interlining Color ID=${iColorId}, Consumption=${consumption}m/pc, Required Meters=${reqMeters.toFixed(2)}`);
                    if (!requirementsByColor[iColorId]) {
                        const iColorObj = options.fabricColors.find(c => c.id === iColorId);
                        requirementsByColor[iColorId] = {
                            id: iColorId,
                            name: mapping.interlining_color || (iColorObj ? iColorObj.name : 'Unknown'),
                            required: 0,
                            potentialPieces: 0
                        };
                    }
                    requirementsByColor[iColorId].required += reqMeters;
                    requirementsByColor[iColorId].potentialPieces += rollPieces;
                }else{
                    console.log(`  NN o template mapping found for roll color "${rollColorName}" (ID: ${rollColorObj.id}) in selected template.`);
                }
            }
            console.log(`After Roll ID ${roll.id}, Requirements:`, requirementsByColor);
        });
        console.log("Calculatedf Interlining Requirements:", requirementsByColor);
        return Object.values(requirementsByColor);
    }, [selectedTemplate, layerLength, sizeRatios, selectedShellDetails, options.fabricColors]);

    // Grouping Logic
    const groupRolls = (list) => {
        const groups = {};
        list.forEach(roll => {
            const ref = roll.reference_number || 'No Reference';
            if (!groups[ref]) groups[ref] = [];
            groups[ref].push(roll);
        });
        return groups;
    };
    
    const shellGroups = useMemo(() => groupRolls(filteredShellRolls), [filteredShellRolls]);

    // --- Handlers ---
     const handleRatioChange = (index, value) => {
        if (value === '' || /^[0-9]+$/.test(value)) {
            const newRatios = [...sizeRatios];
            newRatios[index].ratio = value;
            setSizeRatios(newRatios);
        }
     };

     const handleShellSelection = (rollId) => setSelectedShellRolls(prev => prev.includes(rollId) ? prev.filter(id => id !== rollId) : [...prev, rollId]);

    // --- Submit Handler ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!purchaseOrderId) { setError("Purchase Order selection is required."); return; }
        if (!productId) { setError("Product selection is required."); return; }
        if (!productionLineId) { setError("Production Line assignment is required."); return; }
        if (selectedShellRolls.length === 0) { setError("At least one shell fabric roll must be selected."); return; }
        
        // Interlining Approval Check
        if (selectedTemplateId && !interliningConfirmed) {
            setError("Please approve the interlining requirements in the Interlining tab.");
            setActiveTab('interlining');
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const metaNotes = `\n[System Info] Planned Qty: ${Math.round(interliningRequirements.reduce((acc, r) => acc + r.potentialPieces, 0))} | Interlining Template: ${selectedTemplate?.interlining_type || 'None'}`;
            
            const requirementsPayload = interliningRequirements.map(req => ({
                interlining_color_id: req.id,
                required_meters: req.required.toFixed(2)
            }));

            const payload = {
                purchase_order_id: purchaseOrderId, 
                product_id: productId,
                assigned_production_line_id: productionLineId, 
                length_of_layer_inches: layerLength || null,
                notes: (notes || '') + metaNotes,
                interlining_template_id: selectedTemplateId || null, 
                interlining_requirements: requirementsPayload, 
                size_ratios: sizeRatios
                    .map(r => ({ ...r, ratio: parseInt(r.ratio, 10) }))
                    .filter(r => !isNaN(r.ratio) && r.ratio > 0),
                rolls: selectedShellRolls, // Only Shell Rolls
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
                     <p className="text-sm text-gray-500">{isEditMode ? `Updating Batch ID: ${batchId}` : 'Define batch hierarchy and assign fabric.'}</p>
                </div>

                <div className="flex border-b overflow-x-auto">
                     <TabButton label="Details" icon={Package} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                     <TabButton label="Sales Order" icon={FileText} isActive={activeTab === 'sales_order'} onClick={() => setActiveTab('sales_order')} />
                     <TabButton label="Size Ratios" icon={Ruler} isActive={activeTab === 'ratios'} onClick={() => setActiveTab('ratios')} />
                     <TabButton label="Shell Fabric" icon={Layers} isActive={activeTab === 'rolls'} onClick={() => setActiveTab('rolls')} />
                     {/* ✅ NEW TAB */}
                     <TabButton label="Interlining" icon={Scissors} isActive={activeTab === 'interlining'} onClick={() => setActiveTab('interlining')} />
                </div>

                <div className="p-6">
                    {error && <ErrorDisplay message={error} />}

                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                <h4 className="text-sm font-bold text-indigo-800 mb-3 flex items-center"><ShoppingBag size={16} className="mr-2"/> Batch Context</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Purchase Order (Link)*</label>
                                        <select 
                                            value={purchaseOrderId} 
                                            onChange={e => setPurchaseOrderId(e.target.value)} 
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
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Product*</label>
                                        <select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required>
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
                                         <option value="">Select a Line</option>
                                         {(options.productionLines || []).map(line => (<option key={line.line_id} value={line.line_id}>{line.line_name}</option>))}
                                     </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Planned Cut Quantity (Pcs)</label>
                                    <input type="number" value={plannedCutQty} onChange={e => setPlannedCutQty(e.target.value)} placeholder="Estimated output..." className="mt-1 p-2 w-full border rounded-md" />
                                    <p className="text-xs text-gray-400 mt-1">Used to estimate interlining requirements.</p>
                                </div>
                                <div><label className="block text-sm font-medium">Layer Length (inches)</label><input type="number" step="0.01" value={layerLength} onChange={e => setLayerLength(e.target.value)} className="mt-1 p-2 w-full border rounded-md" /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1 p-2 w-full border rounded-md"></textarea></div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sales_order' && (
                        <div className="space-y-6">
                            {linkedSO ? (
                                <div className="bg-white p-6 rounded-lg border border-blue-100 shadow-sm space-y-6">
                                    <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                                        <div>
                                            <h5 className="font-bold text-lg text-gray-800 flex items-center"><FileText size={20} className="text-blue-600 mr-2" /> Sales Order: {linkedSO.order_number}</h5>
                                            <p className="text-sm text-gray-500 mt-1">Customer: <span className="font-medium text-gray-700">{linkedSO.customer_name}</span></p>
                                        </div>
                                        <div className="text-right"><span className="text-xs text-gray-400 font-bold uppercase">Date</span><p className="text-sm font-medium text-gray-700">{new Date(linkedSO.order_date).toLocaleDateString()}</p></div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-700 uppercase mb-3 flex items-center"><List size={16} className="mr-2"/> Order Items Breakdown</h4>
                                        <div className="overflow-x-auto border rounded-lg">
                                            <table className="min-w-full text-sm text-left">
                                                <thead className="bg-gray-50 text-gray-600 font-medium border-b"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Fabric</th><th className="px-4 py-3">Color Info</th><th className="px-4 py-3 text-right">Qty</th></tr></thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {linkedSO.products.map((prod, idx) => (
                                                        <React.Fragment key={idx}>{(prod.colors || []).map((color, cIdx) => (<tr key={`${idx}-${cIdx}`} className="hover:bg-blue-50/30"><td className="px-4 py-3 font-medium text-gray-800">{prod.product_name}</td><td className="px-4 py-3 text-gray-600">{prod.fabric_type}</td><td className="px-4 py-3"><span className="inline-flex items-center px-2 py-1 rounded-md bg-white border border-gray-200 shadow-sm">{color.color_name} ({color.color_number})</span></td><td className="px-4 py-3 text-right font-bold text-gray-800">{color.quantity}</td></tr>))}</React.Fragment>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            ) : <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200"><ShoppingBag className="mx-auto h-10 w-10 text-gray-300 mb-3" /><p className="text-gray-500 font-medium">Select a Purchase Order to view Sales Order context.</p></div>}
                        </div>
                    )}

                    {activeTab === 'ratios' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2"><h3 className="text-lg font-semibold text-gray-800">Size Ratios</h3>{linkedSO && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center"><Info size={12} className="mr-1"/> Auto-filled</span>}</div>
                            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                                {sizeRatios.map((ratio, index) => (<div key={ratio.size}><label className="block text-sm font-medium text-center">{ratio.size}</label><input type="number" placeholder="0" min="0" value={ratio.ratio} onChange={e => handleRatioChange(index, e.target.value)} className="mt-1 block w-full p-2 border rounded-md text-center" /></div>))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'rolls' && (
                        <div className="space-y-6">
                             <div>
                                 <h3 className="text-lg font-semibold text-gray-800 mb-4">Assign Shell Fabric Rolls*</h3>
                                 {/* Shell rolls are selected here. We also display a summary here so user knows what drives calculation in next tab */}
                                 {selectedShellDetails.length > 0 && (
                                     <div className="mb-4 bg-blue-50 p-3 rounded-md text-sm text-blue-700">
                                         <span className="font-bold">{selectedShellDetails.length} Rolls Selected.</span> These will determine interlining requirements.
                                     </div>
                                 )}
                                 <div className="grid grid-cols-2 gap-4 mb-4">
                                     <select value={fabricTypeFilter} onChange={e => setFabricTypeFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Type</option>{(options.fabricTypes || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select>
                                     <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50"><option value="">Filter by Color</option>{(options.fabricColors || []).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
                                 </div>
                                 <div className="mt-2 max-h-96 overflow-y-auto p-2 border rounded-md bg-gray-50/50">
                                     {Object.keys(shellGroups).sort().length > 0 ? Object.keys(shellGroups).sort().map(refNum => <RollGroup key={refNum} referenceNumber={refNum} rolls={shellGroups[refNum]} selectedRolls={selectedShellRolls} onToggleRoll={handleShellSelection} />) : <p className="text-center text-gray-500 py-6">{purchaseOrderId ? "No shell rolls match filters." : "Select a Purchase Order first."}</p>}
                                 </div>
                             </div>
                        </div>
                    )}

                    {/* ✅ NEW TAB: INTERLINING ASSIGNMENT */}
                    {activeTab === 'interlining' && (
                        <div className="space-y-6">
                            {/* Warning if no shell rolls selected */}
                            {selectedShellRolls.length === 0 && (
                                <div className="p-4 bg-amber-100 text-amber-800 rounded-lg flex items-center mb-4">
                                    <AlertTriangle className="mr-2 h-5 w-5" />
                                    <span>Please select Shell Fabric Rolls in the "Shell Fabric" tab first to calculate requirements.</span>
                                </div>
                            )}

                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                                <h4 className="text-sm font-bold text-amber-800 mb-3">Interlining Calculator</h4>
                                <div className="grid grid-cols-1 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-amber-700 uppercase mb-1">Select Template</label>
                                        <select 
                                            value={selectedTemplateId} 
                                            onChange={e => setSelectedTemplateId(e.target.value)} 
                                            className="w-full p-2 border border-amber-300 rounded bg-white text-sm"
                                        >
                                            <option value="">-- Choose Interlining Rule --</option>
                                            {interliningTemplates
                                                .filter(t => !productId || String(t.product_id) === String(productId))
                                                .map(t => (
                                                <option key={t.id} value={t.id}>{t.interlining_type} ({t.consumption_per_piece}m/pc)</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {/* Requirement Table */}
                                    {selectedTemplate && (
                                        <div className="bg-white rounded-md border border-amber-200 overflow-hidden">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-amber-100/50 text-amber-900">
                                                    <tr>
                                                        <th className="p-2">Interlining Color</th>
                                                        <th className="p-2 text-right">Est. Pieces</th>
                                                        <th className="p-2 text-right">Required (m)</th>
                                                        <th className="p-2 text-center">Shell Basis</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-amber-50">
                                                    {interliningRequirements.map((req, idx) => (
                                                        <tr key={idx} className="bg-white">
                                                            <td className="p-2 font-medium">{req.name}</td>
                                                            <td className="p-2 text-right">{Math.round(req.potentialPieces)}</td>
                                                            <td className="p-2 text-right font-mono font-bold text-amber-700">{req.required.toFixed(2)}</td>
                                                            <td className="p-2 text-center text-xs text-gray-500">
                                                                Calculated from {req.potentialPieces > 0 ? 'Selected Rolls' : 'No rolls'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {interliningRequirements.length === 0 && (
                                                        <tr><td colSpan="4" className="p-4 text-center text-gray-400">Select Shell Rolls and define Layer Length to calculate requirements.</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* APPROVAL CHECKBOX */}
                            {selectedTemplate && interliningRequirements.length > 0 && (
                                <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <label className="flex items-start cursor-pointer">
                                        <div className="flex items-center h-5">
                                            <input 
                                                type="checkbox" 
                                                checked={interliningConfirmed} 
                                                onChange={(e) => setInterliningConfirmed(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="ml-3 text-sm">
                                            <span className="font-bold text-slate-800">I verify and approve the above interlining requirements.</span>
                                            <p className="text-gray-500 text-xs mt-1">
                                                Checking this confirms that the calculated interlining quantity is sufficient and available for production.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-end space-x-4 p-4 border-t bg-gray-50">
                    <button type="button" onClick={handleCancel} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md font-semibold hover:bg-gray-300">Cancel</button>
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-400 hover:bg-blue-700" disabled={isSaving || isLoading}>
                        {isSaving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Batch')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateProductionBatchForm;
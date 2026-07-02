import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link, useLocation } from 'react-router-dom';
import {
    Package, Ruler, Layers, ArrowLeft, Loader2,
    ChevronDown, ChevronRight, Hash,
    Scissors, CheckCircle, AlertTriangle, Calendar, Tag,
} from 'lucide-react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import { accountingApi } from '../../api/accountingApi';

const Spinner = () => (
    <div className="flex justify-center p-8">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
    </div>
);

const ErrorDisplay = ({ message }) => (
    <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-md border border-red-200">{message}</div>
);

const TabButton = ({ label, icon: Icon, isActive, onClick, badge }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors duration-200 ${
            isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
        }`}
    >
        <Icon size={16} />
        <span>{label}</span>
        {badge != null && (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full leading-none">
                {badge}
            </span>
        )}
    </button>
);

// ── Collapsible roll group (reference-number or color-based) ──────────────
const RollGroup = ({ groupKey, rolls, selectedRolls, onToggleRoll, colorDot, isInterlining = false }) => {
    const [isOpen, setIsOpen] = useState(true);
    const allSelected = rolls.length > 0 && rolls.every(r => selectedRolls.includes(r.id));

    const handleGroupToggle = (e) => {
        e.stopPropagation();
        rolls.forEach(r => {
            if (allSelected) { if (selectedRolls.includes(r.id))  onToggleRoll(r.id); }
            else             { if (!selectedRolls.includes(r.id)) onToggleRoll(r.id); }
        });
    };

    const borderCls = isInterlining ? 'border-slate-200' : 'border-gray-200';
    const headerCls = isInterlining ? 'bg-slate-50 hover:bg-slate-100' : 'bg-gray-100 hover:bg-gray-200';

    return (
        <div className={`border rounded-lg overflow-hidden mb-3 ${borderCls}`}>
            <div
                className={`px-3 py-2 flex justify-between items-center cursor-pointer transition-colors ${headerCls}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {colorDot
                        ? <span className="w-3 h-3 rounded-full border border-gray-300 shrink-0" style={{ backgroundColor: colorDot }} />
                        : <Hash size={14} className="text-gray-500 shrink-0" />}
                    <span className="font-semibold text-sm text-gray-700">
                        {groupKey || 'No Reference / Unassigned'}
                    </span>
                    <span className="bg-white text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-500">
                        {rolls.length}
                    </span>
                </div>
                <button type="button" onClick={handleGroupToggle} className="text-xs text-blue-600 hover:underline font-medium">
                    {allSelected ? 'Deselect All' : 'Select All'}
                </button>
            </div>
            {isOpen && (
                <div className="p-2 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {rolls.map(roll => (
                        <label
                            key={roll.id}
                            className={`flex items-center p-2 border rounded cursor-pointer transition-colors ${
                                isInterlining ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-100 hover:bg-blue-50'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={selectedRolls.includes(roll.id)}
                                onChange={() => onToggleRoll(roll.id)}
                                className={`h-4 w-4 rounded focus:ring-blue-500 ${isInterlining ? 'text-slate-600' : 'text-blue-600'}`}
                            />
                            <div className="ml-3 flex flex-col min-w-0">
                                <span className="text-sm font-medium text-gray-700 truncate">
                                    {roll.type || roll.fabric_type} – {roll.color || roll.color_name || roll.fabric_color || 'Generic'}
                                </span>
                                <span className="text-xs text-gray-500">
                                    Roll #{roll.id}{roll.bale_no ? ` · ${roll.bale_no}` : ''} · {roll.meter} {roll.uom === 'yard' ? 'yd' : 'm'}
                                </span>
                            </div>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── SO / SOP context card (shown in Overview when context is available) ────
const SOContextCard = ({ sopContext }) => {
    if (!sopContext?.sales_order) return null;
    const { sales_order: so, sales_order_product: sop, colors = [], fabric_requirements: fabReqs = [] } = sopContext;

    return (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-100 p-4 space-y-4">
            {/* SO header row */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Sales Order</p>
                    <p className="text-base font-bold text-slate-800 mt-0.5">{so.order_number}</p>
                    <p className="text-sm text-slate-600">{so.customer_name}</p>
                    {so.buyer_po_number && (
                        <p className="text-xs text-slate-400 mt-0.5">Buyer PO: {so.buyer_po_number}</p>
                    )}
                </div>
                <div className="text-right shrink-0 space-y-1.5">
                    <span className="inline-block text-xs font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        {so.status}
                    </span>
                    {so.delivery_date && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 justify-end">
                            <Calendar size={11} />
                            <span>{new Date(so.delivery_date).toLocaleDateString('en', { dateStyle: 'medium' })}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* SOP product strip */}
            {sop && (
                <div className="flex items-center gap-3 p-3 bg-white/70 rounded-lg border border-indigo-100">
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{sop.product_name}</p>
                        <p className="text-xs text-slate-500">{sop.fabric_type_name}</p>
                    </div>
                    {sop.bom_name && (
                        <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-100 px-2 py-1 rounded-lg font-bold whitespace-nowrap">
                            BOM: {sop.bom_name} ✓
                        </span>
                    )}
                    {sop.production_readiness && sop.production_readiness !== 'in_planning' && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-1 rounded-lg font-bold">
                            Ready
                        </span>
                    )}
                </div>
            )}

            {/* Color chips */}
            {colors.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Order Colors</p>
                    <div className="flex flex-wrap gap-2">
                        {colors.map(c => (
                            <div key={c.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                                <span className="w-3 h-3 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: c.color_name?.toLowerCase() }} />
                                <span className="text-xs font-semibold text-slate-700">{c.color_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{c.color_number}</span>
                                <span className="text-xs text-slate-500">{c.quantity?.toLocaleString()} pcs</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Fabric requirements progress */}
            {fabReqs.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Fabric Requirements</p>
                    <div className="space-y-1.5">
                        {fabReqs.map(req => {
                            const pct = req.meters_required > 0
                                ? Math.min(100, (req.meters_reserved / req.meters_required) * 100)
                                : 0;
                            return (
                                <div key={req.id} className="flex items-center gap-3 p-2.5 bg-white/80 rounded-lg border border-slate-100">
                                    <span className="w-3 h-3 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: req.color_name?.toLowerCase() }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-slate-700 truncate">
                                            {req.fabric_type_name} – {req.color_name}
                                            {req.color_number && <span className="font-normal text-slate-400 ml-1">({req.color_number})</span>}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-1.5 rounded-full ${req.is_fulfilled ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                                {req.meters_reserved?.toFixed(1)}/{req.meters_required?.toFixed(1)} m
                                            </span>
                                        </div>
                                    </div>
                                    {req.is_fulfilled
                                        ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                                        : <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main form ─────────────────────────────────────────────────────────────
const CreateProductionBatchForm = () => {
    const navigate   = useNavigate();
    const location   = useLocation();
    const { batchId } = useParams();
    const [searchParams] = useSearchParams();

    const prefillSalesOrderId        = searchParams.get('salesOrderId');
    const prefillSalesOrderProductId = searchParams.get('salesOrderProductId');
    const prefillFabricRollId        = searchParams.get('prefillFabricRollId');
    const isEditMode = Boolean(batchId);

    const isInitPortal = location.pathname.includes('/initialization-portal');
    const returnPath   = isInitPortal ? '/initialization-portal/dashboard' : '/production-manager/dashboard';
    const returnLabel  = isInitPortal ? 'Back to Dashboard' : 'Back to Workflow';

    // ── Core form state ───────────────────────────────────────────────────
    const [productId,       setProductId]       = useState('');
    const [lineId,          setLineId]          = useState('');
    const [layerLength,     setLayerLength]     = useState('');
    const [notes,           setNotes]           = useState('');
    const [plannedCutQty,   setPlannedCutQty]   = useState('');
    const [sopContext,      setSopContext]       = useState(null);
    const [ratiosAutoFilled, setRatiosAutoFilled] = useState(false);

    const [sizeRatios, setSizeRatios] = useState([]);

    const [selectedShellRolls, setSelectedShellRolls] = useState([]);

    const [interliningTemplates,  setInterliningTemplates]  = useState([]);
    const [selectedTemplateId,    setSelectedTemplateId]    = useState('');
    const [interliningConfirmed,  setInterliningConfirmed]  = useState(false);

    const [options, setOptions] = useState({
        products: [], availableRolls: [], fabricTypes: [],
        fabricColors: [], productionLines: [],
    });

    const [isLoading, setIsLoading]         = useState(true);
    const [isSaving,  setIsSaving]          = useState(false);
    const [error,     setError]             = useState(null);
    const [success,   setSuccess]           = useState(null);
    const [fabricTypeFilter,  setFabricTypeFilter]  = useState('');
    const [fabricColorFilter, setFabricColorFilter] = useState('');
    const [activeTab, setActiveTab]         = useState('overview');

    // ── 1. Initial data load ──────────────────────────────────────────────
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [typesRes, colorsRes, templatesRes, sizesRes] = await Promise.all([
                    productionManagerApi.getFabricTypes(),
                    productionManagerApi.getFabricColors(),
                    initializationPortalApi.getInterliningTemplates(),
                    accountingApi.getSizes(),
                ]);
                const SIZE_SORT_ORDER = [
                    'XXS','XS','S','M','L','XL','XXL','2XL','3XL','4XL','5XL','6XL',
                    '24','26','28','30','32','34','36','38','40','42','44','46','48','50',
                ];
                const apiSizes = (sizesRes.data || []).sort((a, b) => {
                    const iA = SIZE_SORT_ORDER.indexOf(a.name);
                    const iB = SIZE_SORT_ORDER.indexOf(b.name);
                    if (iA !== -1 && iB !== -1) return iA - iB;
                    if (iA !== -1) return -1;
                    if (iB !== -1) return 1;
                    return a.name.localeCompare(b.name, undefined, { numeric: true });
                });

                const commonOptions = {
                    fabricTypes:  typesRes.data  || [],
                    fabricColors: colorsRes.data || [],
                };
                setInterliningTemplates(templatesRes.data || []);

                if (isEditMode) {
                    const res  = await productionManagerApi.getBatchForEdit(batchId);
                    const data = res.data;
                    console.log('[EditBatch] raw API response:', JSON.parse(JSON.stringify(data)));

                    // Handle both API shapes: { batchDetails, ... } or { batch, ... }
                    const batchDetails = data?.batchDetails ?? data?.batch ?? data;
                    if (!batchDetails) throw new Error('Batch data not found.');

                    setProductId(String(batchDetails.product_id || ''));
                    setLineId(String(batchDetails.assigned_production_line_id || ''));
                    setLayerLength(batchDetails.length_of_layer_inches || '');
                    setNotes(batchDetails.notes || '');
                    setSelectedTemplateId(
                        batchDetails.interlining_template_id
                            ? String(batchDetails.interlining_template_id)
                            : ''
                    );
                    const notesMatch = (batchDetails.notes || '').match(/Planned Qty: (\d+)/);
                    if (notesMatch) setPlannedCutQty(notesMatch[1]);
                    if (batchDetails.interlining_template_id) setInterliningConfirmed(true);

                    const savedRatios = data.size_ratios || batchDetails.size_ratios || [];
                    setSizeRatios(apiSizes.map(s => {
                        const found = savedRatios.find(r => String(r.size) === String(s.name));
                        return { size: s.name, ratio: found ? String(found.ratio) : '' };
                    }));

                    const available   = data.available_rolls   || [];
                    const assignedIds = data.assigned_roll_ids
                        || (batchDetails.rolls || []).map(r => (typeof r === 'object' ? r.id : r));
                    const shellIds    = assignedIds.filter(id => {
                        const roll = available.find(r => r.id === id);
                        return roll && !(roll.type || '').toLowerCase().includes('interlining');
                    });
                    setSelectedShellRolls(shellIds);
                    setOptions({
                        ...commonOptions,
                        products:        data.products        || [],
                        availableRolls:  available,
                        productionLines: data.production_lines || [],
                        fabricColors:    commonOptions.fabricColors,
                    });

                } else {
                    const formDataRes = await productionManagerApi.getFormData({
                        ...(prefillSalesOrderId        && { sales_order_id:         prefillSalesOrderId }),
                        ...(prefillSalesOrderProductId && { sales_order_product_id: prefillSalesOrderProductId }),
                    });
                    const fd = formDataRes.data;

                    // Capture SOP context for UI enrichment
                    setSopContext(fd.sales_order ? fd : null);

                    // Auto-fill product from SOP
                    if (fd.sales_order_product?.product_id) {
                        setProductId(String(fd.sales_order_product.product_id));
                    } else {
                        setProductId('');
                    }

                    // Auto-fill size ratios from suggestion
                    const suggested = fd.suggested_size_ratios || [];
                    if (suggested.length > 0) {
                        const newRatios = apiSizes.map(s => {
                            const found = suggested.find(r => String(r.size) === String(s.name));
                            return { size: s.name, ratio: found ? String(found.ratio) : '' };
                        });
                        const hasAny = newRatios.some(r => r.ratio !== '');
                        setSizeRatios(newRatios);
                        setRatiosAutoFilled(hasAny);
                    } else {
                        setSizeRatios(apiSizes.map(s => ({ size: s.name, ratio: '' })));
                        setRatiosAutoFilled(false);
                    }

                    setLayerLength('');
                    setNotes('');
                    setSelectedTemplateId('');
                    setInterliningConfirmed(false);
                    // Seed selection from ?prefillFabricRollId=<id> when arriving from the
                    // EndBit-merge flow; otherwise start with no rolls selected.
                    setSelectedShellRolls(prefillFabricRollId ? [parseInt(prefillFabricRollId, 10)] : []);

                    setOptions({
                        ...commonOptions,
                        products:        fd.products        || [],
                        availableRolls:  fd.fabric_rolls    || fd.fabricRolls || [],
                        productionLines: fd.production_lines || [],
                    });
                }
            } catch (err) {
                console.error('Error loading form data:', err);
                setError(err.response?.data?.error || err.message || 'Could not load data.');
            } finally { setIsLoading(false); }
        };
        loadData();
    }, [batchId, isEditMode, prefillSalesOrderId, prefillSalesOrderProductId, prefillFabricRollId]);

    // ── 3. Derived values ─────────────────────────────────────────────────
    const productIsLocked     = !isEditMode && !!sopContext?.sales_order_product;
    const selectedProductName = sopContext?.sales_order_product?.product_name
        || options.products.find(p => String(p.id) === String(productId))?.name
        || '—';

    // Shell roll filtering
    const filteredShellRolls = useMemo(() => {
        return (options.availableRolls || []).filter(roll => {
            const rollType = (roll.type || roll.fabric_type || '').toLowerCase();
            if (rollType.includes('interlining') || rollType.includes('fusing')) return false;
            const rollColor = roll.color || roll.color_name || roll.fabric_color;
            const typeMatch  = !fabricTypeFilter  || rollType === fabricTypeFilter.toLowerCase();
            const colorMatch = !fabricColorFilter || rollColor === fabricColorFilter;
            return typeMatch && colorMatch;
        });
    }, [options.availableRolls, fabricTypeFilter, fabricColorFilter]);

    // Group rolls by color (SOP context) or reference number (plain mode)
    const shellGroups = useMemo(() => {
        const groups = {};
        filteredShellRolls.forEach(roll => {
            const key = sopContext
                ? (roll.color_name || roll.color || roll.fabric_color || 'Unknown')
                : (roll.reference_number || 'No Reference');
            if (!groups[key]) groups[key] = [];
            groups[key].push(roll);
        });
        return groups;
    }, [filteredShellRolls, sopContext]);

    // ── 4. Interlining ────────────────────────────────────────────────────
    const selectedTemplate = useMemo(() =>
        interliningTemplates.find(t => String(t.id) === String(selectedTemplateId)),
    [interliningTemplates, selectedTemplateId]);

    useEffect(() => { setInterliningConfirmed(false); }, [selectedTemplateId]);

    const selectedShellDetails = useMemo(() =>
        (options.availableRolls || []).filter(r => selectedShellRolls.includes(r.id)),
    [selectedShellRolls, options.availableRolls]);

    const interliningRequirements = useMemo(() => {
        if (!selectedTemplate || !layerLength || !selectedShellDetails.length) return [];
        const totalRatio = sizeRatios.reduce((s, r) => s + (parseInt(r.ratio) || 0), 0);
        if (totalRatio === 0) return [];

        const byColor = {};
        selectedShellDetails.forEach(roll => {
            const convFactor = roll.uom === 'yard' ? 36 : 39.3701;
            const rollInches = (parseFloat(roll.meter) || 0) * convFactor;
            const lays       = Math.floor(rollInches / parseFloat(layerLength));
            const pieces     = lays * totalRatio;
            const colorObj   = options.fabricColors.find(c => String(c.id) === String(roll.color_id));
            if (colorObj) {
                const mapping = selectedTemplate.mappings.find(m => m.fabric_color_id == colorObj.id);
                if (mapping) {
                    const iId = mapping.interlining_color_id;
                    if (!byColor[iId]) {
                        const iObj = options.fabricColors.find(c => c.id === iId);
                        byColor[iId] = {
                            id: iId,
                            name: mapping.interlining_color || (iObj ? iObj.name : 'Unknown'),
                            required: 0, potentialPieces: 0,
                        };
                    }
                    byColor[iId].required       += pieces * parseFloat(selectedTemplate.consumption_per_piece);
                    byColor[iId].potentialPieces += pieces;
                }
            }
        });
        return Object.values(byColor);
    }, [selectedTemplate, layerLength, sizeRatios, selectedShellDetails, options.fabricColors]);

    // ── Handlers ──────────────────────────────────────────────────────────
    const handleRatioChange = (index, value) => {
        if (value === '' || /^[0-9]+$/.test(value))
            setSizeRatios(prev => prev.map((r, i) => i === index ? { ...r, ratio: value } : r));
    };

    const handleShellSelection = rollId =>
        setSelectedShellRolls(prev =>
            prev.includes(rollId) ? prev.filter(id => id !== rollId) : [...prev, rollId]
        );

    // ── Submit (payload unchanged) ────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isEditMode && (!prefillSalesOrderId || !prefillSalesOrderProductId)) {
            setError('Sales order context is required. Please open this form from the workflow dashboard.');
            return;
        }
        if (!productId)                { setError('Product selection is required.'); return; }
        if (!selectedShellRolls.length){ setError('At least one shell fabric roll must be selected.'); return; }
        if (!isEditMode && selectedTemplateId && !interliningConfirmed) {
            setError('Please approve the interlining requirements in the Interlining tab.');
            setActiveTab('interlining');
            return;
        }

        setIsSaving(true);
        setError(null);
        setSuccess(null);
        try {
            if (isEditMode) {
                await productionManagerApi.updateBatch(batchId, {
                    product_id:                  parseInt(productId, 10),
                    assigned_production_line_id: lineId ? parseInt(lineId, 10) : null,
                    length_of_layer_inches:      layerLength ? parseFloat(layerLength) : null,
                    notes:                       notes || null,
                    size_ratios: sizeRatios
                        .map(r => ({ ...r, ratio: parseInt(r.ratio, 10) }))
                        .filter(r => !isNaN(r.ratio) && r.ratio > 0),
                    rolls: selectedShellRolls.map(id => parseInt(id, 10)),
                });
                setSuccess('Batch updated successfully.');
                setIsSaving(false);
                return;
            } else {
                const metaNotes = `\n[System Info] Planned Qty: ${Math.round(interliningRequirements.reduce((acc, r) => acc + r.potentialPieces, 0))} | Interlining Template: ${selectedTemplate?.interlining_type || 'None'}`;
                await productionManagerApi.create({
                    sales_order_id:           parseInt(prefillSalesOrderId, 10),
                    sales_order_product_id:   parseInt(prefillSalesOrderProductId, 10),
                    product_id:               productId,
                    length_of_layer_inches:   layerLength || null,
                    notes:                    (notes || '') + metaNotes,
                    interlining_template_id:  selectedTemplateId || null,
                    interlining_requirements: interliningRequirements.map(req => ({
                        interlining_color_id: req.id,
                        required_meters:      req.required.toFixed(2),
                    })),
                    size_ratios: sizeRatios
                        .map(r => ({ ...r, ratio: parseInt(r.ratio, 10) }))
                        .filter(r => !isNaN(r.ratio) && r.ratio > 0),
                    rolls: selectedShellRolls,
                });
            }
            navigate(returnPath);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'An unexpected error occurred.');
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    const totalRatio = sizeRatios.reduce((s, r) => s + (parseInt(r.ratio) || 0), 0);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <Link to={returnPath} className="text-sm text-blue-600 hover:underline flex items-center mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> {returnLabel}
            </Link>

            <form onSubmit={handleSubmit} className="flex flex-col bg-white rounded-lg shadow border overflow-hidden">

                {/* Form header */}
                <div className="p-4 border-b">
                    <h1 className="text-2xl font-bold text-gray-800">
                        {isEditMode ? 'Edit Production Batch' : 'Create New Production Batch'}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {isEditMode ? `Updating Batch ID: ${batchId}` : 'Configure batch settings and assign fabric rolls.'}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex border-b overflow-x-auto">
                    <TabButton label="Overview"     icon={Package}  isActive={activeTab === 'overview'}    onClick={() => setActiveTab('overview')} />
                    <TabButton label="Size Ratios"  icon={Ruler}    isActive={activeTab === 'ratios'}      onClick={() => setActiveTab('ratios')}
                        badge={ratiosAutoFilled ? 'Auto' : null} />
                    <TabButton label="Shell Fabric" icon={Layers}   isActive={activeTab === 'rolls'}       onClick={() => setActiveTab('rolls')}
                        badge={selectedShellRolls.length > 0 ? selectedShellRolls.length : null} />
                    <TabButton label="Interlining"  icon={Scissors} isActive={activeTab === 'interlining'} onClick={() => setActiveTab('interlining')} />
                </div>

                <div className="p-6">
                    {error && <ErrorDisplay message={error} />}
                    {success && (
                        <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
                            {success}
                        </div>
                    )}

                    {/* ── OVERVIEW ───────────────────────────────────── */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">

                            {/* SO / SOP context card */}
                            <SOContextCard sopContext={sopContext} />

                            {/* Product */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Product*</label>
                                {productIsLocked ? (
                                    <div className="mt-1 flex items-center gap-2 p-2.5 bg-violet-50 border border-violet-100 rounded-md">
                                        <Tag size={14} className="text-violet-500 shrink-0" />
                                        <span className="text-sm font-semibold text-violet-700 flex-1 truncate">{selectedProductName}</span>
                                        <span className="text-[10px] bg-violet-100 text-violet-500 px-1.5 py-0.5 rounded font-bold shrink-0">From SO</span>
                                    </div>
                                ) : (
                                    <select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 p-2 w-full border rounded-md" required>
                                        <option value="">Select Product</option>
                                        {options.products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                )}
                            </div>

                            {/* Production Line (edit mode only) */}
                            {isEditMode && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Production Line</label>
                                    <select value={lineId} onChange={e => setLineId(e.target.value)} className="mt-1 p-2 w-full border rounded-md">
                                        <option value="">Select Line</option>
                                        {options.productionLines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Batch settings */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3">Batch Settings</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium">Planned Cut Quantity (Pcs)</label>
                                        <input
                                            type="number" value={plannedCutQty}
                                            onChange={e => setPlannedCutQty(e.target.value)}
                                            placeholder="Estimated output…"
                                            className="mt-1 p-2 w-full border rounded-md"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Used to estimate interlining requirements.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium">Layer Length (inches)</label>
                                        <input
                                            type="number" step="0.01" value={layerLength}
                                            onChange={e => setLayerLength(e.target.value)}
                                            className="mt-1 p-2 w-full border rounded-md"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium">Notes</label>
                                        <textarea
                                            value={notes} onChange={e => setNotes(e.target.value)}
                                            rows={3} className="mt-1 p-2 w-full border rounded-md"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── SIZE RATIOS ────────────────────────────────── */}
                    {activeTab === 'ratios' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-semibold text-gray-800">Size Ratios</h3>
                                {ratiosAutoFilled && (
                                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">
                                        <CheckCircle size={12} /> Auto-filled from Sales Order
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
                                {sizeRatios.map((ratio, index) => (
                                    <div key={ratio.size}>
                                        <label className="block text-sm font-medium text-center">{ratio.size}</label>
                                        <input
                                            type="number" placeholder="0" min="0"
                                            value={ratio.ratio}
                                            onChange={e => handleRatioChange(index, e.target.value)}
                                            className="mt-1 block w-full p-2 border rounded-md text-center"
                                        />
                                    </div>
                                ))}
                            </div>
                            {totalRatio > 0 && (
                                <p className="text-xs text-gray-400">
                                    Total: <span className="font-semibold text-gray-600">{totalRatio}</span> pieces per lay
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── SHELL FABRIC ───────────────────────────────── */}
                    {activeTab === 'rolls' && (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-800">Assign Shell Fabric Rolls*</h3>
                                {selectedShellRolls.length > 0 && (
                                    <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                                        {selectedShellRolls.length} roll{selectedShellRolls.length !== 1 ? 's' : ''} selected
                                    </span>
                                )}
                            </div>

                            {/* Type / color filters — only when no SOP context */}
                            {!sopContext && (
                                <div className="grid grid-cols-2 gap-4">
                                    <select value={fabricTypeFilter}  onChange={e => setFabricTypeFilter(e.target.value)}  className="p-2 border rounded-md bg-gray-50">
                                        <option value="">Filter by Type</option>
                                        {options.fabricTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                    </select>
                                    <select value={fabricColorFilter} onChange={e => setFabricColorFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50">
                                        <option value="">Filter by Color</option>
                                        {options.fabricColors.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* Fabric requirement status badges (SOP context only) */}
                            {sopContext?.fabric_requirements?.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {sopContext.fabric_requirements.map(req => (
                                        <div
                                            key={req.id}
                                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${
                                                req.is_fulfilled
                                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                                    : 'bg-amber-50 border-amber-100 text-amber-700'
                                            }`}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full border border-current/20" style={{ backgroundColor: req.color_name?.toLowerCase() }} />
                                            {req.color_name} · {req.meters_reserved?.toFixed(1)}/{req.meters_required?.toFixed(1)} m
                                            {req.is_fulfilled
                                                ? <CheckCircle size={11} />
                                                : <AlertTriangle size={11} />}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="max-h-96 overflow-y-auto p-2 border rounded-md bg-gray-50/50">
                                {Object.keys(shellGroups).sort().length > 0
                                    ? Object.keys(shellGroups).sort().map(key => (
                                        <RollGroup
                                            key={key}
                                            groupKey={key}
                                            rolls={shellGroups[key]}
                                            selectedRolls={selectedShellRolls}
                                            onToggleRoll={handleShellSelection}
                                            colorDot={sopContext ? key.toLowerCase() : undefined}
                                        />
                                    ))
                                    : <p className="text-center text-gray-500 py-6">
                                        No shell rolls available.
                                    </p>
                                }
                            </div>
                        </div>
                    )}

                    {/* ── INTERLINING ────────────────────────────────── */}
                    {activeTab === 'interlining' && (
                        <div className="space-y-6">
                            {selectedShellRolls.length === 0 && (
                                <div className="p-4 bg-amber-100 text-amber-800 rounded-lg flex items-center gap-3">
                                    <AlertTriangle className="h-5 w-5 shrink-0" />
                                    <span>Please select Shell Fabric Rolls in the "Shell Fabric" tab first.</span>
                                </div>
                            )}

                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
                                <h4 className="text-sm font-bold text-amber-800 mb-3">Interlining Calculator</h4>
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
                                                <option key={t.id} value={t.id}>
                                                    {t.interlining_type} ({t.consumption_per_piece}m/pc)
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                {selectedTemplate && (
                                    <div className="mt-4 bg-white rounded-md border border-amber-200 overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-amber-100/50 text-amber-900">
                                                <tr>
                                                    <th className="p-2">Interlining Color</th>
                                                    <th className="p-2 text-right">Est. Pieces</th>
                                                    <th className="p-2 text-right">Required (m)</th>
                                                    <th className="p-2 text-center">Basis</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-50">
                                                {interliningRequirements.map((req, idx) => (
                                                    <tr key={idx}>
                                                        <td className="p-2 font-medium">{req.name}</td>
                                                        <td className="p-2 text-right">{Math.round(req.potentialPieces)}</td>
                                                        <td className="p-2 text-right font-mono font-bold text-amber-700">{req.required.toFixed(2)}</td>
                                                        <td className="p-2 text-center text-xs text-gray-500">
                                                            {req.potentialPieces > 0 ? 'Selected Rolls' : 'No rolls'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {interliningRequirements.length === 0 && (
                                                    <tr>
                                                        <td colSpan="4" className="p-4 text-center text-gray-400">
                                                            Select shell rolls and define Layer Length to calculate.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {selectedTemplate && interliningRequirements.length > 0 && (
                                <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <label className="flex items-start cursor-pointer">
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                checked={interliningConfirmed}
                                                onChange={e => setInterliningConfirmed(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="ml-3 text-sm">
                                            <span className="font-bold text-slate-800">I verify and approve the above interlining requirements.</span>
                                            <p className="text-gray-500 text-xs mt-1">
                                                Confirms that the calculated interlining quantity is sufficient and available for production.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                    <button type="button" onClick={() => navigate(returnPath)} className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md font-semibold hover:bg-gray-300">
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving || isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md font-semibold disabled:bg-gray-400 hover:bg-blue-700"
                    >
                        {isSaving ? 'Saving…' : (isEditMode ? 'Save Changes' : 'Create Batch')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateProductionBatchForm;

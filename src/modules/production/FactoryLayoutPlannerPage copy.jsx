import React, { useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { 
    LuGripVertical, LuUser, LuPackage, LuLayoutGrid, LuTruck, LuUsers, 
    LuPlus, LuX, LuSearch, LuChevronDown, LuChevronRight, LuPencil, LuTrash2 
} from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8 h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
const Placeholder = ({ text }) => <div className="p-8 text-center bg-slate-50 rounded-lg h-full flex items-center justify-center border-2 border-dashed border-slate-200"><p className="text-sm text-slate-400 font-medium">{text}</p></div>;

// --- DRAGGABLE CHIPS ---
const DraggableChip = ({ item, type, onDragStart, icon: Icon, colorClass }) => (
    <div
        className={`p-2 rounded shadow-sm flex items-center cursor-grab transition-transform hover:scale-[1.02] ${colorClass}`}
        draggable
        onDragStart={(e) => onDragStart(e, item, type)}
        data-item-id={item.id}
    >
         <LuGripVertical className="opacity-40 mr-2 flex-shrink-0" />
         <Icon className="mr-2 opacity-60" size={14} flex-shrink-0 />
         <span className="font-medium text-sm truncate">{item.name}</span>
    </div>
);

// --- COLLAPSIBLE PRODUCTION LINE COMPONENT ---
const ProductionLine = ({ line, onDragOver, onDrop, onDragLeave, onDragStart, onEditClick, onDeleteClick }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [operatorSearch, setOperatorSearch] = useState('');
    
    const filteredOperators = line.operators?.filter(op => 
        op.name.toLowerCase().includes(operatorSearch.toLowerCase())
    ) || [];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 relative overflow-hidden flex-shrink-0 transition-all duration-300">
            {/* Accent Bar */}
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
            
            {/* INTERACTIVE HEADER (Click to Collapse/Expand) */}
            <div 
                className="flex flex-col sm:flex-row justify-between sm:items-center p-4 pl-5 cursor-pointer hover:bg-slate-50 transition-colors border-b border-transparent data-[expanded=true]:border-slate-100"
                data-expanded={isExpanded}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                 <div className="flex items-center gap-3">
                     <div className="text-slate-400 hover:text-indigo-500 transition-colors">
                        {isExpanded ? <LuChevronDown size={22} /> : <LuChevronRight size={22} />}
                     </div>
                     <h2 className="text-lg font-bold text-slate-800 flex items-center">
                         <LuLayoutGrid className="mr-2 text-indigo-500" size={18}/>{line.name}
                     </h2>

                     {/* // Inside ProductionLine component, around line 43: */}
                        {!isExpanded && (
                            <div className="hidden sm:flex items-center gap-2 ml-4 animate-in fade-in duration-300">
                            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-xs font-bold border border-emerald-100 flex items-center">
                                <LuUsers className="mr-1" size={12}/> {line.operators?.length || 0} Staff
                            </span>
                            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md text-xs font-bold border border-blue-100 flex items-center">
                                <LuPackage className="mr-1" size={12}/> {line.workstations?.length || 0} Machines
                            </span>
                            
                            {/* NEW: Display the WIP Limit */}
                            <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md text-xs font-bold border border-amber-100 flex items-center" title="Max Active Batches Allowed">
                                WIP Limit: {line.wip_limit || 5}
                            </span>

                            {(line.line_manager_name || line.line_loader_name) && (
                                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-bold border border-slate-200">
                                    Assigned: {line.line_manager_name ? 'Mgr' : ''} {line.line_manager_name && line.line_loader_name ? '&' : ''} {line.line_loader_name ? 'Ldr' : ''}
                                </span>
                            )}
                            </div>
                        )}
                 </div>
                 
                 <div className="flex items-center gap-2 mt-3 sm:mt-0" onClick={(e) => e.stopPropagation()}>
                    <button 
                        onClick={() => onEditClick(line)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        title="Edit Line"
                    >
                        <LuPencil size={18} />
                    </button>
                    <button 
                        onClick={() => onDeleteClick(line.id, line.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="Delete Line"
                    >
                        <LuTrash2 size={18} />
                    </button>
                 </div>
            </div>

            {/* EXPANDABLE BODY */}
            {isExpanded && (
                <div className="p-5 pl-6 pt-2 animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="flex flex-wrap gap-3 mb-5">
                        <div
                            className="border border-dashed border-slate-300 rounded-lg p-2 min-w-[160px] bg-slate-50 transition-colors"
                            data-line-id={line.id} data-drop-type="manager"
                            onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
                        >
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Line Manager</p>
                            {line.line_manager_name 
                                ? <DraggableChip item={{ id: line.line_manager_user_id, name: line.line_manager_name }} type="manager" onDragStart={onDragStart} icon={LuUser} colorClass="bg-purple-100 text-purple-800 border border-purple-200" />
                                : <span className="text-xs text-slate-400 italic">Drag Manager Here</span>
                            }
                        </div>
                        <div
                            className="border border-dashed border-slate-300 rounded-lg p-2 min-w-[160px] bg-slate-50 transition-colors"
                            data-line-id={line.id} data-drop-type="loader"
                            onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
                        >
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Material Loader</p>
                            {line.line_loader_name 
                                ? <DraggableChip item={{ id: line.line_loader_user_id, name: line.line_loader_name }} type="loader" onDragStart={onDragStart} icon={LuTruck} colorClass="bg-orange-100 text-orange-800 border border-orange-200" />
                                : <span className="text-xs text-slate-400 italic">Drag Loader Here</span>
                            }
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            className="border-2 border-dashed border-slate-200 rounded-lg p-4 min-h-[140px] bg-slate-50/50"
                            data-line-id={line.id} data-drop-type="workstation"
                            onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
                        >
                            <p className="text-xs font-bold text-slate-500 mb-3 flex items-center"><LuPackage className="mr-1"/> Workstations Sequence</p>
                            <div className="flex flex-wrap gap-2">
                                {line.workstations?.length > 0 ? line.workstations.map(ws => 
                                    <DraggableChip key={ws.id} item={ws} type="workstation" onDragStart={onDragStart} icon={LuPackage} colorClass="bg-blue-50 text-blue-700 border border-blue-200" />
                                ) : <span className="text-sm text-slate-400 w-full text-center py-4">Drop workstations in order</span>}
                            </div>
                        </div>

                        <div
                            className="border-2 border-dashed border-slate-200 rounded-lg p-4 min-h-[140px] bg-slate-50/50 flex flex-col"
                            data-line-id={line.id} data-drop-type="operator"
                            onDragOver={onDragOver} onDrop={onDrop} onDragLeave={onDragLeave}
                        >
                            <div className="flex justify-between items-center mb-3 gap-2">
                                <p className="text-xs font-bold text-slate-500 flex items-center whitespace-nowrap">
                                    <LuUsers className="mr-1"/> Assigned Staff
                                </p>
                                <div className="flex items-center gap-2 w-full max-w-[200px]">
                                    <div className="relative w-full">
                                        <LuSearch className="absolute left-2 top-1.5 text-slate-400" size={12} />
                                        <input 
                                            type="text" placeholder="Find operator..." 
                                            className="w-full pl-6 pr-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                            value={operatorSearch} onChange={(e) => setOperatorSearch(e.target.value)}
                                        />
                                    </div>
                                    <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">
                                        {line.operators?.length || 0}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 flex-1 content-start">
                                {filteredOperators.length > 0 ? filteredOperators.map(op => 
                                    <DraggableChip key={op.id} item={op} type="operator" onDragStart={onDragStart} icon={LuUser} colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs py-1" />
                                ) : (
                                    <span className="text-sm text-slate-400 w-full text-center py-4">
                                        {line.operators?.length > 0 ? "No matches found." : "Drop available operators here"}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MAIN PAGE ---
export default function FactoryLayoutPlannerPage() {
    const [lines, setLines] = useState([]);
    const [palettes, setPalettes] = useState({ workstation: [], manager: [], loader: [], operator: [] });
    const [lineTypes, setLineTypes] = useState([]);
    const [search, setSearch] = useState({ manager: '', loader: '', operator: '', workstation: '' });

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    // NEW STATE: Added output_attributes to handle dynamic JSON tracking
    const [lineFormData, setLineFormData] = useState({ 
        id: null, 
        name: '', 
        production_line_type_id: '',
       output_attributes: ['Total Quantity'],
        wip_limit: 5 
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [layoutRes, typesRes] = await Promise.all([
                productionManagerApi.getFactoryLayoutData(),
                productionManagerApi.getLineTypes()
            ]);
            
            setLines(layoutRes.data.lines || []);
            setPalettes({
                workstation: layoutRes.data.availableWorkstations || [],
                manager: layoutRes.data.availableManagers || [],
                loader: layoutRes.data.availableLoaders || [],
                operator: layoutRes.data.availableOperators || []
            });
            setLineTypes(typesRes.data || []);
        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // --- LINE CRUD OPERATIONS ---
    const openCreateModal = () => {
        setIsEditing(false);
        setLineFormData({ 
            id: null, 
            name: '', 
            production_line_type_id: '',
           output_attributes: ['Total Quantity'],
            wip_limit: 5
        });
        setIsModalOpen(true);
    };

    const openEditModal = (line) => {
        setIsEditing(true);
        setLineFormData({ 
            id: line.id, 
            name: line.name, 
            production_line_type_id: line.production_line_type_id || '',
            output_attributes: line.output_attributes && line.output_attributes.length > 0 ? line.output_attributes : ['Total Quantity'],
            wip_limit: line.wip_limit !== undefined ? line.wip_limit : 5 // NEW: Load existing limit
        });
        setIsModalOpen(true);
    };

    const handleSaveLine = async (e) => {
        e.preventDefault(); // Prevent page reload
        
        // 1. Explicit Manual Validation (Fixes the silent block)
        if (!lineFormData.name || !lineFormData.name.trim()) {
            return alert("Please enter a Line Name.");
        }
        if (!lineFormData.production_line_type_id) {
            return alert("Please select a Process Type.");
        }
        if (!lineFormData.output_attributes || lineFormData.output_attributes.length === 0) {
            return alert("Please add at least one Tracked Output Attribute (e.g., Total Quantity).");
        }

        // 2. Trigger loading state
        setIsSaving(true); 

        try {
            if (isEditing) {
                await productionManagerApi.updateProductionLine(lineFormData.id, lineFormData);
            } else {
                await productionManagerApi.createProductionLine(lineFormData);
            }
            setIsModalOpen(false); // Close modal on success
            fetchData();           // Refresh the background data
        } catch (error) {
            console.error("Save Error:", error);
            alert(error.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} line. Please check console.`);
        } finally {
            setIsSaving(false); // Turn off loading state whether it succeeds or fails
        }
    };

    const handleDeleteLine = async (lineId, lineName) => {
        if (!window.confirm(`Are you sure you want to delete "${lineName}"?\nThis will unassign all staff and workstations immediately.`)) return;
        
        try {
            await productionManagerApi.deleteProductionLine(lineId);
            fetchData();
        } catch (error) {
            alert(error.response?.data?.error || "Cannot delete this line because it is referenced by historical production batches.");
        }
    };

    const getFilteredPalette = (type) => palettes[type].filter(item => item.name.toLowerCase().includes(search[type].toLowerCase()));

    // --- NATIVE DRAG & DROP LOGIC ---
    const handleDragStart = (e, item, type) => {
        e.dataTransfer.setData('itemData', JSON.stringify(item));
        e.dataTransfer.setData('itemType', type);
        e.dataTransfer.setData('sourceLineId', e.target.closest('[data-line-id]')?.dataset.lineId || null);
        e.target.classList.add('opacity-50');
    };

    const handleDragOver = (e) => {
         e.preventDefault();
         e.currentTarget.classList.add('bg-indigo-50/50', 'border-indigo-300');
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('bg-indigo-50/50', 'border-indigo-300');
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        handleDragLeave(e);
        
        const itemType = e.dataTransfer.getData('itemType');
        const targetDropType = e.currentTarget.dataset.dropType;
        if (itemType !== targetDropType) return; 

        setIsSaving(true);
        const itemData = JSON.parse(e.dataTransfer.getData('itemData'));
        const sourceLineId = e.dataTransfer.getData('sourceLineId') === 'null' ? null : e.dataTransfer.getData('sourceLineId');
        const targetLineId = e.currentTarget.closest('[data-line-id]')?.dataset.lineId || null;

        if (sourceLineId === targetLineId) { setIsSaving(false); return; }

        try {
            if (itemType === 'workstation') {
                 let targetWorkstations = [];
                 if (targetLineId) {
                     const line = lines.find(l => l.id.toString() === targetLineId);
                     targetWorkstations = [...(line.workstations || []), itemData];
                     await productionManagerApi.updateLineLayout(targetLineId, targetWorkstations.map(w => w.id));
                 }
                 if (sourceLineId) {
                     const line = lines.find(l => l.id.toString() === sourceLineId);
                     const sourceWorkstations = line.workstations.filter(w => w.id !== itemData.id);
                     await productionManagerApi.updateLineLayout(sourceLineId, sourceWorkstations.map(w => w.id));
                 }
            } 
            else if (itemType === 'manager') {
                 if (sourceLineId) await productionManagerApi.assignManagerToLine(sourceLineId, null);
                 if (targetLineId) await productionManagerApi.assignManagerToLine(targetLineId, itemData.id);
            } 
            else if (itemType === 'loader') {
                 if (sourceLineId) await productionManagerApi.assignLoaderToLine(sourceLineId, null);
                 if (targetLineId) await productionManagerApi.assignLoaderToLine(targetLineId, itemData.id);
            }
            else if (itemType === 'operator') {
                await productionManagerApi.assignOperatorToLine(targetLineId, itemData.id);
            }
            await fetchData(); 
        } catch (error) {
            console.error("Update failed", error);
            alert("Failed to update assignment. Reverting.");
            fetchData();
        } finally {
             setIsSaving(false);
        }
    };

    return (
        <div className="p-6 sm:p-8 bg-slate-50 h-[calc(100vh-4rem)] flex flex-col">
            
            {/* Header & Create Button */}
            <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Factory Floor Planner</h1>
                    <p className="text-slate-500 mt-1">Design line layouts and assign HR resources in real-time.</p>
                </div>
                <button 
                    onClick={openCreateModal}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-sm transition-colors"
                >
                    <LuPlus className="mr-2" size={20} /> Add New Line
                </button>
            </div>

            {isLoading ? <Spinner /> : (
                <div className="flex-1 flex flex-col lg:flex-row gap-8 overflow-hidden">
                    
                    {/* LEFT SIDEBAR: Resource Palettes */}
                    <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 pb-10">
                        {/* Operator Palette */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-shrink-0">
                            <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider flex items-center justify-between">
                                <span className="flex items-center"><LuUsers className="mr-2 text-emerald-500"/> Unassigned Staff</span>
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px]">{palettes.operator.length}</span>
                            </h3>
                            <div className="relative mb-3">
                                <LuSearch className="absolute left-2.5 top-2 text-slate-400" size={14} />
                                <input type="text" placeholder="Search staff..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none" value={search.operator} onChange={e => setSearch({...search, operator: e.target.value})} />
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-[250px] overflow-y-auto" data-drop-type="operator" onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
                                {getFilteredPalette('operator').map(op => <DraggableChip key={op.id} item={op} type="operator" onDragStart={handleDragStart} icon={LuUser} colorClass="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs py-1 hover:bg-emerald-100" />)}
                                {getFilteredPalette('operator').length === 0 && <p className="text-xs text-slate-400 italic w-full text-center py-4">No staff found.</p>}
                            </div>
                        </div>

                        {/* Manager Palette */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-shrink-0">
                            <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider flex items-center"><LuUser className="mr-2 text-purple-500"/> Available Managers</h3>
                            <div className="relative mb-3">
                                <LuSearch className="absolute left-2.5 top-2 text-slate-400" size={14} />
                                <input type="text" placeholder="Search managers..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none" value={search.manager} onChange={e => setSearch({...search, manager: e.target.value})} />
                            </div>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto" data-drop-type="manager" onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
                                {getFilteredPalette('manager').map(m => <DraggableChip key={m.id} item={m} type="manager" onDragStart={handleDragStart} icon={LuUser} colorClass="bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100" />)}
                                {getFilteredPalette('manager').length === 0 && <p className="text-xs text-slate-400 italic text-center py-2">No managers found.</p>}
                            </div>
                        </div>

                        {/* Loader Palette */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-shrink-0">
                            <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider flex items-center"><LuTruck className="mr-2 text-orange-500"/> Available Loaders</h3>
                            <div className="relative mb-3">
                                <LuSearch className="absolute left-2.5 top-2 text-slate-400" size={14} />
                                <input type="text" placeholder="Search loaders..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none" value={search.loader} onChange={e => setSearch({...search, loader: e.target.value})} />
                            </div>
                            <div className="space-y-2 max-h-[200px] overflow-y-auto" data-drop-type="loader" onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
                                {getFilteredPalette('loader').map(l => <DraggableChip key={l.id} item={l} type="loader" onDragStart={handleDragStart} icon={LuTruck} colorClass="bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100" />)}
                                {getFilteredPalette('loader').length === 0 && <p className="text-xs text-slate-400 italic text-center py-2">No loaders found.</p>}
                            </div>
                        </div>

                        {/* Workstation Palette */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-shrink-0">
                            <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wider flex items-center"><LuPackage className="mr-2 text-blue-500"/> Unused Machines</h3>
                            <div className="relative mb-3">
                                <LuSearch className="absolute left-2.5 top-2 text-slate-400" size={14} />
                                <input type="text" placeholder="Search machines..." className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none" value={search.workstation} onChange={e => setSearch({...search, workstation: e.target.value})} />
                            </div>
                            <div className="space-y-2 max-h-[250px] overflow-y-auto" data-drop-type="workstation" onDragOver={handleDragOver} onDrop={handleDrop} onDragLeave={handleDragLeave}>
                                {getFilteredPalette('workstation').map(ws => <DraggableChip key={ws.id} item={ws} type="workstation" onDragStart={handleDragStart} icon={LuPackage} colorClass="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100" />)}
                                {getFilteredPalette('workstation').length === 0 && <p className="text-xs text-slate-400 italic text-center py-4">No machines found.</p>}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT MAIN: Production Lines */}
                    <div className="flex-1 overflow-y-auto pr-2 pb-10 flex flex-col">
                        {lines.map(line => (
                            <ProductionLine 
                                key={line.id} line={line} 
                                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onDragStart={handleDragStart}
                                onEditClick={openEditModal} onDeleteClick={handleDeleteLine}
                            />
                        ))}
                        {lines.length === 0 && <div className="h-full"><Placeholder text="No production lines created yet. Click 'Add New Line' to begin." /></div>}
                    </div>
                </div>
            )}

            {/* CREATE / EDIT LINE MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Production Line' : 'Add New Production Line'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><LuX size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveLine} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Line Name</label>
                                    <input 
                                        type="text" required placeholder="e.g. Sewing Line 1"
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={lineFormData.name} onChange={(e) => setLineFormData({...lineFormData, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Process Type</label>
                                    <select 
                                        required
                                        className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                        value={lineFormData.production_line_type_id} onChange={(e) => setLineFormData({...lineFormData, production_line_type_id: e.target.value})}
                                    >
                                        <option value="">Select a type...</option>
                                        {lineTypes.map(t => <option key={t.id} value={t.id}>{t.type_name}</option>)}
                                    </select>
                                </div>


                                {/* NEW: WIP Limit Input Field */}
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">WIP Limit (Max Active Batches)</label>
                                        <input 
                                            type="number" 
                                            min="1"
                                            required 
                                            placeholder="e.g. 5"
                                            className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={lineFormData.wip_limit} 
                                            onChange={(e) => setLineFormData({...lineFormData, wip_limit: parseInt(e.target.value) || ''})}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Prevents loaders from overloading this line beyond capacity.</p>
                                    </div>
                                
                                {/* NEW: Tracked Output Attributes Configuration */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Tracked Output Attributes</label>
                                    <p className="text-xs text-slate-500 mb-2">Press comma (,) or Enter to add a new tracking metric.</p>
                                    
                                    <div className="flex flex-wrap gap-2 p-2 border border-slate-300 rounded-lg bg-white min-h-[44px] items-center focus-within:ring-2 focus-within:ring-indigo-500 transition-shadow">
                                        {lineFormData.output_attributes.map((attr, idx) => (
                                            <span key={idx} className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1.5 rounded flex items-center shadow-sm">
                                                {attr}
                                                <button type="button" onClick={() => {
                                                    const newAttrs = lineFormData.output_attributes.filter((_, i) => i !== idx);
                                                    setLineFormData({...lineFormData, output_attributes: newAttrs.length ? newAttrs : ['Total Quantity']});
                                                }} className="ml-1.5 text-indigo-400 hover:text-indigo-800 transition-colors"><LuX size={14}/></button>
                                            </span>
                                        ))}
                                        <input 
                                            type="text" 
                                            placeholder="e.g. Rejects, Rework..."
                                            className="flex-1 min-w-[120px] outline-none text-sm bg-transparent py-1 px-1"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ',') {
                                                    e.preventDefault();
                                                    const val = e.target.value.trim();
                                                    if (val && !lineFormData.output_attributes.includes(val)) {
                                                        setLineFormData({...lineFormData, output_attributes: [...lineFormData.output_attributes, val]});
                                                    }
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-50 transition-colors">Cancel</button>
                                <button type="submit" className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-sm">{isEditing ? 'Save Changes' : 'Create Line'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SAVING TOAST */}
            {isSaving && (
                <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg flex items-center animate-in slide-in-from-bottom-5 z-50">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-3"></div>
                    <span className="font-medium text-sm">Syncing layout with database...</span>
                </div>
            )}
        </div>
    );
}
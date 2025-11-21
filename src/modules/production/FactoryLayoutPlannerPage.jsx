import { React, useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';

import { LuGripVertical, LuUser, LuPackage, LuLayoutGrid, LuTruck, LuUsers } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const Placeholder = ({ text }) => <div className="p-8 text-center bg-gray-50 rounded-lg h-full flex items-center justify-center"><p className="text-sm text-gray-500">{text}</p></div>;

// --- SUB-COMPONENTS for the Planner ---

// Draggable Workstation Component
const Workstation = ({ workstation, onDragStart }) => (
    <div
        className="workstation bg-blue-100 text-blue-800 p-2 rounded shadow-sm text-center font-medium flex items-center justify-center cursor-grab min-w-[100px]"
        draggable
        onDragStart={(e) => onDragStart(e, workstation, 'workstation')}
        data-workstation-id={workstation.id}
    >
        <LuGripVertical className="text-gray-400 mr-2 flex-shrink-0" />
        <span className="truncate">{workstation.name}</span>
    </div>
);

// Draggable Manager Component
const ManagerChip = ({ manager, onDragStart, isAssigned = false }) => (
    <div
        className={`manager p-2 rounded shadow-sm flex items-center cursor-grab ${isAssigned ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}
        draggable
        onDragStart={(e) => onDragStart(e, manager, 'manager')}
        data-manager-id={manager.id}
    >
         <LuGripVertical className="text-gray-400 mr-2 flex-shrink-0" />
         <span className="font-medium truncate">{manager.name}</span>
         {isAssigned && <span className="text-xs ml-auto pl-2">(Mgr)</span>}
    </div>
);

// Draggable Loader Component
const LoaderChip = ({ loader, onDragStart, isAssigned = false }) => (
    <div
        className={`loader p-2 rounded shadow-sm flex items-center cursor-grab ${isAssigned ? 'bg-cyan-100 text-cyan-800' : 'bg-orange-100 text-orange-800'}`}
        draggable
        onDragStart={(e) => onDragStart(e, loader, 'loader')}
        data-loader-id={loader.id}
    >
         <LuGripVertical className="text-gray-400 mr-2 flex-shrink-0" />
         <span className="font-medium truncate">{loader.name}</span>
         {isAssigned && <span className="text-xs ml-auto pl-2">(Ldr)</span>}
    </div>
);


// Production Line Component
const ProductionLine = ({ line, onDragOver, onDrop, onDragLeave, onDragStart }) => (
    <div className="bg-white p-4 rounded-lg shadow-md border">
        {/* Line Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-3 border-b pb-2 gap-2">
             <h2 className="text-lg font-semibold text-gray-800 flex items-center flex-shrink-0"><LuLayoutGrid className="mr-2 text-gray-400"/>{line.name}</h2>
             <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                 {/* Manager Drop Zone */}
                 <div
                     className="manager-drop-zone border border-dashed border-gray-300 rounded px-2 py-1 min-w-[140px] text-center transition-colors duration-150"
                     data-line-id={line.id}
                     data-drop-type="manager"
                     onDragOver={onDragOver}
                     onDrop={onDrop}
                     onDragLeave={onDragLeave}
                 >
                     {line.line_manager_name ? ( <ManagerChip manager={{ id: line.line_manager_user_id, name: line.line_manager_name }} onDragStart={onDragStart} isAssigned={true} /> ) : ( <span className="text-xs text-gray-400 italic">Assign Manager</span> )}
                </div>
                 {/* Loader Drop Zone */}
                 <div
                     className="loader-drop-zone border border-dashed border-gray-300 rounded px-2 py-1 min-w-[140px] text-center transition-colors duration-150"
                     data-line-id={line.id}
                     data-drop-type="loader"
                     onDragOver={onDragOver}
                     onDrop={onDrop}
                     onDragLeave={onDragLeave}
                 >
                     {line.line_loader_name ? ( <LoaderChip loader={{ id: line.line_loader_user_id, name: line.line_loader_name }} onDragStart={onDragStart} isAssigned={true} /> ) : ( <span className="text-xs text-gray-400 italic">Assign Loader</span> )}
                </div>
            </div>
        </div>
        {/* Workstation Drop Zone */}
        <div
            className="workstation-drop-zone border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[80px] flex flex-wrap items-start gap-2 bg-gray-50 transition-colors duration-150"
            data-line-id={line.id}
            data-drop-type="workstation"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
        >
            {line.workstations && line.workstations.length > 0 ? ( line.workstations.map(ws => <Workstation key={ws.id} workstation={ws} onDragStart={onDragStart} />) ) : ( <p className="text-sm text-gray-400 w-full text-center py-4">Drag workstations here</p> )}
        </div>
    </div>
);

// --- CORRECTED Palette Components ---
// Moved event handlers and data-drop-type to the inner div which acts as the drop zone.

const WorkstationPalette = ({ workstations, onDragStart, onDrop, onDragOver, onDragLeave }) => (
    <div className="bg-white p-4 rounded-lg shadow-md border h-fit">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center"><LuPackage className="mr-2 text-gray-400"/>Available Workstations</h2>
        <div
            id="workstation-palette-drop-zone"
            className="drop-zone space-y-2 min-h-[100px] border border-dashed p-2 rounded bg-gray-50 transition-colors duration-150"
            data-drop-type="workstation"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
        >
            {workstations.length > 0 ? workstations.map(ws => ( <Workstation key={ws.id} workstation={ws} onDragStart={onDragStart} /> )) : ( <Placeholder text="No unassigned workstations." /> )}
        </div>
    </div>
);

const ManagerPalette = ({ managers, onDragStart, onDrop, onDragOver, onDragLeave }) => (
     <div className="bg-white p-4 rounded-lg shadow-md border h-fit">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center"><LuUser className="mr-2 text-gray-400"/>Available Managers</h2>
        <div
            id="manager-palette-drop-zone"
            className="drop-zone space-y-2 min-h-[100px] border border-dashed p-2 rounded bg-gray-50 transition-colors duration-150"
            data-drop-type="manager"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
        >
            {managers.length > 0 ? managers.map(m => ( <ManagerChip key={m.id} manager={m} onDragStart={onDragStart} /> )) : ( <Placeholder text="No unassigned managers found." /> )}
        </div>
    </div>
);

const LoaderPalette = ({ loaders, onDragStart, onDrop, onDragOver, onDragLeave }) => (
     <div className="bg-white p-4 rounded-lg shadow-md border h-fit">
        <h2 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center"><LuUsers className="mr-2 text-gray-400"/>Available Loaders</h2>
        <div
            id="loader-palette-drop-zone"
            className="drop-zone space-y-2 min-h-[100px] border border-dashed p-2 rounded bg-gray-50 transition-colors duration-150"
            data-drop-type="loader"
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
        >
            {loaders.length > 0 ? loaders.map(l => ( <LoaderChip key={l.id} loader={l} onDragStart={onDragStart} /> )) : ( <Placeholder text="No unassigned line loaders found." /> )}
        </div>
    </div>
);


// --- MAIN PAGE CONTAINER ---
const FactoryLayoutPlannerPage = () => {
    const [lines, setLines] = useState([]);
    const [availableWorkstations, setAvailableWorkstations] = useState([]);
    const [availableManagers, setAvailableManagers] = useState([]);
    const [availableLoaders, setAvailableLoaders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await productionManagerApi.getFactoryLayoutData();
            setLines(response.data.lines || []);
            setAvailableWorkstations(response.data.availableWorkstations || []);
            setAvailableManagers(response.data.availableManagers || []);
            setAvailableLoaders(response.data.availableLoaders || []);
        } catch (error) {
            console.error("Failed to fetch layout data", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleDragStart = (e, item, type) => {
        e.dataTransfer.setData('itemData', JSON.stringify(item));
        e.dataTransfer.setData('itemType', type);
        const sourceLineId = e.target.closest('[data-line-id]')?.dataset.lineId || null;
        e.dataTransfer.setData('sourceLineId', sourceLineId);
        e.target.classList.add('opacity-50');
    };

    const handleDragEnd = (e) => {
         // Check if target exists before trying to remove class (robustness)
         if (e.target) {
            e.target.classList.remove('opacity-50');
         }
    };

    const handleDragOver = (e) => {
         e.preventDefault();
         const itemType = e.dataTransfer.types.includes('itemtype') ? e.dataTransfer.getData('itemType') : null;
         const dropType = e.currentTarget.dataset.dropType;

         if (itemType === dropType) {
             if (dropType === 'workstation') e.currentTarget.classList.add('bg-blue-50', 'border-blue-400');
             else if (dropType === 'manager') e.currentTarget.classList.add('bg-purple-50', 'border-purple-400');
             else if (dropType === 'loader') e.currentTarget.classList.add('bg-orange-50', 'border-orange-400');
         } else {
              e.currentTarget.classList.add('border-red-400');
         }
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('bg-blue-50', 'border-blue-400', 'bg-purple-50', 'border-purple-400', 'bg-orange-50', 'border-orange-400', 'border-red-400');
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        handleDragLeave(e);
        setIsSaving(true);

        const itemDataString = e.dataTransfer.getData('itemData');
        const itemType = e.dataTransfer.getData('itemType');
        const sourceLineId = e.dataTransfer.getData('sourceLineId') === 'null' ? null : e.dataTransfer.getData('sourceLineId');
        const targetDropType = e.currentTarget.dataset.dropType;
        const targetLineId = targetDropType === 'manager' || targetDropType === 'workstation' || targetDropType === 'loader'
                           ? e.currentTarget.closest('[data-line-id]')?.dataset.lineId || null
                           : null;

         if (!itemDataString || !itemType) { setIsSaving(false); return; }
         const itemData = JSON.parse(itemDataString);

        if (itemType !== targetDropType) { setIsSaving(false); return; }
        if (sourceLineId === targetLineId && targetLineId !== null) { setIsSaving(false); return; }

        console.log(`Dropping ${itemType} ID ${itemData.id} from line ${sourceLineId || 'Palette'} to ${targetLineId ? `line ${targetLineId}` : 'Palette'}`);

        let nextLines = JSON.parse(JSON.stringify(lines)); // Deep copy to avoid mutation issues
        let nextAvailableWorkstations = [...availableWorkstations];
        let nextAvailableManagers = [...availableManagers];
        let nextAvailableLoaders = [...availableLoaders];

        // --- Logic for moving items ---
        if (itemType === 'workstation') {
            const workstationId = itemData.id;
            // Remove from source
            if (sourceLineId) {
                const lineIndex = nextLines.findIndex(l => l.id.toString() === sourceLineId);
                if (lineIndex > -1) nextLines[lineIndex].workstations = nextLines[lineIndex].workstations.filter(ws => ws.id !== workstationId);
            } else { nextAvailableWorkstations = nextAvailableWorkstations.filter(ws => ws.id !== workstationId); }
            // Add to target
            if (targetLineId) {
                const lineIndex = nextLines.findIndex(l => l.id.toString() === targetLineId);
                 if (lineIndex > -1) {
                    if (!nextLines[lineIndex].workstations.some(ws => ws.id === workstationId)) {
                        nextLines[lineIndex].workstations.push(itemData);
                        // Sort workstations by name within the line for consistent order
                        nextLines[lineIndex].workstations.sort((a, b) => a.name.localeCompare(b.name));
                    }
                 }
            } else { // To palette
                 if (!nextAvailableWorkstations.some(ws => ws.id === workstationId)) {
                    nextAvailableWorkstations.push(itemData);
                    nextAvailableWorkstations.sort((a, b) => a.name.localeCompare(b.name));
                 }
            }
        } else if (itemType === 'manager') {
            const managerId = itemData.id;
             // Remove from source
             if (sourceLineId) {
                 const lineIndex = nextLines.findIndex(l => l.id.toString() === sourceLineId);
                 if (lineIndex > -1) {
                     const removedManager = { id: nextLines[lineIndex].line_manager_user_id, name: nextLines[lineIndex].line_manager_name };
                     nextLines[lineIndex].line_manager_user_id = null;
                     nextLines[lineIndex].line_manager_name = null;
                      if (removedManager.id && !nextAvailableManagers.some(m => m.id === removedManager.id)) {
                         nextAvailableManagers.push(removedManager);
                     }
                 }
             } else { nextAvailableManagers = nextAvailableManagers.filter(m => m.id !== managerId); }
            // Add to target
             if (targetLineId) {
                 const lineIndex = nextLines.findIndex(l => l.id.toString() === targetLineId);
                 if (lineIndex > -1) {
                     if (nextLines[lineIndex].line_manager_user_id) {
                         const oldManager = { id: nextLines[lineIndex].line_manager_user_id, name: nextLines[lineIndex].line_manager_name };
                         if (!nextAvailableManagers.some(m => m.id === oldManager.id)) {
                             nextAvailableManagers.push(oldManager);
                         }
                     }
                     nextLines[lineIndex].line_manager_user_id = managerId;
                     nextLines[lineIndex].line_manager_name = itemData.name;
                     nextAvailableManagers = nextAvailableManagers.filter(m => m.id !== managerId);
                 }
             } else { // To palette
                  if (!nextAvailableManagers.some(m => m.id === managerId)) {
                     nextAvailableManagers.push(itemData);
                  }
             }
             nextAvailableManagers.sort((a, b) => a.name.localeCompare(b.name));

        } else if (itemType === 'loader') {
            const loaderId = itemData.id;
             // Remove from source
             if (sourceLineId) {
                 const lineIndex = nextLines.findIndex(l => l.id.toString() === sourceLineId);
                 if (lineIndex > -1) {
                     const removedLoader = { id: nextLines[lineIndex].line_loader_user_id, name: nextLines[lineIndex].line_loader_name };
                     nextLines[lineIndex].line_loader_user_id = null;
                     nextLines[lineIndex].line_loader_name = null;
                     if (removedLoader.id && !nextAvailableLoaders.some(l => l.id === removedLoader.id)) {
                         nextAvailableLoaders.push(removedLoader);
                     }
                 }
             } else { nextAvailableLoaders = nextAvailableLoaders.filter(l => l.id !== loaderId); }
             // Add to target
             if (targetLineId) {
                 const lineIndex = nextLines.findIndex(l => l.id.toString() === targetLineId);
                 if (lineIndex > -1) {
                     if (nextLines[lineIndex].line_loader_user_id) {
                         const oldLoader = { id: nextLines[lineIndex].line_loader_user_id, name: nextLines[lineIndex].line_loader_name };
                          if (!nextAvailableLoaders.some(l => l.id === oldLoader.id)) {
                             nextAvailableLoaders.push(oldLoader);
                         }
                     }
                     nextLines[lineIndex].line_loader_user_id = loaderId;
                     nextLines[lineIndex].line_loader_name = itemData.name;
                     nextAvailableLoaders = nextAvailableLoaders.filter(l => l.id !== loaderId);
                 }
             } else { // To palette
                  if (!nextAvailableLoaders.some(l => l.id === loaderId)) {
                     nextAvailableLoaders.push(itemData);
                  }
             }
             nextAvailableLoaders.sort((a, b) => a.name.localeCompare(b.name));
        }

        setLines(nextLines);
        setAvailableWorkstations(nextAvailableWorkstations);
        setAvailableManagers(nextAvailableManagers);
        setAvailableLoaders(nextAvailableLoaders);

        // --- Backend Synchronization ---
        try {
             let apiCalls = []; // Collect API calls to run in parallel

            if (itemType === 'workstation') {
                 if (sourceLineId) {
                     const updatedSourceLine = nextLines.find(l => l.id.toString() === sourceLineId);
                     const sourceIds = updatedSourceLine?.workstations.map(ws => ws.id) || [];
                     apiCalls.push(productionManagerApi.updateLineLayout(sourceLineId, sourceIds));
                 }
                 if (targetLineId) {
                     const updatedTargetLine = nextLines.find(l => l.id.toString() === targetLineId);
                      const targetIds = updatedTargetLine?.workstations.map(ws => ws.id) || [];
                     apiCalls.push(productionManagerApi.updateLineLayout(targetLineId, targetIds));
                 }
            } else if (itemType === 'manager') {
                 if (sourceLineId) {
                     apiCalls.push(productionManagerApi.assignManagerToLine(sourceLineId, { managerId: null }));
                 }
                 if (targetLineId) {
                     apiCalls.push(productionManagerApi.assignManagerToLine(targetLineId, { managerId: itemData.id }));
                 }
                  // Run calls and then fetch latest state to ensure consistency
                 await Promise.all(apiCalls);
                 fetchData(); // Re-fetch needed because assignManagerToLine might clear other lines
            } else if (itemType === 'loader') {
                 if (sourceLineId) {
                     apiCalls.push(productionManagerApi.assignLoaderToLine(sourceLineId, { loaderId: null }));
                 }
                 if (targetLineId) {
                     apiCalls.push(productionManagerApi.assignLoaderToLine(targetLineId, { loaderId: itemData.id }));
                 }
                  await Promise.all(apiCalls); // Run loader calls
                  // Optionally re-fetch if assignLoaderToLine has side effects on other lines
                  // fetchData();
            }
             // Wait for workstation layout updates if they were queued
            if (itemType === 'workstation' && apiCalls.length > 0) {
                 await Promise.all(apiCalls);
            }
        } catch (error) {
            console.error("Failed to update layout/assignment on server. Reverting UI.", error);
            fetchData(); // Revert UI on error
        } finally {
             setIsSaving(false);
        }
    };

     useEffect(() => {
         const handleGlobalDragEnd = (e) => { // Accept event here
             // Ensure target exists before removing class
             if(e.target && e.target.classList) {
                e.target.classList.remove('opacity-50');
             }
         };
         document.addEventListener('dragend', handleGlobalDragEnd);
         return () => document.removeEventListener('dragend', handleGlobalDragEnd);
     }, []);

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Factory Layout Planner</h1>
            {isLoading ? <Spinner /> : (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                    <div className="lg:col-span-1 space-y-6">
                        <WorkstationPalette workstations={availableWorkstations} onDragStart={handleDragStart} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}/>
                        <ManagerPalette managers={availableManagers} onDragStart={handleDragStart} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}/>
                         <LoaderPalette loaders={availableLoaders} onDragStart={handleDragStart} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}/>
                    </div>
                    <div className="lg:col-span-4 space-y-8">
                        {lines.map(line => (
                            <ProductionLine key={line.id} line={line} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onDragStart={handleDragStart}/>
                        ))}
                         {lines.length === 0 && ( <Placeholder text="No production lines found." /> )}
                    </div>
                </div>
            )}
            {isSaving && <div className="fixed bottom-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded text-sm shadow animate-pulse">Saving...</div>}
        </div>
    );
};

export default FactoryLayoutPlannerPage;
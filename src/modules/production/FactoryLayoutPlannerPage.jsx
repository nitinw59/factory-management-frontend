import { React, useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuGripVertical , LuUser, LuBuilding } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const Placeholder = ({ text }) => <div className="p-8 text-center bg-gray-50 rounded-lg h-full flex items-center justify-center"><p className="text-sm text-gray-500">{text}</p></div>;

// --- SUB-COMPONENTS for the Planner ---
const Workstation = ({ workstation, onDragStart }) => (
    <div 
        className="workstation bg-blue-100 text-blue-800 p-2 rounded shadow-sm text-center font-medium flex items-center justify-center"
        draggable
        onDragStart={(e) => onDragStart(e, workstation)} // Pass the full workstation object on drag start
        data-workstation-id={workstation.id}
    >
        <LuGripVertical className="cursor-grab text-gray-400 mr-2" />
        {workstation.name}
    </div>
);

const ManagerChip = ({ manager, onDragStart, isAssigned = false }) => (
    <div
        className={`manager p-2 rounded shadow-sm flex items-center cursor-grab ${isAssigned ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}
        draggable
        onDragStart={(e) => onDragStart(e, manager, 'manager')} // Add type
        data-manager-id={manager.id}
    >
         <LuGripVertical className="text-gray-400 mr-2 flex-shrink-0" />
         <span className="font-medium truncate">{manager.name}</span>
         {isAssigned && <span className="text-xs ml-auto pl-2">(Assigned)</span>}
    </div>
);


const ProductionLine = ({ line, onDragOver, onDrop, onDragStart }) => (
    <div className="bg-white p-4 rounded-lg shadow-md border">
        {/* Line Header */}
        <div className="flex justify-between items-center mb-3 border-b pb-2">
             <h2 className="text-lg font-semibold text-gray-800 flex items-center"><LuBuilding className="mr-2 text-gray-400"/>{line.name}</h2>
             {/* Drop zone specifically for the manager */}
             <div
                 className="manager-drop-zone border border-dashed border-gray-300 rounded px-2 py-1 min-w-[150px] text-center"
                 data-line-id={line.id}
                 data-drop-type="manager" // Indicate this accepts managers
                 onDragOver={onDragOver}
                 onDrop={onDrop}
             >
                 {line.line_manager_name ? (
                      <ManagerChip 
                        manager={{ id: line.line_manager_user_id, name: line.line_manager_name }} 
                        onDragStart={onDragStart} 
                        isAssigned={true} 
                      />
                 ) : (
                      <span className="text-xs text-gray-400 italic">Assign Manager</span>
                 )}
            </div>
        </div>
        {/* Workstation Drop Zone */}
        <div 
            className="workstation-drop-zone border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[80px] flex flex-wrap items-start gap-2 bg-gray-50" // Use flex-wrap and gap
            data-line-id={line.id}
            data-drop-type="workstation" // Indicate this accepts workstations
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {line.workstations && line.workstations.length > 0 ? (
                line.workstations.map(ws => <Workstation key={ws.id} workstation={ws} onDragStart={onDragStart} />)
            ) : (
                <p className="text-sm text-gray-400 w-full text-center py-4">Drag workstations here</p>
            )}
        </div>
    </div>
);

const WorkstationPalette = ({ workstations, onDragStart, onDrop }) => (
    <div id="workstation-palette" className="lg-col-span-1 bg-white p-4 rounded-lg shadow drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <h2 className="text-lg font-semibold mb-4 border-b pb-2">Available Workstations</h2>
        <div id="available-workstations-list" className="space-y-2">
            {workstations.length > 0 ? workstations.map(ws => (
                <Workstation key={ws.id} workstation={ws} onDragStart={onDragStart} />
            )) : (
                <p className="text-sm text-gray-500">No unassigned workstations.</p>
            )}
        </div>
    </div>
);

const ManagerPalette = ({ managers, onDragStart, onDrop, onDragOver }) => (
     <div className="bg-white p-4 rounded-lg shadow-md border h-fit"> {/* Added h-fit */}
        <h2 className="text-lg font-semibold mb-4 border-b pb-2 flex items-center"><LuUser className="mr-2 text-gray-400"/>Available Managers</h2>
        <div 
            id="manager-palette-drop-zone" 
            className="drop-zone space-y-2 min-h-[100px] border border-dashed p-2 rounded bg-gray-50" // Make it a drop zone
            data-drop-type="manager"
            onDragOver={onDragOver} 
            onDrop={onDrop}
        >
            {managers.length > 0 ? managers.map(m => (
                <ManagerChip key={m.id} manager={m} onDragStart={onDragStart} />
            )) : (
                 <p className="text-sm text-gray-500 text-center py-4">No unassigned managers found.</p>
            )}
        </div>
    </div>
);
// --- MAIN PAGE CONTAINER ---
const FactoryLayoutPlannerPage = () => {
    const [lines, setLines] = useState([]);
    const [availableWorkstations, setAvailableWorkstations] = useState([]);
    const [availableManagers, setAvailableManagers] = useState([]); // New state
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false); // Add saving state

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await productionManagerApi.getFactoryLayoutData();
            setLines(response.data.lines || []);
            setAvailableWorkstations(response.data.availableWorkstations || []);
            setAvailableManagers(response.data.availableManagers || []); // Set managers
        } catch (error) {
            console.error("Failed to fetch layout data", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleDragStart = (e, item, type) => {
        e.dataTransfer.setData('itemData', JSON.stringify(item));
        e.dataTransfer.setData('itemType', type); // 'workstation' or 'manager'
        // Find the source line ID by traversing up the DOM, handle palette case
        const sourceLineId = e.target.closest('[data-line-id]')?.dataset.lineId || null;
        e.dataTransfer.setData('sourceLineId', sourceLineId);
    };

    const handleDragOver = (e) => {
         e.preventDefault(); // Necessary to allow dropping
         // Optional: Add visual feedback (e.g., change border color)
         // Check if the drop target type matches the dragged item type
         const itemType = e.dataTransfer.getData('itemType');
         const dropType = e.currentTarget.dataset.dropType;
         if (itemType === dropType) {
             e.currentTarget.classList.add('bg-blue-50', 'border-blue-400'); // Example feedback
         } else if (dropType === 'manager' && itemType === 'manager') {
              e.currentTarget.classList.add('bg-purple-50', 'border-purple-400'); // Feedback for manager drop
         }
    };
    
    // Add onDragLeave to remove visual feedback
    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('bg-blue-50', 'border-blue-400', 'bg-purple-50', 'border-purple-400');
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-blue-50', 'border-blue-400', 'bg-purple-50', 'border-purple-400'); // Clear feedback
        setIsSaving(true); // Indicate saving process

        const itemData = JSON.parse(e.dataTransfer.getData('itemData'));
        const itemType = e.dataTransfer.getData('itemType');
        const sourceLineId = e.dataTransfer.getData('sourceLineId') === 'null' ? null : e.dataTransfer.getData('sourceLineId');
        const targetDropType = e.currentTarget.dataset.dropType;
        const targetLineId = e.currentTarget.closest('[data-line-id]')?.dataset.lineId || null; // Use closest for line drop zones

        // Prevent dropping wrong type
        if (itemType !== targetDropType) {
            console.warn("Item type mismatch");
            setIsSaving(false);
            return;
        }
        
        // Prevent dropping onto the same line (no change needed)
        if (sourceLineId === targetLineId && targetLineId !== null) {
             console.log("Dropped onto the same line");
             setIsSaving(false);
             return;
        }

        console.log(`Dropping ${itemType} ID ${itemData.id} from line ${sourceLineId || 'Palette'} to line ${targetLineId || 'Palette'}`);


        // --- Optimistic UI Update ---
        let nextLines = [...lines];
        let nextAvailableWorkstations = [...availableWorkstations];
        let nextAvailableManagers = [...availableManagers];

        if (itemType === 'workstation') {
            const workstationId = itemData.id;
            // Remove from source
            if (sourceLineId) {
                const lineIndex = nextLines.findIndex(l => l.id.toString() === sourceLineId);
                if (lineIndex > -1) nextLines[lineIndex].workstations = nextLines[lineIndex].workstations.filter(ws => ws.id !== workstationId);
            } else { // From palette
                nextAvailableWorkstations = nextAvailableWorkstations.filter(ws => ws.id !== workstationId);
            }
            // Add to target
            if (targetLineId) { // To a line
                const lineIndex = nextLines.findIndex(l => l.id.toString() === targetLineId);
                if (lineIndex > -1) {
                    // Avoid adding duplicates if something went wrong
                    if (!nextLines[lineIndex].workstations.some(ws => ws.id === workstationId)) {
                        nextLines[lineIndex].workstations.push(itemData); 
                    }
                }
            } else { // To palette
                 if (!nextAvailableWorkstations.some(ws => ws.id === workstationId)) {
                    nextAvailableWorkstations.push(itemData);
                    nextAvailableWorkstations.sort((a, b) => a.name.localeCompare(b.name)); // Keep sorted
                 }
            }
        } else if (itemType === 'manager') {
            const managerId = itemData.id;
             // Remove from source
             if (sourceLineId) { // From a line
                 const lineIndex = nextLines.findIndex(l => l.id.toString() === sourceLineId);
                 if (lineIndex > -1) {
                     // Add the removed manager back to available list if they weren't the one being dropped
                     if(nextLines[lineIndex].line_manager_user_id !== managerId && nextLines[lineIndex].line_manager_user_id){
                         // This case should ideally not happen if drag started correctly, but as safety
                         const oldManager = { id: nextLines[lineIndex].line_manager_user_id, name: nextLines[lineIndex].line_manager_name };
                         if (!nextAvailableManagers.some(m => m.id === oldManager.id)) {
                             nextAvailableManagers.push(oldManager);
                         }
                     }
                     nextLines[lineIndex].line_manager_user_id = null;
                     nextLines[lineIndex].line_manager_name = null;
                 }
             } else { // From palette
                 nextAvailableManagers = nextAvailableManagers.filter(m => m.id !== managerId);
             }
             // Add to target
             if (targetLineId) { // To a line
                 const lineIndex = nextLines.findIndex(l => l.id.toString() === targetLineId);
                 if (lineIndex > -1) {
                     // If the target line already had a manager, move them back to available
                     if (nextLines[lineIndex].line_manager_user_id) {
                         const oldManager = { id: nextLines[lineIndex].line_manager_user_id, name: nextLines[lineIndex].line_manager_name };
                         if (!nextAvailableManagers.some(m => m.id === oldManager.id)) {
                             nextAvailableManagers.push(oldManager);
                         }
                     }
                     nextLines[lineIndex].line_manager_user_id = managerId;
                     nextLines[lineIndex].line_manager_name = itemData.name;
                 }
             } else { // To palette
                  if (!nextAvailableManagers.some(m => m.id === managerId)) {
                     nextAvailableManagers.push(itemData);
                     nextAvailableManagers.sort((a, b) => a.name.localeCompare(b.name)); // Keep sorted
                  }
             }
        }

        // Apply optimistic updates
        setLines(nextLines);
        setAvailableWorkstations(nextAvailableWorkstations);
        setAvailableManagers(nextAvailableManagers);

        // --- Backend Synchronization ---
        try {
            if (itemType === 'workstation') {
                 // Update source line layout if workstation moved from a line
                 if (sourceLineId) {
                     const updatedSourceLine = nextLines.find(l => l.id.toString() === sourceLineId);
                     const sourceIds = updatedSourceLine ? updatedSourceLine.workstations.map(ws => ws.id) : [];
                     await productionManagerApi.updateLineLayout(sourceLineId, sourceIds);
                 }
                 // Update target line layout if workstation moved to a line
                 if (targetLineId) {
                     const updatedTargetLine = nextLines.find(l => l.id.toString() === targetLineId);
                      const targetIds = updatedTargetLine ? updatedTargetLine.workstations.map(ws => ws.id) : [];
                     await productionManagerApi.updateLineLayout(targetLineId, targetIds);
                 }
            } else if (itemType === 'manager') {
                 // Update source line manager if manager moved from a line (unassign)
                 if (sourceLineId) {
                     // We already cleared the manager optimistically, tell backend explicitly
                     await productionManagerApi.assignManagerToLine(sourceLineId, { managerId: null });
                 }
                 // Update target line manager if manager moved to a line (assign)
                 if (targetLineId) {
                     await productionManagerApi.assignManagerToLine(targetLineId, { managerId: itemData.id });
                 }
                 // Fetch latest data to ensure consistency after manager assignment changes
                 // because assignManagerToLine might clear the manager from another line not involved in the drag.
                 fetchData(); 
            }
        } catch (error) {
            console.error("Failed to update layout/assignment on server. Reverting UI.", error);
            // Revert UI by re-fetching original data
            fetchData();
        } finally {
             setIsSaving(false);
        }
    };
    
    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Factory Layout Planner</h1>
            {isLoading ? <Spinner /> : (
                // Use grid layout for overall structure
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                   
                    {/* Palettes Column */}
                    <div className="lg:col-span-1 space-y-6">
                        <WorkstationPalette 
                            workstations={availableWorkstations} 
                            onDragStart={handleDragStart} 
                            onDrop={handleDrop} 
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave} // Add leave handler
                        />
                         <ManagerPalette 
                            managers={availableManagers} 
                            onDragStart={handleDragStart} 
                            onDrop={handleDrop} 
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave} // Add leave handler
                        />
                    </div>

                    {/* Production Lines Column */}
                    <div className="lg:col-span-4 space-y-8">
                        {lines.map(line => (
                            <ProductionLine 
                                key={line.id} 
                                line={line} 
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave} // Add leave handler
                                onDrop={handleDrop}
                                onDragStart={handleDragStart}
                            />
                        ))}
                         {lines.length === 0 && (
                            <Placeholder text="No production lines found. Create lines in Production Line Management first." />
                         )}
                    </div>
                </div>
            )}
            {/* Optional: Add a subtle saving indicator */}
            {isSaving && <div className="fixed bottom-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded text-sm shadow">Saving...</div>}
        </div>
    );
};

export default FactoryLayoutPlannerPage;


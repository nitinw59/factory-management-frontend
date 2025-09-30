import { React, useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { LuGripVertical } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

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

const ProductionLine = ({ line, onDragOver, onDrop, onDragStart }) => (
    <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">{line.name}</h2>
        <div 
            className="drop-zone border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[80px] flex items-center space-x-2"
            data-line-id={line.id}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {line.workstations && line.workstations.length > 0 ? (
                line.workstations.map(ws => <Workstation key={ws.id} workstation={ws} onDragStart={onDragStart} />)
            ) : (
                <p className="text-sm text-gray-400">Drag workstations here</p>
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


// --- MAIN PAGE CONTAINER ---
const FactoryLayoutPlannerPage = () => {
    const [lines, setLines] = useState([]);
    const [availableWorkstations, setAvailableWorkstations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await productionManagerApi.getFactoryLayoutData();
            setLines(response.data.lines || []);
            setAvailableWorkstations(response.data.availableWorkstations || []);
        } catch (error) {
            console.error("Failed to fetch layout data", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDragStart = (e, workstation) => {
        // Store the entire workstation object as a string
        e.dataTransfer.setData('workstation', JSON.stringify(workstation));
        const sourceLineId = e.currentTarget.closest('.drop-zone')?.dataset.lineId || null;
        e.dataTransfer.setData('sourceLineId', sourceLineId);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        // Retrieve the entire workstation object
        const workstationToMove = JSON.parse(e.dataTransfer.getData('workstation'));
        const sourceLineId = e.dataTransfer.getData('sourceLineId');
        const targetLineId = e.currentTarget.dataset.lineId || null;

        // The find operation is no longer needed, so the error is prevented
        if (!workstationToMove) {
            console.error("Critical Error: Could not retrieve workstation data from drag event.");
            return;
        }
        
        const workstationId = workstationToMove.id;

        if (sourceLineId === targetLineId) return;

        const isFromPalette = !sourceLineId || sourceLineId === 'null';
        const isToPalette = !targetLineId;

        // --- Calculate the entire next state before applying it ---
        let nextLines = [...lines];
        let nextAvailable = [...availableWorkstations];

        // Remove from source
        if (isFromPalette) {
            nextAvailable = availableWorkstations.filter(ws => ws.id !== workstationId);
        } else {
            const sourceLineIndex = lines.findIndex(l => l.id.toString() === sourceLineId);
            if (sourceLineIndex > -1) {
                const sourceWorkstations = lines[sourceLineIndex].workstations.filter(ws => ws.id !== workstationId);
                nextLines[sourceLineIndex] = { ...lines[sourceLineIndex], workstations: sourceWorkstations };
            }
        }

        // Add to destination
        if (isToPalette) {
            nextAvailable = [...nextAvailable, workstationToMove].sort((a, b) => a.name.localeCompare(b.name));
        } else {
            const targetLineIndex = nextLines.findIndex(l => l.id.toString() === targetLineId);
            if (targetLineIndex > -1) {
                const targetWorkstations = [...nextLines[targetLineIndex].workstations, workstationToMove];
                nextLines[targetLineIndex] = { ...nextLines[targetLineIndex], workstations: targetWorkstations };
            }
        }
        
        // --- Perform a single, atomic optimistic UI update ---
        setLines(nextLines);
        setAvailableWorkstations(nextAvailable);
        
        // --- Synchronize the new layout with the backend ---
        try {
            if (!isFromPalette) {
                const updatedSourceLine = nextLines.find(l => l.id.toString() === sourceLineId);
                const sourceIds = updatedSourceLine.workstations.map(ws => ws.id);
                await productionManagerApi.updateLineLayout(sourceLineId, sourceIds);
            }
            if (!isToPalette) {
                const updatedTargetLine = nextLines.find(l => l.id.toString() === targetLineId);
                const targetIds = updatedTargetLine.workstations.map(ws => ws.id);
                await productionManagerApi.updateLineLayout(targetLineId, targetIds);
            }
        } catch (error) {
            console.error("Failed to update layout on server. Reverting UI.", error);
            fetchData();
        }
    };
    
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Factory Layout Planner</h1>
            {isLoading ? <Spinner /> : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <WorkstationPalette 
                        workstations={availableWorkstations} 
                        onDragStart={handleDragStart} 
                        onDrop={handleDrop} 
                    />
                    <div className="lg:col-span-3 space-y-8">
                        {lines.map(line => (
                            <ProductionLine 
                                key={line.id} 
                                line={line} 
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                                onDragStart={handleDragStart}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FactoryLayoutPlannerPage;


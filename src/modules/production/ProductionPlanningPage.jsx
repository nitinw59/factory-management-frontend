import React, { useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import CreateProductionBatchForm from './CreateProductionBatchForm'; // Assuming this exists for creating new batches
import Modal from '../../shared/Modal';
import { LuPlus, LuChevronDown, LuLoader, LuCircle, LuCircleCheck, LuPlayCircle } from 'react-icons/lu';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-red-600">{message}</div>;

// --- NEW MODAL FOR ROLL STATUS ---
const RollStatusModal = ({ batchId, lineId, lineName, onClose }) => {
    const [rolls, setRolls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRolls = async () => {
            setIsLoading(true);
            try {
                const response = await productionManagerApi.getRollStatusForBatchOnLine(batchId, lineId);
                setRolls(response.data);
            } catch (error) {
                console.error("Failed to fetch roll statuses", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRolls();
    }, [batchId, lineId]);

    const statusStyles = {
        'IN_PROGRESS': 'bg-blue-100 text-blue-800',
        'COMPLETED': 'bg-green-100 text-green-800',
        'PENDING': 'bg-yellow-100 text-yellow-800',
    };

    return (
        <Modal title={`Fabric Roll Status on ${lineName}`} onClose={onClose}>
            {isLoading ? <Spinner /> : (
                <div className="space-y-2">
                    {rolls.map(roll => (
                        <div key={roll.roll_id} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                            <span className="font-semibold">Roll #{roll.roll_id}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusStyles[roll.status] || 'bg-gray-100 text-gray-800'}`}>
                                {roll.status || 'Not Started'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
};


// --- NEW COMPONENTS FOR EXPANDABLE ROW ---
const WorkflowNode = ({ step, progress, onClick }) => {
    const status = progress ? progress.status : 'PENDING';
    
    const statusInfo = {
        'PENDING': { icon: <LuCircle/>, color: 'text-gray-400', label: 'Pending' },
        'IN_PROGRESS': { icon: <LuLoader className="animate-spin"/>, color: 'text-blue-500', label: progress?.line_name || 'In Progress' },
        'COMPLETED': { icon: <LuCircleCheck/>, color: 'text-green-500', label: progress?.line_name || 'Completed' },
    }[status];

    return (
        <div className="flex items-center">
            <button
                onClick={onClick}
                disabled={!progress}
                className="flex flex-col items-center text-center p-2 rounded-lg hover:bg-gray-100 disabled:cursor-not-allowed"
            >
                <div className={`text-3xl ${statusInfo.color}`}>{statusInfo.icon}</div>
                <div className="text-xs font-semibold mt-1">{step.line_type_name}</div>
                <div className="text-xs text-gray-500">{statusInfo.label}</div>
            </button>
        </div>
    );
};

const ExpandedRowContent = ({ batch }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLine, setSelectedLine] = useState(null);

    const handleNodeClick = (progress) => {
        if (!progress) return;
        console.log("Node clicked:", progress);
        setSelectedLine({ id: progress.line_id, name: progress.line_name });
        setIsModalOpen(true);
    };

    return (
        <tr className="bg-gray-50">
            <td colSpan="4" className="p-4">
                <h4 className="font-semibold text-sm mb-2">Production Workflow</h4>
                <div className="flex items-center space-x-4">
                    {batch.cycle_flow.map((step, index) => {
                        const progress = batch.progress.find(p => p.product_cycle_flow_id === step.id);
                        console.log("Rendering step:", step, "with progress:", progress);
                        return (
                            <React.Fragment key={step.id}>
                                <WorkflowNode step={step} progress={progress} onClick={() => handleNodeClick(progress)} />
                                {index < batch.cycle_flow.length - 1 && <div className="h-0.5 w-8 bg-gray-300"></div>}
                            </React.Fragment>
                        );
                    })}
                </div>
                {isModalOpen && (
                    <RollStatusModal
                        batchId={batch.id}
                        lineId={selectedLine.id}
                        lineName={selectedLine.name}
                        onClose={() => setIsModalOpen(false)}
                    />
                )}
            </td>
        </tr>
    );
};


// --- MAIN PAGE CONTAINER (REWRITTEN) ---
const ProductionPlanningPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedBatchId, setExpandedBatchId] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const fetchBatches = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await productionManagerApi.getAll();
            setBatches(response.data || []);
            console.log("Fetched batches:", response.data);
        } catch (err) {
            console.error("Failed to fetch production batches", err);
            setError("Could not load production batches.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchBatches(); }, [fetchBatches]);

    const handleRowClick = (batchId) => {
        setExpandedBatchId(prevId => (prevId === batchId ? null : batchId));
    };

    const getStatusChip = (status) => {
        const styles = {
            'PENDING': 'bg-yellow-100 text-yellow-800',
            'IN_PROGRESS': 'bg-blue-100 text-blue-800',
            'COMPLETED': 'bg-green-100 text-green-800',
        };
        return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status.replace('_', ' ')}</span>;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Production Planning Dashboard</h1>
                <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <LuPlus className="mr-2" /> Create New Batch
                </button> 
            </div>
      
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="w-8"></th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Batch Code</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 uppercase">Created On</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {batches.length > 0 ? batches.map(batch => (
                                <React.Fragment key={batch.id}>
                                    <tr onClick={() => handleRowClick(batch.id)} className="hover:bg-gray-50 cursor-pointer">
                                        <td className="py-3 px-3 text-center">
                                            <LuChevronDown className={`transition-transform ${expandedBatchId === batch.id ? 'rotate-180' : ''}`} />
                                        </td>
                                        <td className="py-3 px-3 font-mono text-sm">{batch.batch_code || `BATCH-${batch.id}`}</td>
                                        <td className="py-3 px-3">{batch.product_name}</td>
                                        <td className="py-3 px-3">{getStatusChip(batch.overall_status)}</td>
                                        <td className="py-3 px-3 text-sm text-gray-600">{new Date(batch.created_at).toLocaleDateString()}</td>
                                    </tr>
                                    {expandedBatchId === batch.id && <ExpandedRowContent batch={batch} />}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan="5" className="text-center p-8 text-gray-500">No production batches have been created yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

             {isCreateModalOpen && (
                <Modal title="Create New Production Batch" onClose={() => setIsCreateModalOpen(false)}>
                    <CreateProductionBatchForm onClose={() => { setIsCreateModalOpen(false); fetchBatches(); }} />
                </Modal>
            )} 
        </div>
    );
};

export default ProductionPlanningPage;

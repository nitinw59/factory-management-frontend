import React, { useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import Modal from '../../shared/Modal';
import { Link, useNavigate } from 'react-router-dom';
import { FiPlus, FiChevronDown, FiLoader, FiCircle, FiCheckCircle, FiX, FiEdit3 } from 'react-icons/fi';

// --- SHARED COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="text-center p-4 text-red-600 bg-red-100 rounded border border-red-200">{message}</div>;


// --- RollStatusModal ---
const RollStatusModal = ({ batchId, lineId, lineName, onClose }) => {
    const [rolls, setRolls] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRolls = async () => {
            setIsLoading(true);
            try {
                const response = await productionManagerApi.getRollStatusForBatchOnLine(batchId, lineId);
                setRolls(response.data || []);
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
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {rolls.length === 0 && <p className="text-sm text-gray-500 text-center">No rolls found for this line/batch combination.</p>}
                    {rolls.map(roll => (
                        <div key={roll.roll_id} className="flex justify-between items-center p-2 bg-gray-50 rounded-md border">
                            <span className="font-semibold text-sm">Roll #{roll.roll_id}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusStyles[roll.status] || 'bg-gray-100 text-gray-800'}`}>
                                {roll.status ? roll.status.replace('_', ' ') : 'Not Started'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
};

// --- WorkflowNode ---
const WorkflowNode = ({ step, progress, onClick }) => {
    const status = progress ? progress.status : 'PENDING';

    const statusInfo = {
        'PENDING': { icon: <FiCircle/>, color: 'text-gray-400', label: 'Pending' },
        'IN_PROGRESS': { icon: <FiLoader className="animate-spin"/>, color: 'text-blue-500', label: progress?.line_name || 'In Progress' },
        'COMPLETED': { icon: <FiCheckCircle/>, color: 'text-green-500', label: progress?.line_name || 'Completed' },
    }[status] || { icon: <FiCircle/>, color: 'text-gray-400', label: 'Unknown' };

    const buttonClass = progress ? "hover:bg-gray-100 cursor-pointer" : "cursor-not-allowed";

    return (
        <div className="flex items-center">
            <button
                onClick={onClick}
                disabled={!progress}
                className={`flex flex-col items-center text-center p-2 rounded-lg transition-colors duration-150 ${buttonClass}`}
            >
                <div className={`text-3xl ${statusInfo.color}`}>{statusInfo.icon}</div>
                <div className="text-xs font-semibold mt-1">{step.line_type_name}</div>
                <div className="text-xs text-gray-500">{statusInfo.label}</div>
            </button>
        </div>
    );
};

// --- ExpandedRowContent ---
const ExpandedRowContent = ({ batch }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedLine, setSelectedLine] = useState(null);

    const handleNodeClick = (progress) => {
        if (!progress || !progress.line_id || !progress.line_name) {
             console.log("Cannot open modal: Missing line details in progress object", progress);
             return;
        }
        setSelectedLine({ id: progress.line_id, name: progress.line_name });
        setIsModalOpen(true);
    };

    return (
        <tr className="bg-gray-50 border-t border-gray-200">
            <td colSpan="6" className="p-4"> 
                <h4 className="font-semibold text-sm mb-3 text-gray-700">Production Workflow</h4>
                <div className="flex items-center space-x-4 overflow-x-auto pb-2">
                    {(batch.cycle_flow || []).map((step, index) => {
                        const progress = (batch.progress || []).find(p => p.product_cycle_flow_id === step.id);
                        return (
                            <React.Fragment key={step.id}>
                                <WorkflowNode step={step} progress={progress} onClick={() => handleNodeClick(progress)} />
                                {index < batch.cycle_flow.length - 1 && <div className="h-0.5 w-8 bg-gray-300 flex-shrink-0"></div>}
                            </React.Fragment>
                        );
                    })}
                    {(batch.cycle_flow || []).length === 0 && <p className="text-xs text-gray-400">No workflow defined for this product.</p>}
                </div>
                {isModalOpen && selectedLine && (
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


// --- MAIN PAGE CONTAINER ---
const ProductionPlanningPage = () => {
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedBatchId, setExpandedBatchId] = useState(null);
    const navigate = useNavigate();

    const fetchBatches = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await productionManagerApi.getAll();
            console.log("Fetched production batches:", response.data);
            const validatedBatches = (response.data || []).map(b => ({
                ...b,
                cycle_flow: Array.isArray(b.cycle_flow) ? b.cycle_flow : [],
                progress: Array.isArray(b.progress) ? b.progress : []
            }));
            setBatches(validatedBatches);
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
             'PENDING': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
             'IN_PROGRESS': 'bg-blue-100 text-blue-800 border border-blue-200',
             'COMPLETED': 'bg-green-100 text-green-800 border border-green-200',
         };
         return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${styles[status] || 'bg-gray-100 text-gray-800 border border-gray-200'}`}>{status ? status.replace('_', ' ') : 'Unknown'}</span>;
    };

    const navigateToCreateBatch = () => {
        navigate('/production-manager/batches/new');
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Production Planning Dashboard</h1>
                <button
                    onClick={navigateToCreateBatch}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-sm"
                >
                    <FiPlus className="mr-2" /> Create New Batch
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden border">
                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <table className="min-w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="w-8 py-3 px-3"></th>
                                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch Code</th>
                                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="py-3 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created On</th>
                                <th className="py-3 px-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {batches.length > 0 ? batches.map(batch => (
                                <React.Fragment key={batch.id}>
                                    <tr className={`transition-colors duration-150 ${expandedBatchId === batch.id ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                                        <td onClick={() => handleRowClick(batch.id)} className="py-3 px-3 text-center text-gray-400 cursor-pointer">
                                            <FiChevronDown className={`transition-transform duration-200 ${expandedBatchId === batch.id ? 'rotate-180' : ''}`} />
                                        </td>
                                        <td className="py-3 px-3 font-mono text-sm text-gray-700">{batch.batch_code || `BATCH-${batch.id}`}</td>
                                        <td className="py-3 px-3 text-gray-900">{batch.product_name}</td>
                                        <td className="py-3 px-3">{getStatusChip(batch.overall_status)}</td>
                                        <td className="py-3 px-3 text-sm text-gray-600">{new Date(batch.created_at).toLocaleDateString()}</td>
                                        <td className="py-3 px-3 text-center">
                                            {/* Edit Button - Enabled for all statuses */}
                                            <Link
                                                to={`/production-manager/batches/edit/${batch.id}`}
                                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                                title="Edit Batch"
                                            >
                                                <FiEdit3 size={16}/>
                                            </Link>
                                        </td>
                                    </tr>
                                    {expandedBatchId === batch.id && <ExpandedRowContent batch={batch} />}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan="6" className="text-center p-8 text-gray-500">No production batches have been created yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default ProductionPlanningPage;
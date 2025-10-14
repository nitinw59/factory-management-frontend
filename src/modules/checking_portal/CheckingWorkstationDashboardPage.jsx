import React, { useState, useEffect, useCallback } from 'react';
import { checkingWorkstationApi } from '../../api/checkingWorkstationApi';
import { LuShirt, LuLayers, LuClipboardCheck, LuComponent, LuCheck, LuX, LuHammer, LuWrench } from 'react-icons/lu';

// --- UI & LOGIC COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;

// --- MODAL FOR VALIDATING NEW PIECES ---
const ValidationModal = ({ itemInfo, unloadMode, onClose, onValidationSubmit }) => {
    const total_cut_num = parseInt(itemInfo.total_cut, 10) || 0;
    const total_validated_num = parseInt(itemInfo.total_validated, 10) || 0;
    const total_rejected_num = parseInt(itemInfo.total_rejected, 10) || 0;
    const total_altered_num = parseInt(itemInfo.total_altered, 10) || 0;
    const remaining = total_cut_num - (total_validated_num + total_rejected_num + total_altered_num);
    const [quantity, setQuantity] = useState(unloadMode === 'bundle' ? remaining : 1);

    useEffect(() => { setQuantity(unloadMode === 'bundle' ? remaining : 1); }, [unloadMode, remaining]);

    const handleStatusClick = (qcStatus) => {
        if (quantity > 0) {
            onValidationSubmit({ rollId: itemInfo.rollId, partId: itemInfo.partId, size: itemInfo.size, quantity, qcStatus });
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b">
                    <h3 className="text-xl font-bold text-gray-800">Validate Part: {itemInfo.partName}</h3>
                    <p className="text-sm text-gray-500">Size: {itemInfo.size} &bull; Roll #{itemInfo.rollId} &bull; Remaining to Check: {remaining}</p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Validate</label>
                        <input type="number" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1)))} disabled={unloadMode === 'single'} className="w-full p-2 border rounded-md disabled:bg-gray-100" min="1" max={remaining} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select QC Status</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => handleStatusClick('APPROVED')} className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold">APPROVE</button>
                            <button onClick={() => handleStatusClick('ALTER')} className="p-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-semibold">ALTER</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MODAL FOR APPROVING ALTERED PIECES ---
const ApproveAlteredModal = ({ itemInfo, onClose, onSave }) => {
    const pending_alter = parseInt(itemInfo.total_altered, 10) - parseInt(itemInfo.total_repaired, 10);
    const [quantity, setQuantity] = useState(pending_alter);

    const handleSave = () => {
        if (isNaN(quantity) || quantity <= 0 || quantity > pending_alter) {
            return alert("Invalid quantity.");
        }
        onSave(quantity);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                 <div className="px-6 py-4 border-b">
                    <h3 className="text-xl font-bold text-gray-800">Approve Repaired Pieces</h3>
                    <p className="text-sm text-gray-500">Part: {itemInfo.partName} &bull; Size: {itemInfo.size}</p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity Repaired & Approved (Max: {pending_alter})
                        </label>
                        <input type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 0)} className="w-full p-2 border rounded-md" min="1" max={pending_alter} autoFocus />
                    </div>
                </div>
                <div className="px-6 py-4 border-t flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">Save Repaired</button>
                </div>
            </div>
        </div>
    );
};

// --- ROW & CARD COMPONENTS (UPGRADED) ---
const SizeValidationRow = ({ sizeDetail, onValidateClick, onApproveAlterClick }) => {
    const total_cut = parseInt(sizeDetail.total_cut, 10) || 0;
    const total_validated = parseInt(sizeDetail.total_validated, 10) || 0;
    const total_rejected = parseInt(sizeDetail.total_rejected, 10) || 0;
    const total_altered = parseInt(sizeDetail.total_altered, 10) || 0;
    const total_repaired = parseInt(sizeDetail.total_repaired, 10) || 0;

    const total_processed = total_validated + total_rejected + total_repaired;
    const pending_alter = total_altered - total_repaired;
    const isValidationComplete = (total_processed + pending_alter) >= total_cut;

    const approvedPercent = total_cut > 0 ? (total_validated / total_cut) * 100 : 0;
    const repairedPercent = total_cut > 0 ? (total_repaired / total_cut) * 100 : 0;
    const rejectedPercent = total_cut > 0 ? (total_rejected / total_cut) * 100 : 0;
    const pendingAlterPercent = total_cut > 0 ? (pending_alter / total_cut) * 100 : 0;
    
    return (
        <div className="p-3 rounded-md bg-white border">
            <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-gray-800 text-lg">{sizeDetail.size}</div>
                <div className="text-sm font-bold text-gray-700">{total_processed} / {total_cut} Checked</div>
            </div>
            <div title="Progress: Green=Approved, Orange=Repaired, Red=Rejected, Yellow=Pending Alter" className="w-full bg-gray-200 rounded-full h-4 mb-2 flex overflow-hidden text-white text-xs items-center justify-center">
                <div className="bg-green-500 h-4" style={{ width: `${approvedPercent}%` }}></div>
                <div className="bg-orange-500 h-4" style={{ width: `${repairedPercent}%` }}></div>
                <div className="bg-red-500 h-4" style={{ width: `${rejectedPercent}%` }}></div>
                <div className="bg-yellow-400 h-4" style={{ width: `${pendingAlterPercent}%` }}></div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="flex items-center"><LuCheck className="text-green-500 mr-1.5"/> Approved: <strong>{total_validated}</strong></span>
                <span className="flex items-center"><LuWrench className="text-orange-500 mr-1.5"/> Repaired: <strong>{total_repaired}</strong></span>
                <span className="flex items-center"><LuX className="text-red-500 mr-1.5"/> Rejected: <strong>{total_rejected}</strong></span>
                <span className="flex items-center"><LuHammer className="text-yellow-500 mr-1.5"/> Pending Alter: <strong>{pending_alter}</strong></span>
            </div>
            <div className="flex justify-end space-x-2 mt-3 pt-2 border-t">
                {pending_alter > 0 && (
                     <button onClick={onApproveAlterClick} className="px-3 py-1 text-xs bg-orange-100 text-orange-800 rounded-full hover:bg-orange-200 font-semibold">Approve Repaired</button>
                )}
                <button onClick={onValidateClick} disabled={isValidationComplete} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 font-semibold disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed">
                    {isValidationComplete ? 'Complete' : 'Validate'}
                </button>
            </div>
        </div>
    );
};

const PrimaryPartCard = ({ part, rollId, onValidateClick, onApproveAlterClick }) => (
    <div className="bg-gray-100 p-3 rounded-lg border">
        <h5 className="font-semibold text-gray-800 flex items-center mb-2 text-md"><LuComponent className="mr-2 text-gray-600"/>{part.part_name}</h5>
        <div className="space-y-2">
            {part.size_details && part.size_details.length > 0 ? (
                part.size_details.map(detail => (
                    <SizeValidationRow key={detail.size} sizeDetail={detail} onValidateClick={() => onValidateClick({ partId: part.part_id, partName: part.part_name, rollId, ...detail })} onApproveAlterClick={() => onApproveAlterClick({ partId: part.part_id, partName: part.part_name, rollId, ...detail })} />
                ))
            ) : (<p className="text-xs text-gray-500 text-center py-2">No pieces were logged for this part.</p>)}
        </div>
    </div>
);

const FabricRollCard = ({ roll, onValidateClick, onApproveAlterClick }) => (
    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
        <h4 className="font-bold text-indigo-800 flex items-center mb-3 text-lg"><LuLayers className="mr-2"/>Fabric Roll #{roll.fabric_roll_id}</h4>
        <div className="space-y-3">
            {roll.parts_details.map(part => (
                <PrimaryPartCard key={part.part_id} part={part} rollId={roll.fabric_roll_id} onValidateClick={onValidateClick} onApproveAlterClick={onApproveAlterClick} />
            ))}
        </div>
    </div>
);

const ProductionBatchCard = ({ batch, onValidateClick, onApproveAlterClick }) => (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <div className="border-b pb-3 mb-3">
            <h2 className="text-xl font-bold text-gray-800 flex items-center"><LuShirt className="mr-2 text-blue-500"/>Batch #{batch.batch_id} <span className="ml-2 text-sm font-normal text-gray-500">{batch.batch_code}</span></h2>
        </div>
        <div className="space-y-4">
            {batch.rolls.map(roll => <FabricRollCard key={roll.fabric_roll_id} roll={roll} onValidateClick={(itemInfo) => onValidateClick(batch.batch_id, itemInfo)} onApproveAlterClick={(itemInfo) => onApproveAlterClick(batch.batch_id, itemInfo)} />)}
        </div>
    </div>
);

// --- MAIN PAGE COMPONENT (REWRITTEN) ---
const CheckingWorkstationDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [unloadMode, setUnloadMode] = useState('bundle');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [headerInfo, setHeaderInfo] = useState({ lineName: 'N/A', processType: 'unknown', lineId: null });

    useEffect(() => { const savedMode = localStorage.getItem('unloadMode') || 'bundle'; setUnloadMode(savedMode); }, []);

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            // This now expects the more detailed data structure
            const res = await checkingWorkstationApi.getMyQueue();
            console.log("Fetched Queue Data:", res.data);
            setBatches(res.data.batches || []);
            setHeaderInfo({ lineName: res.data.production_line_name || 'N/A', processType: res.data.workstation_process_type || 'unknown', lineId: res.data.production_line_id });
            setError(null);
        } catch (err) {
            setError("Could not load your assigned queue. Please ensure you are assigned to a workstation.");
        } finally { setIsLoading(false); }
    }, []);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);
    
    const handleModeToggle = () => {
        const newMode = unloadMode === 'bundle' ? 'single' : 'bundle';
        setUnloadMode(newMode);
        localStorage.setItem('unloadMode', newMode);
    };

    const openValidationModal = (batchId, itemInfo) => setModalState({ type: 'validate', data: { batchId, itemInfo } });
    const openAlterModal = (batchId, itemInfo) => setModalState({ type: 'alter', data: { batchId, itemInfo } });
    const closeModal = () => setModalState({ type: null, data: null });

    const handleValidationSubmit = async (validationData) => {
        try {
            await checkingWorkstationApi.logUnloadProgress(validationData);
            const { itemInfo, batchId } = modalState.data;
            const totalValidatedAfter = (parseInt(itemInfo.total_validated, 10) || 0) + (parseInt(itemInfo.total_rejected, 10) || 0) + (parseInt(itemInfo.total_repaired, 10) || 0) + validationData.quantity;
            const totalCutNum = parseInt(itemInfo.total_cut, 10);
            if (totalValidatedAfter >= totalCutNum) {
                await checkingWorkstationApi.checkAndCompleteStages({
                    rollId: validationData.rollId,
                    batchId: batchId,
                    lineId: headerInfo.lineId
                });
            }
            closeModal();
            fetchQueue();
        } catch (err) { 
            alert(`Error: ${err.message}`); 
        }
    };
    
    const handleApproveAlterSubmit = async (quantity) => {
        try {
            const { batchId, itemInfo } = modalState.data;
            await checkingWorkstationApi.approveAlteredPieces({
                rollId: itemInfo.rollId,
                partId: itemInfo.partId,
                size: itemInfo.size,
                quantity: quantity
            });
            await checkingWorkstationApi.checkAndCompleteStages({
                rollId: itemInfo.rollId,
                batchId: batchId,
                lineId: headerInfo.lineId
            });
            closeModal();
            fetchQueue();
        } catch (err) {
            alert(`Error approving altered pieces: ${err.message}`);
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <header className="mb-6">
                     <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center"><LuClipboardCheck className="mr-3 text-gray-500"/>Checking Workstation Queue</h1>
                            <p className="text-gray-600">Showing batches for <strong className="text-gray-800">{headerInfo.lineName}</strong>. Your workstation type is: <strong className="capitalize">{headerInfo.processType}</strong>.</p>
                        </div>
                        <div className="flex flex-col items-center">
                            <label className="text-sm font-medium text-gray-700 mb-1">Validation Mode</label>
                            <div onClick={handleModeToggle} className="cursor-pointer relative w-32 h-8 flex items-center bg-gray-300 rounded-full p-1">
                                <div className={`absolute left-1 top-1 w-14 h-6 bg-white rounded-full shadow-md transform transition-transform ${unloadMode === 'bundle' ? 'translate-x-0' : 'translate-x-16'}`}></div>
                                <div className={`w-1/2 text-center z-10 text-sm font-bold ${unloadMode === 'bundle' ? 'text-blue-600' : 'text-gray-500'}`}>Bundle</div>
                                <div className={`w-1/2 text-center z-10 text-sm font-bold ${unloadMode === 'single' ? 'text-blue-600' : 'text-gray-500'}`}>Single</div>
                            </div>
                        </div>
                    </div>
                </header>
                
                {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                    <div className="space-y-6">
                        {batches.map(batch => <ProductionBatchCard key={batch.batch_id} batch={batch} onValidateClick={openValidationModal} onApproveAlterClick={openAlterModal} />)}
                    </div>
                )}
            </div>

            {modalState.type === 'validate' && (
                <ValidationModal itemInfo={modalState.data.itemInfo} unloadMode={unloadMode} onClose={closeModal} onValidationSubmit={handleValidationSubmit} />
            )}
            
            {modalState.type === 'alter' && (
                <ApproveAlteredModal itemInfo={modalState.data.itemInfo} onClose={closeModal} onSave={handleApproveAlterSubmit} />
            )}
        </div>
    );
};

export default CheckingWorkstationDashboardPage;


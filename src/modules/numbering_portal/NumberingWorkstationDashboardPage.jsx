import React, { useState, useEffect, useCallback } from 'react';
import { numberingCheckerApi } from '../../api/numberingCheckerApi';
import { LuShirt, LuLayers, LuClipboardCheck, LuComponent } from 'react-icons/lu';

// --- UI & LOGIC COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;

const ValidationModal = ({ itemInfo, unloadMode, onClose, onValidationSubmit }) => {
    const { partId, rollId, size, total_cut, total_validated } = itemInfo;
    const remaining = parseInt(total_cut, 10) - parseInt(total_validated, 10);
    const [quantity, setQuantity] = useState(unloadMode === 'bundle' ? remaining : 1);

    useEffect(() => {
        setQuantity(unloadMode === 'bundle' ? remaining : 1);
    }, [unloadMode, remaining]);

    const handleStatusClick = (qcStatus) => {
        if (quantity > 0) {
            onValidationSubmit({ rollId, partId, size, quantity, qcStatus });
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b">
                    <h3 className="text-xl font-bold text-gray-800">Validate Part: {itemInfo.partName}</h3>
                    <p className="text-sm text-gray-500">Size: {size} &bull; Roll #{rollId} &bull; Remaining: {remaining}</p>
                </div>
                <div className="p-6 space-y-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Validate</label>
                        <input type="number" value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1)))}
                            disabled={unloadMode === 'single'}
                            className="w-full p-2 border rounded-md disabled:bg-gray-100" min="1" max={remaining} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select QC Status (this will submit)</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => handleStatusClick('APPROVED')} className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold">APPROVE</button>
                            {/* <button onClick={() => handleStatusClick('REJECT')} className="p-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-semibold">REJECT</button> */}
                            <button onClick={() => handleStatusClick('ALTER')} className="p-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-semibold">ALTER</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SizeValidationRow = ({ sizeDetail, onValidateClick }) => {
    const total_cut_num = parseInt(sizeDetail.total_cut, 10);
    const total_validated_num = parseInt(sizeDetail.total_validated, 10);
    const isComplete = total_validated_num >= total_cut_num;
    const progressPercent = total_cut_num > 0 ? (total_validated_num / total_cut_num) * 100 : 100;

    return (
        <div className="grid grid-cols-3 items-center gap-4 text-sm p-2 rounded-md bg-white border">
            <div className="font-semibold text-gray-800">{sizeDetail.size}</div>
            <div className="text-center">
                <span className="font-bold text-blue-600">{total_validated_num}</span> / {total_cut_num}
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }}></div></div>
            </div>
            <button onClick={onValidateClick} disabled={isComplete} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 font-semibold disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed justify-self-end">
                {isComplete ? 'Complete' : 'Validate'}
            </button>
        </div>
    );
};

const PrimaryPartCard = ({ part, rollId, onValidateClick }) => (
    <div className="bg-gray-100 p-3 rounded-lg border">
        <h5 className="font-semibold text-gray-800 flex items-center mb-2 text-md">
            <span className="mr-2 text-gray-600"><LuComponent /></span>
            {part.part_name}
        </h5>
        <div className="space-y-2">
            {part.size_details && part.size_details.length > 0 ? (
                part.size_details.map(detail => (
                    <SizeValidationRow key={detail.size} sizeDetail={detail} onValidateClick={() => onValidateClick({ partId: part.part_id, partName: part.part_name, rollId, ...detail })} />
                ))
            ) : (<p className="text-xs text-gray-500 text-center py-2">No pieces were logged for this part.</p>)}
        </div>
    </div>
);

const FabricRollCard = ({ roll, onValidateClick }) => (
    <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
        <h4 className="font-bold text-indigo-800 flex items-center mb-3 text-lg">
            <span className="mr-2"><LuLayers /></span>
            Fabric Roll #{roll.fabric_roll_id}
        </h4>
        <div className="space-y-3">
            {roll.parts_details.map(part => (
                <PrimaryPartCard key={part.part_id} part={part} rollId={roll.fabric_roll_id} onValidateClick={onValidateClick} />
            ))}
        </div>
    </div>
);

const ProductionBatchCard = ({ batch, onValidateClick }) => (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <div className="border-b pb-3 mb-3">
            <h2 className="text-xl font-bold text-gray-800 flex items-center"><span className="mr-2 text-blue-500"><LuShirt /></span>Batch #{batch.batch_id} <span className="ml-2 text-sm font-normal text-gray-500">{batch.batch_code}</span></h2>
        </div>
        <div className="space-y-4">
            {batch.rolls.map(roll => <FabricRollCard key={roll.fabric_roll_id} roll={roll} onValidateClick={(itemInfo) => onValidateClick(batch.batch_id, itemInfo)} />)}
        </div>
    </div>
);

const NumberingCheckerDashboardPage = () => {
    const [batches, setBatches] = useState([]);
    const [unloadMode, setUnloadMode] = useState('bundle');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItemInfo, setSelectedItemInfo] = useState(null);
    const [activeBatchId, setActiveBatchId] = useState(null);
    const [headerInfo, setHeaderInfo] = useState({ lineName: 'N/A', processType: 'unknown' });

    useEffect(() => { const savedMode = localStorage.getItem('unloadMode') || 'bundle'; setUnloadMode(savedMode); }, []);

    const fetchQueue = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await numberingCheckerApi.getMyQueue();
            console.log('Fetched Queue:', res);
            setBatches(res.data.batches || []);
            setHeaderInfo({
                lineName: res.production_line_name || 'N/A',
                processType: res.workstation_process_type || 'unknown'
            });
        } catch (err) {
            setError("Could not load your assigned queue. Please ensure you are assigned to a workstation.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchQueue(); }, [fetchQueue]);
    
    const handleModeToggle = () => {
        const newMode = unloadMode === 'bundle' ? 'single' : 'bundle';
        setUnloadMode(newMode);
        localStorage.setItem('unloadMode', newMode);
    };

    const handleOpenModal = (batchId, itemInfo) => {
        setSelectedItemInfo(itemInfo);
        setActiveBatchId(batchId);
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => setIsModalOpen(false);

    const handleValidationSubmit = async (validationData) => {
        try {
            await numberingCheckerApi.logNumberingCheck(validationData);
            const { total_cut, total_validated } = selectedItemInfo;
            if ((parseInt(total_validated, 10) + validationData.quantity) >= parseInt(total_cut, 10)) {
                await numberingCheckerApi.checkAndCompleteStages({
                    rollId: validationData.rollId,
                    batchId: activeBatchId,
                });
            }
            handleCloseModal();
            fetchQueue();
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <header className="mb-6">
                     <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 flex items-center"><span className="mr-3 text-gray-500"><LuClipboardCheck /></span>Numbering Checker Queue</h1>
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
                        {batches.length > 0 ? (
                            batches.map(batch => <ProductionBatchCard key={batch.batch_id} batch={batch} onValidateClick={handleOpenModal} />)
                        ) : (<div className="text-center py-16 bg-white rounded-lg shadow"><h3 className="text-xl font-semibold text-gray-700">No Batches to Check</h3><p className="text-gray-500 mt-2">There are no batches in progress on this line.</p></div>)}
                    </div>
                )}
            </div>

            {isModalOpen && selectedItemInfo && (
                <ValidationModal itemInfo={selectedItemInfo} unloadMode={unloadMode} onClose={handleCloseModal} onValidationSubmit={handleValidationSubmit} />
            )}
        </div>
    );
};

export default NumberingCheckerDashboardPage;

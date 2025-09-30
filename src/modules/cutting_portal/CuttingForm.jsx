import React, { useState, useEffect, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { LuSave, LuChevronDown, LuChevronUp } from 'react-icons/lu';

const Spinner = () => <div className="flex justify-center items-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>;

const SIZES = [
    { key: '28(s)', value: 'S' }, { key: '30(m)', value: 'M' }, 
    { key: '32(l)', value: 'L' }, { key: '34(xl)', value: 'XL' },
    { key: '36(xxl)', value: 'XXL' }, { key: '38(xxxl)', value: 'XXXL' },
    { key: '40(xxxxl)', value: 'XXXXL' }, { key: '42(xxxxxxl)', value: 'XXXXXXL' },
    { key: '44(xxxxxxxl)', value: 'XXXXXXXXL' }
];

const PartInputRow = ({ part, isFirstPrimary = false, cuts, isSynced, onQuantityChange, onSyncChange }) => (
    <div className="py-3 border-b border-gray-200 last:border-b-0">
        <div className="flex flex-col sm:flex-row sm:items-center">
            <div className="w-full sm:w-1/4 font-medium text-gray-900 pr-4 mb-2 sm:mb-0">
                {part.part_name}
                {!isFirstPrimary && (
                    <div className="flex items-center mt-1">
                        <input 
                            type="checkbox" 
                            id={`sync-${part.id}`}
                            checked={!!isSynced[part.id]}
                            onChange={(e) => onSyncChange(part.id, e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor={`sync-${part.id}`} className="ml-2 text-xs text-gray-600">Sync with Primary</label>
                    </div>
                )}
            </div>
            <div className="w-full sm:w-3/4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-4 gap-y-2">
                {SIZES.map(size => (
                    <div key={size.key}>
                        <label className="block text-xs font-medium text-gray-500">{size.key}</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={cuts[`${part.id}-${size.value}`] || ''}
                            onChange={(e) => onQuantityChange(part, size.value, e.target.value)}
                            disabled={!isFirstPrimary && !!isSynced[part.id]}
                            className="w-full p-2 mt-1 border border-gray-300 rounded-md disabled:bg-gray-100"
                        />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

/**
 * This component is now designed to be rendered inside a modal.
 * It receives batchId, rollId, and a success callback via props.
 */
const CuttingForm = ({ batchId, rollId, onSaveSuccess, onClose }) => {
    const [batchDetails, setBatchDetails] = useState(null);
    const [cuts, setCuts] = useState({});
    const [isSynced, setIsSynced] = useState({}); // Tracks which parts are synced to the first primary
    const [showAdvanced, setShowAdvanced] = useState(false); // Controls visibility of other parts
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setIsLoading(true);
        cuttingPortalApi.getBatchDetailsForCutting(batchId, rollId)
            .then(res => {
                const data = res.data;
                setBatchDetails(data);

                const initialCuts = {};
                data.cut_log.forEach(log => {
                    initialCuts[`${log.product_piece_part_id}-${log.size}`] = log.quantity_cut.toString();
                });
                setCuts(initialCuts);

                const parts = data.piece_parts || [];
                const primary = parts.filter(p => p.part_type === 'PRIMARY');
                const supporting = parts.filter(p => p.part_type === 'SUPPORTING');
                const otherParts = primary.length > 1 ? [...primary.slice(1), ...supporting] : [...supporting];
                
                const initialSyncState = {};
                otherParts.forEach(part => { initialSyncState[part.id] = true; });
                setIsSynced(initialSyncState);
            })
            .catch(() => setError("Could not load batch details."))
            .finally(() => setIsLoading(false));
    }, [batchId, rollId]);
    
    const { firstPrimaryPart, otherPrimaryParts, supportingParts } = useMemo(() => {
        const parts = batchDetails?.piece_parts || [];
        const primary = parts.filter(p => p.part_type === 'PRIMARY');
        return {
            firstPrimaryPart: primary.length > 0 ? primary[0] : null,
            otherPrimaryParts: primary.length > 1 ? primary.slice(1) : [],
            supportingParts: parts.filter(p => p.part_type === 'SUPPORTING')
        };
    }, [batchDetails]);

    const handleQuantityChange = (part, size, value) => {
        if (value !== '' && !/^[0-9]*$/.test(value)) return;

        const piecePartId = part.id;
        const isFirstPrimary = firstPrimaryPart && piecePartId === firstPrimaryPart.id;
        
        const updatedCuts = { ...cuts, [`${piecePartId}-${size}`]: value };

        if (isFirstPrimary) {
            const allOtherParts = [...otherPrimaryParts, ...supportingParts];
            allOtherParts.forEach(otherPart => {
                if (isSynced[otherPart.id]) {
                    updatedCuts[`${otherPart.id}-${size}`] = value;
                }
            });
        } else {
            setIsSynced(prev => ({ ...prev, [piecePartId]: false }));
        }
        setCuts(updatedCuts);
    };
    
    const handleSyncChange = (partId, isChecked) => {
        setIsSynced(prev => ({...prev, [partId]: isChecked}));

        if (isChecked && firstPrimaryPart) {
            const updatedCuts = { ...cuts };
            SIZES.forEach(size => {
                const primaryValue = cuts[`${firstPrimaryPart.id}-${size.value}`] || '';
                updatedCuts[`${partId}-${size.value}`] = primaryValue;
            });
            setCuts(updatedCuts);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        const cutsPayload = Object.entries(cuts)
            .filter(([, quantity]) => {
                const num = parseInt(quantity, 10);
                return !isNaN(num) && num > 0;
            })
            .map(([key, quantity]) => {
                const [piece_part_id, size] = key.split('-');
                return { product_piece_part_id: parseInt(piece_part_id), size, quantity_cut: parseInt(quantity, 10) };
            });

        try {
            await cuttingPortalApi.logCutPieces({ batchId, rollId, cuts: cutsPayload });
            onSaveSuccess();
        } catch (err) {
            setError('Failed to save cut data. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-4">
            {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
            
            <div className="mb-4 text-sm">
                <p className="text-gray-600">
                    <strong>Batch:</strong> {batchDetails?.batch_code || `B-${batchId}`} | 
                    <strong> Product:</strong> {batchDetails?.product_name} |
                    <strong> Roll ID:</strong> {rollId}
                </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
                {firstPrimaryPart && 
                    <PartInputRow 
                        part={firstPrimaryPart} 
                        isFirstPrimary={true}
                        cuts={cuts}
                        isSynced={isSynced}
                        onQuantityChange={handleQuantityChange}
                        onSyncChange={handleSyncChange}
                    />
                }

                {([...otherPrimaryParts, ...supportingParts]).length > 0 && (
                    <div className="mt-4">
                        <button 
                            onClick={() => setShowAdvanced(!showAdvanced)} 
                            className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                            {showAdvanced ? <LuChevronUp className="mr-1" /> : <LuChevronDown className="mr-1" />}
                            {showAdvanced ? 'Hide Other Parts' : 'Customize Other Parts'}
                        </button>
                        {showAdvanced && (
                            <div className="mt-2 border-t pt-2">
                                {otherPrimaryParts.map(part => 
                                    <PartInputRow 
                                        key={part.id} 
                                        part={part}
                                        cuts={cuts}
                                        isSynced={isSynced}
                                        onQuantityChange={handleQuantityChange}
                                        onSyncChange={handleSyncChange}
                                    />
                                )}
                                {supportingParts.map(part => 
                                    <PartInputRow 
                                        key={part.id} 
                                        part={part}
                                        cuts={cuts}
                                        isSynced={isSynced}
                                        onQuantityChange={handleQuantityChange}
                                        onSyncChange={handleSyncChange}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
                 <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                 <button onClick={handleSave} disabled={isSaving} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors">
                    {isSaving ? <Spinner /> : <LuSave className="mr-2" />}
                    Save Cut Data
                </button>
            </div>
        </div>
    );
};

export default CuttingForm;


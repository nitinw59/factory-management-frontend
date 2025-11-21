import React, { useState, useEffect, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { FiSave, FiChevronDown, FiChevronUp, FiAlertTriangle } from 'react-icons/fi';


const Spinner = () => <div className="flex justify-center items-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div></div>;

// Keep SIZES definition - UPDATED as per your request
const SIZES = [
    { key: 'S(28)', value: 'S' }, { key: 'M(30)', value: 'M' },
    { key: 'L(32)', value: 'L' }, { key: 'XL(34)', value: 'XL' },
    { key: 'XXL(36)', value: 'XXL' }, { key: '3XL(38)', value: '3XL' },
    { key: '4XL(40)', value: '4XL' }, { key: '5XL(42)', value: '5XL' },
    { key: '6XL(44)', value: '6XL' }
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
                        {/* Label now uses the new key */}
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


// UPDATED props to include 'meter'
const CuttingForm = ({ batchId, rollId, meter, onSaveSuccess, onClose }) => {
    const [batchDetails, setBatchDetails] = useState(null);
    const [cuts, setCuts] = useState({});
    const [isSynced, setIsSynced] = useState({});
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [shortageMeters, setShortageMeters] = useState('');

    // This useEffect logic is from your provided file
    useEffect(() => {
        setIsLoading(true);
        cuttingPortalApi.getBatchDetailsForCutting(batchId, rollId)
            .then(res => {
                const data = res.data;
                setBatchDetails(data);

                const initialCuts = {};
                (data.cut_log || []).forEach(log => {
                    initialCuts[`${log.product_piece_part_id}-${log.size}`] = log.quantity_cut.toString();
                });
                setCuts(initialCuts);

                const parts = data.piece_parts || [];
                const primary = parts.filter(p => p.part_type === 'PRIMARY');
                const supporting = parts.filter(p => p.part_type === 'SUPPORTING');
                const otherParts = primary.length > 1 ? [...primary.slice(1), ...supporting] : [...supporting];

                const initialSyncState = {};
                otherParts.forEach(part => {
                    const hasExistingData = SIZES.some(size => initialCuts[`${part.id}-${size.value}`]);
                    initialSyncState[part.id] = true; // Sync if no data exists
                });
                setIsSynced(initialSyncState);
            })
            .catch(() => setError("Could not load batch details."))
            .finally(() => setIsLoading(false));
    }, [batchId, rollId]);

    // useMemo for parts calculation (from your file)
    const { firstPrimaryPart, otherPrimaryParts, supportingParts } = useMemo(() => {
        const parts = batchDetails?.piece_parts || [];
        const primary = parts.filter(p => p.part_type === 'PRIMARY');
        return {
            firstPrimaryPart: primary.length > 0 ? primary[0] : null,
            otherPrimaryParts: primary.length > 1 ? primary.slice(1) : [],
            supportingParts: parts.filter(p => p.part_type === 'SUPPORTING')
        };
    }, [batchDetails]);

    // handleQuantityChange (from your file)
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
        }
        else if (isSynced[piecePartId]) {
            setIsSynced(prev => ({ ...prev, [piecePartId]: false }));
        }
        setCuts(updatedCuts);
    };

    // handleSyncChange (from your file)
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

    // handleShortageChange (from your file)
     const handleShortageChange = (e) => {
         const value = e.target.value;
         if (value === '' || (/^\d*\.?\d*$/.test(value) && parseFloat(value) >= 0)) {
             setShortageMeters(value);
         }
     };

    // handleSave (from your file)
    const handleSave = async () => {
        setIsSaving(true);
        setError(null);

        const cutsPayload = Object.entries(cuts)
            .map(([key, quantity]) => {
                const [piece_part_id, size] = key.split('-');
                const numQuantity = parseInt(quantity, 10);
                if (!isNaN(numQuantity) && numQuantity > 0) {
                     return { product_piece_part_id: parseInt(piece_part_id), size, quantity_cut: numQuantity };
                }
                return null;
            })
            .filter(cut => cut !== null);

        const shortageNum = parseFloat(shortageMeters || 0);
        if (isNaN(shortageNum) || shortageNum < 0) {
             setError('Invalid shortage amount. Please enter a positive number or leave blank.');
             setIsSaving(false);
             return;
        }

        const payload = {
            batchId: batchId,
            rollId: rollId,
            cuts: cutsPayload,
            shortageMeters: shortageNum > 0 ? shortageNum : null
        };

        try {
            console.log("Saving payload:", payload); // Log from your file
            await cuttingPortalApi.logCutPieces(payload); 
            onSaveSuccess();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save cut data. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-1">
            {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            {/* UPDATED Header to include meter */}
            <div className="mb-4 text-sm bg-blue-50 p-3 rounded-md border border-blue-200">
                <p className="text-gray-700">
                    <strong>Batch:</strong> {batchDetails?.batch_code || `B-${batchId}`} |
                    <strong> Product:</strong> {batchDetails?.product_name} |
                    <strong> Roll ID:</strong> {rollId} |
                    <strong> Meter:</strong> {meter || 'N/A'}
                </p>
            </div>

            <div className="max-h-[55vh] overflow-y-auto pr-2">
                {firstPrimaryPart ?
                    <PartInputRow
                        part={firstPrimaryPart}
                        isFirstPrimary={true}
                        cuts={cuts}
                        isSynced={isSynced}
                        onQuantityChange={handleQuantityChange}
                        onSyncChange={handleSyncChange}
                    />
                : <p className="text-red-600">Configuration Error: No primary part found for this product.</p> }

                {([...otherPrimaryParts, ...supportingParts]).length > 0 && (
                    <div className="mt-4">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-2"
                        >
                            {/* Replaced icons with Fi variants */}
                            {showAdvanced ? <FiChevronUp className="mr-1" /> : <FiChevronDown className="mr-1" />}
                            {showAdvanced ? 'Hide Other Parts' : 'Customize Other Parts'} ({otherPrimaryParts.length + supportingParts.length})
                        </button>
                        {showAdvanced && (
                            <div className="mt-2 border-t pt-2 space-y-2">
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
                 <div className="mt-6 pt-4 border-t">
                     <label htmlFor="shortageMeters" className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                         {/* Replaced icon with Fi variant */}
                         <FiAlertTriangle className="mr-2 text-orange-500" /> Report Fabric Shortage (Optional)
                     </label>
                     <input
                         type="number"
                         step="0.01"
                         min="0"
                         id="shortageMeters"
                         value={shortageMeters}
                         onChange={handleShortageChange}
                         placeholder="Enter shortage in meters (e.g., 1.5)"
                         className="w-full sm:w-1/2 p-2 border border-gray-300 rounded-md"
                     />
                     <p className="text-xs text-gray-500 mt-1">Enter the amount of fabric missing or unusable from this roll.</p>
                 </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3 pt-4 border-t">
                 <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium">Cancel</button>
                 <button onClick={handleSave} disabled={isSaving} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-semibold">
                    {/* Replaced icon with Fi variant */}
                    {isSaving ? <Spinner /> : <FiSave className="mr-2" />}
                    Save Cut Data
                </button>
            </div>
        </div>
    );
};

export default CuttingForm;

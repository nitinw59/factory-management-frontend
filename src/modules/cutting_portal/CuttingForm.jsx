import React, { useState, useEffect, useMemo } from 'react';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { Save, AlertTriangle, Layers, Calculator, Loader2 } from 'lucide-react';

const Spinner = () => <div className="flex justify-center items-center p-4"><Loader2 className="animate-spin h-6 w-6 text-blue-600" /></div>;

const CuttingForm = ({ batchId, rollId, meter, onSaveSuccess, onClose }) => {
    const [batchDetails, setBatchDetails] = useState(null);
    const [lays, setLays] = useState('');
    const [shortageMeters, setShortageMeters] = useState('');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setIsLoading(true);
        cuttingPortalApi.getBatchCuttingDetails(batchId) // Reusing the detail endpoint to get ratios
            .then(res => {
                const data = res.data;
                setBatchDetails(data);
                
                // Pre-fill lays if already entered
                const currentRoll = data.rolls?.find(r => String(r.id) === String(rollId));
                if (currentRoll && currentRoll.lays > 0) {
                    setLays(currentRoll.lays.toString());
                }
            })
            .catch(() => setError("Could not load batch info."))
            .finally(() => setIsLoading(false));
    }, [batchId, rollId]);

    // --- Calculation Logic ---
    const calculatedTable = useMemo(() => {
        if (!batchDetails || !batchDetails.ratios) return [];
        const numLays = parseInt(lays) || 0;
        
        return batchDetails.ratios.map(r => ({
            size: r.size,
            ratio: r.ratio,
            qty: numLays * r.ratio
        }));
    }, [batchDetails, lays]);

    const totalPieces = calculatedTable.reduce((sum, row) => sum + row.qty, 0);

    const handleSave = async () => {
        const numLays = parseInt(lays);
        if (!numLays || numLays <= 0) {
            alert("Please enter a valid number of lays.");
            return;
        }

        setIsSaving(true);
        try {
            await cuttingPortalApi.logCutPieces({
                batchId,
                rollId,
                lays: numLays,
                shortageMeters: parseFloat(shortageMeters) || 0
            });
            onSaveSuccess();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to save.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <Spinner />;

    return (
        <div className="p-1">
            {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}

            {/* Context Header */}
            <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                    <div>
                        <span className="block text-gray-500 text-xs uppercase font-bold">Product</span>
                        <span className="font-semibold">{batchDetails?.product_name}</span>
                    </div>
                    <div className="text-right">
                         <span className="block text-gray-500 text-xs uppercase font-bold">Total Roll Length</span>
                         <span className="font-mono font-bold text-lg">{meter} m</span>
                    </div>
                </div>
            </div>

            {/* Input Section */}
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2 flex items-center">
                        <Layers className="w-4 h-4 mr-2 text-indigo-600"/> 
                        Number of Lays
                    </label>
                    <input
                        type="number"
                        min="1"
                        autoFocus
                        value={lays}
                        onChange={(e) => setLays(e.target.value)}
                        placeholder="Enter layer count (e.g. 50)"
                        className="w-full p-4 text-xl border-2 border-indigo-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Total pieces will be calculated based on the Size Ratios below.
                    </p>
                </div>

                {/* Calculation Preview Table */}
                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase flex items-center">
                            <Calculator className="w-3 h-3 mr-1"/> Cutting Output
                        </span>
                        <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                            Total: {totalPieces} Pcs
                        </span>
                    </div>
                    <table className="min-w-full text-sm text-left">
                        <thead>
                            <tr className="border-b border-gray-200">
                                <th className="px-4 py-2 text-gray-500 font-medium">Size</th>
                                <th className="px-4 py-2 text-gray-500 font-medium text-center">Ratio</th>
                                <th className="px-4 py-2 text-gray-800 font-bold text-right">Quantity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {calculatedTable.map((row) => (
                                <tr key={row.size}>
                                    <td className="px-4 py-2 font-medium text-gray-700">{row.size}</td>
                                    <td className="px-4 py-2 text-center text-gray-500">x{row.ratio}</td>
                                    <td className="px-4 py-2 text-right font-mono font-bold text-indigo-600">
                                        {row.qty}
                                    </td>
                                </tr>
                            ))}
                            {calculatedTable.length === 0 && (
                                <tr><td colSpan="3" className="p-4 text-center text-red-500">No size ratios defined for this batch.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Shortage Input */}
                <div className="pt-2">
                     <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                         <AlertTriangle className="mr-2 w-4 h-4 text-orange-500" /> Fabric Shortage / End Bit (Optional)
                     </label>
                     <div className="flex items-center">
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={shortageMeters}
                            onChange={(e) => setShortageMeters(e.target.value)}
                            placeholder="0.00"
                            className="w-32 p-2 border border-gray-300 rounded-l-md focus:ring-2 focus:ring-orange-500 outline-none"
                        />
                        <div className="bg-gray-100 border border-l-0 border-gray-300 px-3 py-2 rounded-r-md text-gray-500 text-sm">meters</div>
                     </div>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex justify-end space-x-3 pt-4 border-t">
                 <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">Cancel</button>
                 <button 
                    onClick={handleSave} 
                    disabled={isSaving || !lays || parseInt(lays) <= 0} 
                    className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-bold shadow-sm"
                 >
                    {isSaving ? <Loader2 className="animate-spin mr-2 w-4 h-4" /> : <Save className="mr-2 w-4 h-4" />}
                    Confirm Cut
                </button>
            </div>
        </div>
    );
};

export default CuttingForm;
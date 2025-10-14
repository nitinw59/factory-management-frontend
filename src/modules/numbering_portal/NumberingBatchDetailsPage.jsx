import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { numberingCheckerApi } from '../../api/numberingCheckerApi';
import { LuLayoutGrid, LuCheck, LuX, LuHammer, LuWrench } from 'react-icons/lu';

// --- SHARED UI COMPONENTS ---
const Spinner = () => <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
const ErrorDisplay = ({ message }) => <div className="p-4 bg-red-100 text-red-700 rounded-lg">{message}</div>;

// --- PAGE SUB-COMPONENTS ---

const BatchCard = ({ batchData }) => {
    // This component's internal logic remains the same
    const { batch_code, product_name, parts } = batchData;

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="p-4 border-b">
                <h2 className="font-bold text-lg">{product_name}</h2>
                <p className="font-mono text-sm text-gray-500">{batch_code || `BATCH-${batchData.batch_id}`}</p>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="py-2 px-3 text-left font-semibold text-gray-600">Part Name</th>
                            <th className="py-2 px-3 text-left font-semibold text-gray-600">Size</th>
                            <th className="py-2 px-3 text-right font-semibold text-green-600">Approved</th>
                            <th className="py-2 px-3 text-right font-semibold text-red-600">Rejected</th>
                            <th className="py-2 px-3 text-right font-semibold text-yellow-600">Altered</th>
                            <th className="py-2 px-3 text-right font-semibold text-orange-600">Repaired</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {Object.entries(parts).map(([partName, sizes]) => {
                            const partTotals = Object.values(sizes).reduce((acc, counts) => {
                                acc.approved_qty += parseInt(counts.approved_qty, 10) || 0;
                                acc.rejected_qty += parseInt(counts.rejected_qty, 10) || 0;
                                acc.altered_qty += parseInt(counts.altered_qty, 10) || 0;
                                acc.repaired_qty += parseInt(counts.repaired_qty, 10) || 0;
                                return acc;
                            }, { approved_qty: 0, rejected_qty: 0, altered_qty: 0, repaired_qty: 0 });

                            return (
                                <React.Fragment key={partName}>
                                    {Object.entries(sizes).map(([size, counts], sizeIndex) => (
                                        <tr key={`${partName}-${size}`}>
                                            {sizeIndex === 0 && (
                                                <td rowSpan={Object.keys(sizes).length + 1} className="py-2 px-3 font-bold align-top border-r border-gray-200">{partName}</td>
                                            )}
                                            <td className="py-2 px-3 font-semibold">{size || 'N/A'}</td>
                                            <td className="py-2 px-3 text-right font-mono">{counts.approved_qty || 0}</td>
                                            <td className="py-2 px-3 text-right font-mono">{counts.rejected_qty || 0}</td>
                                            <td className="py-2 px-3 text-right font-mono">{counts.altered_qty || 0}</td>
                                            <td className="py-2 px-3 text-right font-mono">{counts.repaired_qty || 0}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-100 font-bold">
                                        <td className="py-2 px-3 text-right">Total</td>
                                        <td className="py-2 px-3 text-right font-mono">{partTotals.approved_qty}</td>
                                        <td className="py-2 px-3 text-right font-mono">{partTotals.rejected_qty}</td>
                                        <td className="py-2 px-3 text-right font-mono">{partTotals.altered_qty}</td>
                                        <td className="py-2 px-3 text-right font-mono">{partTotals.repaired_qty}</td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- MAIN PAGE COMPONENT ---
const NumberingBatchDetailsPage = () => {
    const [rawData, setRawData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    // ✅ NEW: State to hold the user's filter input.
    const [batchFilter, setBatchFilter] = useState('');

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await numberingCheckerApi.getBatchQCSummary();
            setRawData(response.data || []);
        } catch (err) {
            setError("Could not load batch summary data.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const groupedData = useMemo(() => {
        return rawData.reduce((acc, item) => {
            const { batch_id, batch_code, product_name, part_name, size, ...counts } = item;
            if (!batch_id || !part_name || size === null) return acc;
            if (!acc[batch_id]) {
                acc[batch_id] = { batch_id, batch_code, product_name, parts: {} };
            }
            if (!acc[batch_id].parts[part_name]) {
                acc[batch_id].parts[part_name] = {};
            }
            acc[batch_id].parts[part_name][size] = counts;
            return acc;
        }, {});
    }, [rawData]);

    // ✅ NEW: A second useMemo hook to filter the grouped data.
    // This runs whenever the groupedData or the filter text changes.
    const filteredData = useMemo(() => {
        const allBatches = Object.values(groupedData);
        if (!batchFilter) {
            return allBatches; // Return all batches if filter is empty
        }
        const lowercasedFilter = batchFilter.toLowerCase();
        return allBatches.filter(batch => {
            const batchIdentifier = batch.batch_code || `BATCH-${batch.batch_id}`;
            return batchIdentifier.toLowerCase().includes(lowercasedFilter);
        });
    }, [groupedData, batchFilter]);

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold flex items-center">
                    <LuLayoutGrid className="mr-3 text-gray-400" />
                    Numbering QC Batch Summary
                </h1>
            </div>
            
            {/* ✅ NEW: Filter input field */}
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Filter by Batch Code or ID..."
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="w-full max-w-sm p-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            
            {isLoading ? <Spinner /> : error ? <ErrorDisplay message={error} /> : (
                <div className="space-y-6">
                    {/* The component now maps over the 'filteredData' array */}
                    {filteredData.length > 0 ? (
                        filteredData.map(batchData => (
                            <BatchCard key={batchData.batch_id} batchData={batchData} />
                        ))
                    ) : (
                        <div className="text-center py-16 bg-white rounded-lg shadow">
                            <h3 className="text-xl font-semibold text-gray-700">
                                {batchFilter ? 'No Matching Batches Found' : 'No QC Data Found'}
                            </h3>
                            <p className="text-gray-500 mt-2">
                                {batchFilter ? 'Try adjusting your filter.' : 'There is no numbering check data logged for any batches yet.'}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NumberingBatchDetailsPage;


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { cuttingPortalApi } from '../../api/cuttingPortalApi';
import { FiArrowLeft, FiPackage, FiScissors, FiAlertTriangle, FiCheckCircle, FiFileText } from 'react-icons/fi'; // Using Fi icons

const Spinner = () => <div className="flex justify-center items-center p-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

const BatchCuttingDetailsPage = () => {
    const { batchId } = useParams();
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchDetails = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Assume cuttingPortalApi has a new method getBatchCuttingDetails
            const response = await cuttingPortalApi.getBatchCuttingDetails(batchId);
            console.log("Fetched Batch Details:", response.data);
            setDetails(response.data);
        } catch (err) {
            console.error("Failed to fetch batch details:", err);
            setError("Could not load batch cutting details.");
        } finally {
            setIsLoading(false);
        }
    }, [batchId]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    // --- Calculations using useMemo for efficiency ---
    const summaryStats = useMemo(() => {
        if (!details) return { totalMeters: 0, totalPieces: 0, avgConsumption: 0, totalShortage: 0, allSizes: [] };

        let totalMeters = 0;
        let totalPieces = 0;
        const sizeTotals = {};
        const allSizesSet = new Set();

        (details.rolls || []).forEach(roll => {
            totalMeters += parseFloat(roll.meter || 0);
            (roll.cuts || []).forEach(cut => {
                const qty = parseInt(cut.quantity_cut || 0);
                totalPieces += qty;
                sizeTotals[cut.size] = (sizeTotals[cut.size] || 0) + qty;
                allSizesSet.add(cut.size);
            });
        });
        
        // --- Calculate Shortage ---
        // Summing up only 'approved' shortages for the summary might be desired
        const totalShortage = (details.shortages || []).reduce((sum, shortage) => {
           // if (shortage.status === 'approved') { // Optional: Filter by status
                return sum + parseFloat(shortage.meter || 0);
           // }
           // return sum;
        }, 0);

        const avgConsumption = totalPieces > 0 ? (totalMeters - totalShortage) / totalPieces : 0;
        const allSizes = Array.from(allSizesSet).sort(); // Sort sizes alphabetically or numerically if needed

        return { totalMeters, totalPieces, avgConsumption, totalShortage, allSizes, sizeTotals };

    }, [details]);
    // --- End Calculations ---

    if (isLoading) return <Spinner />;
    if (error) return <div className="p-6"><div className="p-4 bg-red-100 text-red-700 rounded-lg">{error}</div></div>;
    if (!details) return <div className="p-6 text-center text-gray-500">No details found for this batch.</div>;

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <header className="mb-6">
                <Link to="/cutting-portal/dashboard" className="text-sm text-blue-600 hover:underline flex items-center mb-4">
                    <FiArrowLeft className="mr-2" /> Back to Cutting Queue
                </Link>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
    <div className="flex justify-between items-start">
        {/* Left: Identity */}
        <div>
            <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Cutting Details
            </h6>
            <h1 className="text-2xl font-bold text-gray-900 leading-none mb-1">
                Batch <span className="font-mono text-indigo-600">{details.batch_code || `#${batchId}`}</span>
            </h1>
            <h3 className="text-sm font-medium text-gray-500">
                {details.product_name}
            </h3>
        </div>

        {/* Right: Metric */}
        <div className="text-right pl-4 border-l border-gray-100">
            <span className="block text-xs text-gray-400 font-medium uppercase">Fabric Layer</span>
            <div className="flex items-baseline justify-end gap-1">
                <span className="text-3xl font-bold text-gray-800">
                    {details.length_of_layer_inches || '0'}
                </span>
                <span className="text-sm text-gray-500 font-medium">in</span>
            </div>
        </div>
    </div>
</div>
            </header>

            {/* Summary Header */}
            <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Fabric Assigned</h2>
                    <p className="text-2xl font-bold text-blue-600">{summaryStats.totalMeters.toFixed(2)} m</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Pieces Cut</h2>
                    <p className="text-2xl font-bold text-green-600">{summaryStats.totalPieces}</p>
                </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Avg. Consumption</h2>
                    <p className="text-2xl font-bold text-purple-600">{summaryStats.avgConsumption > 0 ? `${summaryStats.avgConsumption.toFixed(3)} m/pc` : 'N/A'}</p>
                 </div>
                 <div className="bg-white p-4 rounded-lg shadow-sm border text-center">
                    <h2 className="text-xs text-gray-500 uppercase font-semibold">Total Shortage</h2>
                    <p className={`text-2xl font-bold ${summaryStats.totalShortage > 0 ? 'text-red-600' : 'text-gray-700'}`}>{summaryStats.totalShortage.toFixed(2)} m</p>
                 </div>
            </section>

            {/* Detailed Table */}
            <section className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="p-4 border-b">
                    <h3 className="text-xl font-semibold text-gray-800 flex items-center"><FiFileText className="mr-3 text-gray-400"/>Cut Log Details</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
                            <tr>
                                <th className="py-3 px-4 text-left">Roll ID</th>
                                <th className="py-3 px-4 text-left">Color</th>
                                <th className="py-3 px-4 text-left">Type</th>
                                <th className="py-3 px-4 text-right">Meters</th>
                                {/* Dynamically create size columns */}
                                {summaryStats.allSizes.map(size => (
                                    <th key={size} className="py-3 px-4 text-center">{size}</th>
                                ))}
                                <th className="py-3 px-4 text-right">Roll Total Pcs</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {(details.rolls || []).map(roll => {
                                const rollCutsBySize = (roll.cuts || []).reduce((acc, cut) => {
                                    acc[cut.size] = (acc[cut.size] || 0) + parseInt(cut.quantity_cut || 0);
                                    return acc;
                                }, {});
                                const rollTotalPieces = Object.values(rollCutsBySize).reduce((sum, qty) => sum + qty, 0);
                                return (
                                    <tr key={roll.id} className="hover:bg-gray-50">
                                        <td className="py-3 px-4 font-medium">{roll.roll_identifier}</td>
                                        <td className="py-3 px-4">{roll.color_name || 'N/A'}({roll.color_number || 'N/A'  })</td>
                                        <td className="py-3 px-4">{roll.type_name || 'N/A'}</td>
                                        <td className="py-3 px-4 text-right">{parseFloat(roll.meter || 0).toFixed(2)}</td>
                                        {summaryStats.allSizes.map(size => (
                                            <td key={size} className="py-3 px-4 text-center">{rollCutsBySize[size] || 0}</td>
                                        ))}
                                        <td className="py-3 px-4 text-right font-semibold">{rollTotalPieces}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {/* Footer Row for Totals */}
                        <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                             <tr className="font-bold text-gray-700">
                                 <td colSpan="4" className="py-3 px-4 text-right uppercase text-xs">Total Pieces Cut:</td>
                                 {summaryStats.allSizes.map(size => (
                                     <td key={size} className="py-3 px-4 text-center">{summaryStats.sizeTotals[size] || 0}</td>
                                 ))}
                                 <td className="py-3 px-4 text-right text-blue-700">{summaryStats.totalPieces}</td>
                             </tr>
                        </tfoot>
                    </table>
                </div>
            </section>

             {/* Shortage Section */}
             {(details.shortages && details.shortages.length > 0) && (
                <section className="mt-6 bg-white rounded-lg shadow-sm border">
                    <div className="p-4 border-b">
                        <h3 className="text-xl font-semibold text-red-700 flex items-center"><FiAlertTriangle className="mr-3"/>Reported Shortages</h3>
                    </div>
                     <div className="overflow-x-auto">
                         <table className="min-w-full">
                             <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
                                 <tr>
                                     <th className="py-3 px-4 text-left">Roll ID</th>
                                     <th className="py-3 px-4 text-right">Meters Claimed</th>
                                     <th className="py-3 px-4 text-center">Status</th>
                                     <th className="py-3 px-4 text-left">Claimed By</th>
                                     <th className="py-3 px-4 text-left">Claimed At</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-gray-200 text-sm">
                                 {details.shortages.map(shortage => (
                                    <tr key={shortage.id}>
                                         <td className="py-3 px-4">{shortage.roll_identifier}</td>
                                         <td className="py-3 px-4 text-right font-medium text-red-600">{parseFloat(shortage.meter).toFixed(2)}</td>
                                         <td className="py-3 px-4 text-center capitalize">{shortage.status}</td>
                                         <td className="py-3 px-4">{shortage.claimed_by_user_name || 'N/A'}</td>
                                         <td className="py-3 px-4">{new Date(shortage.claimed_at).toLocaleString()}</td>
                                    </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </section>
             )}

        </div>
    );
};

export default BatchCuttingDetailsPage;

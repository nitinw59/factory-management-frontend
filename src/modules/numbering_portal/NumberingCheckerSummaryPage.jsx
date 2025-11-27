import React, { useState, useEffect, useMemo } from 'react';
import { 
    ClipboardList, 
    Search, 
    Filter, 
    ChevronRight, 
    X, 
    CheckCircle, 
    AlertTriangle, 
    XCircle, 
    Hammer, 
    PieChart,
    Loader2
} from 'lucide-react';
import { numberingCheckerApi } from '../../api/numberingCheckerApi';

// --- HELPER: Group Flat Data by Batch ---
const processSummaryData = (flatData) => {
    const batches = {};

    flatData.forEach(row => {
        if (!batches[row.batch_id]) {
            batches[row.batch_id] = {
                batch_id: row.batch_id,
                batch_code: row.batch_code,
                product_name: row.product_name,
                stats: { approved: 0, rejected: 0, altered: 0, repaired: 0, total: 0 },
                parts: {} // Nested grouping for detailed view
            };
        }

        const batch = batches[row.batch_id];
        
        // Aggregate Totals
        const approved = parseInt(row.approved_qty || 0, 10);
        const rejected = parseInt(row.rejected_qty || 0, 10);
        const altered = parseInt(row.altered_qty || 0, 10); // Pending Alter
        const repaired = parseInt(row.repaired_qty || 0, 10);
        
        batch.stats.approved += approved;
        batch.stats.rejected += rejected;
        batch.stats.altered += altered;
        batch.stats.repaired += repaired;
        batch.stats.total += (approved + rejected + repaired + altered);

        // Group by Part for Detail View
        if (!batch.parts[row.part_name]) {
            batch.parts[row.part_name] = [];
        }
        batch.parts[row.part_name].push({
            size: row.size,
            approved,
            rejected,
            altered,
            repaired
        });
    });

    return Object.values(batches);
};


// --- COMPONENT: Detailed Modal ---
const BatchDetailModal = ({ batch, onClose }) => {
    if (!batch) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">{batch.product_name}</h2>
                        <p className="text-sm text-gray-500 font-mono mt-1">Batch Code: {batch.batch_code}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* QC Stats Overview */}
                <div className="grid grid-cols-4 gap-4 p-6 bg-white border-b border-gray-100">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-100 text-center">
                        <div className="text-2xl font-bold text-green-700">{batch.stats.approved + batch.stats.repaired}</div>
                        <div className="text-xs font-medium text-green-600 uppercase tracking-wider">Total Passed</div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 text-center">
                        <div className="text-2xl font-bold text-orange-700">{batch.stats.repaired}</div>
                        <div className="text-xs font-medium text-orange-600 uppercase tracking-wider">Repaired (OK)</div>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100 text-center">
                        <div className="text-2xl font-bold text-yellow-700">{batch.stats.altered}</div>
                        <div className="text-xs font-medium text-yellow-600 uppercase tracking-wider">Pending Alter</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg border border-red-100 text-center">
                        <div className="text-2xl font-bold text-red-700">{batch.stats.rejected}</div>
                        <div className="text-xs font-medium text-red-600 uppercase tracking-wider">Rejected</div>
                    </div>
                </div>

                {/* Detailed Table */}
                <div className="flex-1 overflow-y-auto p-6">
                    {Object.entries(batch.parts).map(([partName, sizes]) => (
                        <div key={partName} className="mb-8 last:mb-0">
                            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                                <span className="w-2 h-6 bg-blue-600 rounded-full mr-3"></span>
                                {partName}
                            </h3>
                            <div className="overflow-hidden border border-gray-200 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-green-600 uppercase tracking-wider">Approved</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-orange-600 uppercase tracking-wider">Repaired</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-yellow-600 uppercase tracking-wider">In Alter</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-red-600 uppercase tracking-wider">Rejected</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Checked</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {sizes.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 text-sm font-bold text-gray-800">{row.size}</td>
                                                <td className="px-4 py-3 text-sm text-center text-gray-600">{row.approved}</td>
                                                <td className="px-4 py-3 text-sm text-center font-medium text-orange-600">{row.repaired}</td>
                                                <td className="px-4 py-3 text-sm text-center font-medium text-yellow-600">{row.altered}</td>
                                                <td className="px-4 py-3 text-sm text-center font-bold text-red-600">{row.rejected}</td>
                                                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                                                    {row.approved + row.repaired + row.altered + row.rejected}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


// --- COMPONENT: Batch Summary Card ---
const BatchSummaryCard = ({ batch, onClick }) => {
    // Calculate Pass Rate: (Approved + Repaired) / Total Processed * 100
    // Note: Total Processed usually excludes "Pending Alter" because they aren't final yet, 
    // but for a general progress view, we might include them as "Work in Progress".
    const totalProcessed = batch.stats.total;
    const totalGood = batch.stats.approved + batch.stats.repaired;
    const passRate = totalProcessed > 0 ? Math.round((totalGood / totalProcessed) * 100) : 0;

    return (
        <div 
            onClick={() => onClick(batch)}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden"
        >
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800 group-hover:text-blue-600 transition-colors">
                            {batch.product_name}
                        </h3>
                        <p className="text-xs font-mono text-gray-500 mt-1">{batch.batch_code}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${passRate >= 95 ? 'bg-green-100 text-green-800' : passRate >= 85 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                        {passRate}% Yield
                    </div>
                </div>

                {/* Mini Stats Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                        <span className="font-medium">{totalGood}</span>
                        <span className="text-xs text-gray-400 ml-1">Good</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 mr-2" />
                        <span className="font-medium">{batch.stats.altered}</span>
                        <span className="text-xs text-gray-400 ml-1">Alter</span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden flex">
                    <div className="bg-green-500 h-2.5" style={{ width: `${(batch.stats.approved / totalProcessed) * 100}%` }}></div>
                    <div className="bg-orange-400 h-2.5" style={{ width: `${(batch.stats.repaired / totalProcessed) * 100}%` }}></div>
                    <div className="bg-red-500 h-2.5" style={{ width: `${(batch.stats.rejected / totalProcessed) * 100}%` }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 uppercase font-medium">
                    <span>Progress</span>
                    <span>{totalProcessed} Pcs Checked</span>
                </div>
            </div>
            <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-between items-center group-hover:bg-blue-50 transition-colors">
                <span className="text-xs font-medium text-gray-600 group-hover:text-blue-700">View Work Breakdown</span>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
            </div>
        </div>
    );
};


// --- MAIN PAGE COMPONENT ---
const NumberingCheckerSummaryPage = () => {
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await numberingCheckerApi.getBatchQCSummary();
                const processedData = processSummaryData(res.data);
                setBatches(processedData);
            } catch (error) {
                console.error("Failed to fetch summary", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredBatches = useMemo(() => {
        return batches.filter(b => 
            b.batch_code.toLowerCase().includes(searchTerm.toLowerCase()) || 
            b.product_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [batches, searchTerm]);

    return (
        <div className="p-6 bg-gray-100 min-h-screen">
            <div className="max-w-7xl mx-auto">
                
                {/* Page Header */}
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                            <PieChart className="w-6 h-6 mr-3 text-blue-600" />
                            Batch QC Summary
                        </h1>
                        <p className="text-gray-500 mt-1">Overview of numbering quality across production lines.</p>
                    </div>
                    
                    {/* Search Bar */}
                    <div className="relative w-full md:w-72">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search batch or product..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Content Area */}
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
                    </div>
                ) : filteredBatches.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-900">No batches found</h3>
                        <p className="text-gray-500">Try adjusting your search or check back later.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredBatches.map(batch => (
                            <BatchSummaryCard 
                                key={batch.batch_id} 
                                batch={batch} 
                                onClick={setSelectedBatch} 
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {selectedBatch && (
                <BatchDetailModal 
                    batch={selectedBatch} 
                    onClose={() => setSelectedBatch(null)} 
                />
            )}
        </div>
    );
};

export default NumberingCheckerSummaryPage;
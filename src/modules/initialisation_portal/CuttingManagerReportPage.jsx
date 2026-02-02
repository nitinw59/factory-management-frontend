import React, { useState } from 'react';
import { initializationPortalApi } from '../../api/initializationPortalApi';
import { 
    Calendar, Search, BarChart2, FileText, Download, ChevronDown, ChevronRight, Layers, ClipboardCheck, Scissors 
} from 'lucide-react';
import { CSVLink } from 'react-csv';

const CuttingManagerReportPage = () => {
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expandedDays, setExpandedDays] = useState({});

    const handleGenerateReport = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const response = await initializationPortalApi.getDailyReport(startDate, endDate);
            setReportData(response.data);
            setExpandedDays({}); // Reset expansions
        } catch (err) {
            console.error("Failed to fetch report:", err);
            setError("Failed to generate report. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDay = (date) => {
        setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));
    };

    // Prepare CSV Data (Flattened)
    const csvData = reportData.flatMap(day => {
        if (day.details.length === 0) {
            return [{
                Date: day.date,
                "Batches Started": day.summary.batches_started,
                "Garments Cut": day.summary.garments_cut,
                "Primary Parts (Target)": day.summary.primary_parts_to_process,
                "Total Parts Checked": day.summary.total_parts_checked,
                "Batch Code": "-",
                "Product": "-",
                "Batch Garments Cut": "-",
                "Batch Parts Checked": "-"
            }];
        }
        return day.details.map(batch => ({
            Date: day.date,
            "Batches Started": day.summary.batches_started,
            "Garments Cut": day.summary.garments_cut,
            "Primary Parts (Target)": day.summary.primary_parts_to_process,
            "Total Parts Checked": day.summary.total_parts_checked,
            "Batch Code": batch.batch_code,
            "Product": batch.product_name,
            "Batch Garments Cut": batch.garments_cut_today,
            "Batch Parts Checked": batch.parts_checked_today
        }));
    });

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter text-slate-800">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center">
                    <BarChart2 className="w-8 h-8 mr-3 text-indigo-600"/>
                    Cutting Department Daily Report
                </h1>
                <p className="text-slate-500 mt-2 font-medium ml-11">Track daily throughput, garments cut, and parts processed.</p>
            </header>

            {/* Filter Section */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-8">
                <form onSubmit={handleGenerateReport} className="flex flex-col md:flex-row items-end gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-slate-600 mb-1">Start Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-48"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-600 mb-1">End Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400"/>
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-48"
                                required
                            />
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        disabled={isLoading}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:bg-slate-300 flex items-center justify-center min-w-[140px]"
                    >
                        {isLoading ? "Loading..." : <><Search className="w-4 h-4 mr-2"/> Generate</>}
                    </button>
                    
                    {reportData.length > 0 && (
                        <CSVLink 
                            data={csvData} 
                            filename={`Cutting_Report_${startDate}_to_${endDate}.csv`}
                            className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-md flex items-center justify-center"
                        >
                            <Download className="w-4 h-4 mr-2"/> Export CSV
                        </CSVLink>
                    )}
                </form>
            </div>

            {error && <div className="p-4 bg-red-100 text-red-700 rounded-lg mb-6 text-center font-medium">{error}</div>}

            {reportData.length > 0 && (
                <div className="space-y-4">
                    {reportData.map((day) => (
                        <div key={day.date} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            {/* Summary Row */}
                            <div 
                                onClick={() => toggleDay(day.date)}
                                className="flex flex-col md:flex-row md:items-center p-4 cursor-pointer hover:bg-slate-50 transition-colors border-b border-transparent hover:border-slate-200"
                            >
                                <div className="flex items-center w-48 mb-2 md:mb-0">
                                    <div className={`p-1 rounded-md mr-3 transition-colors ${expandedDays[day.date] ? 'bg-slate-200 text-slate-700' : 'text-slate-400'}`}>
                                        {expandedDays[day.date] ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}
                                    </div>
                                    <div>
                                        <span className="font-bold text-slate-800 block text-lg">
                                            {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                        <span className="text-xs text-slate-400 font-medium">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'long' })}</span>
                                    </div>
                                </div>

                                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center md:text-left">
                                        <span className="text-xs font-bold text-slate-400 uppercase block">Batches Started</span>
                                        <span className="text-lg font-bold text-slate-700">{day.summary.batches_started}</span>
                                    </div>
                                    <div className="text-center md:text-left">
                                        <span className="text-xs font-bold text-blue-400 uppercase block">Garments Cut</span>
                                        <span className="text-lg font-bold text-blue-600">{day.summary.garments_cut}</span>
                                    </div>
                                    <div className="text-center md:text-left">
                                        <span className="text-xs font-bold text-indigo-400 uppercase block">Parts Target</span>
                                        <span className="text-lg font-bold text-indigo-600">{day.summary.primary_parts_to_process}</span>
                                    </div>
                                    <div className="text-center md:text-left">
                                        <span className="text-xs font-bold text-emerald-400 uppercase block">Total Checked</span>
                                        <span className="text-lg font-bold text-emerald-600">{day.summary.total_parts_checked}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Breakdown */}
                            {expandedDays[day.date] && (
                                <div className="bg-slate-50 border-t border-slate-100 p-4 animate-in slide-in-from-top-2 duration-200">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 ml-1">Detailed Batch Activity</h4>
                                    {day.details.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left bg-white rounded-lg border border-slate-200">
                                                <thead className="bg-slate-100 text-slate-500 font-semibold uppercase text-xs">
                                                    <tr>
                                                        <th className="px-4 py-2 w-32">Batch Code</th>
                                                        <th className="px-4 py-2">Product</th>
                                                        <th className="px-4 py-2 text-right text-blue-600">Garments Cut (Today)</th>
                                                        <th className="px-4 py-2 text-right text-emerald-600">Parts Checked (Today)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {day.details.map(batch => (
                                                        <tr key={batch.id} className="hover:bg-slate-50">
                                                            <td className="px-4 py-2 font-mono font-medium text-slate-700">{batch.batch_code}</td>
                                                            <td className="px-4 py-2 text-slate-600">{batch.product_name}</td>
                                                            <td className="px-4 py-2 text-right font-bold text-slate-800">{batch.garments_cut_today}</td>
                                                            <td className="px-4 py-2 text-right font-bold text-slate-800">{batch.parts_checked_today}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-400 italic text-center py-2">No specific batch activity recorded for this date.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && reportData.length === 0 && !error && (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-slate-200 mt-6">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4"/>
                    <h3 className="text-lg font-medium text-slate-600">No Data Available</h3>
                    <p className="text-slate-400 mt-1">Select a date range to generate the report.</p>
                </div>
            )}
        </div>
    );
};

export default CuttingManagerReportPage;
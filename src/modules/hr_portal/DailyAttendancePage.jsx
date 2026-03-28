import React, { useState, useEffect, useCallback } from 'react';
import { Users, Clock, AlertTriangle, Calendar, Search, X, CheckCircle2, Loader2, Save } from 'lucide-react';
// Make sure you have this API file created with these endpoints
import { hrApi } from '../../api/hrApi'; 

// --- SUBCOMPONENTS ---

const KpiCard = ({ title, value, icon: Icon, colorClass, bgColorClass, isLoading }) => (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between transition-all hover:shadow-md">
        <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
            {isLoading ? (
                <div className="h-8 w-16 bg-slate-100 animate-pulse rounded mt-1"></div>
            ) : (
                <p className={`text-2xl font-black ${colorClass}`}>{value}</p>
            )}
        </div>
        <div className={`p-3 rounded-xl ${bgColorClass}`}>
            <Icon className={colorClass} size={24} />
        </div>
    </div>
);

const ResolveAnomalyModal = ({ anomaly, onClose, onSuccess }) => {
    const [punchOut, setPunchOut] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!punchOut) {
            setError("Please enter a valid punch-out time.");
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            // Convert standard time input (HH:mm) to what your backend expects
            await hrApi.resolveAnomaly({
                attendance_id: anomaly.id,
                employee_id: anomaly.emp_id,
                punch_out_time: punchOut
            });
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to resolve anomaly.");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-orange-50">
                    <h3 className="font-bold text-lg text-orange-800 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-orange-600" /> Resolve Missing Punch
                    </h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-sm font-bold text-slate-800">{anomaly.name} <span className="text-slate-500 font-normal">({anomaly.emp_id})</span></p>
                        <p className="text-xs text-slate-500 mt-1">Department: {anomaly.dept}</p>
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Punch In</p>
                                <p className="font-mono font-bold text-emerald-600">{anomaly.punch_in}</p>
                            </div>
                            <div className="flex-1 border-b-2 border-dashed border-slate-300 relative">
                                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-slate-50 px-2 text-[10px] text-slate-400 font-bold">TO</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-rose-400 uppercase">Punch Out</p>
                                <p className="font-mono font-bold text-rose-600">MISSING</p>
                            </div>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Manual Punch Out Time</label>
                        <input 
                            type="time" 
                            required
                            value={punchOut}
                            onChange={(e) => setPunchOut(e.target.value)}
                            className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800"
                        />
                        <p className="text-xs text-slate-500 mt-2">Enter the confirmed time the employee left the facility.</p>
                    </div>

                    {error && <p className="text-sm text-rose-600 mb-4 bg-rose-50 p-3 rounded-lg border border-rose-100">{error}</p>}

                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-sm">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50 text-sm shadow-md">
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {isSubmitting ? 'Saving...' : 'Confirm Fix'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export default function DailyAttendancePage() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Today YYYY-MM-DD
    const [kpis, setKpis] = useState({ totalHeadcount: 0, present: 0, absent: 0, halfDay: 0, anomalies: 0, dailyExpense: 0 });
    const [anomalies, setAnomalies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [resolvingAnomaly, setResolvingAnomaly] = useState(null);

    const fetchDashboardData = useCallback(async (selectedDate) => {
        setIsLoading(true);
        setError(null);
        try {
            // Call the backend API (you need to implement this route in hrController)
            const response = await hrApi.getDailyAttendanceDashboard(selectedDate);
            setKpis({
                totalHeadcount: response.data.kpis.totalHeadcount || 0,
                present: response.data.kpis.present || 0,
                absent: response.data.kpis.absent || 0,
                halfDay: response.data.kpis.halfDay || 0,
                anomalies: response.data.anomalies?.length || 0,
                dailyExpense: response.data.kpis.dailyExpense || 0
            });
            setAnomalies(response.data.anomalies || []);
        } catch (err) {
            console.error("Failed to fetch attendance data", err);
            setError("Failed to load attendance records. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch data when date changes
    useEffect(() => { 
        fetchDashboardData(date); 
    }, [date, fetchDashboardData]);

    const handleResolutionSuccess = () => {
        setResolvingAnomaly(null);
        fetchDashboardData(date); // Refresh the dashboard to clear the queue
    };

    // Formatter for currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto min-h-screen bg-slate-50">
            
            {/* Header & Date Picker */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Attendance Analytics</h1>
                    <p className="text-slate-500 mt-1 text-sm">Monitor daily factory presence and estimated labor expenses.</p>
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm transition-shadow hover:shadow-md">
                    <div className="p-2 text-slate-400 bg-slate-50 rounded-lg mr-2"><Calendar size={18} /></div>
                    <input 
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 cursor-pointer pr-2 outline-none"
                    />
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={20} className="text-rose-500" />
                    <span className="font-medium">{error}</span>
                    <button onClick={() => fetchDashboardData(date)} className="ml-auto text-xs font-bold bg-rose-100 px-3 py-1.5 rounded hover:bg-rose-200 transition-colors">Retry</button>
                </div>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <KpiCard isLoading={isLoading} title="Headcount" value={kpis.totalHeadcount} icon={Users} colorClass="text-blue-700" bgColorClass="bg-blue-50" />
                <KpiCard isLoading={isLoading} title="Present" value={kpis.present} icon={CheckCircle2} colorClass="text-emerald-700" bgColorClass="bg-emerald-50" />
                <KpiCard isLoading={isLoading} title="Absent" value={kpis.absent} icon={X} colorClass="text-rose-700" bgColorClass="bg-rose-50" />
                <KpiCard isLoading={isLoading} title="Half Day" value={kpis.halfDay} icon={Clock} colorClass="text-amber-700" bgColorClass="bg-amber-50" />
                <KpiCard isLoading={isLoading} title="Anomalies" value={kpis.anomalies} icon={AlertTriangle} colorClass={kpis.anomalies > 0 ? "text-orange-700" : "text-slate-400"} bgColorClass={kpis.anomalies > 0 ? "bg-orange-50 border-orange-200 border" : "bg-slate-50"} />
                <KpiCard isLoading={isLoading} title="Est. Expense" value={formatCurrency(kpis.dailyExpense)} icon={Users} colorClass="text-indigo-700" bgColorClass="bg-indigo-50" />
            </div>

            {/* The Exception Queue */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
                <div className={`p-5 border-b border-slate-100 flex justify-between items-center transition-colors ${anomalies.length > 0 ? 'bg-orange-50/30' : 'bg-white'}`}>
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        {anomalies.length > 0 ? <AlertTriangle className="text-orange-500" size={20} /> : <CheckCircle2 className="text-emerald-500" size={20} />}
                        Action Required: Attendance Anomalies
                    </h3>
                </div>
                <div className="overflow-x-auto min-h-[200px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-blue-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-3" />
                            <span className="text-sm font-medium text-slate-500">Analyzing attendance logs...</span>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Emp ID</th>
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Department</th>
                                    <th className="p-4">Punch In</th>
                                    <th className="p-4">Punch Out</th>
                                    <th className="p-4">System Flag</th>
                                    <th className="p-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {anomalies.map(row => (
                                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-bold text-slate-700">{row.emp_id}</td>
                                        <td className="p-4 font-medium text-slate-800">{row.name}</td>
                                        <td className="p-4 text-slate-500 text-xs font-bold tracking-wide">{row.dept}</td>
                                        <td className="p-4 font-mono text-emerald-600 font-bold text-xs">{row.punch_in || '--:--'}</td>
                                        <td className="p-4 font-mono text-rose-600 font-bold text-xs">{row.punch_out || 'MISSING'}</td>
                                        <td className="p-4">
                                            <span className="bg-orange-100 text-orange-800 border border-orange-200 px-2 py-1 rounded text-[10px] font-bold tracking-wider">
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => setResolvingAnomaly(row)}
                                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors border border-transparent hover:border-blue-200"
                                            >
                                                Resolve
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {anomalies.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="p-12 text-center text-slate-500 font-medium">
                                            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-100 mb-3" />
                                            <p className="text-slate-600">No anomalies detected for this date.</p>
                                            <p className="text-xs font-normal mt-1">All attendance logs are complete and balanced.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Render the Resolution Modal */}
            {resolvingAnomaly && (
                <ResolveAnomalyModal 
                    anomaly={resolvingAnomaly} 
                    onClose={() => setResolvingAnomaly(null)} 
                    onSuccess={handleResolutionSuccess} 
                />
            )}
        </div>
    );
}
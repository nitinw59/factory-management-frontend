import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Users, Clock, AlertTriangle, Calendar, X, CheckCircle2, 
    Loader2, Save, Filter, DollarSign, ChevronRight, Download
} from 'lucide-react';
import { hrApi } from '../../api/hrApi'; 

// --- TIMEZONE UTILITIES (Enterprise Rigid) ---

/**
 * Gets the current date in YYYY-MM-DD format specifically for IST
 */
const getIndiaDate = () => {
    return new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

/**
 * Gets the current hour specifically in IST to prevent Vercel UTC drift
 */
const getIndiaHour = () => {
    return parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        hour12: false
    }).format(new Date()));
};

// --- SUBCOMPONENTS ---

const KpiCard = ({ title, value, icon: Icon, colorClass, bgColorClass, isLoading, isActive, onClick }) => (
    <div 
        onClick={onClick}
        className={`bg-white p-5 rounded-2xl border shadow-sm flex items-center justify-between transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5
        ${isActive ? `ring-2 ring-offset-2 ${colorClass.replace('text-', 'ring-')}` : 'border-slate-200'}
        `}
    >
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
        if (!punchOut) return setError("Please enter a valid punch-out time.");
        
        setIsSubmitting(true);
        try {
            await hrApi.resolveAnomaly({
                attendance_id: anomaly.attendance_id,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-orange-50">
                    <h3 className="font-bold text-lg text-orange-800 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-orange-600" /> Resolve Missing Punch
                    </h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-sm font-bold text-slate-800">{anomaly.name}</p>
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
                        <input type="time" required value={punchOut} onChange={(e) => setPunchOut(e.target.value)} className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800"/>
                    </div>
                    {error && <p className="text-sm text-rose-600 mb-4 bg-rose-50 p-3 rounded-lg border border-rose-100">{error}</p>}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-sm">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 text-sm shadow-md">
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Confirm Fix
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export default function DailyAttendancePage() {
    const [date, setDate] = useState(getIndiaDate());
    const [logs, setLogs] = useState([]);
    const [totalHeadcount, setTotalHeadcount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Interactive State
    const [resolvingAnomaly, setResolvingAnomaly] = useState(null);
    const [activeFilter, setActiveFilter] = useState('ALL'); 
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [showExpenseModal, setShowExpenseModal] = useState(false);

    const fetchDashboardData = useCallback(async (selectedDate) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await hrApi.getDailyAttendanceDashboard(selectedDate);
            console.log("Fetched Dashboard Data:", response.data);
            setLogs(response.data.logs || []);
            setTotalHeadcount(response.data.totalHeadcount || 0);
        } catch (err) {
            setError("Failed to load attendance records.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboardData(date); }, [date, fetchDashboardData]);

    const handleResolutionSuccess = () => {
        setResolvingAnomaly(null);
        fetchDashboardData(date); 
    };

    // --- Dynamic Computations ---
    const departments = useMemo(() => Array.from(new Set(logs.map(l => l.dept))).sort(), [logs]);
    
    const kpis = useMemo(() => {
        let present = 0, absent = 0, halfDay = 0, anomalies = 0, dailyExpense = 0;
        const currentHourIST = getIndiaHour();
        const isToday = date === getIndiaDate();

        logs.forEach(log => {
            // Logic: If it's today and before 7 PM (19:00), don't flag missing punch as anomaly yet.
            if (log.status === 'PRESENT') present++;
            else if (log.status === 'HALF_DAY') halfDay++;
            else if (log.status === 'MISSED_OUT_PUNCH') {
                if (isToday && currentHourIST < 19) {
                    present++; // Treat as present while shift is active
                } else {
                    anomalies++;
                }
            }
            else if (log.status === 'ABSENT') absent++;
            
            dailyExpense += log.expense || 0;
        });
        return { present, absent, halfDay, anomalies, dailyExpense };
    }, [logs, date]);

    const filteredLogs = useMemo(() => {
        const currentHourIST = getIndiaHour();
        const isToday = date === getIndiaDate();

        return logs.filter(log => {
            const matchDept = deptFilter === 'ALL' || log.dept === deptFilter;
            let matchStatus = true;
            
            // Adjust filtering logic to match KPI counts (Active workers vs true anomalies)
            const effectiveStatus = (log.status === 'MISSED_OUT_PUNCH' && isToday && currentHourIST < 19) 
                ? 'PRESENT' 
                : log.status;

            if (activeFilter === 'PRESENT') matchStatus = effectiveStatus === 'PRESENT';
            if (activeFilter === 'HALF_DAY') matchStatus = effectiveStatus === 'HALF_DAY';
            if (activeFilter === 'ANOMALIES') matchStatus = effectiveStatus === 'MISSED_OUT_PUNCH';
            if (activeFilter === 'ABSENT') matchStatus = effectiveStatus === 'ABSENT';
            
            return matchDept && matchStatus;
        });
    }, [logs, activeFilter, deptFilter, date]);

    const departmentSummary = useMemo(() => {
        const summary = {};
        logs.forEach(log => {
            if (!summary[log.dept]) summary[log.dept] = { count: 0, expense: 0 };
            if (log.expense > 0) {
                summary[log.dept].count++;
                summary[log.dept].expense += log.expense;
            }
        });
        return Object.entries(summary)
            .map(([dept, data]) => ({ dept, ...data }))
            .filter(d => d.expense > 0)
            .sort((a, b) => b.expense - a.expense);
    }, [logs]);

    const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

    const handleExportCSV = () => {
        const headers = ["Emp ID", "Name", "Department", "Punch In", "Punch Out", "Status", "Daily Expense"];
        const csvRows = filteredLogs.map(log => [
            log.emp_id, 
            log.name, 
            log.dept, 
            log.punch_in || '-', 
            log.punch_out || '-', 
            log.status, 
            log.expense || 0
        ]);
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += `ATTENDANCE REPORT - ${date}\n\n`;
        csvContent += headers.join(",") + "\n";
        csvRows.forEach(row => { csvContent += row.join(",") + "\n"; });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Attendance_${date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto min-h-screen bg-slate-50 font-inter">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Attendance Analytics</h1>
                    <p className="text-slate-500 mt-1 text-sm font-medium">IST Synchronization Active • Precise Cost Tracking</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
                        <Filter size={16} className="text-slate-400 mr-2" />
                        <select 
                            value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
                            className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none cursor-pointer"
                        >
                            <option value="ALL">All Departments</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center bg-white border border-slate-300 rounded-xl p-1.5 shadow-sm">
                        <div className="p-1.5 text-slate-400 bg-slate-50 rounded-md mr-2"><Calendar size={16} /></div>
                        <input 
                            type="date" value={date} onChange={(e) => setDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 cursor-pointer pr-2 outline-none"
                        />
                    </div>
                    <button 
                        onClick={handleExportCSV}
                        className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-sm text-sm h-full"
                    >
                        <Download size={16} className="mr-2" /> Export
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <KpiCard title="Headcount" value={totalHeadcount} icon={Users} colorClass="text-slate-700" bgColorClass="bg-slate-100" isLoading={isLoading} isActive={activeFilter === 'ALL'} onClick={() => setActiveFilter('ALL')} />
                <KpiCard title="Present" value={kpis.present} icon={CheckCircle2} colorClass="text-emerald-600" bgColorClass="bg-emerald-50" isLoading={isLoading} isActive={activeFilter === 'PRESENT'} onClick={() => setActiveFilter('PRESENT')} />
                <KpiCard title="Half Day" value={kpis.halfDay} icon={Clock} colorClass="text-amber-600" bgColorClass="bg-amber-50" isLoading={isLoading} isActive={activeFilter === 'HALF_DAY'} onClick={() => setActiveFilter('HALF_DAY')} />
                <KpiCard title="Anomalies" value={kpis.anomalies} icon={AlertTriangle} colorClass={kpis.anomalies > 0 ? "text-orange-600" : "text-slate-400"} bgColorClass={kpis.anomalies > 0 ? "bg-orange-50 border-orange-200 border" : "bg-slate-50"} isLoading={isLoading} isActive={activeFilter === 'ANOMALIES'} onClick={() => setActiveFilter('ANOMALIES')} />
                <KpiCard title="Absent" value={kpis.absent} icon={X} colorClass="text-rose-600" bgColorClass="bg-rose-50" isLoading={isLoading} isActive={activeFilter === 'ABSENT'} onClick={() => setActiveFilter('ABSENT')} />
                
                <div 
                    onClick={() => setShowExpenseModal(true)}
                    className="bg-gradient-to-br from-indigo-700 to-indigo-900 p-5 rounded-2xl shadow-md cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 text-white flex flex-col justify-between"
                >
                    <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">Est. Expense</p>
                    {isLoading ? <div className="h-8 w-16 bg-indigo-500/50 animate-pulse rounded mt-1"></div> : <p className="text-2xl font-black">{formatCurrency(kpis.dailyExpense)}</p>}
                    <div className="mt-2 text-[10px] font-bold text-indigo-300 flex items-center bg-indigo-900/50 px-2 py-1 rounded w-max">
                        View Breakdown <ChevronRight size={12} className="ml-1"/>
                    </div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 uppercase tracking-wider text-sm">
                        {activeFilter === 'ALL' ? 'Total Active Roster' : activeFilter === 'ANOMALIES' ? 'Action Required: Missing Punches' : `${activeFilter.replace('_', ' ')} STAFF`}
                    </h3>
                </div>
                <div className="overflow-x-auto min-h-[300px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-indigo-500">
                            <Loader2 className="w-10 h-10 animate-spin mb-4" />
                            <span className="text-sm font-bold text-slate-500">Syncing logs...</span>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="p-16 text-center text-slate-500 font-medium">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-slate-200 mb-3" />
                            <p className="text-slate-600 font-bold">No records found for this filter.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                                <tr>
                                    <th className="p-4">Emp ID</th>
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Department</th>
                                    <th className="p-4">Punch In</th>
                                    <th className="p-4">Punch Out</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredLogs.map(row => (
                                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4 font-bold text-slate-600">{row.emp_id}</td>
                                        <td className="p-4 font-bold text-slate-800">{row.name}</td>
                                        <td className="p-4 text-slate-500 text-xs font-bold tracking-wide">{row.dept}</td>
                                        <td className="p-4 font-mono text-emerald-600 font-bold text-xs">{row.punch_in || '--:--'}</td>
                                        <td className="p-4 font-mono text-rose-600 font-bold text-xs">{row.punch_out || '--:--'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-[10px] font-black tracking-wider ${
                                                row.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                                                row.status === 'HALF_DAY' ? 'bg-amber-100 text-amber-800' :
                                                row.status === 'ABSENT' ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                                                'bg-orange-100 text-orange-800 border border-orange-200'
                                            }`}>
                                                {row.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {row.status === 'MISSED_OUT_PUNCH' ? (
                                                <button onClick={() => setResolvingAnomaly(row)} className="text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors border border-blue-200 hover:bg-blue-100">
                                                    Resolve
                                                </button>
                                            ) : <span className="text-slate-300 text-xs font-bold">-</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {showExpenseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-indigo-50/50">
                            <div>
                                <h3 className="font-black text-xl text-indigo-900 flex items-center gap-2">
                                    <DollarSign className="text-indigo-600" /> Estimated Expense Drilldown
                                </h3>
                                <p className="text-sm font-medium text-slate-500 mt-1">IST Calculated Wage Pool for {date}</p>
                            </div>
                            <button onClick={() => setShowExpenseModal(false)} className="p-2 bg-white text-slate-400 hover:text-rose-600 rounded-full shadow-sm border border-slate-200 transition-colors"><X size={20} /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto bg-slate-50/30">
                            <div className="p-6 border-b border-slate-200 bg-white">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Department Summary</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {departmentSummary.map((dept) => (
                                        <div key={dept.dept} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                            <p className="text-sm font-bold text-slate-700 truncate">{dept.dept}</p>
                                            <div className="flex justify-between items-end mt-2">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Staff</p>
                                                    <p className="text-sm font-black text-slate-600">{dept.count}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Cost</p>
                                                    <p className="text-sm font-black text-indigo-600">{formatCurrency(dept.expense)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <table className="w-full text-left text-sm bg-white">
                                <thead className="bg-slate-100 sticky top-0 shadow-sm text-xs uppercase font-bold text-slate-500">
                                    <tr>
                                        <th className="px-6 py-4">Employee</th>
                                        <th className="px-6 py-4">Department</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 font-mono text-right">Base/Mo</th>
                                        <th className="px-6 py-4 text-right bg-indigo-50 text-indigo-800">Est. Daily Wage</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {logs.filter(e => e.expense > 0).map((emp, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-bold text-slate-800">{emp.name}</td>
                                            <td className="px-6 py-3 font-bold text-slate-500 text-xs">{emp.dept}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-[10px] font-black ${emp.status === 'HALF_DAY' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                    {emp.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 font-mono text-right text-slate-500">{formatCurrency(emp.base_salary)}</td>
                                            <td className="px-6 py-3 text-right bg-indigo-50/30">
                                                <div className="font-bold text-indigo-700">{formatCurrency(emp.expense)}</div>
                                                <div className="text-[10px] text-indigo-400 mt-0.5 font-bold">
                                                    {emp.status === 'HALF_DAY' ? `(Base / ${emp.working_days * 2})` : `(Base / ${emp.working_days} days)`}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
                            <span className="font-bold text-slate-500 uppercase text-xs tracking-wider">Total Est. Expense</span>
                            <span className="text-2xl font-black text-indigo-700">{formatCurrency(kpis.dailyExpense)}</span>
                        </div>
                    </div>
                </div>
            )}

            {resolvingAnomaly && <ResolveAnomalyModal anomaly={resolvingAnomaly} onClose={() => setResolvingAnomaly(null)} onSuccess={handleResolutionSuccess} />}
        </div>
    );
}
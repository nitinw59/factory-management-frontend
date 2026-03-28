import React, { useState, useEffect } from 'react';
import { lineManagerApi } from '../../api/lineManagerApi';
import { 
    LuUsers, LuIndianRupee, LuActivity, LuUserCheck, 
    LuCircleAlert, LuSearch, LuCalendar, LuUserX 
} from 'react-icons/lu';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#64748b']; 

export default function LineStaffCostingPage() {
    const [data, setData] = useState({ lines: [], kpis: {}, staff: [], chartData: [] });
    const [isLoading, setIsLoading] = useState(true);

    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('ALL'); 

    useEffect(() => {
        const fetchStaffData = async () => {
            setIsLoading(true);
            try {
                const response = await lineManagerApi.getMyLineStaffAndCosting(selectedDate);
                setData(response.data);

                console.log("Fetched staff and costing data:", response.data);
            } catch (error) {
                console.error("Failed to fetch staff data", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStaffData();
    }, [selectedDate]);

    if (isLoading && data.staff.length === 0) {
        return <div className="flex justify-center items-center h-full min-h-[400px]"><LuActivity className="animate-pulse text-indigo-500 w-10 h-10" /></div>;
    }

    if (!isLoading && data.lines.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500">
                <LuCircleAlert size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700">No Lines Assigned</h2>
                <p className="text-sm">You are not currently assigned as a manager to any production lines.</p>
            </div>
        );
    }

    const absentCount = (data.kpis.totalStaff || 0) - (data.kpis.presentToday || 0);

    const filteredStaff = data.staff.filter(emp => {
        const matchesSearch = emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              emp.emp_id.toString().includes(searchQuery);
        
        const isPresent = ['PRESENT', 'HALF_DAY', 'MISSED_OUT_PUNCH'].includes(emp.attendance_status);
        let matchesFilter = true;
        if (activeFilter === 'PRESENT') matchesFilter = isPresent;
        if (activeFilter === 'ABSENT') matchesFilter = !isPresent;

        return matchesSearch && matchesFilter;
    });

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Staff & Costing</h1>
                    <p className="text-slate-500 mt-1">
                        Managing: <span className="font-bold text-indigo-600">{data.lines.map(l => l.name).join(', ')}</span>
                    </p>
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
                    <div className="p-2 text-slate-400 bg-slate-50 rounded-lg mr-2"><LuCalendar size={18} /></div>
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 cursor-pointer pr-2 outline-none"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div 
                    onClick={() => setActiveFilter('ALL')}
                    className={`bg-white p-5 rounded-2xl shadow-sm cursor-pointer transition-all border-2 
                        ${activeFilter === 'ALL' ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}
                >
                    <p className="text-xs font-bold text-slate-500 uppercase flex items-center"><LuUsers className="mr-1"/> Total Assigned</p>
                    <p className="text-2xl sm:text-3xl font-black text-slate-800 mt-2">{data.kpis.totalStaff}</p>
                </div>

                <div 
                    onClick={() => setActiveFilter('PRESENT')}
                    className={`bg-white p-5 rounded-2xl shadow-sm cursor-pointer transition-all border-2 
                        ${activeFilter === 'PRESENT' ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100 hover:border-emerald-200'}`}
                >
                    <p className="text-xs font-bold text-emerald-600 uppercase flex items-center"><LuUserCheck className="mr-1"/> Present</p>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">{data.kpis.presentToday}</p>
                    <p className="text-xs text-emerald-600/70 mt-1 font-medium">{data.kpis.attendanceRate}% Rate</p>
                </div>

                <div 
                    onClick={() => setActiveFilter('ABSENT')}
                    className={`bg-white p-5 rounded-2xl shadow-sm cursor-pointer transition-all border-2 
                        ${activeFilter === 'ABSENT' ? 'border-amber-500 ring-4 ring-amber-50' : 'border-slate-100 hover:border-amber-200'}`}
                >
                    <p className="text-xs font-bold text-amber-600 uppercase flex items-center"><LuUserX className="mr-1"/> Absent / Late</p>
                    <p className="text-2xl sm:text-3xl font-black text-amber-600 mt-2">{absentCount}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border-2 border-slate-100 shadow-sm col-span-2 lg:col-span-1 border-l-4 border-l-rose-500">
                    <p className="text-xs font-bold text-slate-500 uppercase flex items-center"><LuIndianRupee className="mr-1"/> Est. Labor Cost</p>
                    <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-2">{formatCurrency(data.kpis.dailyCost)}</p>
                    <p className="text-xs text-slate-400 mt-1">Total cost of present staff today</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <h3 className="font-bold text-slate-800 flex items-center">
                            Assigned Operators 
                            {activeFilter !== 'ALL' && <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] uppercase tracking-wider">{activeFilter} Only</span>}
                        </h3>
                        <div className="relative w-full sm:w-64">
                            <LuSearch className="absolute left-3 top-2 text-slate-400" size={16} />
                            <input 
                                type="text" placeholder="Search by name or ID..."
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto flex-1 relative">
                        {isLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10"><LuActivity className="animate-spin text-indigo-500" size={24}/></div>}
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0 z-0">
                                <tr>
                                    <th className="p-4">Employee Name</th>
                                    <th className="p-4">Designation</th>
                                    <th className="p-4">Status ({selectedDate})</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredStaff.map((emp) => (
                                    <tr key={emp.emp_id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <p className="font-bold text-slate-800">{emp.employee_name}</p>
                                            <p className="text-xs font-mono text-slate-400">{emp.emp_id}</p>
                                        </td>
                                        <td className="p-4 text-slate-600">{emp.designation || 'Operator'}</td>
                                        <td className="p-4">
                                            {emp.attendance_status === 'PRESENT' ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                                                    In at {emp.punch_in_time}
                                                </span>
                                            ) : emp.attendance_status === 'NOT_PUNCHED' ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                                                    Absent / No Punch
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded bg-amber-50 text-amber-700 text-xs font-bold border border-amber-100">
                                                    {emp.attendance_status.replace('_', ' ')}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredStaff.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-slate-400">
                                            No operators found matching your current filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col h-[500px]">
                    <h3 className="font-bold text-slate-800 mb-6 text-center">Cost Distribution by Role</h3>
                    <div className="flex-1 flex items-center justify-center">
                        {data.chartData && data.chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.chartData}
                                        cx="50%" cy="50%"
                                        innerRadius="50%" outerRadius="80%"
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(value) => formatCurrency(value)}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="text-slate-400 text-sm italic">No labor cost data for this date.</div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
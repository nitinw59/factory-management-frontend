import React, { useState, useEffect, useMemo } from 'react';
import { hrApi } from '../../api/hrApi';
import { 
    LuSearch, LuFilter, LuUser, LuPhone, LuMail, 
    LuMapPin, LuSeparatorVertical, LuActivity, LuClock
} from 'react-icons/lu';

// --- HELPER: Generate Initials for Avatar ---
const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
};

export default function EmployeeDirectoryPage() {
    const [data, setData] = useState({ kpis: {}, employees: [] });
    const [isLoading, setIsLoading] = useState(true);
    
    // Filtering & Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [shiftFilter, setShiftFilter] = useState('All'); // NEW: Shift filter

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const response = await hrApi.getAllEmployees();
                setData(response.data);
            } catch (error) {
                console.error("Failed to load directory", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchEmployees();
    }, []);

    // --- DYNAMIC SHIFT STATS ---
    const shiftStats = useMemo(() => {
        const stats = {};
        data.employees.forEach(emp => {
            const shift = emp.shift_name || 'Unassigned';
            stats[shift] = (stats[shift] || 0) + 1;
        });
        return stats;
    }, [data.employees]);

    // --- LOCAL FILTERING LOGIC ---
    const filteredEmployees = useMemo(() => {
        return data.employees.filter(emp => {
            const matchesSearch = 
                emp.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                emp.emp_id?.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.mobile_no?.includes(searchQuery);
            
            const matchesStatus = statusFilter === 'All' || emp.status === statusFilter;
            const matchesCategory = categoryFilter === 'All' || emp.labor_category === categoryFilter;
            const matchesShift = shiftFilter === 'All' || (emp.shift_name || 'Unassigned') === shiftFilter;

            return matchesSearch && matchesStatus && matchesCategory && matchesShift;
        });
    }, [data.employees, searchQuery, statusFilter, categoryFilter, shiftFilter]);

    // Interactive Card Click Handlers
    const handleKpiClick = (type) => {
        // Reset other filters to provide a clean view of the clicked KPI
        setShiftFilter('All');
        
        if (type === 'TOTAL') {
            setStatusFilter('All');
            setCategoryFilter('All');
        } else if (type === 'ACTIVE') {
            setStatusFilter('Active');
            setCategoryFilter('All');
        } else if (type === 'DIRECT') {
            setStatusFilter('Active');
            setCategoryFilter('Direct Labor');
        } else if (type === 'OVERHEAD') {
            setStatusFilter('Active');
            setCategoryFilter('Overhead');
        }
    };

    const handleShiftClick = (shiftName) => {
        if (shiftFilter === shiftName) {
            setShiftFilter('All'); // Toggle off if already selected
        } else {
            setShiftFilter(shiftName);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><LuActivity className="animate-pulse text-indigo-500 w-12 h-12" /></div>;
    }

    return (
        <div className="p-6 sm:p-8 bg-slate-50 min-h-screen font-inter">
            
            {/* --- HEADER --- */}
            <div className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Employee Directory</h1>
                    <p className="text-slate-500 mt-1 font-medium">Manage personnel, view assignments, and track active headcount.</p>
                </div>
                <div className="text-sm font-bold text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                    Showing {filteredEmployees.length} records
                </div>
            </div>

            {/* --- INTERACTIVE KPI CARDS --- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div 
                    onClick={() => handleKpiClick('TOTAL')}
                    className={`bg-white p-5 rounded-2xl border shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${statusFilter === 'All' && categoryFilter === 'All' && shiftFilter === 'All' ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-200 border-l-4 border-l-indigo-500'}`}
                >
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Headcount</p>
                    <p className="text-3xl font-black text-slate-800 mt-1">{data.kpis.total}</p>
                </div>
                
                <div 
                    onClick={() => handleKpiClick('ACTIVE')}
                    className={`bg-white p-5 rounded-2xl border shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${statusFilter === 'Active' && categoryFilter === 'All' && shiftFilter === 'All' ? 'border-2 border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-200 border-l-4 border-l-emerald-500'}`}
                >
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Staff</p>
                    <p className="text-3xl font-black text-emerald-600 mt-1">{data.kpis.active}</p>
                </div>
                
                <div 
                    onClick={() => handleKpiClick('DIRECT')}
                    className={`bg-white p-5 rounded-2xl border shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${categoryFilter === 'Direct Labor' && shiftFilter === 'All' ? 'border-2 border-blue-500 ring-4 ring-blue-50' : 'border-slate-200 border-l-4 border-l-blue-500'}`}
                >
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Direct Labor</p>
                    <p className="text-3xl font-black text-blue-600 mt-1">{data.kpis.directLabor}</p>
                </div>
                
                <div 
                    onClick={() => handleKpiClick('OVERHEAD')}
                    className={`bg-white p-5 rounded-2xl border shadow-sm cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${categoryFilter === 'Overhead' && shiftFilter === 'All' ? 'border-2 border-slate-500 ring-4 ring-slate-50' : 'border-slate-200 border-l-4 border-l-slate-400'}`}
                >
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overhead</p>
                    <p className="text-3xl font-black text-slate-700 mt-1">{data.kpis.overhead}</p>
                </div>
            </div>

            {/* --- INTERACTIVE SHIFT CARDS --- */}
            <div className="mb-6">
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <LuClock className="mr-2"/> Today's Shift Distribution
                </h2>
                <div className="flex flex-wrap gap-3">
                    {Object.entries(shiftStats).map(([shiftName, count]) => (
                        <div 
                            key={shiftName}
                            onClick={() => handleShiftClick(shiftName)}
                            className={`px-4 py-3 rounded-xl border shadow-sm cursor-pointer transition-all flex items-center gap-3 min-w-[160px] hover:shadow-md hover:-translate-y-0.5 ${
                                shiftFilter === shiftName 
                                ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-100' 
                                : 'bg-white border-slate-200 hover:border-amber-300'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${shiftName === 'Unassigned' ? 'bg-slate-300' : 'bg-amber-500'}`}></div>
                            <div className="flex-1">
                                <p className={`text-sm font-bold leading-none ${shiftFilter === shiftName ? 'text-amber-900' : 'text-slate-700'}`}>
                                    {shiftName}
                                </p>
                            </div>
                            <span className={`text-lg font-black ${shiftFilter === shiftName ? 'text-amber-700' : 'text-slate-400'}`}>
                                {count}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- SEARCH & MANUAL FILTERS --- */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:w-96">
                    <LuSearch className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input 
                        type="text" placeholder="Search by name, ID, or phone..." 
                        className="w-full pl-10 pr-4 py-2.5 font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5">
                        <LuFilter className="text-slate-400 mr-2" size={16} />
                        <select 
                            className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 outline-none cursor-pointer"
                            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="All">All Roles</option>
                            <option value="Direct Labor">Direct Labor</option>
                            <option value="Overhead">Overhead</option>
                            <option value="Unassigned">Unassigned</option>
                        </select>
                    </div>

                    <select 
                        className="bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                        value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Terminated">Terminated</option>
                    </select>
                </div>
            </div>

            {/* --- DATA TABLE --- */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-800 text-white">
                            <tr>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">Employee</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">Contact</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">Assignment</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-amber-200">Today's Shift</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredEmployees.map((emp) => (
                                <tr key={emp.emp_id} className="hover:bg-slate-50 transition-colors">
                                    
                                    {/* Profile */}
                                    <td className="p-4">
                                        <div className="flex items-center">
                                            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                                                {getInitials(emp.employee_name)}
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm font-bold text-slate-800">{emp.employee_name}</p>
                                                <div className="flex items-center text-xs text-slate-500 mt-0.5">
                                                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 mr-2">{emp.emp_id}</span>
                                                    {emp.designation || 'Staff'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Contact Info */}
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1 text-sm text-slate-600 font-medium">
                                            {emp.mobile_no && <span className="flex items-center"><LuPhone size={14} className="mr-1.5 text-slate-400" /> {emp.mobile_no}</span>}
                                            {emp.email && <span className="flex items-center text-xs"><LuMail size={14} className="mr-1.5 text-slate-400" /> {emp.email}</span>}
                                        </div>
                                    </td>

                                    {/* Assignment */}
                                    <td className="p-4">
                                        <div className="flex flex-col items-start">
                                            <span className="font-bold text-sm text-slate-800 flex items-center">
                                                <LuMapPin size={14} className="mr-1 text-indigo-500" /> {emp.assignment}
                                            </span>
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md mt-1.5 ${
                                                emp.labor_category === 'Direct Labor' ? 'bg-blue-50 text-blue-700' :
                                                emp.labor_category === 'Overhead' ? 'bg-slate-100 text-slate-600' :
                                                'bg-orange-50 text-orange-700'
                                            }`}>
                                                {emp.labor_category}
                                            </span>
                                        </div>
                                    </td>

                                    {/* NEW: Shift Column */}
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                            (emp.shift_name && emp.shift_name !== 'Unassigned') 
                                            ? 'bg-amber-50 text-amber-800 border-amber-200' 
                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                        }`}>
                                            <LuClock size={12} className="mr-1.5 opacity-70" />
                                            {emp.shift_name || 'Unassigned'}
                                        </span>
                                    </td>

                                    {/* Status Badge */}
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                            emp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 
                                            emp.status === 'Inactive' ? 'bg-amber-100 text-amber-800' : 
                                            'bg-rose-100 text-rose-800'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                                emp.status === 'Active' ? 'bg-emerald-500' : 
                                                emp.status === 'Inactive' ? 'bg-amber-500' : 
                                                'bg-rose-500'
                                            }`}></span>
                                            {emp.status || 'Unknown'}
                                        </span>
                                    </td>

                                    {/* Actions */}
                                    <td className="p-4 text-right">
                                        <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                            <LuSeparatorVertical size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredEmployees.length === 0 && (
                        <div className="p-16 text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <LuUser size={32} className="text-slate-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">No matching personnel</h3>
                            <p className="text-slate-500 text-sm mt-1">Click the active filter cards above to clear them, or adjust your search.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
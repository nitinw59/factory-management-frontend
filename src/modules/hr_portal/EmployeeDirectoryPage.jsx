import React, { useState, useEffect } from 'react';
import { hrApi } from '../../api/hrApi';
import { 
    LuSearch, LuFilter, LuUser, LuBriefcase, LuPhone, 
    LuMail, LuMapPin, LuSeparatorVertical, LuActivity 
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

    // --- LOCAL FILTERING LOGIC ---
    const filteredEmployees = data.employees.filter(emp => {
        const matchesSearch = 
            emp.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            emp.emp_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.mobile_no?.includes(searchQuery);
        
        const matchesStatus = statusFilter === 'All' || emp.status === statusFilter;
        const matchesCategory = categoryFilter === 'All' || emp.labor_category === categoryFilter;

        return matchesSearch && matchesStatus && matchesCategory;
    });

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><LuActivity className="animate-pulse text-indigo-500 w-12 h-12" /></div>;
    }

    return (
        <div className="p-6 sm:p-8 bg-slate-50 min-h-screen">
            
            {/* --- HEADER & KPIs --- */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Employee Directory</h1>
                <p className="text-slate-500 mt-1">Manage personnel, view assignments, and track active headcount.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-500">
                    <p className="text-xs font-bold text-slate-500 uppercase">Total Headcount</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{data.kpis.total}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
                    <p className="text-xs font-bold text-slate-500 uppercase">Active Staff</p>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{data.kpis.active}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
                    <p className="text-xs font-bold text-slate-500 uppercase">Direct Labor (Lines)</p>
                    <p className="text-2xl font-black text-blue-700 mt-1">{data.kpis.directLabor}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-slate-400">
                    <p className="text-xs font-bold text-slate-500 uppercase">Overhead (Admin)</p>
                    <p className="text-2xl font-black text-slate-700 mt-1">{data.kpis.overhead}</p>
                </div>
            </div>

            {/* --- SEARCH & FILTERS --- */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
                
                {/* Search Bar */}
                <div className="relative w-full sm:w-96">
                    <LuSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search by name, ID, or phone..." 
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Dropdown Filters */}
                <div className="flex gap-3 w-full sm:w-auto">
                    <div className="flex items-center bg-slate-50 border border-slate-300 rounded-lg px-3 py-2">
                        <LuFilter className="text-slate-400 mr-2" size={16} />
                        <select 
                            className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 outline-none cursor-pointer"
                            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="All">All Roles</option>
                            <option value="Direct Labor">Direct Labor</option>
                            <option value="Overhead">Overhead</option>
                            <option value="Unassigned">Unassigned</option>
                        </select>
                    </div>

                    <select 
                        className="bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
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
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Assignment</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredEmployees.map((emp) => (
                                <tr key={emp.emp_id} className="hover:bg-slate-50 transition-colors">
                                    
                                    {/* 1. Profile / Name */}
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

                                    {/* 2. Contact Info */}
                                    <td className="p-4">
                                        <div className="flex flex-col gap-1 text-sm text-slate-600">
                                            {emp.mobile_no && <span className="flex items-center"><LuPhone size={14} className="mr-1.5 text-slate-400" /> {emp.mobile_no}</span>}
                                            {emp.email && <span className="flex items-center text-xs"><LuMail size={14} className="mr-1.5 text-slate-400" /> {emp.email}</span>}
                                        </div>
                                    </td>

                                    {/* 3. The Dual-Track Assignment */}
                                    <td className="p-4">
                                        <div className="flex flex-col items-start">
                                            <span className="font-semibold text-sm text-slate-800 flex items-center">
                                                <LuMapPin size={14} className="mr-1 text-indigo-500" /> {emp.assignment}
                                            </span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                                                emp.labor_category === 'Direct Labor' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                emp.labor_category === 'Overhead' ? 'bg-slate-100 text-slate-700 border border-slate-200' :
                                                'bg-orange-50 text-orange-700 border border-orange-200'
                                            }`}>
                                                {emp.labor_category}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 4. Status Badge */}
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

                                    {/* 5. Actions */}
                                    <td className="p-4 text-right">
                                        <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                            <LuSeparatorVertical size={18} />
                                        </button>
                                    </td>

                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Empty State */}
                    {filteredEmployees.length === 0 && (
                        <div className="p-12 text-center flex flex-col items-center">
                            <LuUser size={48} className="text-slate-200 mb-3" />
                            <h3 className="text-lg font-bold text-slate-800">No employees found</h3>
                            <p className="text-slate-500 text-sm mt-1">Try adjusting your search or filters.</p>
                        </div>
                    )}
                </div>
            </div>
            
        </div>
    );
}
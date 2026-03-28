import React, { useState, useEffect } from 'react';
import { Calendar, TrendingDown, Users, AlertCircle, DollarSign, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { productionManagerApi } from '../../api/productionManagerApi';

// Recharts Color Palette
const COLORS = ['#4f46e5', '#94a3b8']; // Indigo (Present/Direct), Slate (Absent/Indirect)

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export default function ProductionCapacityDashboard() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [data, setData] = useState({ kpis: {}, lineHealth: [], costSplit: [], disruptions: [] });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch from the new backend endpoint
                const res = await productionManagerApi.getCapacityDashboard(date);
                setData(res.data);
            } catch (err) {
                console.error("Failed to load dashboard data", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [date]);

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Activity className="animate-pulse text-indigo-500 w-12 h-12" /></div>;
    }

    return (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto min-h-screen bg-slate-50">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Costing & Capacity</h1>
                    <p className="text-slate-500 mt-1">Monitor line health, labor burn rate, and production disruptions.</p>
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
                    <div className="p-2 text-slate-400 bg-slate-50 rounded-lg mr-2"><Calendar size={18} /></div>
                    <input 
                        type="date" 
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 cursor-pointer pr-2 outline-none"
                    />
                </div>
            </div>

            {/* Top Level KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-500">
                    <p className="text-xs font-bold text-slate-500 uppercase">Total Labor Cost (Est)</p>
                    <p className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(data.kpis.totalDailyCost)}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
                    <p className="text-xs font-bold text-slate-500 uppercase">Direct Labor (Value Add)</p>
                    <p className="text-2xl font-black text-emerald-700 mt-1">{formatCurrency(data.kpis.directCost)}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-slate-400">
                    <p className="text-xs font-bold text-slate-500 uppercase">Indirect Labor (Overhead)</p>
                    <p className="text-2xl font-black text-slate-700 mt-1">{formatCurrency(data.kpis.indirectCost)}</p>
                </div>
                <div className="bg-orange-50 p-5 rounded-2xl border border-orange-200 shadow-sm border-l-4 border-l-orange-500">
                    <p className="text-xs font-bold text-orange-800 uppercase">Late Arrivals (Disruptions)</p>
                    <p className="text-2xl font-black text-orange-700 mt-1">{data.kpis.lateArrivalsCount} Operators</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                
                {/* Line Health Bar Chart */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Users className="text-indigo-500" size={20} /> Line Staffing Health
                    </h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.lineHealth} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                                <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                <Legend wrapperStyle={{paddingTop: '20px'}} />
                                <Bar dataKey="Present" stackId="a" fill="#4f46e5" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="Absent" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Cost Split Pie Chart */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <DollarSign className="text-emerald-500" size={20} /> Labor Cost Breakdown
                    </h3>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.costSplit}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {data.costSplit.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => formatCurrency(value)} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Disruption Watchlist Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <TrendingDown className="text-rose-500" size={20} /> Production Disruptions (Late Arrivals)
                    </h3>
                    <span className="text-xs font-bold bg-rose-100 text-rose-700 px-3 py-1 rounded-full">Grace Period: 9:15 AM</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                            <tr>
                                <th className="p-4">Line Assignment</th>
                                <th className="p-4">Operator Code</th>
                                <th className="p-4">Operator Name</th>
                                <th className="p-4 text-right">Punch In Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.disruptions.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-bold text-indigo-700">{row.line_name}</td>
                                    <td className="p-4 font-mono text-slate-500 text-xs">{row.emp_code}</td>
                                    <td className="p-4 font-medium text-slate-800">{row.employee_name}</td>
                                    <td className="p-4 text-right">
                                        <span className="bg-rose-50 text-rose-700 font-mono font-bold px-3 py-1.5 rounded border border-rose-100">
                                            {row.punch_in_time}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {data.disruptions.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="p-8 text-center text-slate-500">
                                        All operators arrived on time today. Excellent line discipline!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
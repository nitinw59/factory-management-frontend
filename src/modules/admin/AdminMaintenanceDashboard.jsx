import React, { useState, useEffect } from 'react';
import { 
    AlertCircle, Wrench, DollarSign, Clock, ShieldCheck, 
    Activity, ArrowUpRight, AlertTriangle, ShieldAlert, Cpu
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';

import {maintenanceApi} from '../../api/maintenanceApi';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

const KPICard = ({ title, value, subtitle, icon: Icon, colorClass, bgColorClass }) => (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4">
        <div className={`p-4 rounded-xl ${bgColorClass} ${colorClass}`}>
            <Icon size={28} strokeWidth={2.5} />
        </div>
        <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
            <h3 className="text-3xl font-black text-gray-900">{value}</h3>
            {subtitle && <p className="text-xs font-medium text-gray-400 mt-1">{subtitle}</p>}
        </div>
    </div>
);

const AdminMaintenanceDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const res = await maintenanceApi.getAdminAnalytics();
                setData(res.data);
            } catch (err) {
                setError("Failed to load analytics dashboard.");
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, []);

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div></div>;
    if (error) return <div className="p-8 text-red-600 bg-red-50">{error}</div>;
    if (!data) return null;

    const { kpis, inactiveMachines, topOffenders, charts, topSpares } = data;

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
            case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'MEDIUM': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            default: return 'bg-green-100 text-green-800 border-green-200';
        }
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen font-inter pb-24">
            <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center">
                    <Activity className="mr-3 h-8 w-8 text-blue-600"/> 
                    Maintenance Health & Analytics
                </h1>
                <p className="text-gray-500 mt-1 font-medium">Factory asset overview, costs, and mechanic efficiency.</p>
            </header>

            {/* --- KPI SUMMARY CARDS --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <KPICard 
                    title="Total Maint. Cost" 
                    value={`$${kpis.totalMaintenanceCost.toLocaleString()}`} 
                    subtitle="Labor + Spares (Last 12M)"
                    icon={DollarSign} colorClass="text-indigo-600" bgColorClass="bg-indigo-50"
                />
                <KPICard 
                    title="Total Downtime" 
                    value={`${kpis.totalDowntimeHours} Hrs`} 
                    subtitle="Production hours lost"
                    icon={Clock} colorClass="text-rose-600" bgColorClass="bg-rose-50"
                />
                <KPICard 
                    title="PM Compliance" 
                    value={`${kpis.pmComplianceRate}%`} 
                    subtitle="Schedules completed on time"
                    icon={ShieldCheck} colorClass="text-emerald-600" bgColorClass="bg-emerald-50"
                />
                <KPICard 
                    title="Active Bottlenecks" 
                    value={kpis.activeBottlenecks} 
                    subtitle="High/Critical tickets open"
                    icon={AlertTriangle} colorClass="text-amber-600" bgColorClass="bg-amber-50"
                />
            </div>

            {/* --- ACTIONABLE AREA: INACTIVE MACHINES --- */}
            <h2 className="text-xl font-extrabold text-gray-800 mb-4 flex items-center">
                <AlertCircle className="mr-2 text-rose-500"/> Action Required: Currently Inactive Machines
            </h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                
                {/* Breakdowns List */}
                <div className="bg-white rounded-2xl shadow-sm border border-rose-100 overflow-hidden flex flex-col h-[400px]">
                    <div className="p-4 bg-rose-50 border-b border-rose-100 flex justify-between items-center">
                        <h3 className="font-bold text-rose-900 flex items-center">
                            <Wrench className="mr-2 h-5 w-5"/> Reactive Breakdowns ({inactiveMachines.breakdowns.length})
                        </h3>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 space-y-3">
                        {inactiveMachines.breakdowns.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-10">No active breakdowns. Production is smooth!</p>
                        ) : inactiveMachines.breakdowns.map((machine, i) => (
                            <div key={i} className="p-4 border border-gray-100 rounded-xl shadow-sm hover:border-rose-200 transition-colors bg-white">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{machine.asset_name}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{machine.asset_qr_id}</span>
                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{machine.current_line}</span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md border uppercase tracking-wider ${getPriorityColor(machine.priority)}`}>
                                        {machine.priority}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-2 bg-gray-50 p-2 rounded-lg mt-2">"{machine.issue}"</p>
                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                                    <span className="text-xs font-semibold text-rose-600">Reported: {new Date(machine.since).toLocaleDateString()}</span>
                                    <span className="text-[10px] font-bold uppercase text-gray-500 bg-gray-100 px-2 py-1 rounded">{machine.ticket_status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Preventative Maintenance List */}
                <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden flex flex-col h-[400px]">
                    <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                        <h3 className="font-bold text-indigo-900 flex items-center">
                            <ShieldAlert className="mr-2 h-5 w-5"/> Preventative Tasks Due ({inactiveMachines.preventiveMaintenance.length})
                        </h3>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1 space-y-3">
                        {inactiveMachines.preventiveMaintenance.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-10">All PM schedules are up to date.</p>
                        ) : inactiveMachines.preventiveMaintenance.map((machine, i) => (
                            <div key={i} className={`p-4 border rounded-xl shadow-sm transition-colors bg-white ${machine.priority === 'HIGH' ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">{machine.asset_name}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{machine.asset_qr_id}</span>
                                            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{machine.current_line}</span>
                                        </div>
                                    </div>
                                    {machine.priority === 'HIGH' && (
                                        <span className="text-[10px] font-extrabold px-2 py-1 rounded-md border bg-red-100 text-red-800 border-red-200 uppercase tracking-wider animate-pulse">
                                            OVERDUE
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-indigo-800 line-clamp-2 bg-indigo-50 p-2 rounded-lg mt-2 font-medium">
                                    {machine.issue.split('\n')[0].replace('[PREVENTATIVE MAINTENANCE] ', '')}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* --- CHARTS ROW --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center"><ArrowUpRight className="mr-2 text-green-500"/> Maintenance Cost Trend</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={charts.costTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} tickFormatter={(value) => `$${value}`} />
                                <Tooltip cursor={{fill: '#F3F4F6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center"><Cpu className="mr-2 text-purple-500"/> Breakdowns by Line</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={charts.breakdownsByLine} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value">
                                    {charts.breakdownsByLine.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* --- TABLES ROW: TOP OFFENDERS & SPARES --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Most Frequent Breakdowns */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 text-sm uppercase tracking-wider">Most Frequent Breakdowns</h3>
                    <div className="space-y-3">
                        {topOffenders.frequentBreakdowns.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-gray-700">{idx+1}. {item.asset_name}</span>
                                <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-1 rounded">{item.count} tickets</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Highest Cost Assets */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 text-sm uppercase tracking-wider">Highest Cost Assets</h3>
                    <div className="space-y-3">
                        {topOffenders.highestCost.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-gray-700">{idx+1}. {item.asset_name}</span>
                                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded">${item.total_cost.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Consumed Spares */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 text-sm uppercase tracking-wider">Top Spares Consumed</h3>
                    <div className="space-y-3">
                        {topSpares.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-gray-700">{idx+1}. {item.name}</span>
                                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">{item.quantity} used</span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

        </div>
    );
};

export default AdminMaintenanceDashboard;
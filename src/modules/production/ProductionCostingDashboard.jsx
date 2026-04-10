import React, { useState, useEffect, useCallback } from 'react';
import { 
    Calendar, Download, TrendingUp, Users, Package, DollarSign, 
    Loader2, AlertCircle, ChevronDown, ChevronRight, X, Calculator
} from 'lucide-react';
import { costingApi } from '../../api/costingApi';

export default function ProductionCostingDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [fromDate, setFromDate] = useState(lastWeek);
    const [toDate, setToDate] = useState(today);
    
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedDays, setExpandedDays] = useState({});
    
    // Modal State
    const [drilldown, setDrilldown] = useState({ isOpen: false, date: '', dept: '', data: [], loading: false, type: '' });

    const fetchReports = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await costingApi.getCostingReportRange({ params: { fromDate, toDate } });
            setReports(res.data);
            if (res.data.length > 0) setExpandedDays({ [res.data[0].date]: true });
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => { fetchReports(); }, [fetchReports]);

    const formatMoney = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);
    const toggleDay = (date) => setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));

    const openDrilldown = async (date, dept, type) => {
        setDrilldown({ isOpen: true, date, dept, type, data: [], loading: true });
        try {
            let res;
            if (type === 'PRODUCTION') {
                res = await costingApi.getProductionDrilldown({ params: { date, department: dept } });
            } else {
                res = await costingApi.getCostingDrilldown({ params: { date, department: dept } });
            }
            setDrilldown(prev => ({ ...prev, data: res.data, loading: false }));
        } catch (err) {
            alert("Failed to load drilldown details.");
            setDrilldown(prev => ({ ...prev, isOpen: false }));
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto bg-slate-50 min-h-screen font-inter">
            
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 flex items-center">
                        <TrendingUp className="mr-3 text-indigo-600" size={28}/> Daily Costing Matrix
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">View day-by-day profitability and drill down into wages or production.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row w-full xl:w-auto gap-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <input 
                                type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                                className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 outline-none"
                            />
                        </div>
                        <span className="text-slate-400 font-bold text-sm">TO</span>
                        <div className="relative flex-1">
                            <input 
                                type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                                className="w-full pl-3 pr-2 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold text-slate-700 outline-none"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>
                ) : reports.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 font-bold">No data found for this date range.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-800 text-white text-xs uppercase tracking-wider font-black">
                                    <th className="p-4 w-10"></th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4 text-center">Total Strength</th>
                                    <th className="p-4 text-center">Total Prod (Pcs)</th>
                                    <th className="p-4 text-right">Total Cost</th>
                                    <th className="p-4 text-right text-indigo-200">Cost / Piece</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reports.map((dayReport) => (
                                    <React.Fragment key={dayReport.date}>
                                        <tr onClick={() => toggleDay(dayReport.date)} className={`cursor-pointer transition-colors ${expandedDays[dayReport.date] ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                                            <td className="p-4 text-slate-400">{expandedDays[dayReport.date] ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}</td>
                                            <td className="p-4 font-black text-slate-800 text-base">{dayReport.date}</td>
                                            <td className="p-4 text-center font-bold text-slate-600"><Users size={14} className="inline mr-1"/>{dayReport.kpis.totalStrength}</td>
                                            <td className="p-4 text-center font-bold text-blue-600"><Package size={14} className="inline mr-1"/>{dayReport.kpis.totalPieces}</td>
                                            <td className="p-4 text-right font-black text-slate-800">{formatMoney(dayReport.kpis.totalCost)}</td>
                                            <td className="p-4 text-right font-black text-indigo-600 text-lg bg-indigo-50/50">₹{dayReport.kpis.costPerPiece}</td>
                                        </tr>

                                        {expandedDays[dayReport.date] && (
                                            <tr>
                                                <td colSpan="6" className="p-0 bg-slate-50 border-b-2 border-indigo-100">
                                                    <div className="p-4 md:pl-16 md:pr-4">
                                                        {(() => {
                                                            const directDepts = dayReport.departments.filter(d => !d.is_overhead);
                                                            const overheadDepts = dayReport.departments.filter(d => d.is_overhead);
                                                            const directTotal = directDepts.reduce((s, d) => s + (d.total_cost || 0), 0);
                                                            const overheadTotal = overheadDepts.reduce((s, d) => s + (d.total_cost || 0), 0);
                                                            const grandTotal = directTotal + overheadTotal;
                                                            const directPct = grandTotal > 0 ? ((directTotal / grandTotal) * 100).toFixed(1) : 0;
                                                            const overheadPct = grandTotal > 0 ? ((overheadTotal / grandTotal) * 100).toFixed(1) : 0;

                                                            const DeptTable = ({ depts, label, isDirect }) => (
                                                                <div className="mb-4">
                                                                    <div className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-t-xl ${isDirect ? 'bg-indigo-600 text-white' : 'bg-slate-500 text-white'}`}>
                                                                        {label}
                                                                    </div>
                                                                    <table className="w-full text-left bg-white border border-slate-200 rounded-b-xl overflow-hidden shadow-sm">
                                                                        <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2.5">Department</th>
                                                                                <th className="px-4 py-2.5 text-center">Strength</th>
                                                                                <th className="px-4 py-2.5 text-center">Production</th>
                                                                                <th className="px-4 py-2.5 text-right">Regular Cost</th>
                                                                                <th className="px-4 py-2.5 text-right">OT Cost</th>
                                                                                <th className="px-4 py-2.5 text-right">Total</th>
                                                                                {isDirect && <th className="px-4 py-2.5 text-right bg-indigo-50 text-indigo-600">Cost / Piece</th>}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100">
                                                                            {depts.map((dept, idx) => {
                                                                                const cpp = dept.production_qty > 0 ? (dept.total_cost / dept.production_qty).toFixed(2) : null;
                                                                                return (
                                                                                    <tr key={idx} className="hover:bg-slate-50 text-sm">
                                                                                        <td className="px-4 py-3 font-bold text-slate-700">{dept.department_name}</td>
                                                                                        <td onClick={() => openDrilldown(dayReport.date, dept.department_name, 'STRENGTH')} className="px-4 py-3 text-center font-bold text-blue-600 cursor-pointer hover:bg-blue-50 hover:underline">
                                                                                            {dept.strength}
                                                                                        </td>
                                                                                        <td onClick={() => dept.production_qty > 0 && openDrilldown(dayReport.date, dept.department_name, 'PRODUCTION')} className={`px-4 py-3 text-center font-medium ${dept.production_qty > 0 ? 'text-indigo-600 cursor-pointer hover:bg-indigo-50 hover:underline' : 'text-slate-400'}`}>
                                                                                            {dept.production_qty > 0 ? dept.production_qty : '-'}
                                                                                        </td>
                                                                                        <td onClick={() => openDrilldown(dayReport.date, dept.department_name, 'COST')} className="px-4 py-3 text-right font-medium text-emerald-600 cursor-pointer hover:bg-emerald-50 hover:underline">
                                                                                            {formatMoney(dept.regular_cost)}
                                                                                        </td>
                                                                                        <td className="px-4 py-3 text-right font-medium text-amber-600">{dept.ot_cost > 0 ? formatMoney(dept.ot_cost) : '-'}</td>
                                                                                        <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(dept.total_cost)}</td>
                                                                                        {isDirect && (
                                                                                            <td className="px-4 py-3 text-right bg-indigo-50/40">
                                                                                                {cpp ? <span className="font-black text-indigo-700">₹{cpp}</span> : <span className="text-slate-300 font-bold">—</span>}
                                                                                            </td>
                                                                                        )}
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            );

                                                            return (
                                                                <>
                                                                    {directDepts.length > 0 && <DeptTable depts={directDepts} label="Direct Cost Departments" isDirect={true} />}
                                                                    {overheadDepts.length > 0 && <DeptTable depts={overheadDepts} label="Admin / Overhead Departments" isDirect={false} />}

                                                                    {/* Cost Split Summary */}
                                                                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                        <div className="px-4 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest">Cost Split Summary</div>
                                                                        <div className="p-4 flex flex-col md:flex-row gap-4 items-center">
                                                                            <div className="flex-1 w-full">
                                                                                <div className="flex text-[10px] font-black uppercase justify-between mb-1">
                                                                                    <span className="text-indigo-600">Direct {directPct}%</span>
                                                                                    <span className="text-slate-500">Admin {overheadPct}%</span>
                                                                                </div>
                                                                                <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex">
                                                                                    <div className="bg-indigo-500 h-full transition-all" style={{ width: `${directPct}%` }} />
                                                                                    <div className="bg-slate-400 h-full transition-all" style={{ width: `${overheadPct}%` }} />
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-3 shrink-0">
                                                                                <div className="flex flex-col items-center bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 min-w-[130px]">
                                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Direct Cost</span>
                                                                                    <span className="text-xl font-black text-indigo-700">{formatMoney(directTotal)}</span>
                                                                                    <span className="text-xs font-bold text-indigo-400 mt-0.5">{directPct}% of total</span>
                                                                                </div>
                                                                                <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 min-w-[130px]">
                                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Admin Cost</span>
                                                                                    <span className="text-xl font-black text-slate-700">{formatMoney(overheadTotal)}</span>
                                                                                    <span className="text-xs font-bold text-slate-400 mt-0.5">{overheadPct}% of total</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* --- DRILLDOWN MODAL --- */}
            {drilldown.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 flex items-center">
                                    {drilldown.type === 'PRODUCTION' && <Package className="mr-2 text-indigo-600"/>}
                                    {drilldown.type === 'STRENGTH' && <Users className="mr-2 text-blue-600"/>}
                                    {drilldown.type === 'COST' && <Calculator className="mr-2 text-emerald-600"/>}
                                    {drilldown.dept} Breakdown
                                </h2>
                                <p className="text-sm font-medium text-slate-500 mt-1">{drilldown.date}</p>
                            </div>
                            <button onClick={() => setDrilldown({ ...drilldown, isOpen: false })} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-auto p-0">
                            {drilldown.loading ? (
                                <div className="flex justify-center items-center h-48"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
                            ) : drilldown.type === 'PRODUCTION' ? (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100 sticky top-0 shadow-sm text-xs uppercase font-bold text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Hour Block</th>
                                            <th className="px-4 py-3">Product Name</th>
                                            <th className="px-4 py-3">Batch Code</th>
                                            <th className="px-4 py-3 text-right bg-indigo-50 text-indigo-700">Pieces Produced</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {drilldown.data.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 font-bold text-slate-700">{row.hour}</td>
                                                <td className="px-4 py-3 font-medium text-slate-600">{row.product}</td>
                                                <td className="px-4 py-3 text-slate-500 font-mono">{row.batch}</td>
                                                <td className="px-4 py-3 text-right font-black text-indigo-600 bg-indigo-50/20">{row.pieces}</td>
                                            </tr>
                                        ))}
                                        {drilldown.data.length === 0 && (
                                            <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium">No production logs found for this day.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100 sticky top-0 shadow-sm text-xs uppercase font-bold text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3">Employee</th>
                                            <th className="px-4 py-3">Base Salary</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Times</th>
                                            <th className="px-4 py-3 text-right bg-emerald-50 text-emerald-700">Reg. Wage Calc</th>
                                            <th className="px-4 py-3 text-right bg-amber-50 text-amber-700">OT Calc</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {drilldown.data.map((emp, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-slate-800">{emp.employee_name}</div>
                                                    <div className="text-xs text-slate-400">{emp.designation || 'Operator'}</div>
                                                </td>
                                                <td className="px-4 py-3 font-mono">₹{parseFloat(emp.base_salary).toLocaleString()}/mo</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-black tracking-wider ${emp.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {emp.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs font-mono font-bold text-slate-500">
                                                    <span className="text-emerald-600">{emp.punch_in || '--:--'}</span> <br/> 
                                                    {/* SHOW MISSING CLEANLY INSTEAD OF BLANK */}
                                                    <span className="text-rose-600">{emp.punch_out || 'MISSING'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right bg-emerald-50/30">
                                                    <div className="font-bold text-emerald-700">{formatMoney(emp.regular_cost)}</div>
                                                    <div className="text-[10px] text-emerald-500 mt-0.5 font-bold">
                                                        {emp.status === 'HALF_DAY' ? `(Base / ${emp.month_working_days * 2})` : `(Base / ${emp.month_working_days})`}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right bg-amber-50/30">
                                                    <div className="font-bold text-amber-700">{emp.ot_cost > 0 ? formatMoney(emp.ot_cost) : '-'}</div>
                                                    {emp.ot_cost > 0 && (
                                                        <div className="text-[10px] text-amber-500 mt-0.5 font-bold">
                                                            {parseFloat(emp.overtime_hours).toFixed(1)} hrs × 1.5x
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
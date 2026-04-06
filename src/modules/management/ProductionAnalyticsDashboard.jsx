import React, { useState, useEffect } from 'react';
import { Activity, Factory, Loader2, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';

const fetchProductionData = async () => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                oeeMetrics: {
                    availability: 92.5,
                    performance: 88.0,
                    quality: 98.2,
                    overall: 79.8,
                    trend: '+2.4%'
                },
                liveLines: [
                    { id: 1, name: "Line 1 - Primary Assm.", target: 1200, actual: 1050, status: "RUNNING", efficiency: 87.5 },
                    { id: 2, name: "Line 2 - Sleeves", target: 800, actual: 810, status: "RUNNING", efficiency: 101.2 },
                    { id: 3, name: "Line 3 - Collars", target: 600, actual: 200, status: "DOWN", efficiency: 33.3 },
                    { id: 4, name: "Line 4 - Finishing", target: 1000, actual: 950, status: "RUNNING", efficiency: 95.0 },
                ]
            });
        }, 600);
    });
};

const OEEGauge = ({ value, label, color, size = "lg" }) => {
    const radius = size === "lg" ? 70 : 45;
    const stroke = size === "lg" ? 14 : 10;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    return (
        <div className="flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center">
                <svg height={radius * 2} width={radius * 2} className="-rotate-90 transform">
                    <circle stroke="#f1f5f9" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
                    <circle stroke={color} fill="transparent" strokeWidth={stroke} strokeDasharray={circumference + ' ' + circumference} style={{ strokeDashoffset, transition: 'stroke-dashoffset 1.5s ease-in-out' }} strokeLinecap="round" r={normalizedRadius} cx={radius} cy={radius} />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                    <span className={`font-black ${size === "lg" ? "text-5xl" : "text-2xl"} text-slate-900 tracking-tighter`}>{value}<span className="text-xl">%</span></span>
                </div>
            </div>
            <span className="mt-4 font-black text-slate-500 uppercase tracking-widest text-sm">{label}</span>
        </div>
    );
};

export default function ProductionAnalyticsDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchProductionData().then(res => { setData(res); setLoading(false); }); }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Loader2 className="w-12 h-12 text-indigo-600 animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-slate-200 p-4 md:p-10 font-inter">
            <div className="max-w-[1600px] mx-auto">
                
                <div className="mb-10 bg-white p-8 rounded-[2rem] shadow-sm border-b-4 border-slate-300">
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center uppercase">
                        <Factory className="w-12 h-12 mr-5 text-indigo-600" /> Production OEE
                    </h1>
                    <p className="text-slate-500 font-bold tracking-widest uppercase mt-3 ml-17">Live Floor Efficiency & Throughput</p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12">
                    <div className="bg-white rounded-[2rem] p-10 border border-slate-200 shadow-xl xl:col-span-1 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-6 right-6 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg font-black text-sm flex items-center shadow-sm">
                            <ArrowUpRight size={18} className="mr-1"/> {data.oeeMetrics.trend}
                        </div>
                        <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest mb-10">Master OEE Score</h3>
                        <OEEGauge value={data.oeeMetrics.overall} label="Overall Equipment Effectiveness" color="#4f46e5" size="lg" />
                    </div>

                    <div className="bg-white rounded-[2rem] p-10 border border-slate-200 shadow-sm xl:col-span-2">
                        <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest mb-10">Efficiency Breakdown</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 h-full items-center">
                            <div className="flex flex-col items-center p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                <OEEGauge value={data.oeeMetrics.availability} label="Availability" color="#3b82f6" size="sm" />
                            </div>
                            <div className="flex flex-col items-center p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                <OEEGauge value={data.oeeMetrics.performance} label="Performance" color="#f59e0b" size="sm" />
                            </div>
                            <div className="flex flex-col items-center p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                <OEEGauge value={data.oeeMetrics.quality} label="Quality" color="#10b981" size="sm" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border-2 border-slate-200">
                    <div className="p-8 bg-slate-900 border-b border-slate-800">
                        <h3 className="text-2xl font-black text-white flex items-center tracking-widest uppercase">
                            <Activity className="w-8 h-8 mr-4 text-indigo-400" /> Live Line Status
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-500 text-sm uppercase tracking-widest font-black border-b-4 border-slate-200">
                                    <th className="px-8 py-6">Production Line</th>
                                    <th className="px-8 py-6">Status</th>
                                    <th className="px-8 py-6 text-right">Target</th>
                                    <th className="px-8 py-6 text-right">Actual</th>
                                    <th className="px-8 py-6 text-right">Efficiency</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-slate-100">
                                {data.liveLines.map(line => (
                                    <tr key={line.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-8 py-6 font-black text-slate-900 text-xl tracking-tight">{line.name}</td>
                                        <td className="px-8 py-6">
                                            <span className={`inline-flex items-center px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest shadow-sm ${line.status === 'RUNNING' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'}`}>
                                                {line.status === 'RUNNING' ? <span className="w-3 h-3 rounded-full bg-emerald-500 mr-2 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> : <AlertTriangle className="w-4 h-4 mr-2"/>}
                                                {line.status}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right font-mono font-bold text-slate-400 text-2xl">{line.target}</td>
                                        <td className="px-8 py-6 text-right font-mono font-black text-indigo-600 text-3xl">{line.actual}</td>
                                        <td className="px-8 py-6 text-right w-64">
                                            <div className="flex items-center justify-end">
                                                <span className={`font-black text-2xl tracking-tighter mr-4 ${line.efficiency >= 90 ? 'text-emerald-600' : line.efficiency >= 70 ? 'text-amber-500' : 'text-rose-600'}`}>
                                                    {line.efficiency.toFixed(1)}%
                                                </span>
                                                <div className="w-32 h-4 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                                                    <div className={`h-full rounded-full transition-all duration-1000 ${line.efficiency >= 90 ? 'bg-emerald-500' : line.efficiency >= 70 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${Math.min(line.efficiency, 100)}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
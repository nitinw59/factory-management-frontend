import React, { useState, useEffect, useMemo } from 'react';
import { lineManagerApi } from '../../api/lineManagerApi';
import { 
    LuActivity, LuCalendar, LuSave, LuPlus, LuMinus, 
    LuTrendingUp, LuCircleCheck, LuClock, LuCircleAlert, LuX, LuListChecks
} from 'react-icons/lu';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

// Helper to format 24h string "14:30" to "02:30 PM"
const formatTime = (timeStr) => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const formattedHour = h % 12 || 12;
    return `${formattedHour}:${minutes} ${ampm}`;
};

export default function OutputLogsPage() {
    const [data, setData] = useState({ lines: [], timeSlots: [], dayLogs: [], weekLogs: [], monthLogs: [], todayTotals: {} });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [activeTab, setActiveTab] = useState('ENTRY'); 

    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedLine, setSelectedLine] = useState('');
    const [selectedSlot, setSelectedSlot] = useState('');
    const [isEntryModalOpen, setIsEntryModalOpen] = useState(false); 

    // NEW: Metrics State to hold { "Good Pieces": 50, "Reject": 2 }
    const [metrics, setMetrics] = useState({});
    const [activeMetricTab, setActiveMetricTab] = useState('');

    useEffect(() => { fetchData(); }, [selectedDate]);

    useEffect(() => {
        if (data.lines.length > 0 && !selectedLine) {
            setSelectedLine(data.lines[0].id);
        }
    }, [data.lines, selectedLine]);

    const activeLineAttributes = useMemo(() => {
        const line = data.lines.find(l => l.id.toString() === selectedLine.toString());
        return line?.output_attributes || ['Total Quantity'];
    }, [data.lines, selectedLine]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const response = await lineManagerApi.getOutputAnalytics(selectedDate);
            setData(response.data);
        } catch (error) {
            console.error("Failed to fetch analytics", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Open Modal and Pre-fill ALL attributes
    const handleOpenModal = (slot) => {
        setSelectedSlot(slot);
        const existingLog = data.dayLogs.find(log => log.timeSlot === slot);
        
        const initialMetrics = {};
        activeLineAttributes.forEach(attr => {
            initialMetrics[attr] = existingLog?.metrics?.[attr] || 0;
        });
        
        setMetrics(initialMetrics);
        setActiveMetricTab(activeLineAttributes[0]);
        setIsEntryModalOpen(true);
    };

    const handleSave = async () => {
        if (!selectedLine || !selectedSlot) return alert("Select line and time slot.");
        setIsSaving(true);
        try {
            await lineManagerApi.logHourlyOutput({
                lineId: selectedLine,
                date: selectedDate,
                timeSlot: selectedSlot,
                metrics: metrics // Send the entire JSON object
            });
            setTimeout(() => {
                fetchData();
                setIsSaving(false);
                setIsEntryModalOpen(false); 
            }, 400);
        } catch (error) {
            alert("Failed to save output.");
            setIsSaving(false);
        }
    };

    const adjustQuantity = (amount) => {
        setMetrics(prev => ({
            ...prev,
            [activeMetricTab]: Math.max(0, parseInt(prev[activeMetricTab] || 0) + amount)
        }));
    };

    if (isLoading && data.lines.length === 0) {
        return <div className="flex justify-center items-center h-[400px]"><LuActivity className="animate-pulse text-indigo-500 w-10 h-10" /></div>;
    }

    const pendingSlots = [];
    const completedSlots = [];
    
    data.timeSlots.forEach(slot => {
        const log = data.dayLogs.find(l => l.timeSlot === slot);
        if (log) completedSlots.push({ slot, ...log });
        else pendingSlots.push({ slot });
    });

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
            
            {/* Header & Dynamic Totals */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Production Output</h1>
                    <div className="flex gap-3 mt-3">
                        <select 
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)}
                        >
                            {data.lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <input 
                            type="date" 
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 outline-none"
                            value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                </div>
                
                {/* DYNAMIC TOTALS UI */}
                <div className="bg-indigo-50 px-6 py-3 rounded-xl border border-indigo-100 w-full md:w-auto">
                    <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 text-center md:text-right">Today's Output</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center md:justify-end">
                        
                        {Object.keys(data.todayTotals || {}).length === 0 && (
                            <div className="text-center md:text-right">
                                <p className="text-2xl font-black text-indigo-900">0</p>
                                <p className="text-[10px] font-bold text-indigo-400 uppercase">Items</p>
                            </div>
                        )}

                        {Object.entries(data.todayTotals || {}).map(([attributeName, totalValue]) => (
                            <div key={attributeName} className="text-center md:text-right">
                                <p className="text-2xl font-black text-indigo-900">{totalValue}</p>
                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">{attributeName}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex overflow-x-auto hide-scrollbar bg-slate-200/50 p-1.5 rounded-xl gap-1">
                <button onClick={() => setActiveTab('ENTRY')} className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'ENTRY' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}>Log Output</button>
                <button onClick={() => setActiveTab('DAY')} className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'DAY' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}>Daily Analytics</button>
                <button onClick={() => setActiveTab('WEEK')} className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'WEEK' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}>Weekly Trend</button>
                <button onClick={() => setActiveTab('MONTH')} className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'MONTH' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'}`}>Monthly</button>
            </div>

            {/* TAB 1: DATA ENTRY (VERTICAL LIST) */}
            {activeTab === 'ENTRY' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 animate-in fade-in duration-300 max-w-3xl mx-auto">
                    <h2 className="font-bold text-slate-800 flex items-center mb-6">
                        <LuClock className="mr-2 text-indigo-500" /> Tap a time slot to log production
                    </h2>
                    
                    <div className="space-y-8">
                        {pendingSlots.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-3 ml-1">Pending Entry</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {pendingSlots.map((item) => (
                                        <button
                                            key={item.slot} onClick={() => handleOpenModal(item.slot)}
                                            className="flex items-center justify-between p-4 rounded-xl border-2 border-slate-100 hover:border-indigo-300 bg-white text-slate-600 transition-all text-left shadow-sm hover:shadow active:scale-95"
                                        >
                                            <span className="font-bold text-lg">{formatTime(item.slot)}</span>
                                            <span className="text-sm font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">Log Data</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {completedSlots.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-3 ml-1">Completed</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {completedSlots.map((item) => (
                                        <button
                                            key={item.slot} onClick={() => handleOpenModal(item.slot)}
                                            className="flex flex-col p-4 rounded-xl border-2 border-emerald-100 hover:border-emerald-300 bg-emerald-50/30 text-slate-600 transition-all text-left shadow-sm active:scale-95"
                                        >
                                            <div className="flex items-center justify-between w-full mb-2">
                                                <div className="flex items-center">
                                                    <LuCircleCheck className="mr-2 text-emerald-500" size={20} />
                                                    <span className="font-bold text-lg text-emerald-900">{formatTime(item.slot)}</span>
                                                </div>
                                                <span className="text-lg font-black text-emerald-600">{item.totalOutput} <span className="text-xs font-medium opacity-70">pcs total</span></span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {Object.entries(item.metrics || {}).map(([key, val]) => (
                                                    <span key={key} className="text-[10px] font-bold bg-white border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded">
                                                        {key}: {val}
                                                    </span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {data.timeSlots.length === 0 && (
                            <div className="text-center p-10 text-slate-400 flex flex-col items-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                <LuCircleAlert size={40} className="mb-3 opacity-50"/>
                                <p className="text-base font-bold text-slate-500">No time slots configured.</p>
                                <p className="text-sm mt-1">Contact the Factory Admin to set up shift hours.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2/3/4: ANALYTICS */}
            {activeTab !== 'ENTRY' && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6 h-[500px] flex flex-col animate-in fade-in duration-300">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center">
                        <LuTrendingUp className="mr-2 text-indigo-500"/> 
                        {activeTab === 'DAY' ? "Today's Hourly Trend" : activeTab === 'WEEK' ? "Last 7 Days Output" : "This Month's Daily Output"}
                    </h3>
                    
                    <div className="flex-1 w-full relative">
                        {isLoading && <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10"><LuActivity className="animate-spin text-indigo-500" size={24}/></div>}
                        
                        <ResponsiveContainer width="100%" height="100%">
                            {activeTab === 'DAY' ? (
                                <AreaChart data={data.dayLogs}>
                                    <defs>
                                        <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="timeSlot" tickFormatter={formatTime} tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <RechartsTooltip labelFormatter={formatTime} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Area type="monotone" dataKey="output" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorOutput)" />
                                </AreaChart>
                            ) : (
                                <BarChart data={activeTab === 'WEEK' ? data.weekLogs : data.monthLogs}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <YAxis tick={{fill: '#64748b', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Bar dataKey="output" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* MULTI-ATTRIBUTE MODAL NUMPAD */}
            {isEntryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Logging For</p>
                                <h2 className="text-2xl font-black text-slate-800">{formatTime(selectedSlot)}</h2>
                            </div>
                            <button onClick={() => setIsEntryModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                <LuX size={24} />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            {/* Horizontal Scroll Attribute Tabs */}
                            <div className="flex overflow-x-auto gap-2 mb-6 pb-2 hide-scrollbar">
                                {activeLineAttributes.map(attr => (
                                    <button
                                        key={attr}
                                        onClick={() => setActiveMetricTab(attr)}
                                        className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm transition-all border-2 ${
                                            activeMetricTab === attr 
                                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm' 
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        {attr}
                                        <span className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] ${activeMetricTab === attr ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100'}`}>
                                            {metrics[attr] || 0}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Input Pad (Targets Active Tab) */}
                            <div className="flex items-center justify-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-inner w-full mb-6">
                                <button onClick={() => adjustQuantity(-1)} className="w-14 h-14 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 shadow-sm transition-transform"><LuMinus size={24}/></button>
                                <input 
                                    type="number" 
                                    className="w-full text-center text-6xl font-black text-indigo-600 bg-transparent border-none outline-none focus:ring-0 p-0"
                                    value={metrics[activeMetricTab] || 0} 
                                    onChange={(e) => setMetrics({...metrics, [activeMetricTab]: parseInt(e.target.value) || 0})}
                                />
                                <button onClick={() => adjustQuantity(1)} className="w-14 h-14 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 shadow-sm transition-transform"><LuPlus size={24}/></button>
                            </div>

                            <div className="grid grid-cols-4 gap-3 w-full mb-8">
                                <button onClick={() => adjustQuantity(-20)} className="py-3 bg-rose-50 text-rose-700 font-bold rounded-xl hover:bg-rose-100 active:scale-95 shadow-sm">-20</button>
                                <button onClick={() => adjustQuantity(-10)} className="py-3 bg-rose-50 text-rose-700 font-bold rounded-xl hover:bg-rose-100 active:scale-95 shadow-sm">-10</button>
                                <button onClick={() => adjustQuantity(10)} className="py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 active:scale-95 shadow-sm">+10</button>
                                <button onClick={() => adjustQuantity(20)} className="py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 active:scale-95 shadow-sm">+20</button>
                            </div>

                            <button 
                                onClick={handleSave} disabled={isSaving}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-black text-lg shadow-lg shadow-indigo-200 flex items-center justify-center transition-all active:scale-[0.98]"
                            >
                                {isSaving ? <LuActivity className="animate-spin mr-3" size={24} /> : <LuListChecks className="mr-3" size={24} />}
                                {isSaving ? 'SAVING...' : 'SAVE ALL METRICS'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
import React, { useState, useEffect } from 'react';
import { 
    Factory, Users, Clock, AlertTriangle, Monitor, 
    CheckCircle2, Loader2, Shirt, ArrowLeft,
    UserCircle, Activity, Layers, Calendar, ChevronRight
} from 'lucide-react';

// ============================================================================
// DEEP MOCK DATA (Mirrors the future Backend Aggregation)
// ============================================================================
const fetchLineControlData = async () => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                lines: [
                    {
                        line_id: 1,
                        line_name: "Line 1 - Main Assembly",
                        wip_limit: 5,
                        metrics: { total_completed: 450, current_wip: 2, dhu: 1.2 },
                        active_batches: [
                            { 
                                batchCode: "BCH-1092", product: "Men's Polo (Navy)", target: 1200, completed: 450,
                                history: [
                                    { stage: "Material Loaded", time: "09:15 AM", pieces: 1200, status: "COMPLETED" },
                                    { stage: "Primary Sewing", time: "10:30 AM", pieces: 800, status: "IN_PROGRESS" },
                                    { stage: "Final Assembly", time: "11:45 AM", pieces: 450, status: "IN_PROGRESS" }
                                ]
                            },
                            { 
                                batchCode: "BCH-1093", product: "Denim Jeans (32)", target: 800, completed: 0,
                                history: [
                                    { stage: "Material Loaded", time: "11:30 AM", pieces: 800, status: "COMPLETED" },
                                    { stage: "Primary Sewing", time: "Pending", pieces: 0, status: "PENDING" }
                                ]
                            }
                        ],
                        workstations: [
                            {
                                id: 101, name: "Station 1A (Loader)", type: "loader",
                                operator: { 
                                    name: "Ravi Kumar", emp_id: "EMP-4012", attendance: "PRESENT", 
                                    punch_in: "08:55 AM", shift: "Morning (09:00 - 18:00)", efficiency: 94,
                                    activity: [
                                        { time: "09:15 AM", action: "Loaded Batch BCH-1092", qty: 1200 },
                                        { time: "11:30 AM", action: "Loaded Batch BCH-1093", qty: 800 }
                                    ]
                                }
                            },
                            {
                                id: 102, name: "Station 1B (Sewing)", type: "regular",
                                operator: { 
                                    name: "Anita Sharma", emp_id: "EMP-4018", attendance: "HALF_DAY", 
                                    punch_in: "13:00 PM", shift: "Morning (09:00 - 18:00)", efficiency: 82,
                                    activity: [
                                        { time: "13:10 PM", action: "Processed Pieces (BCH-1092)", qty: 150 }
                                    ]
                                }
                            },
                            {
                                id: 103, name: "Station 1C (Sewing)", type: "regular",
                                operator: { 
                                    name: "Sunil Verma", emp_id: "EMP-4022", attendance: "ABSENT", 
                                    punch_in: null, shift: "Morning (09:00 - 18:00)", efficiency: 0, activity: []
                                }
                            }
                        ]
                    },
                    {
                        line_id: 2,
                        line_name: "Line 2 - Sleeves Prep",
                        wip_limit: 3,
                        metrics: { total_completed: 820, current_wip: 4, dhu: 4.5 }, // WIP WARNING
                        active_batches: [
                            { 
                                batchCode: "BCH-1095", product: "Winter Jacket (L)", target: 1000, completed: 820,
                                history: [
                                    { stage: "Material Loaded", time: "08:30 AM", pieces: 1000, status: "COMPLETED" },
                                    { stage: "Sleeve Prep", time: "09:00 AM", pieces: 820, status: "IN_PROGRESS" }
                                ]
                            }
                        ],
                        workstations: [
                            {
                                id: 201, name: "Station 2A (Prep)", type: "loader",
                                operator: { 
                                    name: "Vikram Singh", emp_id: "EMP-3011", attendance: "PRESENT", 
                                    punch_in: "08:45 AM", shift: "Morning (09:00 - 18:00)", efficiency: 88,
                                    activity: [
                                        { time: "09:00 AM", action: "Processed Bundles (BCH-1095)", qty: 820 }
                                    ]
                                }
                            },
                            {
                                id: 202, name: "Station 2B (Prep)", type: "unloader",
                                operator: null 
                            }
                        ]
                    }
                ]
            });
        }, 800);
    });
};

// ============================================================================
// DRILL-DOWN VIEWS
// ============================================================================

const BatchDetailView = ({ batch, lineName, onBack }) => (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
        <button onClick={onBack} className="mb-6 flex items-center text-slate-500 hover:text-black font-black uppercase tracking-widest transition-colors bg-white px-6 py-3 rounded-xl border-2 border-slate-200 shadow-sm active:scale-95">
            <ArrowLeft className="w-5 h-5 mr-3"/> Back to Floor
        </button>

        <div className="bg-white rounded-[2rem] p-10 border-2 border-slate-300 shadow-xl mb-8">
            <div className="flex justify-between items-start mb-10 pb-8 border-b-2 border-slate-100">
                <div>
                    <h2 className="text-4xl font-black text-black flex items-center tracking-tight mb-2">
                        <Shirt className="w-10 h-10 mr-5 text-indigo-600"/> {batch.batchCode}
                    </h2>
                    <span className="text-xl font-bold text-slate-500 flex items-center">
                        <Layers className="w-5 h-5 mr-2"/> {batch.product}
                    </span>
                </div>
                <div className="text-right">
                    <span className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Target Quantity</span>
                    <span className="text-5xl font-black tracking-tighter text-black">{batch.target}</span>
                </div>
            </div>

            <div className="flex items-center justify-between mb-12 bg-slate-50 p-8 rounded-2xl border-2 border-slate-100">
                <div className="w-full mr-8">
                    <div className="flex justify-between text-sm font-black uppercase tracking-widest text-slate-500 mb-3">
                        <span>Line Progress ({lineName})</span>
                        <span className="text-indigo-600">{Math.round((batch.completed / batch.target) * 100)}%</span>
                    </div>
                    <div className="h-6 w-full bg-slate-200 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(batch.completed / batch.target) * 100}%` }}></div>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <span className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</span>
                    <span className="text-4xl font-black text-indigo-600">{batch.completed}</span>
                </div>
            </div>

            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center uppercase tracking-widest">
                <Activity className="w-6 h-6 mr-3 text-indigo-500"/> Routing Timeline
            </h3>
            
            <div className="space-y-4">
                {batch.history.map((stage, idx) => (
                    <div key={idx} className="flex items-center p-6 bg-white border-2 border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors">
                        <div className={`p-3 rounded-xl mr-6 ${stage.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : stage.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                            {stage.status === 'COMPLETED' ? <CheckCircle2 className="w-6 h-6"/> : stage.status === 'IN_PROGRESS' ? <Loader2 className="w-6 h-6 animate-spin"/> : <Clock className="w-6 h-6"/>}
                        </div>
                        <div className="flex-grow">
                            <h4 className="font-black text-xl text-slate-900">{stage.stage}</h4>
                            <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">{stage.time}</span>
                        </div>
                        <div className="text-right">
                            <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Pieces Tracked</span>
                            <span className="text-2xl font-black text-slate-800">{stage.pieces}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const OperatorDetailView = ({ operator, stationName, onBack }) => (
    <div className="animate-in fade-in slide-in-from-bottom-8 duration-300">
        <button onClick={onBack} className="mb-6 flex items-center text-slate-500 hover:text-black font-black uppercase tracking-widest transition-colors bg-white px-6 py-3 rounded-xl border-2 border-slate-200 shadow-sm active:scale-95">
            <ArrowLeft className="w-5 h-5 mr-3"/> Back to Floor
        </button>

        <div className="bg-white rounded-[2rem] p-10 border-2 border-slate-300 shadow-xl mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-8 border-b-2 border-slate-100 gap-6">
                <div className="flex items-center">
                    <div className="w-20 h-20 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-4xl mr-6 shadow-inner">
                        {operator.name.charAt(0)}
                    </div>
                    <div>
                        <h2 className="text-4xl font-black text-black tracking-tight">{operator.name}</h2>
                        <span className="text-lg font-bold text-slate-500 flex items-center mt-1">
                            <UserCircle className="w-5 h-5 mr-2"/> {operator.emp_id} | {stationName}
                        </span>
                    </div>
                </div>
                <div className="text-right flex items-center gap-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div>
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Live Efficiency</span>
                        <span className={`text-4xl font-black ${operator.efficiency >= 90 ? 'text-emerald-600' : operator.efficiency >= 75 ? 'text-amber-500' : 'text-rose-600'}`}>
                            {operator.efficiency}%
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center">
                    <Clock className="w-8 h-8 text-indigo-400 mr-4" />
                    <div>
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Assigned Shift</span>
                        <span className="text-sm font-black text-slate-800">{operator.shift}</span>
                    </div>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mr-4" />
                    <div>
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Punch In Time</span>
                        <span className="text-lg font-black text-slate-800">{operator.punch_in || 'N/A'}</span>
                    </div>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex items-center">
                    <AlertTriangle className={`w-8 h-8 mr-4 ${operator.attendance === 'PRESENT' ? 'text-emerald-500' : 'text-rose-500'}`} />
                    <div>
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Today's Status</span>
                        <span className={`text-lg font-black uppercase tracking-widest ${operator.attendance === 'PRESENT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {operator.attendance.replace('_', ' ')}
                        </span>
                    </div>
                </div>
            </div>

            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center uppercase tracking-widest">
                <Activity className="w-6 h-6 mr-3 text-indigo-500"/> Recent Terminal Activity
            </h3>
            
            <div className="space-y-4">
                {operator.activity.length === 0 ? (
                     <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                         <span className="text-slate-400 font-bold uppercase tracking-widest">No activity logged today.</span>
                     </div>
                ) : (
                    operator.activity.map((act, idx) => (
                        <div key={idx} className="flex justify-between items-center p-6 bg-white border-2 border-slate-200 rounded-2xl hover:border-indigo-300 transition-colors">
                            <div>
                                <span className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1 block">{act.time}</span>
                                <h4 className="font-black text-lg text-slate-900">{act.action}</h4>
                            </div>
                            <div className="text-right">
                                <span className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</span>
                                <span className="text-2xl font-black text-indigo-600">+{act.qty}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    </div>
);

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function FactoryLineControlBoard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // State for Drill-Downs
    const [viewMode, setViewMode] = useState('MAIN'); // 'MAIN', 'BATCH_DETAIL', 'OPERATOR_DETAIL'
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [contextInfo, setContextInfo] = useState("");

    useEffect(() => {
        fetchLineControlData().then(res => {
            setData(res);
            setLoading(false);
        });
    }, []);

    const handleBatchClick = (batch, lineName) => {
        setSelectedEntity(batch);
        setContextInfo(lineName);
        setViewMode('BATCH_DETAIL');
    };

    const handleOperatorClick = (operator, stationName) => {
        if (!operator) return; // Ignore clicks on unassigned stations
        setSelectedEntity(operator);
        setContextInfo(stationName);
        setViewMode('OPERATOR_DETAIL');
    };

    const goBack = () => {
        setViewMode('MAIN');
        setSelectedEntity(null);
        setContextInfo("");
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-200"><Loader2 className="w-16 h-16 text-black animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-slate-200 p-4 md:p-10 font-inter">
            <div className="max-w-[1800px] mx-auto">
                
                {/* GLOBAL HEADER (Persists across views) */}
                <div className="mb-10 bg-black p-8 rounded-[2rem] shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center">
                    <div>
                        <h1 className="text-4xl font-black text-white tracking-tight flex items-center uppercase">
                            <Factory className="w-10 h-10 mr-5 text-amber-400" /> Line Control Board
                        </h1>
                        <p className="text-slate-400 font-bold tracking-widest uppercase mt-2 ml-15">Live Workstation & Personnel Mapping</p>
                    </div>
                    {viewMode === 'MAIN' && (
                        <div className="flex items-center gap-4 mt-6 md:mt-0 bg-slate-900 p-4 rounded-xl border border-slate-800">
                            <div className="flex items-center mr-4"><span className="w-3 h-3 bg-emerald-500 rounded-full mr-2"></span><span className="text-xs font-bold text-white uppercase tracking-widest">Present</span></div>
                            <div className="flex items-center mr-4"><span className="w-3 h-3 bg-amber-400 rounded-full mr-2"></span><span className="text-xs font-bold text-white uppercase tracking-widest">Half Day</span></div>
                            <div className="flex items-center"><span className="w-3 h-3 bg-rose-500 rounded-full mr-2"></span><span className="text-xs font-bold text-white uppercase tracking-widest">Absent</span></div>
                        </div>
                    )}
                </div>

                {/* ROUTER LOGIC */}
                {viewMode === 'BATCH_DETAIL' && <BatchDetailView batch={selectedEntity} lineName={contextInfo} onBack={goBack} />}
                {viewMode === 'OPERATOR_DETAIL' && <OperatorDetailView operator={selectedEntity} stationName={contextInfo} onBack={goBack} />}

                {viewMode === 'MAIN' && (
                    <div className="space-y-12 animate-in fade-in duration-500">
                        {data.lines.map(line => {
                            const wipWarning = line.metrics.current_wip > line.wip_limit;
                            const presentOperators = line.workstations.filter(ws => ws.operator && (ws.operator.attendance === 'PRESENT' || ws.operator.attendance === 'HALF_DAY')).length;

                            return (
                                <div key={line.line_id} className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-300 overflow-hidden">
                                    
                                    {/* LINE HEADER & METRICS */}
                                    <div className="bg-slate-100 p-8 border-b-2 border-slate-300 flex flex-col xl:flex-row justify-between gap-8">
                                        <div className="flex-1">
                                            <h2 className="text-3xl font-black text-black uppercase tracking-tight mb-4">
                                                {line.line_name}
                                            </h2>
                                            <div className="flex flex-wrap gap-3">
                                                {line.active_batches.map(batch => (
                                                    <button 
                                                        key={batch.batchCode} 
                                                        onClick={() => handleBatchClick(batch, line.line_name)}
                                                        className="bg-black hover:bg-indigo-600 text-white px-5 py-3 rounded-xl text-sm font-black uppercase tracking-widest shadow-md flex items-center transition-all active:scale-95 group"
                                                    >
                                                        <Shirt className="w-5 h-5 mr-3 text-indigo-400 group-hover:text-white transition-colors" /> {batch.batchCode}
                                                    </button>
                                                ))}
                                                {line.active_batches.length === 0 && <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">No Active Batches</span>}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-4 shrink-0">
                                            {/* WIP LIMIT TRACKER */}
                                            <div className={`p-6 rounded-2xl border-4 flex flex-col justify-center min-w-[200px] ${wipWarning ? 'bg-rose-50 border-rose-500' : 'bg-white border-slate-200'}`}>
                                                <span className={`text-xs font-black uppercase tracking-widest mb-1 ${wipWarning ? 'text-rose-600' : 'text-slate-500'}`}>Active WIP Queue</span>
                                                <div className="flex items-baseline">
                                                    <span className={`text-5xl font-black ${wipWarning ? 'text-rose-600' : 'text-black'}`}>{line.metrics.current_wip}</span>
                                                    <span className="text-2xl font-bold text-slate-400 mx-2">/</span>
                                                    <span className="text-2xl font-black text-slate-400">{line.wip_limit} Max</span>
                                                </div>
                                                {wipWarning && <span className="text-[10px] font-black text-white bg-rose-600 px-2 py-1 rounded uppercase tracking-wider mt-2 w-max animate-pulse shadow-md">WIP Limit Exceeded</span>}
                                            </div>

                                            {/* OUTPUT METRIC */}
                                            <div className="p-6 rounded-2xl border-2 border-slate-200 bg-white flex flex-col justify-center min-w-[180px]">
                                                <span className="text-xs font-black uppercase tracking-widest mb-1 text-slate-500">Output Today</span>
                                                <span className="text-5xl font-black text-indigo-600">{line.metrics.total_completed}</span>
                                            </div>

                                            {/* MANPOWER METRIC */}
                                            <div className="p-6 rounded-2xl border-2 border-slate-200 bg-white flex flex-col justify-center min-w-[180px]">
                                                <span className="text-xs font-black uppercase tracking-widest mb-1 text-slate-500">Manpower</span>
                                                <div className="flex items-center">
                                                    <Users className="w-10 h-10 text-slate-300 mr-4" />
                                                    <span className="text-5xl font-black text-black">{presentOperators}<span className="text-2xl text-slate-400">/{line.workstations.length}</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* WORKSTATIONS ROW */}
                                    <div className="p-8 overflow-x-auto bg-slate-50">
                                        <div className="flex gap-6 pb-4">
                                            {line.workstations.map(ws => {
                                                const hasOp = !!ws.operator;
                                                const isPresent = hasOp && ws.operator.attendance === 'PRESENT';
                                                const isHalfDay = hasOp && ws.operator.attendance === 'HALF_DAY';
                                                const isAbsent = hasOp && (ws.operator.attendance === 'ABSENT' || ws.operator.attendance === 'MISSED_OUT_PUNCH');

                                                return (
                                                    <div 
                                                        key={ws.id} 
                                                        onClick={() => handleOperatorClick(ws.operator, ws.name)}
                                                        className={`bg-white rounded-2xl p-5 border-2 min-w-[340px] flex-shrink-0 transition-all ${hasOp ? 'cursor-pointer hover:border-indigo-400 hover:shadow-lg' : 'border-slate-200'}`}
                                                    >
                                                        <div className="flex justify-between items-center mb-5">
                                                            <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center">
                                                                <Monitor className="w-5 h-5 mr-2 text-indigo-500" /> {ws.name}
                                                            </h3>
                                                            <span className="bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded shadow-sm">
                                                                {ws.type}
                                                            </span>
                                                        </div>
                                                        
                                                        {/* OPERATOR CARD INNER */}
                                                        {!hasOp ? (
                                                            <div className="flex items-center p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 h-[110px]">
                                                                <UserCircle className="w-10 h-10 text-slate-300 mr-4" />
                                                                <div>
                                                                    <span className="block text-sm font-black text-slate-400 uppercase tracking-widest">No Operator</span>
                                                                    <span className="text-xs font-bold text-rose-500 mt-1 block">Terminal Unassigned</span>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className={`p-4 rounded-xl border-l-8 shadow-sm flex justify-between items-center h-[110px] bg-white ${isPresent ? 'border-emerald-500' : isHalfDay ? 'border-amber-400' : 'border-rose-500'}`}>
                                                                <div className="flex items-center">
                                                                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-black text-2xl mr-4 shadow-inner ${isPresent ? 'bg-emerald-100 text-emerald-700' : isHalfDay ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                                                        {ws.operator.name.charAt(0)}
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-black text-slate-900 text-lg leading-tight mb-1">{ws.operator.name}</h4>
                                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">{ws.operator.emp_id}</span>
                                                                        <div className="flex items-center">
                                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${isPresent ? 'bg-emerald-500 text-white' : isHalfDay ? 'bg-amber-400 text-black' : 'bg-rose-500 text-white'}`}>
                                                                                {ws.operator.attendance.replace('_', ' ')}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {!isAbsent && (
                                                                    <div className="text-right">
                                                                        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">OEE</span>
                                                                        <span className={`text-3xl font-black ${ws.operator.efficiency >= 90 ? 'text-emerald-600' : ws.operator.efficiency >= 75 ? 'text-amber-500' : 'text-rose-600'}`}>
                                                                            {ws.operator.efficiency}%
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
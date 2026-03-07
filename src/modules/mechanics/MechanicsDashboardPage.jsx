import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Wrench, Clock, AlertTriangle, CheckCircle, Search, 
    Plus, Trash2, FileText, History, ChevronRight, ChevronDown,
    Package, DollarSign, ArrowLeft, Loader2, Send, Calendar, HardHat, Camera, X
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { mechanicApi } from '../../api/mechanicApi'; // Ensure this uses the updated endpoints via your api util
import { sparesApi } from '../../api/sparesApi';


const Spinner = () => <Loader2 className="animate-spin text-blue-600" />;

const Modal = ({ title, children, onClose, fullScreenOnMobile = false }) => (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className={`bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl ${fullScreenOnMobile ? 'h-full max-h-full sm:h-auto sm:max-h-[90vh]' : 'max-h-[90vh]'}`} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                <h2 className="text-lg font-bold text-gray-800">{title}</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"><X size={20}/></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">{children}</div>
        </div>
    </div>
);

const PriorityBadge = ({ priority }) => {
    const styles = {
        CRITICAL: 'bg-red-100 text-red-700 border-red-200 animate-pulse',
        HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
        MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        LOW: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${styles[priority] || styles.LOW}`}>{priority}</span>;
};

// --- QR SCANNER MODAL ---
const QrScannerModal = ({ onScanSuccess, onClose }) => {
    const [manualEntry, setManualEntry] = useState('');

    useEffect(() => {
        let scanner;
        try {
            scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
            scanner.render((decodedText) => {
                scanner.clear().then(() => onScanSuccess(decodedText)).catch(() => onScanSuccess(decodedText));
            }, () => {});
        } catch (err) { console.error(err); }
        return () => { if (scanner) scanner.clear().catch(e => console.error(e)); };
    }, [onScanSuccess]);

    const handleManualSubmit = (e) => {
        e.preventDefault();
        if (manualEntry.trim()) onScanSuccess(manualEntry.trim());
    };

    return (
        <Modal title="Scan Asset QR Code" onClose={onClose}>
            <div className="text-center p-2">
                <div id="qr-reader" className="w-full max-w-sm mx-auto mb-4 overflow-hidden rounded-lg"></div>
                <div className="mt-4 border-t pt-4">
                    <p className="text-sm text-gray-500 mb-2">Or enter ID manually:</p>
                    <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <input 
                            type="text" 
                            value={manualEntry} 
                            onChange={(e) => setManualEntry(e.target.value)} 
                            placeholder="e.g. ASSET-001" 
                            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button type="submit" disabled={!manualEntry.trim()} className="px-4 bg-blue-600 text-white rounded-lg font-bold disabled:opacity-50">Submit</button>
                    </form>
                </div>
            </div>
        </Modal>
    );
};

// --- REUSABLE QUANTITY SLIDER ---
const QuantitySlider = ({ value, onChange, min = 1, max, disabled, activeColor = 'blue' }) => {
    const handleMinus = () => { if (value > min && !disabled) onChange(value - 1); };
    const handlePlus = () => { if (value < max && !disabled) onChange(value + 1); };
    const accentClass = activeColor === 'orange' ? 'accent-orange-500' : 'accent-blue-600';
    const textClass = activeColor === 'orange' ? 'text-orange-600' : 'text-blue-600';

    return (
        <div className="flex flex-col items-center py-2 w-full max-w-xs mx-auto">
            <div className={`text-4xl md:text-5xl font-black ${textClass} font-mono mb-4 tracking-tighter drop-shadow-sm`}>
                {value}
            </div>
            <div className="flex items-center w-full gap-3 px-2">
                <button type="button" onClick={handleMinus} disabled={disabled || value <= min} className="w-12 h-12 shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 text-2xl font-medium transition-all shadow-sm">
                    -
                </button>
                <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} disabled={disabled} className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 touch-none ${accentClass}`} />
                <button type="button" onClick={handlePlus} disabled={disabled || value >= max} className="w-12 h-12 shrink-0 flex items-center justify-center bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 active:bg-gray-300 disabled:opacity-40 text-2xl font-medium transition-all shadow-sm">
                    +
                </button>
            </div>
            <div className="flex justify-between w-full px-2 mt-2 text-[10px] font-bold text-gray-400 uppercase">
                <span>Min: {min}</span>
                <span>Max: {max}</span>
            </div>
        </div>
    );
};

// 1. SPARE PARTS SELECTOR (Now uses personal inventory)
const SparePartSelector = ({ spares, onAdd }) => {
    const [search, setSearch] = useState('');
    const filtered = spares.filter(s => 
        s.name.toLowerCase().includes(search.toLowerCase()) || 
        s.part_number.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 flex flex-col h-full max-h-64">
            <div className="relative mb-3 shrink-0">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"/>
                <input 
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Search toolbag..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {filtered.map(part => (
                    <div key={part.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                        <div className="min-w-0 pr-2">
                            <p className="text-sm font-bold text-gray-800 truncate">{part.name}</p>
                            <p className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded inline-block mt-1">Stock: {part.current_stock}</p>
                        </div>
                        <button 
                            type="button"
                            disabled={part.current_stock <= 0}
                            onClick={() => onAdd(part)}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors shadow-sm shrink-0 active:scale-95"
                        >
                            Use
                        </button>
                    </div>
                ))}
                {filtered.length === 0 && <p className="text-sm text-center text-gray-400 mt-4 italic">Part not found in inventory.</p>}
            </div>
        </div>
    );
};

// 2. MAINTENANCE FORM
const MaintenanceForm = ({ job, myInventory, onCancel, onSuccess }) => {
    const [formData, setFormData] = useState({ maintenance_type: job.issue_description.includes('[PREVENTATIVE') ? 'PREVENTATIVE' : 'REPAIR', description: '', labor_cost: '' });
    const [usedSpares, setUsedSpares] = useState([]); 
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitLock = useRef(false);

    useEffect(() => {
        setLoadingHistory(true);
        mechanicApi.getComplaintHistory(job.id).then(res => setHistory(res.data)).finally(() => setLoadingHistory(false));
    }, [job.id]);

    const handleAddSpare = (part) => {
        setUsedSpares(prev => {
            const existing = prev.find(p => p.id === part.id);
            if (existing) {
                if (existing.quantity >= part.current_stock) return prev; 
                return prev.map(p => p.id === part.id ? { ...p, quantity: p.quantity + 1 } : p);
            }
            return [...prev, { ...part, quantity: 1 }];
        });
    };

    const updateSpareQty = (id, delta) => {
        setUsedSpares(prev => prev.map(p => {
            if (p.id === id) {
                const newQty = Math.max(1, Math.min(p.current_stock, p.quantity + delta));
                return { ...p, quantity: newQty };
            }
            return p;
        }).filter(p => p.quantity > 0));
    };

    const totalCost = useMemo(() => {
        const sparesCost = usedSpares.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0);
        const labor = parseFloat(formData.labor_cost) || 0;
        return (sparesCost + labor).toFixed(2);
    }, [usedSpares, formData.labor_cost]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitLock.current || isSubmitting) return;
        submitLock.current = true;
        setIsSubmitting(true);
        
        try {
            await mechanicApi.performMaintenance({
                complaint_id: job.id,
                description: formData.description,
                maintenance_type: formData.maintenance_type,
                labor_cost: formData.labor_cost || 0,
                sparesUsed: usedSpares.map(s => ({ spare_part_id: s.id, quantity: s.quantity }))
            });
            onSuccess();
        } catch (error) {
            alert("Failed to log maintenance.");
            submitLock.current = false;
            setIsSubmitting(false);
        }
    };

    const isPM = job.issue_description.includes('[PREVENTATIVE');

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-in fade-in duration-300">
            {/* Context Sidebar */}
            <div className="lg:col-span-1 flex flex-col gap-4">
                <button onClick={onCancel} className="w-max text-sm font-bold text-gray-500 hover:text-gray-800 flex items-center bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200 transition-colors active:scale-95">
                    <ArrowLeft className="w-4 h-4 mr-2"/> Back
                </button>
                
                <div className={`p-5 rounded-2xl border shadow-sm ${isPM ? 'bg-indigo-50 border-indigo-100' : 'bg-red-50 border-red-100'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <h3 className={`font-black text-xl leading-tight ${isPM ? 'text-indigo-900' : 'text-red-900'}`}>{job.asset_name}</h3>
                    </div>
                    <p className={`text-sm font-medium mb-4 flex items-center ${isPM ? 'text-indigo-700' : 'text-red-700'}`}>
                        <Package className="w-4 h-4 mr-1.5"/> {job.location}
                    </p>
                    
                    {!isPM && <div className="mb-4"><PriorityBadge priority={job.priority} /></div>}

                    <div className={`p-4 rounded-xl border ${isPM ? 'bg-white border-indigo-100' : 'bg-white border-red-100'}`}>
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider block mb-1.5 ${isPM ? 'text-indigo-400' : 'text-red-400'}`}>
                            {isPM ? 'Scheduled Task' : 'Issue Reported'}
                        </span>
                        <p className="text-sm text-gray-800 font-medium whitespace-pre-wrap">
                            {job.issue_description.replace(/\[.*?\]\s*/, '')}
                        </p>
                    </div>
                </div>

                {/* History omitted for brevity if needed, but normally sits here */}
            </div>

            {/* Form Area */}
            <div className="lg:col-span-2 bg-white p-5 md:p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col">
                <h2 className="text-2xl font-black text-gray-800 mb-6 flex items-center border-b border-gray-100 pb-4">
                    <FileText className="w-7 h-7 mr-3 text-blue-600"/> Resolution Log
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6 flex-1 flex flex-col">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Maintenance Type</label>
                            <select className="w-full p-3 border border-gray-300 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-gray-700" value={formData.maintenance_type} onChange={e => setFormData({...formData, maintenance_type: e.target.value})}>
                                <option value="REPAIR">Repair Breakdown</option>
                                <option value="PREVENTATIVE">Preventative Check</option>
                                <option value="CALIBRATION">Calibration</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Additional Labor Cost ($)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-3 w-5 h-5 text-gray-400"/>
                                <input type="number" step="0.01" placeholder="0.00" className="w-full pl-10 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-bold" value={formData.labor_cost} onChange={e => setFormData({...formData, labor_cost: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Work Description *</label>
                        <textarea required className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm" rows="3" placeholder="Describe fixes applied, parts adjusted..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                    </div>

                    {/* SPARES USAGE */}
                    <div className="flex-1 flex flex-col">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                            <Wrench className="w-4 h-4 mr-1.5 text-gray-400"/> Parts Consumed (Optional)
                        </label>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                            <SparePartSelector spares={myInventory} onAdd={handleAddSpare} />
                            
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex flex-col max-h-64">
                                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                    {usedSpares.length === 0 && <div className="h-full flex flex-col items-center justify-center text-gray-400"><Package className="w-8 h-8 mb-2 opacity-50"/><p className="text-sm font-medium">No parts used.</p></div>}
                                    {usedSpares.map(part => (
                                        <div key={part.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-gray-100 gap-3">
                                            <p className="text-sm font-bold text-gray-800 truncate flex-1">{part.name}</p>
                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                                <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50 overflow-hidden shadow-sm">
                                                    <button type="button" onClick={() => updateSpareQty(part.id, -1)} className="px-3 py-1.5 hover:bg-gray-200 text-gray-600 font-black">-</button>
                                                    <span className="px-3 py-1.5 text-sm font-mono bg-white font-bold min-w-[2.5rem] text-center border-x border-gray-200">{part.quantity}</span>
                                                    <button type="button" onClick={() => updateSpareQty(part.id, 1)} disabled={part.quantity >= part.current_stock} className="px-3 py-1.5 hover:bg-gray-200 text-gray-600 font-black disabled:opacity-30">+</button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {usedSpares.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center px-1">
                                        <span className="text-xs font-bold text-gray-500 uppercase">Parts Total</span>
                                        <span className="font-mono font-black text-gray-800">${usedSpares.reduce((sum, p) => sum + (p.unit_cost * p.quantity), 0).toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-6 mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-200 w-full sm:w-auto justify-center">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-3">Total Value</span>
                            <span className="text-xl font-black text-gray-900 font-mono">${totalCost}</span>
                        </div>
                        <div className="flex gap-3 w-full sm:w-auto">
                            <button type="button" onClick={onCancel} className="flex-1 sm:flex-none px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors active:scale-95">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="flex-1 sm:flex-none px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-200 hover:bg-blue-700 hover:shadow-lg flex items-center justify-center transition-all disabled:opacity-70 disabled:cursor-not-allowed active:scale-95">
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <><CheckCircle className="w-5 h-5 mr-2"/> Complete Task</>}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};


// 3. REQUEST INVENTORY FORM (For Mechanics to get parts from Store)
const RequestInventoryView = ({ myInventory, globalSpares }) => {
    const [selectedItems, setSelectedItems] = useState([]); // { spare_part_id, requested_qty, name, part_number }
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submitLock = useRef(false);
    
    const handleAdd = (part) => {
        setSelectedItems(prev => {
            if (prev.find(p => p.spare_part_id === part.id)) return prev;
            return [...prev, { spare_part_id: part.id, requested_qty: 1, name: part.name, part_number: part.part_number, storeStock: part.current_stock }];
        });
    };

    const handleQtyChange = (id, val) => {
        setSelectedItems(prev => prev.map(p => p.spare_part_id === id ? { ...p, requested_qty: parseInt(val) || 1 } : p));
    };

    const handleRemove = (id) => {
        setSelectedItems(prev => prev.filter(p => p.spare_part_id !== id));
    };

    const submitRequest = async () => {
        if (selectedItems.length === 0 || submitLock.current || isSubmitting) return;
        submitLock.current = true;
        setIsSubmitting(true);
        try {
            await sparesApi.requestSpares({ items: selectedItems, notes });
            alert("Request sent to Store Manager!");
            setSelectedItems([]);
            setNotes('');
        } catch (err) {
            alert("Failed to submit request.");
        } finally {
            submitLock.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-300">
            {/* Left: My Current Stock */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                <h3 className="text-xl font-black text-gray-800 mb-6 flex items-center border-b border-gray-100 pb-4">
                    <Package className="w-6 h-6 mr-3 text-blue-600"/> My Toolbag
                </h3>
                <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                    {myInventory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <Wrench className="w-12 h-12 mb-3 opacity-20"/>
                            <p className="font-medium">Your toolbag is empty.</p>
                        </div>
                    ) : (
                        myInventory.map(item => (
                            <div key={item.id} className="flex justify-between items-center p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-blue-200 transition-colors">
                                <div>
                                    <p className="font-bold text-gray-900 text-sm sm:text-base">{item.name}</p>
                                    <p className="text-xs text-gray-500 font-mono mt-1">{item.part_number}</p>
                                </div>
                                <div className="text-right bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
                                    <span className="block text-2xl font-black text-blue-600 leading-none">{item.current_stock}</span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1 block">In Stock</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right: Request Form */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col h-[70vh]">
                <h3 className="text-xl font-black text-gray-800 mb-6 flex items-center border-b border-gray-100 pb-4">
                    <Send className="w-6 h-6 mr-3 text-orange-500"/> Request Store Spares
                </h3>
                
                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Search Store Catalog</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
                        <select 
                            className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl bg-gray-50 focus:ring-2 focus:ring-orange-500 outline-none text-sm font-medium appearance-none"
                            onChange={(e) => {
                                const part = globalSpares.find(p => p.id === parseInt(e.target.value));
                                if (part) handleAdd(part);
                                e.target.value = "";
                            }}
                        >
                            <option value="">Browse parts...</option>
                            {globalSpares.map(sp => (
                                <option key={sp.id} value={sp.id} disabled={sp.current_stock <= 0}>
                                    {sp.name} (Available: {sp.current_stock})
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none"/>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                    {selectedItems.map(item => (
                        <div key={item.spare_part_id} className="flex flex-col sm:flex-row sm:items-center gap-4 bg-orange-50/50 border border-orange-100 p-4 rounded-xl">
                            <div className="flex-1">
                                <p className="font-bold text-sm text-gray-900">{item.name}</p>
                                <p className="text-[10px] text-orange-600 font-bold uppercase mt-1">Store Stock: {item.storeStock}</p>
                            </div>
                            
                            <div className="w-full sm:w-auto bg-white p-2 rounded-lg shadow-sm border border-orange-100">
                                <QuantitySlider 
                                    value={item.requested_qty} 
                                    onChange={(v) => handleQtyChange(item.spare_part_id, v)} 
                                    min={1} 
                                    max={item.storeStock}
                                    activeColor="orange"
                                />
                            </div>

                            <button onClick={() => handleRemove(item.spare_part_id)} className="self-end sm:self-center p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={20}/></button>
                        </div>
                    ))}
                    {selectedItems.length === 0 && <div className="text-center p-8 text-gray-400 font-medium">Select items from the dropdown above to build your request.</div>}
                </div>

                <div className="pt-4 border-t border-gray-100 shrink-0">
                    <textarea 
                        className="w-full p-3 border border-gray-300 rounded-xl text-sm mb-4 focus:ring-2 focus:ring-orange-500 outline-none" 
                        placeholder="Reason for request (Optional)..." 
                        rows="2"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    ></textarea>
                    <button 
                        onClick={submitRequest}
                        disabled={isSubmitting || selectedItems.length === 0}
                        className="w-full py-3.5 bg-orange-500 text-white font-bold rounded-xl shadow-md hover:bg-orange-600 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : <Send className="w-5 h-5 mr-2"/>}
                        {isSubmitting ? 'Sending Request...' : 'Submit Request to Store'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// 4. HISTORY TAB VIEW
const HistoryView = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        mechanicApi.getMyCompletedTasks().then(res => {
            setHistory(res);
            setLoading(false);
        });
    }, []);
    
    if (loading) return <div className="h-64 flex justify-center items-center"><Spinner/></div>;
    if (history.length === 0) return <div className="text-center py-20 text-gray-400 bg-white rounded-2xl border-2 border-dashed border-gray-200">No completed tasks found.</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
            {history.map(job => (
                <div key={job.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-5">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-gray-900 text-lg">{job.asset_name}</h3>
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase">{job.maintenance_type}</span>
                        </div>
                        <p className="text-sm text-gray-600 flex items-center mb-3"><Package className="w-4 h-4 mr-1.5 text-gray-400"/> {job.location}</p>
                        
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Issue Fixed</span>
                            <p className="text-sm text-gray-700 italic">"{job.issue_description.replace(/\[.*?\]\s*/, '')}"</p>
                        </div>
                    </div>
                    <div className="w-full sm:w-48 shrink-0 flex flex-col justify-between border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-5">
                        <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Completed On</span>
                            <p className="text-sm font-medium text-gray-800">{new Date(job.maintenance_date).toLocaleDateString()}</p>
                        </div>
                        <div className="mt-4">
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Total Cost</span>
                             <p className="text-lg font-black text-green-600">${parseFloat(job.cost).toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// 5. ASSET HISTORY MODAL (Opened via QR Scan)
const AssetHistoryModal = ({ qrId, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        mechanicApi.getAssetHistoryByQR(qrId).then(res => {
            setData(res);
            setLoading(false);
        }).catch(() => {
            alert("Asset not found");
            onClose();
        });
    }, [qrId, onClose]);

    return (
        <Modal title={loading ? "Scanning Asset..." : `Asset History: ${data?.asset?.name}`} onClose={onClose} fullScreenOnMobile={true}>
            {loading ? <div className="p-12 flex justify-center"><Spinner/></div> : (
                <div className="space-y-6">
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Asset Tag</p>
                        <p className="text-lg font-mono font-bold text-indigo-900">{data.asset.asset_qr_id}</p>
                    </div>
                    
                    <div>
                        <h3 className="font-bold text-gray-800 mb-3 flex items-center">
                            <History className="w-5 h-5 mr-2 text-gray-400"/> Maintenance Log
                        </h3>
                        {data.history.length === 0 ? (
                            <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg">No maintenance records found for this machine.</p>
                        ) : (
                            <div className="space-y-3">
                                {data.history.map((log, idx) => (
                                    <div key={idx} className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase">{log.maintenance_type}</span>
                                            <span className="text-xs font-medium text-gray-500">{new Date(log.maintenance_date).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm text-gray-800 font-medium">"{log.description}"</p>
                                        <div className="mt-3 flex justify-between items-end border-t border-gray-100 pt-2">
                                            <p className="text-xs text-gray-400">By: <span className="font-medium text-gray-600">{log.mechanic_name || 'System'}</span></p>
                                            <p className="text-xs font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">${parseFloat(log.cost).toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
};

// --- MAIN COMPONENT ---
const MechanicPortal = () => {
    const [activeTab, setActiveTab] = useState('board'); // 'board', 'work', 'inventory', 'history'
    const [jobs, setJobs] = useState([]);
    
    // Inventory States
    const [myInventory, setMyInventory] = useState([]);
    const [globalSpares, setGlobalSpares] = useState([]);
    
    const [selectedJob, setSelectedJob] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scannedAsset, setScannedAsset] = useState(null); // stores QR string

    const fetchDashboard = () => {
        setLoading(true);
        Promise.all([
            mechanicApi.getOpenComplaints(),
            sparesApi.getMySpareInventory(),
            sparesApi.getAllSpares()
        ]).then(([jobsData, myStock, storeStock]) => {
            setJobs(jobsData);
            setMyInventory(myStock);
            setGlobalSpares(storeStock);
            setLoading(false);
        });
    };

    useEffect(() => { fetchDashboard(); }, []);

    const handleStartJob = (job) => {
        setSelectedJob(job);
        setActiveTab('work');
    };

    const breakdowns = useMemo(() => jobs.filter(j => !j.issue_description.includes('[PREVENTATIVE')), [jobs]);
    const preventative = useMemo(() => jobs.filter(j => j.issue_description.includes('[PREVENTATIVE')), [jobs]);

    return (
        <div className="min-h-screen bg-gray-50 font-inter text-gray-900 pb-24 md:p-6 p-4">
            {/* Header & Navigation */}
            <header className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center tracking-tight">
                            <Wrench className="mr-3 text-indigo-600 h-6 w-6 md:h-8 md:w-8"/> Mechanic Portal
                        </h1>
                    </div>
                    <button 
                        onClick={() => setIsScannerOpen(true)}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center shadow-sm transition-colors active:scale-95 w-full sm:w-auto"
                    >
                        <Camera className="w-4 h-4 mr-2" /> Scan Machine QR
                    </button>
                </div>

                <div className="flex overflow-x-auto hide-scrollbar bg-gray-200/50 p-1.5 rounded-xl w-full sm:w-max snap-x">
                    <button 
                        onClick={() => setActiveTab('board')}
                        className={`snap-center shrink-0 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'board' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Job Board <span className="ml-2 bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">{jobs.length}</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`snap-center shrink-0 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        My History
                    </button>
                    <button 
                        onClick={() => setActiveTab('inventory')}
                        className={`snap-center shrink-0 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'inventory' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Spares & Requests
                    </button>
                </div>
            </header>

            {loading ? <div className="h-64 flex justify-center items-center"><Spinner/></div> : (
                <>
                    {/* VIEW: JOB BOARD */}
                    {activeTab === 'board' && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            {/* Breakdown Section */}
                            <section>
                                <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center">
                                    <AlertTriangle className="w-5 h-5 mr-2 text-rose-500"/> Reactive Breakdowns ({breakdowns.length})
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                    {breakdowns.length === 0 && <p className="col-span-full text-sm text-gray-500 italic p-4 bg-white rounded-xl border border-gray-200">No breakdowns reported.</p>}
                                    {breakdowns.map(job => (
                                        <div key={job.id} className="bg-white rounded-2xl shadow-sm border border-red-100 hover:shadow-md transition-all flex flex-col relative overflow-hidden group">
                                            <div className={`h-1.5 w-full absolute top-0 left-0 ${job.status === 'OPEN' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                            <div className="p-5 flex-1">
                                                <div className="flex justify-between items-start mb-3">
                                                    <PriorityBadge priority={job.priority} />
                                                    <span className="text-[10px] font-bold text-gray-400 flex items-center bg-gray-50 px-2 py-1 rounded-md">
                                                        <Clock className="w-3 h-3 mr-1"/> {new Date(job.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h3 className="font-extrabold text-lg text-gray-900 mb-1 leading-tight">{job.asset_name}</h3>
                                                <p className="text-sm font-medium text-rose-600 mb-4 flex items-center"><Package className="w-4 h-4 mr-1.5"/> {job.location}</p>
                                                
                                                <div className="bg-red-50/50 p-3 rounded-xl border border-red-100 text-sm text-gray-800 font-medium">
                                                    "{job.issue_description}"
                                                </div>
                                            </div>
                                            <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex justify-end">
                                                <button onClick={() => handleStartJob(job)} className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm flex items-center justify-center transition-transform active:scale-95">
                                                    Start Repair <ChevronRight className="w-4 h-4 ml-1.5"/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Preventative Section */}
                            <section>
                                <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center">
                                    <Calendar className="w-5 h-5 mr-2 text-indigo-500"/> Scheduled Preventative Tasks ({preventative.length})
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                    {preventative.length === 0 && <p className="col-span-full text-sm text-gray-500 italic p-4 bg-white rounded-xl border border-gray-200">No preventative tasks due.</p>}
                                    {preventative.map(job => (
                                        <div key={job.id} className="bg-white rounded-2xl shadow-sm border border-indigo-100 hover:shadow-md transition-all flex flex-col relative overflow-hidden group">
                                            <div className="h-1.5 w-full absolute top-0 left-0 bg-indigo-400"></div>
                                            <div className="p-5 flex-1">
                                                <div className="flex justify-between items-start mb-3">
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border uppercase bg-indigo-50 text-indigo-700 border-indigo-200">PM Task</span>
                                                    <span className="text-[10px] font-bold text-gray-400 flex items-center bg-gray-50 px-2 py-1 rounded-md">
                                                        <Clock className="w-3 h-3 mr-1"/> Due: {new Date(job.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h3 className="font-extrabold text-lg text-gray-900 mb-1 leading-tight">{job.asset_name}</h3>
                                                <p className="text-sm font-medium text-indigo-600 mb-4 flex items-center"><Package className="w-4 h-4 mr-1.5"/> {job.location}</p>
                                                
                                                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-sm text-gray-800 font-medium whitespace-pre-wrap">
                                                    {job.issue_description.replace(/\[.*?\]\s*/, '')}
                                                </div>
                                            </div>
                                            <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex justify-end">
                                                <button onClick={() => handleStartJob(job)} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm flex items-center justify-center transition-transform active:scale-95">
                                                    Start PM <ChevronRight className="w-4 h-4 ml-1.5"/>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* VIEW: WORK FORM */}
                    {activeTab === 'work' && selectedJob && (
                        <MaintenanceForm 
                            job={selectedJob} 
                            myInventory={myInventory}
                            onCancel={() => setActiveTab('board')}
                            onSuccess={() => {
                                alert("Maintenance Logged Successfully!");
                                setSelectedJob(null);
                                setActiveTab('board');
                                fetchDashboard();
                            }}
                        />
                    )}

                    {/* VIEW: HISTORY */}
                    {activeTab === 'history' && <HistoryView />}

                    {/* VIEW: PERSONAL INVENTORY & REQUESTS */}
                    {activeTab === 'inventory' && (
                        <RequestInventoryView myInventory={myInventory} globalSpares={globalSpares} />
                    )}
                </>
            )}

            {/* GLOBAL MODALS */}
            {isScannerOpen && (
                <QrScannerModal 
                    onClose={() => setIsScannerOpen(false)} 
                    onScanSuccess={(qr) => {
                        setIsScannerOpen(false);
                        setScannedAsset(qr);
                    }} 
                />
            )}

            {scannedAsset && (
                <AssetHistoryModal 
                    qrId={scannedAsset} 
                    onClose={() => setScannedAsset(null)} 
                />
            )}
        </div>
    );
};

export default MechanicPortal;
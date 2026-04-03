import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    QrCode, ShieldCheck, ShieldAlert, Check, X, Camera,
    Hammer, Loader2, AlertCircle, ArrowLeft, Info,
    Package, CheckCircle2, RefreshCw, Maximize, HardDrive
} from 'lucide-react';
import { Html5Qrcode } from "html5-qrcode";
import { assemblyApi } from '../../api/assemblyApi';
// import { universalApi } from '../../api/universalApi';

// Standard Enterprise Status Enums
const STATUS = {
    APPROVED: 'APPROVED',
    REWORK: 'NEEDS_REWORK',
    REJECT: 'QC_REJECTED'
};

const AssemblyProcessingPortal = () => {
    // --- STATE MANAGEMENT ---
    const [garment, setGarment] = useState(null);
    const [mismatch, setMismatch] = useState(null);
    const [defectCodes, setDefectCodes] = useState([]);
    const [showDefectModal, setShowDefectModal] = useState(null); // 'REWORK' or 'REJECT'
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [error, setError] = useState(null);
    const [lastAction, setLastAction] = useState(null);
    
    // Camera Specific State
    const [isCameraActive, setIsCameraActive] = useState(false);
    const scannerRef = useRef(null);

    // Hardware Scanner Buffer Refs (Keyboard Wedge)
    const scanBuffer = useRef('');
    const lastKeyStrokeAt = useRef(0);

    const [manualInput, setManualInput] = useState('');
    const [showManualBox, setShowManualBox] = useState(false);
    const manualInputRef = useRef(null);

    // Toggle and focus logic
    const toggleManualBox = () => {
        setShowManualBox(!showManualBox);
        if (!showManualBox) {
            setTimeout(() => manualInputRef.current?.focus(), 100);
        }
    };



    const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim().length > 3) {
        processScan(manualInput.trim());
        setManualInput('');
        setShowManualBox(false);
    }
};
    // --- AUDIO FEEDBACK ENGINE ---
    const playFeedback = (type) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === 'success') {
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                osc.start(); osc.stop(audioCtx.currentTime + 0.2);
            } else {
                osc.frequency.setValueAtTime(220, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc.start(); osc.stop(audioCtx.currentTime + 0.5);
            }
        } catch (e) { console.warn("Audio feedback not supported or blocked."); }
    };

    // --- DATA INITIALIZATION ---
    const loadRequiredData = useCallback(async () => {
        try {
            const res = await assemblyApi.getDefectCodes();
            setDefectCodes(res.data);
        } catch (e) { console.error("Failed to load defect dictionary."); }
    }, []);

    useEffect(() => { loadRequiredData(); }, [loadRequiredData]);

    // --- CORE SCAN PROCESSING ---
    const processScan = async (uid) => {
        if (isLoading || isProcessingAction) return;
        
        const cleanUid = uid.trim();
        if (isCameraActive) stopCamera();

        setIsLoading(true);
        setError(null);
        setMismatch(null);
        setGarment(null);

        try {
            const res = await assemblyApi.getGarmentDetails(cleanUid);
            setGarment(res.data);
            playFeedback('success');
        } catch (err) {
            playFeedback('error');
            const errData = err.response?.data;
            if (err.response?.status === 403 && errData?.error === "Batch Mismatch") {
                setMismatch(errData);
            } else {
                setError(errData?.message || errData?.error || "Invalid Scan: Check Barcode Integrity.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // --- CAMERA SCANNING LOGIC ---
    const startCamera = () => {
        setGarment(null);
        setMismatch(null);
        setError(null);
        setIsCameraActive(true);
        
        // Wait for DOM to render the #reader div
        setTimeout(() => {
            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;
            
            const config = { 
                fps: 10, 
                qrbox: { width: 300, height: 150 }, // Aspect ratio optimized for Code 128
                aspectRatio: 1.777778 // 16:9
            };

            html5QrCode.start(
                { facingMode: "environment" }, 
                config, 
                (decodedText) => processScan(decodedText),
                () => { /* Silent failure for frames with no barcode */ }
            ).catch(err => {
                setError("Camera access denied. Please check permissions.");
                setIsCameraActive(false);
            });
        }, 300);
    };

    const stopCamera = () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
                setIsCameraActive(false);
                scannerRef.current = null;
            }).catch(e => console.error("Camera stop error", e));
        } else {
            setIsCameraActive(false);
        }
    };

    // --- HARDWARE SCANNER LOGIC (Global Keyboard Listener) ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Disable hardware buffer if camera modal is covering the screen
            if (isCameraActive || isProcessingAction) return;

            const now = Date.now();
            // Code 128 hardware scanners fire characters at < 20ms intervals
            if (now - lastKeyStrokeAt.current > 40) {
                scanBuffer.current = ''; 
            }

            if (e.key === 'Enter') {
                if (scanBuffer.current.length > 3) {
                    processScan(scanBuffer.current);
                }
                scanBuffer.current = '';
            } else if (e.key.length === 1) {
                scanBuffer.current += e.key;
            }
            
            lastKeyStrokeAt.current = now;
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [garment, mismatch, isLoading, isCameraActive, isProcessingAction]);

    // --- FINAL ACTIONS ---
    const handleAction = async (status, defectCodeId = null) => {
        if (isProcessingAction) return;
        setIsProcessingAction(true);
        try {
            await assemblyApi.processGarmentStatus({
                garmentId: garment.garment_id,
                status,
                defectCodeId
            });
            setLastAction({ uid: garment.garment_uid, status });
            setGarment(null);
            setShowDefectModal(null);
            playFeedback('success');
            setTimeout(() => setLastAction(null), 4000);
        } catch (err) {
            playFeedback('error');
            alert(err.response?.data?.error || "Transaction failed.");
        } finally {
            setIsProcessingAction(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-10 font-inter select-none">
            <div className="max-w-5xl mx-auto">
                
                {/* STATION HEADER */}
                <header className="mb-10 flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
                            <HardDrive size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Assembly Station</h1>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">DNA & Component Validator</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {!garment && !mismatch && !isCameraActive && (
                            <button 
                                onClick={startCamera}
                                className="flex items-center px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl font-black text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
                            >
                                <Camera className="w-5 h-5 mr-3 text-indigo-500" />
                                CAM SCAN
                            </button>
                        )}
                        {lastAction && (
                            <div className="bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl border-2 border-emerald-100 flex items-center font-black text-sm animate-in fade-in slide-in-from-right-4">
                                <CheckCircle2 className="w-5 h-5 mr-3" /> {lastAction.uid} {lastAction.status}
                            </div>
                        )}
                    </div>
                </header>

                {/* CAMERA VIEWPORT MODAL */}
                {isCameraActive && (
                    <div className="fixed inset-0 bg-slate-900 z-[200] flex flex-col items-center justify-center p-6 animate-in fade-in">
                        <div className="w-full max-w-2xl bg-black rounded-[3rem] overflow-hidden relative border-8 border-white/10 shadow-2xl">
                            <div id="reader" className="w-full"></div>
                            <div className="absolute inset-0 border-[60px] border-black/40 pointer-events-none">
                                <div className="w-full h-full border-2 border-indigo-400 rounded-2xl animate-pulse flex items-center justify-center">
                                    <div className="w-full h-[2px] bg-indigo-400/50 shadow-[0_0_15px_rgba(129,140,248,0.8)]" />
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={stopCamera}
                            className="mt-12 px-12 py-5 bg-white text-black font-black rounded-3xl hover:bg-rose-600 hover:text-white transition-all shadow-xl flex items-center"
                        >
                            <X className="mr-3" /> CLOSE CAMERA
                        </button>
                    </div>
                )}

                {/* IDLE SCAN STATE */}
                {!garment && !mismatch && !isCameraActive && (
                    <div className="text-center py-32 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-inner">
                        <div className="relative inline-block mb-8">
                            <QrCode size={140} className="text-slate-100" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <RefreshCw size={44} className="text-indigo-400 animate-spin opacity-20" />
                            </div>
                        </div>
                        <h2 className="text-4xl font-black text-slate-300 tracking-tighter uppercase">Ready for Scan</h2>
                        <p className="text-slate-400 font-bold mt-2 uppercase text-xs tracking-[0.2em]">Hardware Wedge Active • Code 128 Mode</p>
                        
                        {error && (
                            <div className="mt-12 max-w-md mx-auto p-5 bg-rose-50 border-2 border-rose-100 rounded-3xl text-rose-700 font-black flex items-center justify-center shadow-sm animate-in shake">
                                <ShieldAlert className="mr-3 shrink-0" /> {error}
                            </div>
                        )}
                    </div>
                )}

                {/* DEPARTMENT MISMATCH WARNING */}
                {mismatch && (
                    <div className="bg-white border-[8px] border-amber-400 rounded-[4rem] p-16 text-center shadow-2xl animate-in zoom-in-95">
                        <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-8">
                            <AlertCircle className="w-14 h-14 text-amber-500" />
                        </div>
                        <h2 className="text-5xl font-black text-slate-900 tracking-tight mb-4">WRONG LINE</h2>
                        <p className="text-slate-500 text-xl font-bold mb-12 max-w-xl mx-auto">{mismatch.message}</p>
                        
                        <div className="flex flex-wrap justify-center gap-6 mb-12">
                            <div className="bg-slate-50 p-8 rounded-3xl border-2 border-slate-100 text-left min-w-[240px]">
                                <span className="text-[10px] uppercase font-black text-slate-400 block mb-2">Required Dept</span>
                                <span className="text-2xl font-black text-indigo-600">{mismatch.currentLocation}</span>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-3xl border-2 border-slate-100 text-left min-w-[240px]">
                                <span className="text-[10px] uppercase font-black text-slate-400 block mb-2">Batch Reference</span>
                                <span className="text-2xl font-black text-slate-800">{mismatch.batchDetails.code}</span>
                            </div>
                        </div>
                        
                        <button 
                            onClick={() => setMismatch(null)} 
                            className="px-14 py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-black active:scale-95 transition-all shadow-xl"
                        >
                            RETURN TO SCANNER
                        </button>
                    </div>
                )}

                {/* GARMENT VERIFICATION VIEW */}
                {garment && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-10">
                        {/* LEFT: DNA COMPONENT MAP */}
                        <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-xl border border-slate-200 overflow-hidden">
                            <div className="bg-slate-900 p-10 text-white">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="bg-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">DNA OK</span>
                                            <h2 className="text-4xl font-black tracking-tighter">{garment.garment_uid}</h2>
                                        </div>
                                        <p className="text-slate-400 font-bold text-lg">{garment.product_name}</p>
                                    </div>
                                    <div className="bg-white/10 px-6 py-3 rounded-2xl text-right">
                                        <span className="block text-[10px] font-bold opacity-50 mb-1">SIZE</span>
                                        <span className="text-3xl font-black">{garment.size}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-10">
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="font-black text-slate-400 text-xs uppercase tracking-[0.2em] flex items-center">
                                        <Package className="w-4 h-4 mr-3" /> Component Integrity Map
                                    </h3>
                                    <span className="text-[10px] font-mono font-bold text-slate-300">ID: {garment.garment_id}</span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {garment.components.map((comp, i) => (
                                        <div key={i} className={`p-6 rounded-[2rem] border-2 flex items-center justify-between transition-all ${comp.has_active_defect ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-sm ${comp.has_active_defect ? 'bg-rose-500 text-white' : 'bg-white text-slate-900'}`}>
                                                    {i + 1}
                                                </div>
                                                <span className="font-black text-slate-700 text-sm">{comp.part_name}</span>
                                            </div>
                                            {comp.has_active_defect ? <X className="text-rose-500" strokeWidth={4} /> : <Check className="text-emerald-500" strokeWidth={4} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: COMMAND CONSOLE */}
                        <div className="flex flex-col gap-6">
                            <button 
                                onClick={() => handleAction(STATUS.APPROVED)}
                                disabled={isProcessingAction || garment.components.some(c => c.has_active_defect)}
                                className="flex-1 bg-emerald-600 text-white rounded-[3rem] shadow-2xl shadow-emerald-200/50 flex flex-col items-center justify-center p-10 hover:bg-emerald-700 transition-all active:scale-95 disabled:grayscale disabled:opacity-50 disabled:cursor-not-allowed group"
                            >
                                <ShieldCheck size={70} className="mb-4 group-hover:scale-110 transition-transform" />
                                <span className="text-3xl font-black">APPROVE</span>
                                <span className="text-[11px] font-bold opacity-60 mt-2 uppercase tracking-widest">Pass to Quality</span>
                            </button>

                            <div className="grid grid-cols-1 gap-4">
                                <button 
                                    onClick={() => setShowDefectModal('REWORK')}
                                    disabled={isProcessingAction}
                                    className="bg-amber-500 text-white rounded-[2.5rem] shadow-xl shadow-amber-200/50 flex items-center justify-center p-8 hover:bg-amber-600 transition-all active:scale-95 group"
                                >
                                    <Hammer size={32} className="mr-4 group-hover:rotate-12 transition-transform" />
                                    <span className="text-xl font-black">REWORK</span>
                                </button>

                                <button 
                                    onClick={() => setShowDefectModal('REJECT')}
                                    disabled={isProcessingAction}
                                    className="bg-rose-600 text-white rounded-[2.5rem] shadow-xl shadow-rose-200/50 flex items-center justify-center p-8 hover:bg-rose-700 transition-all active:scale-95 group"
                                >
                                    <X size={32} className="mr-4 group-hover:scale-90 transition-transform" />
                                    <span className="text-xl font-black">REJECT</span>
                                </button>
                            </div>
                            
                            <button onClick={() => setGarment(null)} className="py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors uppercase text-xs tracking-widest">
                                Cancel Scan
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ENTERPRISE DEFECT DICTIONARY MODAL */}
            {showDefectModal && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6 animate-in fade-in">
                    <div className="bg-white w-full max-w-3xl rounded-[4rem] overflow-hidden shadow-2xl border border-white/20">
                        <div className={`p-10 ${showDefectModal === 'REWORK' ? 'bg-amber-500' : 'bg-rose-600'} text-white flex justify-between items-center`}>
                            <div>
                                <h2 className="text-3xl font-black tracking-tighter">SELECT REASON</h2>
                                <p className="text-[10px] font-bold uppercase opacity-60 tracking-widest mt-1">Classification: {showDefectModal}</p>
                            </div>
                            <button onClick={() => setShowDefectModal(null)} className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"><X /></button>
                        </div>
                        <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-6 custom-scrollbar">
                            {defectCodes.map(code => (
                                <button
                                    key={code.id}
                                    onClick={() => handleAction(STATUS[showDefectModal === 'REWORK' ? 'REWORK' : 'REJECT'], code.id)}
                                    className="p-6 text-left border-2 border-slate-50 bg-slate-50/30 rounded-3xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group active:scale-95"
                                >
                                    <span className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">{code.category}</span>
                                    <span className="font-bold text-slate-800 text-lg leading-tight group-hover:text-indigo-900">{code.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}



            <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center">
                    
                    {/* Manual Input Slide-up Panel */}
                    {showManualBox && (
                        <div className="mb-4 w-full max-w-md bg-white p-4 rounded-3xl shadow-2xl border-2 border-indigo-100 animate-in slide-in-from-bottom-4">
                            <form onSubmit={handleManualSubmit} className="flex gap-2">
                                <input 
                                    ref={manualInputRef}
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    placeholder="Enter Sequence Manually..."
                                    className="flex-1 px-5 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-lg"
                                />
                                <button 
                                    type="submit"
                                    className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-indigo-700 transition-all"
                                >
                                    LOAD
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Toggle Button */}
                    <button 
                        onClick={toggleManualBox}
                        className={`flex items-center px-6 py-3 rounded-full font-black text-xs tracking-widest transition-all shadow-lg border-2 ${
                            showManualBox 
                            ? 'bg-rose-50 border-rose-100 text-rose-600' 
                            : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                    >
                        {showManualBox ? (
                            <><X size={16} className="mr-2" /> CLOSE OVERRIDE</>
                        ) : (
                            <><Maximize size={16} className="mr-2" /> MANUAL SEQUENCE ENTRY</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssemblyProcessingPortal;
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    QrCode, ShieldCheck, ShieldAlert, Check, X,
    Hammer, AlertCircle, ArrowLeft, Package, CheckCircle2,
    RefreshCw, Maximize, HardDrive, List, Barcode, Clock, Layers
} from 'lucide-react';
import { assemblyApi } from '../../api/assemblyApi';

// Standard Enterprise Status Enums
const STATUS = {
    APPROVED: 'APPROVED',
    REWORK: 'NEEDS_REWORK',
    REJECT: 'QC_REJECTED'
};

const AssemblyProcessingPortal = () => {
    // --- STATE MANAGEMENT ---
    const [viewMode, setViewMode] = useState('SCANNER'); // NEW: 'SCANNER' or 'BATCH'
    
    // Core Scan State
    const [garment, setGarment] = useState(null);
    const [mismatch, setMismatch] = useState(null);
    const [defectCodes, setDefectCodes] = useState([]);
    const [showDefectModal, setShowDefectModal] = useState(null); 
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [error, setError] = useState(null);
    const [lastAction, setLastAction] = useState(null);
    
    // Batch Mode State
    const [activeBatches, setActiveBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [batchPieces, setBatchPieces] = useState([]);

    // Batch Mode — selected piece for in-batch action
    const [selectedPiece, setSelectedPiece] = useState(null);
    const [isPieceLoading, setIsPieceLoading] = useState(false);

    // Hardware Scanner Buffer Refs
    const scanBuffer = useRef('');
    const lastKeyStrokeAt = useRef(0);
    const [scannedTextVisual, setScannedTextVisual] = useState('');

    const [manualInput, setManualInput] = useState('');
    const [showManualBox, setShowManualBox] = useState(false);
    const manualInputRef = useRef(null);

    // ===== DEBUG STATE =====
    const [debugLog, setDebugLog] = useState([]);
    const [debugBuffer, setDebugBuffer] = useState('');
    const [debugLastKey, setDebugLastKey] = useState('');
    const [debugLastGap, setDebugLastGap] = useState(0);
    const [debugListenerVersion, setDebugListenerVersion] = useState(0);
    const [showDebug, setShowDebug] = useState(true);
    const [debugFocusTarget, setDebugFocusTarget] = useState('(none)');
    const debugLogRef = useRef([]);

    const addDebug = (msg, type = 'info') => {
        const entry = { msg, type, ts: new Date().toISOString().slice(11, 23) };
        debugLogRef.current = [entry, ...debugLogRef.current.slice(0, 49)];
        setDebugLog([...debugLogRef.current]);
    };

    // ===== CAPTURE-PHASE LISTENER — runs BEFORE any element can steal the event =====
    // This fires even if an input/iframe has focus. If you see keys here but NOT in the
    // main scanner log below, a focused element is consuming them.
    useEffect(() => {
        const getFocusDesc = (el) => {
            if (!el) return 'null';
            const tag = el.tagName?.toLowerCase() || '?';
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
            const name = el.name ? `[name=${el.name}]` : '';
            return `${tag}${id}${cls}${name}`;
        };

        const captureHandler = (e) => {
            if (e.key.length !== 1 && e.key !== 'Enter') return; // only printable + Enter
            const focused = document.activeElement;
            const focusDesc = getFocusDesc(focused);
            const isStealingEl = ['input', 'textarea', 'select'].includes(focused?.tagName?.toLowerCase())
                || focused?.tagName?.toLowerCase() === 'iframe'
                || focused?.isContentEditable;

            setDebugFocusTarget(focusDesc);

            if (isStealingEl) {
                addDebug(`🔴 KEY STOLEN by <${focusDesc}> | key="${e.key}" | event will NOT reach scanner`, 'error');
            } else {
                addDebug(`🟢 CAPTURE key="${e.key}" | focus=<${focusDesc}> | reaching scanner ✓`, 'capture');
            }
        };

        // Track focus changes
        const focusHandler = (e) => {
            const desc = getFocusDesc(e.target);
            setDebugFocusTarget(desc);
            const tag = e.target?.tagName?.toLowerCase();
            if (['input', 'textarea', 'select', 'iframe'].includes(tag) || e.target?.isContentEditable) {
                addDebug(`⚠️ FOCUS moved to <${desc}> — scanner will be BLOCKED while focused`, 'warn');
            } else {
                addDebug(`📍 focus → <${desc}>`, 'system');
            }
        };

        // useCapture: true means this runs in capture phase, BEFORE element handlers
        document.addEventListener('keydown', captureHandler, true);
        document.addEventListener('focusin', focusHandler, true);

        addDebug(`👁 Capture-phase listener ACTIVE — will intercept ALL keystrokes`, 'system');

        return () => {
            document.removeEventListener('keydown', captureHandler, true);
            document.removeEventListener('focusin', focusHandler, true);
        };
    }, []); // intentionally empty — capture listener never needs re-registration

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
        } catch (e) { console.warn("Audio feedback not supported."); }
    };

    const toggleManualBox = () => {
    setShowManualBox(!showManualBox);
    if (!showManualBox) {
        setTimeout(() => manualInputRef.current?.focus(), 100);
    }
        };

    // --- DATA INITIALIZATION ---
    const loadRequiredData = useCallback(async () => {
        addDebug('🔃 loadRequiredData START', 'system');
        try {
            const [defectsRes, monitorRes] = await Promise.all([
                assemblyApi.getDefectCodes(),
                assemblyApi.getMonitorData()
            ]);
            addDebug(`✅ loadRequiredData OK | defects=${defectsRes.data?.length} | activeBatches=${monitorRes.data?.activeBatches?.length}`, 'success');
            console.log('[GarmentPortal] monitorData:', monitorRes.data);
            setDefectCodes(defectsRes.data);
            setActiveBatches(monitorRes.data.activeBatches || []);
        } catch (e) {
            addDebug(`❌ loadRequiredData FAILED: ${e.message}`, 'error');
            console.error("Failed to load portal data.", e);
        }
    }, []);

    useEffect(() => { loadRequiredData(); }, [loadRequiredData]);

    // --- NEW: BATCH MODE FETCHING ---
    const handleBatchClick = async (batch) => {
        setIsLoading(true);
        setSelectedBatch(batch);
        try {
            const res = await assemblyApi.getBatchGarments(batch.batch_id);
            console.log("Fetcheddd batch garments:", res.data);
            setBatchPieces(res.data);
        } catch (e) {
            alert("Failed to load pieces for this batch.");
            setSelectedBatch(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePieceClick = async (piece) => {
        setIsPieceLoading(true);
        setError(null);
        setGarment(null);
        setSelectedPiece(piece);
        try {
            const res = await assemblyApi.getGarmentDetails(piece.garment_uid);
            setGarment(res.data);
            playFeedback('success');
        } catch (err) {
            playFeedback('error');
            const errData = err.response?.data;
            setError(errData?.message || errData?.error || "Failed to load piece.");
            setSelectedPiece(null);
        } finally {
            setIsPieceLoading(false);
        }
    };

    // --- CORE SCAN PROCESSING ---
    const processScan = async (uid) => {
        addDebug(`📡 processScan called | uid="${uid}" | isLoading=${isLoading} | isProcessingAction=${isProcessingAction}`, 'info');

        if (isLoading || isProcessingAction) {
            addDebug(`🚫 processScan ABORTED — isLoading=${isLoading} isProcessingAction=${isProcessingAction}`, 'error');
            return;
        }

        const cleanUid = uid.trim();
        addDebug(`🧹 cleanUid="${cleanUid}" | viewMode=${viewMode}`, 'info');

        if (viewMode !== 'SCANNER') {
            addDebug(`🔀 Switching viewMode SCANNER→SCANNER`, 'system');
            setViewMode('SCANNER');
        }

        setIsLoading(true);
        setError(null);
        setMismatch(null);
        setGarment(null);
        setScannedTextVisual(cleanUid);

        try {
            addDebug(`🌐 API CALL: getGarmentDetails("${cleanUid}")`, 'info');
            console.log('[GarmentPortal] API call start:', cleanUid);
            const res = await assemblyApi.getGarmentDetails(cleanUid);
            console.log('[GarmentPortal] API response:', res.data);
            addDebug(`✅ API SUCCESS | garment_id=${res.data?.garment_id} uid=${res.data?.garment_uid} status=${res.data?.status}`, 'success');
            setGarment(res.data);
            playFeedback('success');
            setScannedTextVisual('');
        } catch (err) {
            const status = err.response?.status;
            const errData = err.response?.data;
            console.error('[GarmentPortal] API error:', status, errData);
            addDebug(`❌ API ERROR | HTTP ${status} | ${JSON.stringify(errData)}`, 'error');
            playFeedback('error');
            if (status === 403 && errData?.error === "Batch Mismatch") {
                addDebug(`⚠️ Batch Mismatch detected`, 'warn');
                setMismatch(errData);
            } else {
                setError(errData?.message || errData?.error || "Invalid Scan: Check Barcode Integrity.");
            }
        } finally {
            setIsLoading(false);
            addDebug(`🏁 processScan DONE | isLoading→false`, 'system');
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

    // --- HARDWARE SCANNER LOGIC ---
    useEffect(() => {
        setDebugListenerVersion(v => {
            const next = v + 1;
            addDebug(`🔄 keydown listener REGISTERED (v${next}) | guards: isProcessingAction=${isProcessingAction} showManualBox=${showManualBox} isLoading=${isLoading} viewMode=${viewMode}`, 'system');
            return next;
        });

        const handleKeyDown = (e) => {
            const now = Date.now();
            const gap = now - lastKeyStrokeAt.current;

            // Log every key except modifier-only keys
            if (e.key.length === 1 || e.key === 'Enter') {
                setDebugLastKey(e.key === 'Enter' ? '↵ ENTER' : e.key);
                setDebugLastGap(gap);
                setDebugBuffer(scanBuffer.current + (e.key.length === 1 ? e.key : ''));
            }

            // Guard check log
            if (isProcessingAction) {
                addDebug(`🚫 KEY BLOCKED — isProcessingAction=true | key="${e.key}"`, 'warn');
                return;
            }
            if (showManualBox) {
                addDebug(`🚫 KEY BLOCKED — showManualBox=true | key="${e.key}"`, 'warn');
                return;
            }

            // QR codes (Retsol D 5015) need a larger gap threshold than Code 128.
            // USB HID scanners can have inter-character gaps up to ~80ms for QR payloads.
            const GAP_THRESHOLD = 120;
            if (gap > GAP_THRESHOLD && scanBuffer.current.length > 0) {
                addDebug(`⏱ Gap ${gap}ms > ${GAP_THRESHOLD}ms — buffer RESET (was: "${scanBuffer.current}")`, 'warn');
                scanBuffer.current = '';
            }

            if (e.key === 'Enter') {
                const captured = scanBuffer.current;
                addDebug(`↵ ENTER pressed | buffer="${captured}" | length=${captured.length}`, captured.length > 3 ? 'success' : 'warn');
                if (captured.length > 3) {
                    addDebug(`🚀 FIRING processScan("${captured}")`, 'success');
                    processScan(captured);
                } else {
                    addDebug(`❌ Buffer too short (${captured.length} chars) — scan IGNORED`, 'error');
                }
                scanBuffer.current = '';
                setDebugBuffer('');
            } else if (e.key.length === 1) {
                scanBuffer.current += e.key;
                setDebugBuffer(scanBuffer.current);
                addDebug(`⌨ key="${e.key}" gap=${gap}ms | buffer="${scanBuffer.current}"`, 'key');
            }

            lastKeyStrokeAt.current = now;
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            addDebug(`🗑 keydown listener REMOVED`, 'system');
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [garment, mismatch, isLoading, isProcessingAction, showManualBox, viewMode]);

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
            setSelectedPiece(null);
            playFeedback('success');

            // If in batch mode, refresh the batch pieces so status updates live
            if (viewMode === 'BATCH' && selectedBatch) {
                const res = await assemblyApi.getBatchGarments(selectedBatch.batch_id);
                setBatchPieces(res.data);
                console.log("Refreshed dbatch garments after action:", res.data);
            }
            loadRequiredData();

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

            {/* ===== DEBUG OVERLAY ===== */}
            <div className="fixed top-2 right-2 z-[9999] w-[420px] max-h-[95vh] flex flex-col font-mono text-[10px]">
                <div className="bg-slate-900 text-white px-3 py-2 rounded-t-lg flex items-center justify-between border-b border-slate-700">
                    <span className="font-bold uppercase tracking-widest text-yellow-400">🐛 Scanner Debug</span>
                    <button onClick={() => setShowDebug(p => !p)} className="text-slate-400 hover:text-white text-xs px-2 py-0.5 bg-slate-800 rounded">
                        {showDebug ? 'HIDE' : 'SHOW'}
                    </button>
                </div>
                {showDebug && (
                    <div className="bg-slate-950 border border-slate-800 rounded-b-lg overflow-hidden flex flex-col">
                        {/* Live status row */}
                        <div className="grid grid-cols-2 gap-1 p-2 border-b border-slate-800 bg-slate-900">
                            <div className="bg-slate-800 rounded p-1.5">
                                <div className="text-slate-500 uppercase text-[9px]">viewMode</div>
                                <div className="text-cyan-400 font-bold">{viewMode}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5">
                                <div className="text-slate-500 uppercase text-[9px]">isLoading</div>
                                <div className={isLoading ? 'text-yellow-400 font-bold' : 'text-slate-400'}>{String(isLoading)}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5">
                                <div className="text-slate-500 uppercase text-[9px]">isProcessingAction</div>
                                <div className={isProcessingAction ? 'text-red-400 font-bold' : 'text-slate-400'}>{String(isProcessingAction)}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5">
                                <div className="text-slate-500 uppercase text-[9px]">showManualBox</div>
                                <div className={showManualBox ? 'text-red-400 font-bold' : 'text-slate-400'}>{String(showManualBox)}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5">
                                <div className="text-slate-500 uppercase text-[9px]">Last Key</div>
                                <div className="text-green-400 font-bold">{debugLastKey || '—'}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5">
                                <div className="text-slate-500 uppercase text-[9px]">Last Gap</div>
                                <div className={debugLastGap > 120 ? 'text-red-400 font-bold' : 'text-green-400'}>{debugLastGap}ms {debugLastGap > 120 ? '⚠ RESET' : ''}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5 col-span-2">
                                <div className="text-slate-500 uppercase text-[9px]">Live Buffer</div>
                                <div className="text-yellow-300 font-bold break-all">{debugBuffer || '(empty)'}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5 col-span-2">
                                <div className="text-slate-500 uppercase text-[9px]">garment loaded</div>
                                <div className={garment ? 'text-green-400 font-bold' : 'text-slate-500'}>{garment ? `✅ ${garment.garment_uid} (id:${garment.garment_id})` : 'null'}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-1.5 col-span-2">
                                <div className="text-slate-500 uppercase text-[9px]">🎯 focused element</div>
                                <div className={['input','textarea','select','iframe'].some(t => debugFocusTarget.startsWith(t)) ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>{debugFocusTarget}</div>
                            </div>
                        </div>
                        {/* Log entries */}
                        <div className="overflow-y-auto max-h-64 p-1.5 space-y-0.5">
                            {debugLog.map((entry, i) => (
                                <div key={i} className={`px-2 py-0.5 rounded text-[10px] leading-snug ${
                                    entry.type === 'error' ? 'bg-red-950 text-red-300' :
                                    entry.type === 'warn' ? 'bg-yellow-950 text-yellow-300' :
                                    entry.type === 'success' ? 'bg-green-950 text-green-300' :
                                    entry.type === 'system' ? 'bg-slate-800 text-slate-400' :
                                    entry.type === 'key' ? 'bg-blue-950 text-blue-300' :
                                    entry.type === 'capture' ? 'bg-violet-950 text-violet-300' :
                                    'bg-slate-900 text-slate-300'
                                }`}>
                                    <span className="text-slate-600 mr-1">{entry.ts}</span>{entry.msg}
                                </div>
                            ))}
                            {debugLog.length === 0 && <div className="text-slate-600 text-center py-4">Waiting for events...</div>}
                        </div>
                        <div className="p-1.5 border-t border-slate-800">
                            <button onClick={() => { debugLogRef.current = []; setDebugLog([]); }} className="w-full text-[9px] uppercase tracking-widest text-slate-500 hover:text-white py-1 bg-slate-800 rounded hover:bg-slate-700">Clear Log</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Global Loader for Batch Selection only */}
            {isLoading && viewMode === 'BATCH' && !selectedBatch && (
                <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[500] flex items-center justify-center">
                    <RefreshCw className="w-10 h-10 animate-spin text-indigo-600" />
                </div>
            )}

            <div className="max-w-6xl mx-auto">
                
                {/* STATION HEADER WITH NEW TOGGLE */}
                <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
                            <HardDrive size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Assembly Station</h1>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Live Validations</p>
                            </div>
                        </div>
                    </div>

                    {/* NEW: VIEW MODE TOGGLE */}
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                        <button 
                            onClick={() => { setViewMode('SCANNER'); setSelectedBatch(null); }}
                            className={`flex items-center px-6 py-3 rounded-xl font-black text-sm transition-all ${
                                viewMode === 'SCANNER' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <Barcode size={18} className="mr-2" /> SCANNER
                        </button>
                        <button 
                            onClick={() => setViewMode('BATCH')}
                            className={`flex items-center px-6 py-3 rounded-xl font-black text-sm transition-all ${
                                viewMode === 'BATCH' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            <List size={18} className="mr-2" /> BATCH LIST
                        </button>
                    </div>

                    <div className="flex gap-3">
                        {lastAction && (
                            <div className="bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl border-2 border-emerald-100 flex items-center font-black text-sm animate-in fade-in slide-in-from-right-4">
                                <CheckCircle2 className="w-5 h-5 mr-3" /> {lastAction.uid} {lastAction.status}
                            </div>
                        )}
                    </div>
                </header>

                {/* =========================================
                    MODE A: EXISTING SCANNER INTERFACE 
                ========================================= */}
                {viewMode === 'SCANNER' && (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                        
                        {/* IDLE SCAN STATE WITH SCANNED TEXT VISUAL */}
                        {!garment && !mismatch && (
                            <div className="text-center py-32 bg-white rounded-[3rem] border-4 border-dashed border-slate-200 shadow-inner">
                                <div className="relative inline-block mb-8">
                                    <QrCode size={140} className="text-slate-100" />
                                    {isLoading ? (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <RefreshCw size={44} className="text-indigo-400 animate-spin" />
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <RefreshCw size={44} className="text-indigo-400 animate-spin opacity-20" />
                                        </div>
                                    )}
                                </div>
                                
                                {/* VISUAL TEXT FEEDBACK OF SCAN */}
                                {scannedTextVisual ? (
                                    <div className="mb-4">
                                        <span className="bg-indigo-50 text-indigo-600 font-mono font-black text-2xl px-6 py-3 rounded-2xl border-2 border-indigo-100">
                                            {scannedTextVisual}
                                        </span>
                                    </div>
                                ) : (
                                    <h2 className="text-4xl font-black text-slate-300 tracking-tighter uppercase">Ready for Scan</h2>
                                )}
                                
                                <p className="text-slate-400 font-bold mt-4 uppercase text-xs tracking-[0.2em]">Hardware Wedge Active • QR Code • Retsol D 5015</p>
                                
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
                                <button onClick={() => setMismatch(null)} className="px-14 py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-black active:scale-95 transition-all shadow-xl">
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
                )}

                {/* =========================================
                    MODE B: BATCH & PIECE SELECTION
                ========================================= */}
                {viewMode === 'BATCH' && (
                    <div className="animate-in fade-in duration-200 space-y-6">

                        {!selectedBatch ? (
                            <div className="w-full bg-white rounded-[3rem] p-8 md:p-12 shadow-sm border border-slate-200">
                                <h2 className="text-xl font-black text-slate-400 mb-8 uppercase tracking-widest flex items-center">
                                    <List className="mr-3" size={24}/> Select Active Batch
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {activeBatches.map(batch => {
                                        const approved = batch.approved_units ?? batch.completed_units ?? 0;
                                        const pending = (batch.total_units ?? 0) - (batch.completed_units ?? 0);
                                        const rejected = batch.rejected_units ?? batch.qc_rejected_units ?? 0;
                                        const total = batch.total_units ?? 0;
                                        return (
                                            <button
                                                key={batch.batch_id}
                                                onClick={() => handleBatchClick(batch)}
                                                className="bg-slate-50 p-8 rounded-[2rem] text-left border-2 border-slate-100 hover:border-indigo-500 hover:shadow-lg transition-all group"
                                            >
                                                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-600 font-black text-[10px] uppercase rounded-lg mb-4">
                                                    {batch.batch_code}
                                                </span>
                                                <h3 className="text-2xl font-black text-slate-800 mb-5 group-hover:text-indigo-600 transition-colors">{batch.product_name}</h3>

                                                {/* Summary chips */}
                                                <div className="flex gap-2 flex-wrap mb-4">
                                                    <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700">{approved} Approved</span>
                                                    <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-slate-200 text-slate-600">{pending} Pending</span>
                                                    {rejected > 0 && <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700">{rejected} Rejected</span>}
                                                </div>

                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                                        <span>Completion</span>
                                                        <span className="text-indigo-600">{batch.completed_units} / {total}</span>
                                                    </div>
                                                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                                                        <div className="bg-emerald-500 h-full" style={{ width: `${total > 0 ? (approved/total)*100 : 0}%` }} />
                                                        <div className="bg-rose-400 h-full" style={{ width: `${total > 0 ? (rejected/total)*100 : 0}%` }} />
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                    {activeBatches.length === 0 && (
                                        <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase">
                                            No active batches running on this line.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className={`animate-in slide-in-from-right-8 space-y-6 ${garment ? 'pb-64' : ''}`}>
                                {/* Batch header */}
                                <div className="w-full bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <button onClick={() => { setSelectedBatch(null); setGarment(null); setSelectedPiece(null); }}
                                                className="flex items-center text-slate-400 hover:text-indigo-600 font-bold text-sm mb-3 transition-colors">
                                                <ArrowLeft size={16} className="mr-2" /> Back to Batches
                                            </button>
                                            <h2 className="text-2xl font-black text-slate-900">{selectedBatch.product_name}</h2>
                                            <p className="text-indigo-600 font-black text-sm uppercase tracking-widest mt-0.5">{selectedBatch.batch_code}</p>
                                        </div>
                                        {/* Summary */}
                                        {(() => {
                                            const approved = batchPieces.filter(p => p.status === 'APPROVED').length;
                                            const rejected = batchPieces.filter(p => p.status === 'QC_REJECTED').length;
                                            const rework = batchPieces.filter(p => p.status === 'NEEDS_REWORK').length;
                                            const pending = batchPieces.filter(p => !p.status || p.status === 'PENDING').length;
                                            return (
                                                <div className="flex gap-3 flex-wrap">
                                                    <span className="text-xs font-black px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">{approved} Approved</span>
                                                    <span className="text-xs font-black px-4 py-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">{pending} Pending</span>
                                                    {rework > 0 && <span className="text-xs font-black px-4 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">{rework} Rework</span>}
                                                    {rejected > 0 && <span className="text-xs font-black px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">{rejected} Rejected</span>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Pieces grouped by roll */}
                                {(() => {
                                    const byRoll = batchPieces.reduce((acc, p) => {
                                        const key = p.fabric_roll_id || 'Unknown';
                                        if (!acc[key]) acc[key] = [];
                                        acc[key].push(p);
                                        return acc;
                                    }, {});
                                    return Object.entries(byRoll).map(([rollId, pieces]) => {
                                        const sortedPieces = [...pieces].sort((a, b) => (a.piece_sequence ?? 0) - (b.piece_sequence ?? 0));
                                        return (
                                        <div key={rollId} className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-slate-200">
                                            <div className="flex items-center gap-3 mb-5">
                                                <Layers size={18} className="text-indigo-500" />
                                                <span className="font-black text-slate-700 uppercase tracking-widest text-sm">Roll #{rollId}</span>
                                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{pieces.length} pcs</span>
                                            </div>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
                                                {sortedPieces.map(piece => {
                                                    const st = piece.status;
                                                    const isSelected = selectedPiece?.id === piece.id;
                                                    let cls = "bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:shadow-md";
                                                    let icon = <Clock size={12} className="opacity-40" />;
                                                    if (st === 'APPROVED') { cls = "bg-emerald-50 border-emerald-300 text-emerald-600"; icon = <CheckCircle2 size={12} />; }
                                                    else if (st === 'QC_REJECTED') { cls = "bg-rose-50 border-rose-300 text-rose-600 hover:border-rose-500"; icon = <X size={12} />; }
                                                    else if (st === 'NEEDS_REWORK') { cls = "bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500"; icon = <Hammer size={12} />; }
                                                    if (isSelected) cls += " ring-2 ring-indigo-500 ring-offset-1";

                                                    const tooltipLines = [
                                                        `UID: ${piece.garment_uid}`,
                                                        `Status: ${st || 'PENDING'}`,
                                                        piece.active_garment_defect_count > 0 ? `Defects: ${piece.active_garment_defect_count}` : null,
                                                        piece.garment_defects?.length > 0 ? piece.garment_defects.map(d => d.description || d.defect_description).join(', ') : null,
                                                    ].filter(Boolean).join('\n');

                                                    const isLoadingThis = isPieceLoading && selectedPiece?.id === piece.id;
                                                    return (
                                                        <button
                                                            key={piece.id}
                                                            title={tooltipLines}
                                                            onClick={() => handlePieceClick(piece)}
                                                            disabled={isPieceLoading}
                                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all active:scale-95 disabled:cursor-wait ${cls}`}
                                                        >
                                                            <span className="font-black text-base leading-none mb-1">{piece.piece_sequence}</span>
                                                            {isLoadingThis ? <RefreshCw size={12} className="animate-spin" /> : icon}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        );
                                    });
                                })()}

                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* FIXED BOTTOM DRAWER — piece action panel (BATCH mode) */}
            {viewMode === 'BATCH' && (garment || isPieceLoading) && (
                <div className="fixed bottom-0 left-0 right-0 z-[200] animate-in slide-in-from-bottom-4 duration-200">
                    <div className="max-w-6xl mx-auto px-4 pb-4">
                        <div className="bg-white rounded-[2rem] shadow-2xl border-2 border-indigo-200 overflow-hidden">
                            {isPieceLoading && !garment ? (
                                <div className="flex items-center justify-center py-8 gap-3 text-indigo-500">
                                    <RefreshCw size={20} className="animate-spin" />
                                    <span className="font-black text-sm uppercase tracking-widest">Loading piece...</span>
                                </div>
                            ) : garment ? (
                                <div className="p-5 md:p-6">
                                    {/* Header row */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Selected Piece</span>
                                            <h3 className="text-xl font-black text-slate-900 leading-tight">{garment.garment_uid}</h3>
                                            <p className="text-slate-500 font-bold text-xs mt-0.5">
                                                Size {garment.size}
                                                {garment.current_active_location && <span className="ml-2 text-indigo-400">· {garment.current_active_location}</span>}
                                            </p>
                                        </div>
                                        <button onClick={() => { setGarment(null); setSelectedPiece(null); }}
                                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all ml-4 shrink-0">
                                            <X size={16} className="text-slate-600" />
                                        </button>
                                    </div>

                                    {/* Component map — compact horizontal */}
                                    {garment.components?.length > 0 && (
                                        <div className="flex gap-2 flex-wrap mb-4">
                                            {garment.components.map((comp, i) => (
                                                <div key={i} className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${comp.has_active_defect ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                    {comp.has_active_defect ? <X size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3} />}
                                                    {comp.part_name}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* QC note */}
                                    {garment.qc_status && garment.qc_status !== 'CLEAN' && (
                                        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
                                            QC: {garment.qc_status}
                                            {garment.garment_defects?.length > 0 && (
                                                <span className="ml-1.5 text-amber-600">· {garment.garment_defects.map(d => d.description || d.defect_description).join(', ')}</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleAction(STATUS.APPROVED)}
                                            disabled={isProcessingAction || garment.components?.some(c => c.has_active_defect)}
                                            className="flex-1 bg-emerald-600 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            <ShieldCheck size={16} /> APPROVE
                                        </button>
                                        <button
                                            onClick={() => setShowDefectModal('REWORK')}
                                            disabled={isProcessingAction}
                                            className="flex-1 bg-amber-500 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-amber-600 active:scale-95 disabled:opacity-40 transition-all"
                                        >
                                            <Hammer size={16} /> REWORK
                                        </button>
                                        <button
                                            onClick={() => setShowDefectModal('REJECT')}
                                            disabled={isProcessingAction}
                                            className="flex-1 bg-rose-600 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-rose-700 active:scale-95 disabled:opacity-40 transition-all"
                                        >
                                            <X size={16} /> REJECT
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* DEFECT DICTIONARY MODAL (Preserved) */}
            {showDefectModal && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6 animate-in fade-in">
                    {/* ... Existing Defect Modal Logic ... */}
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

            {/* MANUAL OVERRIDE (Preserved, only shows in SCANNER mode) */}
            {viewMode === 'SCANNER' && (
                <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none">
                    <div className="pointer-events-auto flex flex-col items-center">
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
                                    <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-indigo-700 transition-all">
                                        LOAD
                                    </button>
                                </form>
                            </div>
                        )}
                        <button 
                            onClick={toggleManualBox}
                            className={`flex items-center px-6 py-3 rounded-full font-black text-xs tracking-widest transition-all shadow-lg border-2 ${
                                showManualBox 
                                ? 'bg-rose-50 border-rose-100 text-rose-600' 
                                : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                            }`}
                        >
                            {showManualBox ? <><X size={16} className="mr-2" /> CLOSE OVERRIDE</> : <><Maximize size={16} className="mr-2" /> MANUAL ENTRY</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AssemblyProcessingPortal;
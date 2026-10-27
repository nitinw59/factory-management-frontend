// Garment scanner — 2.0's garment checker screen (GarmentProcessingPortal, SCANNER mode) on 3.0 (27 Oct 2026, owner:
// "build exactly same for 3.0 in /v3/production/check for stages after bf line" → "copy 2.0's screen layout"). Garment
// stages only (Assembly onwards); the stage check page shows it in SCANNER mode, the batch tiles in BATCH LIST mode.
//
//   Idle        the dashed "READY FOR SCAN" panel (the scanned code while it loads, the error under it), recent scans
//               (this line's latest garment checks at this stage)
//   Garment     left: dark header (garment no., style, colour · roll, SIZE), the stage chain, a warning, the
//               component map (each part green, or red: rejected / not cleared at an earlier stage); right: the
//               command console — tall APPROVE (batch no. on it), REWORK | REPAIR NOW, Cancel scan; a garment in
//               rework or with a part rejected earlier: REPAIRED (3.0 "passed") instead
//   Popups      BATCH NOT LOADED · NOT AT THIS STAGE YET (waiting parts, stage chain, QA OVERRIDE: APPROVE GARMENT —
//               a supervisor's / quality manager's password) · ALREADY APPROVED (revert = 3.0 undo)
//   Order       as 2.0's scan (assemblyPortalController.getGarmentDetails): found → on this stage's route → batch
//               loaded at this stage (any line of the stage; one roll / size loaded opens the whole batch — 2.0's batch
//               switch) → parts cleared at the earlier stages → the garment
//   Defects     2.0's sheet: search, category chips, codes — one code (3.0 records one), Confirm
//   Manual      MANUAL ENTRY at the bottom
// 3.0's rules stay: no Reject; same calls as the tiles (garment-checks / garment-repairs) — loaded line, earlier stages
// cleared or a QA override, rework limit (supervisor dialog from the page). The hardware scanner is caught by the page (scanShared) and
// arrives here as scanReq; sounds as 2.0.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { QrCode, RefreshCw, ShieldCheck, ShieldAlert, AlertCircle, Clock, Check, X, Hammer, Wrench, Package, CheckCircle2, Maximize, Loader2 } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { feedback } from './scanShared';
import { StationDialog } from './stationShared';

const CLEARED = ['APPROVED', 'REPAIRED'];
const rollOf = (no) => String(no).split('-').slice(-3, -2)[0] || '';
const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return '—'; } };
const STATUS_DOT = { APPROVED: 'bg-emerald-500', NEEDS_REWORK: 'bg-amber-400', REPAIRED: 'bg-teal-500', QC_REJECTED: 'bg-rose-500' };
const STATUS_PILL = { APPROVED: 'bg-emerald-50 text-emerald-700', NEEDS_REWORK: 'bg-amber-50 text-amber-700', REPAIRED: 'bg-teal-50 text-teal-700', QC_REJECTED: 'bg-rose-50 text-rose-700' };

// 2.0's stage chain: passed (green check) · current (amber, pulsing — where it actually is) · upcoming (grey); "(You)" =
// this checker's stage.
const STAGE_STATE_STYLE = {
    passed: { circle: 'bg-emerald-500 border-emerald-500 text-white', label: 'text-emerald-600', line: 'bg-emerald-400' },
    current: { circle: 'bg-amber-500 border-amber-500 text-white animate-pulse', label: 'text-amber-600', line: 'bg-slate-200' },
    upcoming: { circle: 'bg-white border-slate-200 text-slate-300', label: 'text-slate-300', line: 'bg-slate-200' },
};
function StageProgressStepper({ stages }) {
    if (!stages?.length) return null;
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {stages.map((s, i) => {
                const style = STAGE_STATE_STYLE[s.state] || STAGE_STATE_STYLE.upcoming;
                return (
                    <Fragment key={s.key}>
                        <div className="flex flex-col items-center shrink-0" title={s.status ? `${s.label} — ${s.status}` : s.label}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 font-black text-[11px] ${style.circle} ${s.you ? 'ring-4 ring-red-800' : ''}`}>
                                {s.state === 'passed' ? <Check size={14} strokeWidth={4} /> : i + 1}
                            </div>
                            <span className={`mt-1 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${s.you ? 'text-red-800' : style.label}`}>{s.label}{s.you ? ' (You)' : ''}</span>
                        </div>
                        {i < stages.length - 1 && <div className={`h-0.5 flex-1 min-w-[16px] ${style.line}`} />}
                    </Fragment>
                );
            })}
        </div>
    );
}

// The batch's route as the chain for one garment (3.0 data: garment statuses per stage, what still blocks it).
function stagesOf(view, g, stageId) {
    const idx = view.route.findIndex(r => String(r.stage_type_id) === String(stageId));
    return view.route.map((r, i) => {
        const st = g.statuses?.[r.stage_type_id];
        let state;
        if (r.unit === 'GARMENT') state = CLEARED.includes(st) ? 'passed' : i <= idx ? 'current' : 'upcoming';
        else state = g.blocked_by.some(b => b.startsWith(`${r.name} (`)) ? 'current' : i < idx ? 'passed' : 'upcoming';
        return { key: `${r.stage_type_id}-${i}`, label: r.name, state, you: i === idx, status: st ? st.replace('_', ' ') : '' };
    });
}
// The component map: one chip per part — red when rejected at an earlier stage (not cleared since) or not cleared there yet.
const partsOf = (g) => g.parts.map(p => {
    const flag = g.flagged.find(f => f.part_name === p.part_name);
    const wait = g.blocked_by.find(b => b.endsWith(`(${p.part_name})`));
    return { id: p.id, name: p.part_name, bad: Boolean(flag || wait), note: flag ? `Rejected @ ${flag.rejected_at}` : wait ? `Not cleared @ ${wait.slice(0, wait.lastIndexOf(' ('))}` : p.replacement ? 'Re-cut' : null };
});

// Full-screen 2.0 popup (BATCH NOT LOADED / NOT AT THIS STAGE / ALREADY APPROVED).
const POPUP = {
    rose: { back: 'bg-rose-950/80', border: 'border-rose-500', disc: 'bg-rose-100', icon: 'text-rose-600', title: 'text-rose-600', box: 'bg-rose-50 border-rose-100', val: 'text-rose-700', btn: 'bg-rose-600 hover:bg-rose-700' },
    amber: { back: 'bg-amber-950/80', border: 'border-amber-400', disc: 'bg-amber-100', icon: 'text-amber-600', title: 'text-amber-600', box: 'bg-amber-50 border-amber-100', val: 'text-amber-700', btn: 'bg-amber-500 hover:bg-amber-600' },
    emerald: { back: 'bg-emerald-950/80', border: 'border-emerald-400', disc: 'bg-emerald-100', icon: 'text-emerald-500', title: 'text-emerald-600', box: 'bg-emerald-50 border-emerald-100', val: 'text-slate-900', btn: 'bg-emerald-600 hover:bg-emerald-700' },
};
function Popup({ tone, icon: Icon, title, message, rows = [], children, before, onOk, extra }) {
    const c = POPUP[tone];
    return (
        <div className={`fixed inset-0 z-[320] ${c.back} backdrop-blur-sm flex items-center justify-center p-4`}>
            <div className={`bg-white border-[8px] ${c.border} rounded-[3rem] p-8 md:p-10 max-w-2xl w-full max-h-[92vh] overflow-y-auto text-center shadow-2xl`}>
                <div className={`w-24 h-24 ${c.disc} rounded-full flex items-center justify-center mx-auto mb-6`}><Icon className={`w-14 h-14 ${c.icon}`} /></div>
                <h2 className={`text-3xl md:text-5xl font-black ${c.title} tracking-tight mb-3`}>{title}</h2>
                <p className="text-slate-500 font-bold text-lg mb-6">{message}</p>
                {children}
                {rows.length > 0 && (
                    <div className={`${c.box} border-2 rounded-3xl p-6 mb-8 text-left space-y-2.5`}>
                        {rows.map(([l, v]) => <div key={l} className="flex justify-between items-center gap-3"><span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{l}</span><span className={`font-mono font-black text-lg ${c.val}`}>{v}</span></div>)}
                    </div>
                )}
                {before}
                <button type="button" onClick={onOk} className={`px-14 py-5 ${c.btn} text-white font-black text-xl rounded-3xl active:scale-95 shadow-xl w-full`}>OK</button>
                {extra}
            </div>
        </div>
    );
}

// stage: the stage (name); lineId: the line for the check calls (managers' picked line; the station's otherwise);
// feedLine: the line for recent scans; act / askUndo: the page's.
export default function GarmentScanner({ stage, stageId, lineId, feedLine, codes, act, askUndo, tick, scanReq }) {
    const [scanned, setScanned] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [cur, setCur] = useState(null);          // { d: lookup, v: batch garments view, g: the garment }
    const [popup, setPopup] = useState(null);      // { kind: NOT_LOADED | NOT_AT_STAGE | ALREADY, ... }
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const [defect, setDefect] = useState(null);    // 'REWORK' | 'REPAIR NOW'
    const [defSearch, setDefSearch] = useState('');
    const [defCat, setDefCat] = useState(null);
    const [defCode, setDefCode] = useState(null);
    const [recent, setRecent] = useState([]);
    const [lastAction, setLastAction] = useState(null);
    const [showManual, setShowManual] = useState(false);
    const [manual, setManual] = useState('');
    const [qaFor, setQaFor] = useState(null);      // the NOT AT THIS STAGE popup whose garment a QA override approves
    const lastTimer = useRef(null);

    const loadRecent = useCallback(() => { productionApi.recentGarments(stageId, feedLine).then(r => setRecent(r.data)).catch(() => {}); }, [stageId, feedLine]);
    useEffect(() => { loadRecent(); }, [loadRecent, tick]);
    // Live: someone else checked the garment on screen — show its state now.
    useEffect(() => {
        if (!cur) return;
        productionApi.batchGarments(cur.d.batch_id, stageId).then(r => {
            const g = r.data.garments.find(x => String(x.id) === String(cur.d.id));
            if (g) setCur(c => (c && c.d.id === cur.d.id ? { ...c, v: r.data, g } : c));
        }).catch(() => {});
    }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

    const runScan = useCallback(async (raw) => {
        const code = String(raw || '').trim();
        if (!code || loading || busy) return;
        setError(''); setActionError(''); setPopup(null); setCur(null); setDefect(null); setScanned(code); setLoading(true);
        try {
            const d = (await productionApi.garmentLookup(code, stageId)).data;
            const a = d.at_stage;
            if (!a || a.on_route === false) {
                feedback('wrong_stage');
                setPopup({ kind: 'NOT_AT_STAGE', title: 'NOT CHECKED AT THIS STAGE', message: `Garment ${d.garment_no} — its style's route doesn't go through ${stage.name}.`, d });
                return;
            }
            const v = (await productionApi.batchGarments(d.batch_id, stageId)).data;
            // Batch switch (2.0): loaded at this stage on any of its lines — one roll / size opens the whole batch.
            if (!v.first && v.loads.length === 0) {
                feedback('not_loaded');
                setPopup({ kind: 'NOT_LOADED', message: `Batch #${d.floor_no} is not loaded on your line. Ask your line loader to load this batch on your line.`, d });
                return;
            }
            const g = v.garments.find(x => String(x.id) === String(d.id));
            if (!g) {
                feedback('error');
                setPopup({ kind: 'NOT_AT_STAGE', title: 'NOT AT THIS STAGE', message: `Garment ${d.garment_no} isn't checked at ${stage.name} (taken out of the batch here).`, d });
                return;
            }
            if (CLEARED.includes(g.status)) { feedback('already'); setPopup({ kind: 'ALREADY', d, v, g }); setScanned(''); return; }
            if (!g.status && !g.gate_ok) {
                feedback('waiting');
                const waitStages = [...new Set(g.blocked_by.map(x => (x.includes(' (') ? x.slice(0, x.indexOf(' (')) : x)))];
                setPopup({ kind: 'NOT_AT_STAGE', title: 'NOT AT THIS STAGE YET', message: `Not available yet — waiting for ${waitStages.join(', ')}.`, waitStages, d, v, g });
                return;
            }
            feedback('success');
            setCur({ d, v, g });
            setScanned('');
        } catch (err) {
            feedback('error');
            const status = err?.response?.status;
            setError(err?.response?.data?.error ? apiError(err) : `Invalid scan "${code}" (${status ? `server answered ${status}` : 'no answer from the server'}). Check the barcode.`);
        } finally { setLoading(false); }
    }, [loading, busy, stageId, stage]);
    // A hardware scan caught by the page.
    useEffect(() => { if (scanReq) runScan(scanReq.code); }, [scanReq]); // eslint-disable-line react-hooks/exhaustive-deps

    const flashLast = (no, what) => { setLastAction({ no, what }); clearTimeout(lastTimer.current); lastTimer.current = setTimeout(() => setLastAction(null), 4000); };
    // One action on the garment on screen; back to READY FOR SCAN once saved (or once the supervisor dialog takes over).
    const doAction = async (fn, what) => {
        if (!cur || busy) return;
        const { g } = cur;
        setBusy(true); setActionError('');
        try {
            const ok = await act(fn, what, 'garment');
            if (ok) flashLast(g.garment_no, what);
            setCur(null); setDefect(null); loadRecent();
        } catch (e) { setActionError(e.message || 'Failed.'); }
        finally { setBusy(false); }
    };
    const base = () => ({ batch_id: cur.d.batch_id, stage_type_id: stageId, production_line_id: lineId, garment_ids: [cur.g.id] });
    const approve = () => doAction((e) => productionApi.garmentCheck({ ...base(), status: 'APPROVED', ...e }), 'Approved');
    const repaired = () => doAction((e) => productionApi.garmentRepair({ ...base(), ...e }), 'Repaired');
    const confirmDefect = () => {
        if (!defCode) return;
        const status = defect === 'REWORK' ? 'NEEDS_REWORK' : 'REPAIRED';
        doAction((e) => productionApi.garmentCheck({ ...base(), status, defect_code_id: defCode, ...e }), defect === 'REWORK' ? 'To rework' : 'Repaired now');
    };
    const openDefects = (kind) => { setDefect(kind); setDefSearch(''); setDefCat(null); setDefCode(null); };
    const submitManual = (e) => { e.preventDefault(); if (manual.trim().length > 3) { runScan(manual.trim()); setManual(''); setShowManual(false); } };

    const g = cur?.g;
    const inRework = g?.status === 'NEEDS_REWORK';
    const flagged = Boolean(g && !g.status && g.flagged.length);
    const parts = g ? partsOf(g) : [];
    const cats = [...new Set(codes.map(c => c.category).filter(Boolean))].sort();
    const q = defSearch.trim().toLowerCase();
    const shownCodes = codes.filter(c => (!defCat || c.category === defCat) && (!q || `${c.code} ${c.description} ${c.category || ''}`.toLowerCase().includes(q)));

    return (
        <div className="min-h-[calc(100vh-250px)] flex flex-col pb-24">
            {lastAction && (
                <div className="self-end mb-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center font-black text-xs">
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> {lastAction.no} {lastAction.what}
                </div>
            )}

            {/* IDLE — READY FOR SCAN */}
            {!cur && (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4 bg-white rounded-[2rem] border-4 border-dashed border-slate-200 shadow-inner">
                    <div className="relative inline-block mb-4">
                        <QrCode size={96} className="text-slate-100" />
                        <div className="absolute inset-0 flex items-center justify-center"><RefreshCw size={44} className={`text-indigo-400 animate-spin ${loading ? '' : 'opacity-20'}`} /></div>
                    </div>
                    {scanned
                        ? <div className="mb-4"><span className="bg-indigo-50 text-indigo-600 font-mono font-black text-2xl px-6 py-3 rounded-2xl border-2 border-indigo-100">{scanned}</span></div>
                        : <h2 className="text-3xl font-black text-slate-300 tracking-tighter uppercase">Ready for Scan</h2>}
                    <p className="text-slate-400 font-bold mt-4 uppercase text-xs tracking-[0.2em]">Hardware Wedge Active • QR Code • Retsol D 5015 · {stage.name}</p>
                    {error && (
                        <div className="mt-5 max-w-md mx-auto p-4 bg-rose-50 border-2 border-rose-100 rounded-3xl text-rose-700 font-black flex items-center justify-center shadow-sm">
                            <ShieldAlert className="mr-3 shrink-0" /> {error}
                        </div>
                    )}
                    {!error && recent.length > 0 && (
                        <div className="mt-5 w-full max-w-2xl mx-auto flex flex-col">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mb-2">Recent Scans</p>
                            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                {recent.map(s => (
                                    <div key={s.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-4 py-2.5 shadow-sm text-left">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s.status] || 'bg-slate-300'}`} />
                                        <span className="font-mono font-black text-sm text-slate-700 flex-1">{s.garment_no}</span>
                                        <span className="text-[10px] font-bold text-slate-400 font-mono">#{s.floor_no}</span>
                                        <span className="text-[10px] font-bold text-slate-400">{s.size}</span>
                                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${STATUS_PILL[s.status] || 'bg-slate-100 text-slate-500'}`}>{String(s.status).replace(/_/g, ' ')}</span>
                                        <span className="text-[10px] text-slate-300 font-mono whitespace-nowrap">{fmtTime(s.created_at)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* GARMENT VERIFICATION VIEW — info + parts on the left, the command console on the right */}
            {g && (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="bg-slate-900 px-5 py-4 text-white">
                            <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className={`${parts.some(p => p.bad) ? 'bg-rose-600' : 'bg-indigo-600'} px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest`}>{parts.some(p => p.bad) ? 'Part not OK' : 'Parts OK'}</span>
                                        <h2 className="text-2xl font-black tracking-tighter truncate font-mono">{g.garment_no}</h2>
                                    </div>
                                    <p className="text-slate-400 font-bold text-sm truncate">{cur.v.batch.style_name} · {cur.v.batch.style_code}</p>
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[10px] font-mono">
                                        <span className="bg-white/10 px-2 py-0.5 rounded-md text-white font-bold">{g.colour}</span>
                                        {rollOf(g.garment_no) && <span className="bg-white/5 px-2 py-0.5 rounded-md text-slate-400">Roll #{rollOf(g.garment_no)}</span>}
                                        <span className="bg-white/5 px-2 py-0.5 rounded-md text-slate-400">Batch #{cur.v.batch.floor_no} · {cur.v.batch.order_no}</span>
                                    </div>
                                </div>
                                <div className="bg-white/10 px-4 py-2 rounded-xl text-right shrink-0">
                                    <span className="block text-[9px] font-bold opacity-50">SIZE</span>
                                    <span className="text-2xl font-black leading-none">{g.size}</span>
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100"><StageProgressStepper stages={stagesOf(cur.v, g, stageId)} /></div>
                        {flagged && (
                            <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-900">
                                <p className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><AlertCircle size={12} /> Check before approving</p>
                                <p className="text-xs font-bold">Part rejected earlier: {g.flagged.map(f => `${f.part_name} at ${f.rejected_at}`).join(', ')} — repair it here and tap REPAIRED.</p>
                            </div>
                        )}
                        {actionError && <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl border-2 border-rose-300 bg-rose-50 text-rose-800 text-sm font-bold">{actionError}</div>}
                        <div className="p-4 flex-1 overflow-y-auto">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] flex items-center"><Package className="w-3.5 h-3.5 mr-2" /> Component Integrity Map</h3>
                                <span className="text-[10px] font-mono font-bold text-slate-300">ID: {g.id}</span>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {parts.map((p, i) => (
                                    <div key={p.id} className={`px-3 py-2.5 rounded-xl border-2 flex items-center justify-between gap-2 ${p.bad ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${p.bad ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}>{i + 1}</div>
                                            <span className="font-black text-slate-700 text-sm truncate">{p.name}{p.note && <span className={`block text-[10px] font-black uppercase tracking-wider ${p.bad ? 'text-rose-500' : 'text-slate-400'}`}>{p.note}</span>}</span>
                                        </div>
                                        {p.bad ? <X size={16} className="text-rose-500 shrink-0" strokeWidth={4} /> : <Check size={16} className="text-emerald-500 shrink-0" strokeWidth={4} />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* COMMAND CONSOLE */}
                    <div className="flex flex-col gap-2 md:gap-3">
                        {inRework || flagged ? (
                            <>
                                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 text-center">
                                    <div className="flex items-center justify-center gap-2 mb-1.5">
                                        <Hammer size={16} className="text-amber-600" />
                                        <span className="text-amber-700 font-black text-xs uppercase tracking-widest">{inRework ? 'Previously Flagged for Rework' : 'Part Rejected Earlier'}</span>
                                    </div>
                                    {flagged && <div className="flex flex-wrap justify-center gap-1.5">{g.flagged.map((f, i) => <span key={i} className="inline-flex items-center bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-200">{f.part_name} @ {f.rejected_at}</span>)}</div>}
                                </div>
                                <button type="button" onClick={repaired} disabled={busy}
                                    className="h-[clamp(88px,26vh,260px)] bg-teal-600 text-white rounded-[2rem] shadow-xl flex flex-col items-center justify-center p-3 hover:bg-teal-700 active:scale-95 disabled:grayscale disabled:opacity-50">
                                    {busy ? <Loader2 className="w-10 h-10 mb-1 animate-spin" /> : <ShieldCheck className="w-[clamp(24px,5vh,44px)] h-[clamp(24px,5vh,44px)] mb-1" />}
                                    <span className="text-[length:clamp(1.1rem,3.2vh,1.5rem)] font-black">REPAIRED</span>
                                    <span className="text-[10px] font-bold opacity-60 mt-1 uppercase tracking-widest">Defect Fixed ✓</span>
                                </button>
                            </>
                        ) : (
                            <>
                                {g.status === 'QC_REJECTED' && (
                                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5 mb-0.5"><ShieldAlert size={16} className="text-rose-600" /><span className="text-rose-700 font-black text-xs uppercase tracking-widest">Rejected garment</span></div>
                                        <p className="text-[11px] font-bold text-rose-600">Rejected here earlier — a manager changes it from the batch list.</p>
                                    </div>
                                )}
                                <button type="button" onClick={approve} disabled={busy || g.status === 'QC_REJECTED'}
                                    className="h-[clamp(96px,30vh,300px)] bg-emerald-600 text-white rounded-[2rem] shadow-xl flex flex-col items-center justify-center p-3 hover:bg-emerald-700 active:scale-95 disabled:grayscale disabled:opacity-50">
                                    {busy ? <Loader2 className="w-10 h-10 mb-1 animate-spin" /> : <ShieldCheck className="w-[clamp(22px,4.5vh,44px)] h-[clamp(22px,4.5vh,44px)] mb-1" />}
                                    <span className="font-mono font-black text-[length:clamp(1.5rem,6vh,3rem)] opacity-80 leading-none mb-1 tracking-wider">#{cur.v.batch.floor_no}</span>
                                    <span className="text-[length:clamp(1.1rem,3.2vh,1.5rem)] font-black">APPROVE</span>
                                    <span className="text-[10px] font-bold opacity-60 mt-0.5 uppercase tracking-widest">Pass to next stage</span>
                                </button>
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={() => openDefects('REWORK')} disabled={busy || g.status === 'QC_REJECTED'}
                                        className="h-[clamp(56px,11vh,110px)] bg-amber-500 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-amber-600 active:scale-95 disabled:opacity-50">
                                        <Hammer size={22} className="mr-2" /><span className="text-lg font-black">REWORK</span>
                                    </button>
                                    <button type="button" onClick={() => openDefects('REPAIR NOW')} disabled={busy || g.status === 'QC_REJECTED'}
                                        className="h-[clamp(56px,11vh,110px)] bg-teal-600 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-teal-700 active:scale-95 disabled:opacity-50">
                                        <Wrench size={22} className="mr-2" /><span className="text-lg font-black">REPAIR NOW</span>
                                    </button>
                                </div>
                            </>
                        )}
                        <button type="button" onClick={() => { setCur(null); setActionError(''); }} className="py-2 text-slate-400 font-bold hover:text-slate-600 uppercase text-xs tracking-widest">Cancel Scan</button>
                    </div>
                </div>
            )}

            {/* POPUPS */}
            {popup?.kind === 'NOT_LOADED' && (
                <Popup tone="rose" icon={AlertCircle} title="BATCH NOT LOADED" message={popup.message} onOk={() => setPopup(null)}
                    rows={[['Batch', `#${popup.d.floor_no} · ${popup.d.batch_code}`], ['Garment', popup.d.garment_no], ['Size', popup.d.size]]} />
            )}
            {popup?.kind === 'NOT_AT_STAGE' && (
                <Popup tone="amber" icon={Clock} title={popup.title} message={popup.message} onOk={() => setPopup(null)} rows={[['Batch', `#${popup.d.floor_no} · ${popup.d.batch_code}`]]}
                    before={popup.g && !popup.g.status ? (
                        <button type="button" onClick={() => setQaFor(popup)} disabled={busy}
                            className="px-14 py-4 mb-3 bg-emerald-600 text-white font-black text-lg rounded-3xl hover:bg-emerald-700 active:scale-95 shadow-xl w-full disabled:opacity-50">QA OVERRIDE: APPROVE GARMENT</button>
                    ) : null}>
                    {popup.g && partsOf(popup.g).some(p => p.bad) && (
                        <div className="mb-6">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Parts at {(popup.waitStages || []).join(', ') || 'earlier stages'}</p>
                            <div className="flex flex-wrap justify-center gap-2">
                                {partsOf(popup.g).map(p => (
                                    <span key={p.id} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 font-black text-sm uppercase tracking-wide ${p.bad ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}>
                                        {p.bad ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}{p.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {popup.v && popup.g && <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 mb-6"><StageProgressStepper stages={stagesOf(popup.v, popup.g, stageId)} /></div>}
                </Popup>
            )}
            {popup?.kind === 'ALREADY' && (
                <Popup tone="emerald" icon={ShieldCheck} title={popup.g.status === 'REPAIRED' ? 'ALREADY REPAIRED' : 'ALREADY APPROVED'} message={`This garment already passed ${stage.name}. No action needed.`} onOk={() => setPopup(null)}
                    rows={[['Garment', popup.g.garment_no], ['Batch', `#${popup.v.batch.floor_no}`], ['Product', popup.v.batch.style_name], ['Size', popup.g.size], ...(rollOf(popup.g.garment_no) ? [['Roll', `#${rollOf(popup.g.garment_no)}`]] : []), ['Colour', popup.g.colour]]}
                    extra={<button type="button" onClick={() => { const p = popup; setPopup(null); askUndo({ text: `Garment ${p.g.garment_no} is ${p.g.status.toLowerCase()}.`, unit: 'garment', body: { garment_ids: [p.g.id] }, batchId: p.d.batch_id }); }}
                        className="mt-3 w-full py-3 text-sm font-black uppercase tracking-widest text-slate-500 border-2 border-slate-200 rounded-2xl hover:bg-slate-50 active:scale-95">Revert to pending (supervisor)</button>} />
            )}

            {/* QA OVERRIDE — a supervisor's / quality manager's password approves the waiting garment (as 2.0) */}
            {qaFor && (
                <StationDialog title={`QA override: approve ${qaFor.g.garment_no}`} tone="amber" needPin submitLabel="Approve"
                    message={`${[...qaFor.g.blocked_by.map(x => `Not cleared at ${x}`), ...qaFor.g.flagged.map(f => `${f.part_name} rejected at ${f.rejected_at}`)].join(' · ')}. The approval is recorded under the supervisor's name.`}
                    reasonLabel="Note (optional)" onClose={() => setQaFor(null)}
                    onSubmit={async (pin) => {
                        const p = qaFor;
                        const ok = await act((e) => productionApi.garmentCheck({ batch_id: p.d.batch_id, stage_type_id: stageId, production_line_id: lineId, garment_ids: [p.g.id], status: 'APPROVED', qa_override: true, ...e, supervisor_pin: e.supervisor_pin || pin }), 'Approved (QA override)', 'garment');
                        setQaFor(null); setPopup(null);
                        if (ok) flashLast(p.g.garment_no, 'Approved (QA override)');
                        loadRecent();
                    }} />
            )}

            {/* DEFECT SHEET — 2.0's dictionary; one code */}
            {defect && g && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex items-end sm:items-center justify-center sm:p-4">
                    <div className="bg-white w-full max-w-3xl sm:rounded-[2rem] rounded-t-[2rem] overflow-hidden shadow-2xl flex flex-col h-[95dvh] sm:h-[92vh]">
                        <div className={`px-4 py-3 ${defect === 'REWORK' ? 'bg-amber-500' : 'bg-teal-600'} text-white`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-black text-sm uppercase tracking-widest opacity-90">{defect}</span>
                                <span className="bg-white/20 rounded-lg px-2 py-0.5 font-mono font-black text-xs tracking-wide">{g.garment_no} · Sz {g.size}</span>
                                <button type="button" onClick={() => setDefect(null)} className="ml-auto p-1.5 bg-white/20 rounded-full hover:bg-white/30" aria-label="Close"><X size={14} /></button>
                            </div>
                            <input type="text" value={defSearch} onChange={e => setDefSearch(e.target.value)} placeholder="Search defect…" autoFocus
                                className="w-full bg-white/20 placeholder-white/50 text-white font-bold text-sm px-3 py-2 rounded-xl outline-none border border-white/20 focus:border-white/60" />
                            {cats.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    <button type="button" onClick={() => setDefCat(null)} className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${!defCat ? 'bg-white text-slate-900 border-white' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}>All</button>
                                    {cats.map(c => <button key={c} type="button" onClick={() => setDefCat(x => (x === c ? null : c))} className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${defCat === c ? 'bg-white text-slate-900 border-white' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}>{c}</button>)}
                                </div>
                            )}
                        </div>
                        <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto flex-1 content-start">
                            {shownCodes.length === 0 ? <div className="col-span-full py-10 text-center text-slate-400 font-bold">No matching defect codes.</div> : shownCodes.map(c => {
                                const on = defCode === c.id;
                                return (
                                    <button key={c.id} type="button" onClick={() => setDefCode(on ? null : c.id)}
                                        className={`p-3 text-left border-2 rounded-2xl active:scale-95 ${on ? (defect === 'REWORK' ? 'border-amber-400 bg-amber-50' : 'border-teal-400 bg-teal-50') : 'border-slate-100 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            {c.code && <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded ${on ? `${defect === 'REWORK' ? 'text-amber-600' : 'text-teal-600'} bg-white` : 'text-indigo-500 bg-indigo-50'}`}>{c.code}</span>}
                                            {on && <span className={`ml-auto text-[10px] font-black ${defect === 'REWORK' ? 'text-amber-600' : 'text-teal-600'}`}>✓</span>}
                                        </div>
                                        <span className={`font-bold text-sm leading-tight line-clamp-2 ${on ? 'text-slate-900' : 'text-slate-700'}`}>{c.description}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                            <button type="button" onClick={() => setDefect(null)} className="px-4 py-2 text-slate-500 font-bold hover:text-slate-700 text-sm">Cancel</button>
                            <button type="button" onClick={confirmDefect} disabled={!defCode || busy}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-white text-sm disabled:opacity-40 ${defect === 'REWORK' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-teal-600 hover:bg-teal-700'}`}>
                                {busy && <Loader2 size={14} className="animate-spin" />} Confirm {defect}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MANUAL ENTRY */}
            <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 pointer-events-none z-[200]">
                <div className="pointer-events-auto flex flex-col items-center">
                    {showManual && (
                        <div className="mb-4 w-full max-w-md bg-white p-4 rounded-3xl shadow-2xl border-2 border-indigo-100">
                            <form onSubmit={submitManual} className="flex gap-2">
                                <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Enter garment / piece no. manually…" autoFocus aria-label="Garment or piece number"
                                    className="flex-1 px-5 py-3 bg-slate-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-lg" />
                                <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black hover:bg-indigo-700">LOAD</button>
                            </form>
                        </div>
                    )}
                    <button type="button" onClick={() => setShowManual(v => !v)}
                        className={`flex items-center px-6 py-3 rounded-full font-black text-xs tracking-widest shadow-lg border-2 ${showManual ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600'}`}>
                        {showManual ? <><X size={16} className="mr-2" /> CLOSE OVERRIDE</> : <><Maximize size={16} className="mr-2" /> MANUAL ENTRY</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

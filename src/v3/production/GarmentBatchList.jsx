// Garment stages, BATCH LIST — 2.0's garment checker batch mode (GarmentProcessingPortal, MODE B) on 3.0 (28 Oct 2026,
// owner: "match exactly like 2.0").
//
//   Batches     "Select active batch": a card per batch at this stage (any of its lines — loaded = the whole batch, 2.0's
//               batch switch): batch, priority, garments approved in the last hour, style, Approved / Pending / Rework /
//               Rejected, completion bar
//   A batch     one header row (← Batches, style, batch, priority, counts, "N waiting for BF sewing"); roll tabs — one
//               roll at a time (pending · done / total · waiting); notes (waiting, not cleared upstream, garments with a
//               part rejected earlier — which part, where); tiles by size (garment no., size, status icon); garments
//               still waiting for an earlier stage are left out unless a part of them was rejected
//   A tile      the bottom drawer for that one garment: number, size, colour, roll, stage chain, part chips, QC note;
//               APPROVE (batch no.) · REWORK · REPAIR NOW — in rework or with a part rejected earlier: REPAIRED (3.0
//               "passed"; a part rejected earlier also offers QA override: approve garment); already approved → 2.0's
//               ALREADY APPROVED popup (revert = 3.0 undo)
// 3.0's rules and calls as the scanner (garment-checks / garment-repairs; one garment per action, as 2.0).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { List, ArrowLeft, Layers, Clock, CheckCircle2, X, Hammer, ShieldCheck, Wrench, Loader2, RefreshCw } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PriorityBadge } from '../cutting/cutShared';
import { feedback } from './scanShared';
import { StationDialog } from './stationShared';
import { CLEARED, rollOf, StageProgressStepper, stagesOf, partsOf, Popup, DefectSheet } from './garmentShared';

const seqOf = (no) => Number(String(no).split('-').pop()) || 0;
const isOpen = (g) => !CLEARED.includes(g.status) && g.status !== 'QC_REJECTED';
// Shown = available here (or already worked here), or held by a part rejected earlier (2.0: QA can open and override it).
const isShown = (g) => Boolean(g.status) || g.gate_ok || g.flagged.length > 0;
const stageOfBlock = (b) => (b.includes(' (') ? b.slice(0, b.indexOf(' (')) : b);
const label = (s) => String(s || '').toLowerCase().replace('_', ' ');

export default function GarmentBatchList({ stage, stageId, lineId, queue, codes, act, askUndo, tick }) {
    const [batchId, setBatchId] = useState(null);
    const [opened, setOpened] = useState(null);     // the batch card opened (kept when it leaves the queue, as 2.0)
    const [view, setView] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [activeRoll, setActiveRoll] = useState(null);
    const [selId, setSelId] = useState(null);       // the garment in the drawer
    const [popup, setPopup] = useState(null);       // { g } — ALREADY APPROVED
    const [defect, setDefect] = useState(null);     // 'REWORK' | 'REPAIR NOW'
    const [qaFor, setQaFor] = useState(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');

    const load = useCallback(() => {
        if (!batchId) { setView(null); return; }
        productionApi.batchGarments(batchId, stageId).then(r => { setView(r.data); setLoadError(''); }).catch(err => setLoadError(apiError(err, 'Failed to load the garments of this batch.')));
    }, [batchId, stageId]);
    useEffect(() => { load(); }, [load, tick]);

    const batch = (queue || []).find(q => String(q.id) === String(batchId)) || opened;
    const garments = useMemo(() => view?.garments || [], [view]);
    const sel = garments.find(g => String(g.id) === String(selId)) || null;

    const openBatch = (q) => { setBatchId(q.id); setOpened(q); setView(null); setActiveRoll(null); setSelId(null); setActionError(''); };
    const back = () => { setBatchId(null); setOpened(null); setView(null); setActiveRoll(null); setSelId(null); };
    const tap = (g) => {
        setActionError(''); setDefect(null);
        if (CLEARED.includes(g.status)) { feedback('already'); setSelId(null); setPopup({ g }); return; }
        feedback('success'); setSelId(g.id);
    };
    const doAction = async (fn, what) => {
        if (!sel || busy) return;
        setBusy(true); setActionError('');
        try { await act(fn, what, 'garment'); setSelId(null); setDefect(null); }
        catch (e) { setActionError(e.message || 'Failed.'); }
        finally { setBusy(false); }
    };
    const base = () => ({ batch_id: batchId, stage_type_id: stageId, production_line_id: lineId, garment_ids: [sel.id] });
    const approve = () => doAction((e) => productionApi.garmentCheck({ ...base(), status: 'APPROVED', ...e }), 'Approved');
    const repaired = () => doAction((e) => productionApi.garmentRepair({ ...base(), ...e }), 'Repaired');
    const confirmDefect = (code) => code && doAction((e) => productionApi.garmentCheck({ ...base(), status: defect === 'REWORK' ? 'NEEDS_REWORK' : 'REPAIRED', defect_code_id: code, ...e }), defect === 'REWORK' ? 'To rework' : 'Repaired now');

    // ── Step 1: the batches ──────────────────────────────────────────────
    if (!batchId || !batch) {
        return (
            <div className="flex flex-col bg-white rounded-[2rem] p-4 md:p-5 shadow-sm border border-slate-200 min-h-[50vh]">
                <h2 className="text-sm font-black text-slate-400 mb-3 uppercase tracking-widest flex items-center"><List className="mr-2" size={18} /> Select Active Batch</h2>
                {!queue ? <p className="py-12 text-center text-slate-400 font-bold">Loading…</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
                        {queue.map(q => {
                            const total = q.total || 0;
                            return (
                                <button key={q.id} type="button" onClick={() => openBatch(q)}
                                    className="bg-slate-50 p-4 rounded-2xl text-left border-2 border-slate-100 hover:border-indigo-500 hover:shadow-lg transition-all group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block px-2.5 py-0.5 bg-indigo-100 text-indigo-600 font-black text-[10px] uppercase rounded-md">#{q.floor_no}</span>
                                            <PriorityBadge p={q.priority} note={q.priority_note} />
                                        </div>
                                        {q.hourly != null && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-700">{q.hourly}/hr</span>}
                                    </div>
                                    <h3 className="text-lg font-black text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{q.style_code}</h3>
                                    <p className="text-[11px] font-bold text-slate-400 truncate mb-2">{q.batch_code} · {q.customer_name}</p>
                                    <div className="flex gap-1.5 flex-wrap mb-2">
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">{q.approved || 0} Approved</span>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">{q.pending || 0} Pending</span>
                                        {q.rework > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700">{q.rework} Rework</span>}
                                        {q.rejected > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">{q.rejected} Rejected</span>}
                                    </div>
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1"><span>Completion</span><span className="text-indigo-600">{q.approved || 0} / {total}</span></div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                                        <div className="bg-emerald-500 h-full" style={{ width: `${total ? ((q.approved || 0) / total) * 100 : 0}%` }} />
                                        <div className="bg-amber-400 h-full" style={{ width: `${total ? ((q.rework || 0) / total) * 100 : 0}%` }} />
                                        <div className="bg-rose-400 h-full" style={{ width: `${total ? ((q.rejected || 0) / total) * 100 : 0}%` }} />
                                    </div>
                                </button>
                            );
                        })}
                        {queue.length === 0 && <div className="col-span-full py-12 text-center text-slate-400 font-bold uppercase">No active batches running on this line.</div>}
                    </div>
                )}
            </div>
        );
    }

    // ── Step 2: one batch — header, roll tabs, one roll's tiles ───────────
    const shown = garments.filter(isShown);
    const waitingAll = garments.length - shown.length;
    const waitingStageOf = (list) => { const g = list.find(x => !isShown(x) || (!x.gate_ok && isOpen(x))); return g?.blocked_by[0] ? stageOfBlock(g.blocked_by[0]) : 'the previous stage'; };
    const counts = {
        approved: shown.filter(g => CLEARED.includes(g.status)).length, pending: shown.filter(g => !g.status).length,
        rework: shown.filter(g => g.status === 'NEEDS_REWORK').length, rejected: shown.filter(g => g.status === 'QC_REJECTED').length,
        partRejected: garments.filter(g => g.flagged.length > 0 && isOpen(g)).length,
    };
    const byRoll = new Map();
    for (const g of garments) { const k = rollOf(g.garment_no) || '?'; if (!byRoll.has(k)) byRoll.set(k, []); byRoll.get(k).push(g); }
    const rolls = [...byRoll].map(([rollNo, all]) => {
        const pieces = all.filter(isShown);
        return { rollNo, all, pieces, waiting: all.length - pieces.length, pending: pieces.filter(g => !g.status).length,
            done: pieces.filter(g => CLEARED.includes(g.status)).length, partRejected: pieces.filter(g => g.flagged.length > 0 && isOpen(g)).length };
    }).sort((a, b) => (parseInt(a.rollNo, 10) || 0) - (parseInt(b.rollNo, 10) || 0));
    const active = rolls.find(r => r.rollNo === activeRoll) || rolls.find(r => r.pending > 0) || rolls[0];
    const tiles = active ? [...active.pieces].sort((a, b) => (a.size_order ?? 0) - (b.size_order ?? 0) || String(a.size).localeCompare(String(b.size)) || seqOf(a.garment_no) - seqOf(b.garment_no)) : [];
    const sizeGroups = tiles.reduce((acc, g) => { const last = acc[acc.length - 1]; if (last && last.size === g.size) last.items.push(g); else acc.push({ size: g.size, items: [g] }); return acc; }, []);
    const partRejectedTiles = tiles.filter(g => g.flagged.length > 0 && isOpen(g));
    const unclearedOpen = tiles.filter(g => !g.gate_ok && isOpen(g) && !g.flagged.length);
    const drawerOpen = Boolean(sel);
    const selFix = sel && (sel.status === 'NEEDS_REWORK' || (!sel.status && sel.flagged.length > 0));

    return (
        <div className="flex flex-col gap-2">
            {/* Batch header — one row */}
            <div className="bg-white rounded-2xl px-3 py-2 shadow-sm border border-slate-200 flex flex-wrap items-center gap-2">
                <button type="button" onClick={back} className="flex items-center text-slate-500 hover:text-indigo-600 font-bold text-xs px-2 py-1.5 rounded-lg hover:bg-slate-100"><ArrowLeft size={14} className="mr-1" /> Batches</button>
                <span className="font-black text-slate-900 truncate max-w-[40%]">{batch.style_code}</span>
                <span className="text-indigo-600 font-black text-xs uppercase tracking-widest">#{batch.floor_no}</span>
                <PriorityBadge p={batch.priority} note={batch.priority_note} />
                <div className="ml-auto flex gap-1.5 flex-wrap">
                    {counts.partRejected > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300">{counts.partRejected} with rejected parts</span>}
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">{counts.approved} Approved</span>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200">{counts.pending} Pending</span>
                    {counts.rework > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">{counts.rework} Rework</span>}
                    {counts.rejected > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{counts.rejected} Rejected</span>}
                    {waitingAll > 0 && <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-slate-50 text-slate-400 border border-dashed border-slate-300">{waitingAll} waiting for {waitingStageOf(garments)}</span>}
                </div>
            </div>
            {loadError && <p className="bg-rose-50 border border-rose-200 text-rose-700 font-bold text-sm rounded-xl px-3 py-2">{loadError}</p>}
            {!view ? <div className="py-16 flex justify-center"><RefreshCw className="w-8 h-8 animate-spin text-indigo-500" /></div> : (<>
                {/* Roll tabs — one roll shown at a time */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {rolls.map(r => {
                        const on = active && r.rollNo === active.rollNo;
                        return (
                            <button key={r.rollNo} type="button" onClick={() => { setActiveRoll(r.rollNo); setSelId(null); }}
                                className={`shrink-0 text-left px-3 py-2 rounded-xl border-2 transition-all ${on ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-400'}`}>
                                <div className="flex items-center gap-1.5">
                                    <Layers size={13} className={on ? 'text-indigo-200' : 'text-indigo-500'} />
                                    <span className="font-black text-sm">Roll #{r.rollNo}</span>
                                    {r.partRejected > 0 && <span className={`text-[10px] font-black px-1.5 rounded ${on ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'}`}>✗{r.partRejected}</span>}
                                </div>
                                <div className={`text-[10px] font-bold mt-0.5 ${on ? 'text-indigo-100' : 'text-slate-400'}`}>{r.pending} pending · {r.done}/{r.pieces.length} done{r.waiting > 0 ? ` · ${r.waiting} waiting` : ''}</div>
                            </button>
                        );
                    })}
                </div>

                {/* Active roll: notes + tile grid */}
                {active && (
                    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200 flex flex-col">
                        {(active.waiting > 0 || unclearedOpen.length > 0) && (
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                {active.waiting > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-dashed border-slate-300">{active.waiting} waiting for {waitingStageOf(active.all)}</span>}
                                {unclearedOpen.length > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">⚠ {unclearedOpen.length} not cleared at {waitingStageOf(unclearedOpen)}</span>}
                            </div>
                        )}
                        {/* Visible (not hover — tablets) list of which part was rejected where */}
                        {partRejectedTiles.length > 0 && (
                            <div className="mb-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {partRejectedTiles.map(g => (
                                    <span key={g.id} className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-rose-300 text-rose-800">
                                        <span className="font-black font-mono">#{seqOf(g.garment_no)}</span><span className="text-slate-500"> · size {g.size}</span>
                                        {g.flagged.map((f, i) => <span key={i}> · <span className="font-black uppercase">{f.part_name}</span> rejected @ {f.rejected_at}</span>)}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className={drawerOpen ? 'pb-64' : ''}>
                            {tiles.length === 0 ? <p className="py-10 text-center text-sm font-bold text-slate-400">No garments available on this roll yet.</p> : (
                                <div className="space-y-3">
                                    {sizeGroups.map(group => (
                                        <div key={group.size}>
                                            <p className="text-xs font-black uppercase tracking-widest text-violet-700 mb-1.5">Size {group.size} <span className="text-slate-400 normal-case tracking-normal">· {group.items.length} garment{group.items.length !== 1 ? 's' : ''}</span></p>
                                            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
                                                {group.items.map(g => {
                                                    const st = g.status;
                                                    let cls = 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:shadow-md';
                                                    let icon = <Clock size={12} className="opacity-40" />;
                                                    if (st === 'APPROVED') { cls = 'bg-emerald-50 border-emerald-300 text-emerald-600'; icon = <CheckCircle2 size={12} />; }
                                                    else if (st === 'REPAIRED') { cls = 'bg-teal-50 border-teal-300 text-teal-700'; icon = <CheckCircle2 size={12} />; }
                                                    else if (st === 'QC_REJECTED') { cls = 'bg-rose-50 border-rose-300 text-rose-600 hover:border-rose-500'; icon = <X size={12} />; }
                                                    else if (st === 'NEEDS_REWORK') { cls = 'bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-500'; icon = <Hammer size={12} />; }
                                                    const rejectedParts = isOpen(g) && g.flagged.length ? [...new Set(g.flagged.map(f => f.part_name))] : [];
                                                    if (rejectedParts.length) { cls = 'bg-rose-50 border-rose-400 border-dashed text-rose-700 hover:border-rose-600'; icon = <X size={12} />; }
                                                    const unclearedWarn = !rejectedParts.length && isOpen(g) && !g.gate_ok;
                                                    if (unclearedWarn) cls += ' border-amber-400 border-dashed';
                                                    if (String(selId) === String(g.id)) cls += ' ring-2 ring-indigo-500 ring-offset-1';
                                                    return (
                                                        <button key={g.id} type="button" onClick={() => tap(g)} title={`${g.garment_no}\nStatus: ${st ? label(st) : 'pending'}`}
                                                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border-2 transition-all active:scale-95 ${cls}`}>
                                                            <span className="font-black text-base leading-none">{seqOf(g.garment_no)}</span>
                                                            <span className="text-[9px] font-black text-slate-400 leading-none mt-0.5 mb-1">S {g.size}</span>
                                                            {icon}
                                                            {rejectedParts.length > 0 && <span className="mt-1 text-[9px] font-black uppercase leading-tight text-rose-700 truncate max-w-full">{rejectedParts.join(', ')} ✗</span>}
                                                            {unclearedWarn && <span className="mt-1 text-[9px] font-black uppercase leading-tight text-amber-700 truncate max-w-full">{[...new Set(g.blocked_by.map(b => (b.includes('(') ? b.slice(b.indexOf('(') + 1, -1) : b)))].join(', ')} ⚠</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </>)}

            {/* BOTTOM DRAWER — the garment tapped */}
            {sel && (
                <div className="fixed bottom-0 left-0 right-0 z-[200]">
                    <div className="max-w-6xl mx-auto px-4 pb-4">
                        <div className="bg-white rounded-[2rem] shadow-2xl border-2 border-indigo-200 overflow-hidden">
                            <div className="p-5 md:p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Selected Piece</span>
                                        <h3 className="text-xl font-black text-slate-900 leading-tight font-mono">{sel.garment_no}</h3>
                                        <p className="text-slate-500 font-bold text-xs mt-0.5">Size {sel.size} <span className="ml-2 text-indigo-400">· {stage.name}</span></p>
                                        <p className="mt-1 text-[10px] font-mono text-slate-400 flex flex-wrap gap-x-2"><span className="text-slate-600 font-bold">{sel.colour}</span><span>· Roll #{rollOf(sel.garment_no)}</span><span>· Batch #{batch.floor_no}</span></p>
                                    </div>
                                    <button type="button" onClick={() => setSelId(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 ml-4 shrink-0" aria-label="Close"><X size={16} className="text-slate-600" /></button>
                                </div>
                                <div className="mb-4"><StageProgressStepper stages={stagesOf(view, sel, stageId)} /></div>
                                <div className="flex gap-2 flex-wrap mb-4">
                                    {partsOf(sel).map(p => (
                                        <div key={p.id} className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${p.bad ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`} title={p.note || ''}>
                                            {p.bad ? <X size={10} strokeWidth={3} /> : <ShieldCheck size={10} />}{p.name}{p.note && <span className="text-[10px] uppercase opacity-70">· {p.note}</span>}
                                        </div>
                                    ))}
                                </div>
                                {(sel.status || sel.flagged.length > 0 || !sel.gate_ok) && (
                                    <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800">
                                        {sel.status ? `QC: ${sel.status}` : ''}
                                        {sel.flagged.length > 0 && <span>{sel.status ? ' · ' : ''}Part rejected earlier: {sel.flagged.map(f => `${f.part_name} at ${f.rejected_at}`).join(', ')} — repair it here and tap REPAIRED</span>}
                                        {!sel.gate_ok && <span>{sel.status || sel.flagged.length ? ' · ' : ''}Not cleared at {sel.blocked_by.join(', ')}</span>}
                                    </div>
                                )}
                                {actionError && <p className="mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-sm font-bold text-rose-700">{actionError}</p>}
                                {selFix ? (
                                    <div className="flex gap-3">
                                        <button type="button" onClick={repaired} disabled={busy}
                                            className="flex-1 bg-teal-600 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-teal-700 active:scale-95 disabled:opacity-40">
                                            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} REPAIRED
                                        </button>
                                        {!sel.status && sel.flagged.length > 0 && (
                                            <button type="button" onClick={() => setQaFor(sel)} disabled={busy}
                                                className="flex-1 bg-emerald-600 text-white rounded-2xl py-3.5 font-black text-sm hover:bg-emerald-700 active:scale-95 disabled:opacity-40">QA override: approve garment</button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-3">
                                        <button type="button" onClick={approve} disabled={busy || sel.status === 'QC_REJECTED'}
                                            className="flex-1 bg-emerald-600 text-white rounded-2xl py-3 font-black text-sm flex flex-col items-center justify-center gap-0.5 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
                                            <div className="flex items-center gap-2">{busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} APPROVE</div>
                                            <span className="text-[10px] font-black opacity-75 tracking-widest font-mono">#{batch.floor_no}</span>
                                        </button>
                                        <button type="button" onClick={() => setDefect('REWORK')} disabled={busy || sel.status === 'QC_REJECTED'}
                                            className="flex-1 bg-amber-500 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-amber-600 active:scale-95 disabled:opacity-40"><Hammer size={16} /> REWORK</button>
                                        <button type="button" onClick={() => setDefect('REPAIR NOW')} disabled={busy || sel.status === 'QC_REJECTED'}
                                            className="flex-1 bg-teal-600 text-white rounded-2xl py-3.5 font-black text-sm flex items-center justify-center gap-2 hover:bg-teal-700 active:scale-95 disabled:opacity-40"><Wrench size={16} /> REPAIR NOW</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {popup && (
                <Popup tone="emerald" icon={ShieldCheck} title={popup.g.status === 'REPAIRED' ? 'ALREADY REPAIRED' : 'ALREADY APPROVED'} message={`This garment already passed ${stage.name}. No action needed.`} onOk={() => setPopup(null)}
                    rows={[['Garment', popup.g.garment_no], ['Batch', `#${batch.floor_no}`], ['Product', view?.batch.style_name || batch.style_code], ['Size', popup.g.size], ['Roll', `#${rollOf(popup.g.garment_no)}`], ['Colour', popup.g.colour]]}
                    extra={<button type="button" onClick={() => { const p = popup; setPopup(null); askUndo({ text: `Garment ${p.g.garment_no} is ${label(p.g.status)}.`, unit: 'garment', body: { garment_ids: [p.g.id] }, batchId }); }}
                        className="mt-3 w-full py-3 text-sm font-black uppercase tracking-widest text-slate-500 border-2 border-slate-200 rounded-2xl hover:bg-slate-50 active:scale-95">Revert to pending (supervisor)</button>} />
            )}
            {defect && sel && <DefectSheet kind={defect} garment={sel} codes={codes} busy={busy} onClose={() => setDefect(null)} onConfirm={confirmDefect} />}
            {qaFor && (
                <StationDialog title={`QA override: approve ${qaFor.garment_no}`} tone="amber" needPin submitLabel="Approve" reasonLabel="Note (optional)" onClose={() => setQaFor(null)}
                    message={`${[...qaFor.blocked_by.map(x => `Not cleared at ${x}`), ...qaFor.flagged.map(f => `${f.part_name} rejected at ${f.rejected_at}`)].join(' · ')}. The approval is recorded under the supervisor's name.`}
                    onSubmit={async (pin) => {
                        const g = qaFor;
                        await act((e) => productionApi.garmentCheck({ batch_id: batchId, stage_type_id: stageId, production_line_id: lineId, garment_ids: [g.id], status: 'APPROVED', qa_override: true, ...e, supervisor_pin: e.supervisor_pin || pin }), 'Approved (QA override)', 'garment');
                        setQaFor(null); setSelId(null);
                    }} />
            )}
        </div>
    );
}

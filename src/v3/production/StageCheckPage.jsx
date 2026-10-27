// Stage check (the numbering check is the Cutting stage's check), laid out like 2.0's universal workstation
// (18 Oct 2026 — "2.0 UI is 10x better on the checker's tablet"): a header with the workstation, line, batch picker,
// part filter and the day's numbers; one black card per batch; inside, a section per roll (or size), a collapsed
// accordion per part with BULK INSPECT / FIX REWORK, and inside it a row per size (or roll) — or per bundle at a
// bundle stage — with a progress bar, INSPECT and FIX REWORK (bundles: QUICK APPROVE). INSPECT opens the full-screen
// tile grid (InspectOverlay). The checker's 2.0 workstation decides the line and stage; managers pick them. Pieces not
// cleared at an earlier stage can't be checked (gate). Garment stages (assembly onwards) — GarmentPanel, with a scan box.
// 20 Oct 2026: inside an open batch a roll picker (sizes when grouped by size), like the batch picker — shows one roll;
// the stage status / route line and the "Loaded: …" line are gone (asked: "remove these 2"). "Inspect whole roll / size"
// only for a workstation with 2.0's "approve whole roll" right (as 2.0); others inspect part by part — and at a bundle
// stage bundle by bundle (no part-level Bulk inspect / Fix rework, as 2.0); Quick approve only with "whole bundle"; one
// tile at a time (no SELECT ALL) without "many pieces"; at a bundle stage APPROVE takes whole bundles only (2.0's rule).
// 27 Oct 2026 — barcode scanner as 2.0's garment checker ("build all"): the hardware scanner works anywhere on the page
// (scanShared — no box needs focus, also over the inspection screen): a garment number or piece label at a garment stage
// opens the scanned garment's card (one tap to approve); a bundle label or piece label opens its row with those pieces
// picked — only at piece stages after the stage that makes the bundles (BF sewing; owner: "only implement bundle scan
// after bf line stage"), so Cutting and Preparatory have no scanner. A label that can't be checked here gets its own screen
// (not on your line / waiting for an earlier stage / not this stage / not found) with the next step; 2.0's sounds and
// spoken messages; a recent-scans list under the header.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Shirt, Layers, Ruler, Package, ScanLine, AlertTriangle, Component, Hammer, Check, CheckCircle2, X } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PriorityBadge } from '../cutting/cutShared';
import { useV3Live } from '../live';
import GarmentPanel from './GarmentPanel';
import InspectOverlay, { kindOf } from './InspectOverlay';
import ScanGarmentCard from './ScanGarmentCard';
import { useWedgeScanner, feedback } from './scanShared';
import { WorkLogButton, WhyPanel, StatsBar, ProgressRow, StationDialog } from './stationShared';

const label = (s) => String(s || '').toLowerCase().replace('_', ' ');
const UNDO_REASONS = ['Wrong piece tapped', 'Checked by mistake', 'Defect found later', 'Wrong defect'];
const PART_KEY = 'v3.partFilter';
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* per-browser convenience */ } } };

const toItem = (p, group) => ({
    id: p.id, label: p.no, group, bundle: p.bundle_id || null, status: p.status, gate_ok: p.gate_ok, waiting_replacement: p.replacement_status || null, blocked: (p.blocked_by || []).join(', '), flag: p.rejected_at, replacement: p.replacement,
    title: `${p.uid || ''}${p.rejected_at ? ` — rejected at ${p.rejected_at}` : ''}${!p.gate_ok && !p.status ? ` — waiting for ${(p.blocked_by || []).join(', ')}` : ''}`,
});
const recount = (ps) => ({
    total: ps.length, pending: ps.filter(p => !p.status && p.gate_ok && !p.rejected_at).length, approved: ps.filter(p => ['APPROVED', 'REPAIRED', 'RECUT_CLEARED'].includes(p.status)).length,
    rework: ps.filter(p => p.status === 'NEEDS_REWORK').length, rejected: ps.filter(p => p.status === 'QC_REJECTED').length,
    earlier: ps.filter(p => !p.status && p.gate_ok && p.rejected_at).length, waiting: ps.filter(p => !p.status && !p.gate_ok).length,
});
// The row (bundle, or roll / size group) that holds a scanned piece in the batch view — the keys the tree below uses.
function rowKeyFor(view, pieceId) {
    const g = view.groups.find(x => x.pieces.some(p => String(p.id) === String(pieceId)));
    if (!g) return null;
    const p = g.pieces.find(x => String(x.id) === String(pieceId));
    if (view.stage.unit === 'BUNDLE') return p.bundle_id ? `b|${p.bundle_id}` : `g|${g.key}|single`;
    return `g|${g.key}`;
}
const PROBLEM_TONE = { rose: 'bg-rose-600 text-white', amber: 'bg-amber-400 text-black', slate: 'bg-slate-800 text-white' };
const RECENT_DOT = { ok: 'bg-emerald-500', warn: 'bg-amber-400', bad: 'bg-rose-500' };
const notesOf = (c) => [...(c.waiting ? [['amber', `${c.waiting} not cleared at an earlier stage`]] : []), ...(c.earlier ? [['rose', `${c.earlier} rejected earlier — fix here`]] : [])];

// 2.0's part filter: tick the parts this checker handles (remembered on the tablet).
function PartFilter({ names, sel, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => { const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
    const toggle = (n) => { const x = new Set(sel); const k = n.trim().toLowerCase(); if (x.has(k)) x.delete(k); else x.add(k); onChange(x); };
    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen(v => !v)} className={`flex items-center gap-1.5 text-sm font-black uppercase tracking-widest px-3 py-2 rounded-xl border-2 ${sel.size ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}>
                <Component className="w-4 h-4" />{sel.size === 0 ? 'All parts' : `${sel.size} part${sel.size > 1 ? 's' : ''}`}<ChevronDown className="w-4 h-4" />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200 min-w-[240px] py-1.5">
                    <div className="px-4 py-2 flex justify-between items-center border-b border-slate-100 mb-1">
                        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Filter parts</span>
                        {sel.size > 0 && <button type="button" onClick={() => onChange(new Set())} className="text-sm text-rose-600 font-bold">Clear</button>}
                    </div>
                    {names.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">Open a batch to see its parts.</p>}
                    {names.map(n => (
                        <label key={n} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={sel.has(n.trim().toLowerCase())} onChange={() => toggle(n)} className="w-5 h-5 accent-indigo-600" />
                            <span className="text-base font-bold text-slate-700 uppercase">{n}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

// 2.0's PartAccordion: one part of a roll (or size), collapsed; BULK INSPECT / FIX REWORK on the header.
function PartAccordion({ name, pieces, open, onToggle, onBulk, onFix, children }) {
    const c = recount(pieces);
    const fix = c.rework + c.earlier;
    const complete = c.pending === 0 && fix === 0 && c.waiting === 0;
    return (
        <div className="bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 md:p-5 flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-slate-50 cursor-pointer hover:bg-slate-100" onClick={onToggle}>
                <div className="flex items-center flex-wrap gap-y-2">
                    {open ? <ChevronDown className="w-6 h-6 mr-3 text-slate-500" /> : <ChevronRight className="w-6 h-6 mr-3 text-slate-500" />}
                    <Component className="w-6 h-6 mr-3 text-indigo-500" />
                    <h4 className="font-black text-slate-800 text-xl tracking-tight uppercase">{name}</h4>
                    <span className="ml-4 text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-widest">{c.approved + c.rejected} / {c.total} processed</span>
                    {c.earlier > 0 && <span className="ml-2 text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 rounded-md px-1.5 py-0.5">{c.earlier} rejected earlier</span>}
                    {c.waiting > 0 && <span className="ml-2 text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 rounded-md px-1.5 py-0.5">{c.waiting} waiting</span>}
                </div>
                <div className="flex items-center gap-3 md:ml-0 ml-9" onClick={e => e.stopPropagation()}>
                    {fix > 0 && onFix && <button type="button" onClick={onFix} className="px-4 py-3 text-sm bg-amber-100 text-amber-900 border-2 border-amber-200 rounded-xl hover:bg-amber-200 font-black flex items-center active:scale-95"><Hammer className="w-4 h-4 mr-2" /> FIX REWORK ({fix})</button>}
                    {complete
                        ? <button type="button" onClick={onBulk || onToggle} className="px-4 py-3 text-sm bg-emerald-50 text-emerald-700 border-2 border-emerald-200 rounded-xl font-black flex items-center active:scale-95"><Check className="w-4 h-4 mr-2" /> VALIDATED</button>
                        : onBulk ? <button type="button" onClick={onBulk} className="px-6 py-3 text-sm bg-slate-800 text-white rounded-xl hover:bg-black font-black shadow-md active:scale-95 flex items-center">BULK INSPECT <ChevronRight className="w-4 h-4 ml-1" /></button>
                            // no whole-roll right at a bundle stage: bundle by bundle, as 2.0 (no part-level bulk)
                            : <button type="button" onClick={onToggle} className="px-5 py-3 text-sm bg-white text-slate-800 border-2 border-slate-300 rounded-xl hover:bg-slate-50 font-black flex items-center active:scale-95">{open ? 'HIDE BUNDLES' : 'SHOW BUNDLES'} <ChevronRight className={`w-4 h-4 ml-1 ${open ? 'rotate-90' : ''}`} /></button>}
                </div>
            </div>
            {open && <div className="p-4 md:p-5 bg-white border-t-2 border-slate-100 space-y-3">{children}</div>}
        </div>
    );
}

export default function StageCheckPage() {
    const [st, setSt] = useState(null);
    const [perms, setPerms] = useState({});
    const [params] = useSearchParams();
    const focusStage = params.get('stage'), focusBatch = params.get('batch');   // from the order tracker: open this stage and batch
    const focusApplied = useRef(false);
    const [stageId, setStageId] = useState('');
    const [lineId, setLineId] = useState('');
    const [queue, setQueue] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [batchPick, setBatchPick] = useState('ALL');
    const [secPickRaw, setSecPickRaw] = useState({ at: null, key: 'ALL' });   // roll (or size) shown inside the open batch — for that batch, stage and grouping only
    const [view, setView] = useState(null);
    const [codes, setCodes] = useState([]);
    const [groupBy, setGroupBy] = useState(() => store.get('v3.stageGroupBy', 'roll'));
    const [parts, setParts] = useState(() => { try { return new Set(JSON.parse(store.get(PART_KEY, '[]'))); } catch { return new Set(); } });
    const [openParts, setOpenParts] = useState(new Set());
    const [inspect, setInspect] = useState(null);   // { key, fix, highlightId }
    const [ask, setAsk] = useState(null);           // supervisor dialog: { kind, message, submit }
    const [scan, setScan] = useState('');
    const [scanCard, setScanCard] = useState(null);       // a scanned garment: the lookup result
    const [pendingScan, setPendingScan] = useState(null); // a scanned bundle / piece: open its row once its batch is loaded
    const [problem, setProblem] = useState(null);         // a label that can't be checked here: { title, text, next, code, tone }
    const [recent, setRecent] = useState([]);             // recent scans and what came of them, newest first
    const problemTimer = useRef(null);
    const toastTimer = useRef(null);
    const [toast, setToast] = useState(null);
    const [tick, setTick] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [rework, setRework] = useState(null);
    const effLine = st?.station ? st.station.line_id : lineId;
    const flash = (text, tone = 'ok') => { setToast({ text, tone }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3500); };

    const loadRework = useCallback(() => {
        if (stageId && effLine) productionApi.reworkStatus(stageId, effLine).then(r => setRework(r.data)).catch(() => setRework(null)); else setRework(null);
    }, [stageId, effLine]);
    useEffect(() => { loadRework(); }, [loadRework]);
    useEffect(() => {
        productionApi.permissions().then(r => setPerms(r.data)).catch(() => {});
        productionApi.station().then(res => { setSt(res.data); if (res.data.stage) setStageId(res.data.stage.id); else if (focusStage && res.data.can_pick_line && res.data.stages.some(s => String(s.id) === focusStage)) setStageId(res.data.stages.find(s => String(s.id) === focusStage).id); }).catch(err => setError(apiError(err, 'Failed to load your workstation.')));
    }, [focusStage]);
    const loadQueue = useCallback(() => { if (stageId) productionApi.queue(stageId).then(res => { setQueue(res.data); if (focusBatch && !focusApplied.current && String(stageId) === focusStage) { focusApplied.current = true; setOpenId(focusBatch); } }).catch(err => setError(apiError(err, 'Failed to load the queue.'))); }, [stageId, focusStage, focusBatch]);
    useEffect(() => {
        setQueue(null); setOpenId(null); setView(null); setBatchPick(stageId ? store.get(`v3.stageBatch.${stageId}`, 'ALL') : 'ALL');
        loadQueue(); if (stageId) productionApi.defectCodes(stageId).then(res => setCodes(res.data)).catch(() => setCodes([]));
    }, [stageId, loadQueue]);
    // The picked batch: forget it once it has left the queue; open it when the queue arrives.
    useEffect(() => {
        if (!queue || batchPick === 'ALL') return;
        if (!queue.some(q => String(q.id) === batchPick)) setBatchPick('ALL'); else if (!openId) setOpenId(batchPick);
    }, [queue, batchPick]); // eslint-disable-line react-hooks/exhaustive-deps
    const stage = st?.stages.find(s => s.id === stageId);
    const isGarment = stage?.unit === 'GARMENT';
    // Scanner: garment stages, and piece stages after a bundle-making stage (BF) — st.stages come in route order.
    const stageIdx = st ? st.stages.findIndex(s => s.id === stageId) : -1;
    const canScan = Boolean(stage) && (isGarment || (stageIdx > 0 && st.stages.slice(0, stageIdx).some(s => s.unit === 'BUNDLE')));
    const loadBatch = useCallback(() => { if (openId && stage && !isGarment) productionApi.batchStage(openId, stageId).then(res => setView(res.data)).catch(err => setError(apiError(err, 'Failed to load the batch.'))); }, [openId, stageId, stage, isGarment]);
    useEffect(() => { setView(null); setInspect(null); setOpenParts(new Set()); loadBatch(); }, [loadBatch]);
    // Live: another checker, a re-cut, a load — re-read the queue, the open batch and the numbers (~2 s after a change).
    const live = useV3Live(() => { loadQueue(); loadBatch(); loadRework(); setTick(t => t + 1); }, Boolean(stageId));

    // ── Scanner ──────────────────────────────────────────────────────────
    const addRecent = (code, text, tone = 'ok') => setRecent(r => [{ id: `${Date.now()}-${Math.random()}`, code, text, tone, at: new Date() }, ...r].slice(0, 8));
    const showProblem = ({ code, title, text, next, tone = 'rose', sound = 'error' }) => {
        feedback(sound);
        setProblem({ code, title, text, next, tone });
        addRecent(code, title, 'bad');
        clearTimeout(problemTimer.current);
        problemTimer.current = setTimeout(() => setProblem(null), 9000);
    };
    const runScan = async (raw) => {
        const c = String(raw || '').trim();
        if (!c || !canScan) return;
        setScan(''); setProblem(null);
        const inQueue = (batchId) => (queue || []).some(q => String(q.id) === String(batchId));
        try {
            if (isGarment) {
                const d = (await productionApi.garmentLookup(c, stageId)).data;
                const a = d.at_stage;
                if (!a || a.on_route === false) return showProblem({ code: c, title: `Not checked at ${stage.name}`, text: `Garment ${d.garment_no} (batch #${d.floor_no}) — its style's route doesn't go through ${stage.name}.`, sound: 'wrong_stage' });
                if (!inQueue(d.batch_id)) return showProblem({ code: c, title: 'Not loaded on your line', text: `Garment ${d.garment_no} is in batch #${d.floor_no} (${d.batch_code}), size ${d.size} — that batch isn't in your queue.`, next: 'Ask the line loader to load it onto your line.', tone: 'amber', sound: 'not_loaded' });
                if (!a.status && a.gate_ok === false) return showProblem({ code: c, title: 'Waiting for an earlier stage', text: `Garment ${d.garment_no} still needs: ${a.blocked_by.join(', ')}.`, next: 'Check it there first, then scan it again here.', tone: 'amber', sound: 'waiting' });
                setInspect(null);
                setScanCard({ ...d, ts: Date.now() });
                const doneHere = ['APPROVED', 'REPAIRED'].includes(a.status);
                addRecent(c, `${d.garment_no} · size ${d.size} — ${a.status ? `${label(a.status)} here` : a.flagged?.length ? 'part rejected earlier, fix here' : 'to check'}`, doneHere ? 'warn' : 'ok');
                feedback(doneHere ? 'already' : 'success');
                return;
            }
            const d = (await productionApi.scan(c, stageId)).data;
            const what = `${d.kind === 'BUNDLE' ? `Bundle ${d.code}` : `Piece ${d.code}`} · ${d.part_name || ''} · size ${d.size || '—'}`;
            if (!d.on_route) return showProblem({ code: c, title: `Not checked at ${stage.name}`, text: `${what} (batch #${d.floor_no}) — its style's route doesn't go through ${stage.name}.`, sound: 'wrong_stage' });
            if (d.later_stage) return showProblem({ code: c, title: `A ${d.bundle_stage} bundle`, text: `${d.code} is the bundle label of ${d.bundle_stage}.`, next: `At ${stage.name} scan this stage's bundle label or a piece label.`, tone: 'amber', sound: 'wrong_stage' });
            if (!d.piece_ids.length) return showProblem({ code: c, title: 'No pieces on this label', text: `${what} has no pieces in batch #${d.floor_no}.` });
            if (!inQueue(d.batch_id)) return showProblem({ code: c, title: 'Not loaded on your line', text: `${what} is in batch #${d.floor_no} (${d.batch_code}${d.roll_no ? `, roll #${d.roll_no}` : ''}) — that batch isn't in your queue.`, next: 'Ask the line loader to load it onto your line.', tone: 'amber', sound: 'not_loaded' });
            setInspect(null); setScanCard(null);
            if (batchPick !== 'ALL' && batchPick !== String(d.batch_id)) setBatchPick(String(d.batch_id));
            setOpenId(d.batch_id);
            setPendingScan({ ...d, scanned: c, what, ts: Date.now() });
        } catch (err) {
            showProblem({ code: c, title: 'Label not found', text: apiError(err, `Nothing found for "${c}".`), next: isGarment ? 'Scan the garment number or one of its piece labels — or type it in the box.' : 'Scan a bundle label or a piece label — or type it in the box.' });
        }
    };
    // A scanned bundle / piece: once its batch view is here, open the row with those pieces picked.
    useEffect(() => {
        if (!pendingScan || !view || String(view.batch.id) !== String(pendingScan.batch_id)) return;
        const ps = pendingScan;
        setPendingScan(null);
        const key = rowKeyFor(view, ps.piece_ids[0]);
        if (!key) {
            // The part is checked here but these pieces aren't in the view: their roll / size isn't loaded on this line yet.
            const partHere = view.groups.some(g => g.part_name === ps.part_name);
            if (partHere) showProblem({ code: ps.scanned, title: 'Not loaded on your line', text: `${ps.what} — ${ps.roll_no ? `roll #${ps.roll_no}` : `size ${ps.size}`} of batch #${ps.floor_no} isn't loaded on your line at ${stage?.name || 'this stage'} yet.`, next: 'Ask the line loader to load it onto your line.', tone: 'amber', sound: 'not_loaded' });
            else showProblem({ code: ps.scanned, title: `Not checked at ${stage?.name || 'this stage'}`, text: `${ps.what} — ${ps.part_name || 'this part'} isn't checked at this stage.`, sound: 'wrong_stage' });
            return;
        }
        const want = new Set(ps.piece_ids.map(String));
        const pieces = view.groups.flatMap(g => g.pieces).filter(p => want.has(String(p.id)));
        const open = pieces.filter(p => ['fresh', 'fix'].includes(kindOf({ status: p.status, gate_ok: p.gate_ok, flag: p.rejected_at, waiting_replacement: p.replacement_status })));
        const waiting = pieces.filter(p => !p.status && !p.gate_ok);
        setInspect({ key, highlightId: (open[0] || pieces[0])?.id, preselect: open.map(p => p.id), ts: ps.ts });
        if (!open.length && waiting.length) { feedback('waiting'); addRecent(ps.scanned, `${ps.what} — waiting for ${(waiting[0].blocked_by || []).join(', ') || 'an earlier stage'}`, 'warn'); }
        else if (!open.length) { feedback('already'); addRecent(ps.scanned, `${ps.what} — already checked here`, 'warn'); }
        else { feedback('success'); addRecent(ps.scanned, `${ps.what} — ${open.length} to ${open.some(p => p.status === 'NEEDS_REWORK' || p.rejected_at) ? 'fix' : 'check'}`); }
    }, [pendingScan, view]); // eslint-disable-line react-hooks/exhaustive-deps
    useWedgeScanner(runScan, canScan);

    if (!st) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const linesForStage = st.lines.filter(l => stage && l.line_type_id === stage.line_type_id);
    const base = () => ({ batch_id: openId, stage_type_id: stageId, production_line_id: st.station ? undefined : lineId || undefined });
    const pickBatch = (v) => { setBatchPick(v); store.set(`v3.stageBatch.${stageId}`, v); if (v !== 'ALL') setOpenId(v); };
    const setPartFilter = (x) => { setParts(x); store.set(PART_KEY, JSON.stringify([...x])); };
    const partVisible = (n) => parts.size === 0 || parts.has(String(n || '').trim().toLowerCase());
    const togglePart = (k) => setOpenParts(s => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });

    const done = (res, what, unit) => {
        const n = res.data.checked ?? res.data.repaired ?? res.data.reverted;
        feedback('success');
        flash(`${what}: ${n} ${unit}${n === 1 ? '' : 's'} · stage ${label(res.data.progress)}`);
        loadRework(); loadBatch(); loadQueue(); setTick(t => t + 1);
    };
    // fn(extra) → API call; true once saved. A rework block opens the supervisor dialog and retries with the password
    // (false); other errors are thrown with their message (the inspection screen shows them).
    const act = async (fn, what, unit = 'piece') => {
        setBusy(true);
        try { done(await fn({}), what, unit); return true; }
        catch (err) {
            if (err?.response?.data?.code === 'REWORK_BLOCKED') {
                feedback('error');
                setAsk({ kind: 'rework', message: err.response.data.error, submit: async (pin, reason) => { done(await fn({ supervisor_pin: pin, override_reason: reason }), `${what} (supervisor allowed)`, unit); setAsk(null); } });
                return false;
            }
            feedback('error');
            throw new Error(apiError(err, 'Failed.'));
        } finally { setBusy(false); }
    };
    const askUndo = ({ text, unit, body, batchId }) => setAsk({
        kind: 'undo', message: `${text} Undo puts it back to "to check" here.`,
        submit: async (pin, reason) => { done(await productionApi.revert({ batch_id: batchId || openId, stage_type_id: stageId, reason, supervisor_pin: pin, ...body }), 'Undone', unit); setAsk(null); },
    });
    const quick = async (fn, what) => { try { await act(fn, what); } catch (e) { flash(e.message, 'bad'); } };

    const submitScan = (e) => { e.preventDefault(); runScan(scan); };
    const setGrouping = (v) => { setGroupBy(v); setOpenParts(new Set()); store.set('v3.stageGroupBy', v); };
    const secAt = `${openId}|${stageId}|${groupBy}`;
    const secPick = secPickRaw.at === secAt ? secPickRaw.key : 'ALL';
    const setSecPick = (key) => setSecPickRaw({ at: secAt, key });

    // Sections (roll or size) → parts → rows (size / roll, or bundle). Rebuilt from the latest view on every render,
    // so live changes show in the rows and on the inspection tiles.
    const isBundle = view?.stage.unit === 'BUNDLE';
    // Part-level bulk inspect: at a bundle stage only with 2.0's "approve whole roll" right (else bundle by bundle, as 2.0).
    const partBulk = !(isBundle && st.station?.whole_roll === false);
    const tree = [];
    const nodes = new Map();   // key → { pieces, head, grouped(p) }
    if (view) {
        const allPieces = view.groups.flatMap(g => g.pieces.map(p => ({ ...p, roll_no: g.roll_no, size: g.size, part_name: g.part_name, colour: g.colour })));
        const rollMeta = new Map(view.groups.filter(g => g.roll_no !== 'Re-cut').map(g => [g.roll_no, [g.fabric, g.lays ? `${g.lays} lays` : ''].filter(Boolean).join(' · ')]));
        const rollName = (roll) => (roll === 'Re-cut' ? 'Re-cuts' : `Roll #${roll}`);
        const secName = (roll, size) => (groupBy === 'size' ? `Size ${size}` : rollName(roll));
        const put = (sec, part, row) => {
            let s = tree.find(x => x.name === sec); if (!s) { s = { key: `s|${sec}`, name: sec, meta: groupBy === 'roll' ? rollMeta.get(row.roll) || '' : '', parts: [] }; tree.push(s); }
            let p = s.parts.find(x => x.name === part); if (!p) { p = { key: `p|${sec}|${part}`, name: part, rows: [] }; s.parts.push(p); }
            p.rows.push(row);
        };
        if (isBundle) {
            for (const bu of view.bundles) {
                const pieces = allPieces.filter(p => p.bundle_id === bu.id);
                put(secName(bu.roll_no, bu.size), bu.part_name, { key: `b|${bu.id}`, bundle: bu, roll: bu.roll_no, pieces, label: groupBy === 'size' ? rollName(bu.roll_no) : `Size ${bu.size}`, sub: `Bundle ${bu.bundle_code} · ${bu.colour}` });
            }
            const singles = allPieces.filter(p => !p.bundle_id);   // re-cut pieces: checked one by one
            for (const g of view.groups) {
                const pieces = singles.filter(p => g.pieces.some(x => x.id === p.id));
                if (pieces.length) put('Single pieces (re-cuts)', g.part_name, { key: `g|${g.key}|single`, roll: g.roll_no, pieces, label: `Size ${g.size}`, sub: `${rollName(g.roll_no)} · ${g.colour}` });
            }
        } else {
            for (const g of view.groups) {
                const pieces = allPieces.filter(p => g.pieces.some(x => x.id === p.id));
                put(secName(g.roll_no, g.size), g.part_name, { key: `g|${g.key}`, roll: g.roll_no, pieces, label: groupBy === 'size' ? rollName(g.roll_no) : `Size ${g.size}`, sub: groupBy === 'size' ? [g.colour, g.fabric].filter(Boolean).join(' · ') : g.colour });
            }
        }
        for (const s of tree) {
            const vis = s.parts.filter(p => partVisible(p.name));
            nodes.set(s.key, { pieces: vis.flatMap(p => p.rows.flatMap(r => r.pieces)), head: [['Source', s.name], [vis.length === 1 ? 'Component' : 'Components', vis.map(p => p.name).join(', ')]], grouped: (p) => `${p.part_name} · ${groupBy === 'size' ? `Roll #${p.roll_no}` : `Size ${p.size}`}` });
            for (const p of s.parts) {
                nodes.set(p.key, { pieces: p.rows.flatMap(r => r.pieces), head: [['Source', s.name], ['Component', p.name]], grouped: (x) => (groupBy === 'size' ? `Roll #${x.roll_no}` : `Size ${x.size}`) });
                for (const r of p.rows) nodes.set(r.key, { pieces: r.pieces, head: [['Source', r.bundle ? `Bundle ${r.bundle.bundle_code}` : s.name], ['Component', `${p.name} | ${r.label} | ${r.pieces[0]?.colour || ''}`]], grouped: () => '' });
            }
        }
    }
    const partNames = view ? [...new Set(view.groups.map(g => g.part_name))] : [];
    const blockedMsg = rework?.blocked ? 'Rework limit reached — repair first, or a supervisor allows it' : undefined;

    let overlay = null;
    const node = inspect && nodes.get(inspect.key);
    if (node) {
        const items = node.pieces.map(p => toItem(p, node.grouped(p)));
        const ids = (x) => ({ piece_ids: x });
        overlay = (
            <InspectOverlay key={`${inspect.key}|${inspect.ts || ''}`} head={[['Batch', `#${view.batch.floor_no}`], ...node.head]} items={items} codes={codes} unit="piece" multi={st.station?.multi !== false} wholeBundle={isBundle} startFix={inspect.fix} highlightId={inspect.highlightId} preselect={inspect.preselect}
                onClose={() => setInspect(null)}
                onApprove={(x) => act((e) => productionApi.check({ ...base(), status: 'APPROVED', ...ids(x), ...e }), 'Approved')}
                onRepairNow={(x, code) => act((e) => productionApi.check({ ...base(), status: 'REPAIRED', defect_code_id: code, ...ids(x), ...e }), 'Repaired now')}
                onRework={(x, code) => act((e) => productionApi.check({ ...base(), status: 'NEEDS_REWORK', defect_code_id: code, ...ids(x), ...e }), 'To rework')}
                onReplace={(x, code) => act((e) => productionApi.check({ ...base(), status: 'NEEDS_REWORK', replacement: true, defect_code_id: code, ...ids(x), ...e }), 'Sent for new material')}
                onRepair={(x) => act((e) => productionApi.repair({ ...base(), ...ids(x), ...e }), 'Repaired')}
                onReplaceRework={(x) => act(async () => { await productionApi.requestReplacement({ batch_id: openId, stage_type_id: stageId, piece_ids: x }); return { data: { checked: x.length, progress: view.progress.status } }; }, 'Sent for new material')}
                onUndo={(it) => askUndo({ text: `Piece #${it.label} is ${label(it.status)}.`, unit: 'piece', body: ids([it.id]) })} />
        );
    }
    const shownQueue = !queue ? null : batchPick === 'ALL' ? queue : queue.filter(q => String(q.id) === batchPick);

    return (
        <div className="space-y-4">
            <header className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black uppercase tracking-widest bg-slate-900 text-white px-3 py-2 rounded-lg">{stage ? (stage.name === 'Cutting' ? 'Numbering check' : `${stage.name} check`) : 'Stage check'}</span>
                    {stage && <span className="text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-600 px-2.5 py-2 rounded-lg">{stage.unit === 'GARMENT' ? 'Garments' : stage.unit === 'BUNDLE' ? 'Bundles' : 'Pieces'}</span>}
                    {st.station && <span className="text-sm font-black text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100">{st.station.workstation}</span>}
                    {st.station && <span className="text-sm font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-lg">{st.station.line}</span>}
                    {stage && <span className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-2 ${live ? 'text-emerald-600' : 'text-slate-400'}`} title={live ? 'Updates by itself when others check' : 'Reconnecting'}><span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />{live ? 'Live' : 'Offline'}</span>}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                        {stage && queue && queue.length > 0 && (
                            <select value={batchPick} onChange={e => pickBatch(e.target.value)} aria-label="Batch"
                                className="bg-slate-900 text-white font-black text-sm px-3 py-2.5 rounded-xl border border-slate-700 focus:outline-none uppercase tracking-widest max-w-[260px]">
                                <option value="ALL">All batches ({queue.length})</option>
                                {queue.map(q => <option key={q.id} value={String(q.id)}>#{q.floor_no} · {q.batch_code}</option>)}
                            </select>
                        )}
                        {stage && !isGarment && <PartFilter names={partNames} sel={parts} onChange={setPartFilter} />}
                        {canScan && <form onSubmit={submitScan} className="flex items-center gap-2 bg-slate-900 rounded-xl pl-3 pr-1 py-1" title="The scanner works anywhere on this page; type here to find a label by hand.">
                            <ScanLine className="w-5 h-5 text-emerald-400" />
                            <input value={scan} onChange={e => setScan(e.target.value)} placeholder={isGarment ? 'Scan or type garment / piece' : 'Scan or type bundle / piece'} aria-label="Scan or type a label"
                                className="bg-transparent text-white placeholder-slate-500 font-mono font-bold text-base w-48 sm:w-60 py-2 focus:outline-none" />
                            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-black text-sm rounded-lg uppercase tracking-widest">Find</button>
                        </form>}
                        <WorkLogButton />
                    </span>
                </div>
                {stage && <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 rounded-b-2xl"><StatsBar stageId={stageId} lineId={effLine} tick={tick} /></div>}
                {canScan && recent.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-100">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Recent scans</span>
                            <button type="button" onClick={() => setRecent([])} className="ml-auto text-[11px] font-bold text-slate-400 hover:text-slate-600">Clear</button>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                            {recent.map(r => (
                                <div key={r.id} className="flex items-center gap-3 text-sm">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${RECENT_DOT[r.tone]}`} />
                                    <span className="font-mono font-black text-slate-800 shrink-0">{r.code}</span>
                                    <span className="text-slate-600 truncate flex-1">{r.text}</span>
                                    <span className="text-xs text-slate-400 font-mono shrink-0">{r.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {!st.station && st.can_pick_line && (
                    <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-3">
                        <Field label="Stage"><select className={`${inputCls} !py-2.5`} value={stageId} onChange={e => { setStageId(e.target.value); setLineId(''); }}><option value="">Choose…</option>{st.stages.map(s => <option key={s.id} value={s.id}>{s.name === 'Cutting' ? 'Cutting — numbering check' : s.name}</option>)}</select></Field>
                        <Field label="Line"><select className={`${inputCls} !py-2.5`} value={lineId} onChange={e => setLineId(e.target.value)}><option value="">Choose…</option>{linesForStage.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
                    </div>
                )}
            </header>
            {!st.station && !st.can_pick_line && <ErrorBox text="You are not assigned to a workstation. Ask the admin to assign one in 2.0 (workstations)." />}
            {st.station && !st.stage && <ErrorBox text={`Your line ${st.station.line} works a stage 3.0 doesn't run yet.`} />}
            <ErrorBox text={error} />
            {rework?.blocked ? (
                <div className="flex items-center gap-3 bg-rose-600 text-white rounded-2xl px-5 py-4 font-black"><AlertTriangle className="w-7 h-7 shrink-0" /><span className="text-lg">{rework.pending} waiting for rework at this station (limit {rework.block}) — repair them before approving more. A supervisor can allow an approval with their password.</span></div>
            ) : rework?.warn ? (
                <div className="flex items-center gap-3 bg-amber-400 text-black rounded-2xl px-5 py-3 font-black"><AlertTriangle className="w-6 h-6 shrink-0" />{rework.pending} waiting for rework at this station — repair them soon{rework.block ? ` (approvals stop at ${rework.block})` : ''}.</div>
            ) : null}

            {stage && (!shownQueue ? <Loading /> : shownQueue.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-[2rem] border-4 border-dashed border-slate-300"><p className="text-slate-400 font-black text-2xl uppercase tracking-widest">Nothing waiting at this station.</p></div>
            ) : (
                <div className="space-y-5">
                    {shownQueue.map(q => {
                        const open = String(openId) === String(q.id);
                        return (
                            <div key={q.id} className="bg-white rounded-[1.5rem] shadow-xl border-2 border-slate-300 overflow-hidden">
                                <div className="bg-black px-5 py-4 flex flex-wrap justify-between items-center gap-3 cursor-pointer select-none" onClick={() => setOpenId(open ? null : q.id)}>
                                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                                        {open ? <ChevronDown className="w-6 h-6 text-slate-500 shrink-0" /> : <ChevronRight className="w-6 h-6 text-slate-500 shrink-0" />}
                                        <Shirt className="w-6 h-6 text-indigo-400 shrink-0" />
                                        <h2 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase">Batch #{q.floor_no}</h2>
                                        <PriorityBadge p={q.priority} note={q.priority_note} />
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{q.batch_code} · {q.style_code} · {q.customer_name} · ships {fmtDate(q.ship_date)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-black text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 uppercase tracking-widest">{q.pending} to check</span>
                                        {q.rework > 0 && <span className="text-xs font-black bg-amber-400 text-black px-3 py-1.5 rounded-lg uppercase tracking-widest">{q.rework} rework</span>}
                                        {q.waiting_earlier > 0 && <span className="text-xs font-black bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg uppercase tracking-widest">{q.waiting_earlier} waiting</span>}
                                        {open && !isGarment && <div onClick={e => e.stopPropagation()} className="inline-flex rounded-lg border-2 border-violet-300 bg-violet-50 p-0.5">
                                            {[['roll', 'By roll', Layers], ['size', 'By size', Ruler]].map(([k, l, I]) => <button key={k} type="button" onClick={() => setGrouping(k)}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-md ${groupBy === k ? 'bg-violet-600 text-white' : 'text-violet-700'}`}><I className="w-3.5 h-3.5" />{l}</button>)}
                                        </div>}
                                    </div>
                                </div>
                                {open && (isGarment ? (
                                    <GarmentPanel key={`${q.id}-${stageId}`} batchId={q.id} stageId={stageId} multi={st.station?.multi !== false} lineId={st.station ? undefined : lineId || undefined} codes={codes} act={act} askUndo={askUndo} tick={tick} blockedMsg={blockedMsg} />
                                ) : !view || String(view.batch.id) !== String(q.id) ? <div className="p-6"><Loading /></div> : (
                                    <div className="p-4 md:p-6 bg-slate-100 space-y-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            {tree.length > 1 && (() => {
                                                const unit = groupBy === 'size' ? 'sizes' : 'rolls';
                                                return (
                                                    <select value={tree.some(x => x.key === secPick) ? secPick : 'ALL'} onChange={e => setSecPick(e.target.value)} aria-label={groupBy === 'size' ? 'Size' : 'Roll'}
                                                        className="bg-slate-900 text-white font-black text-sm px-3 py-2.5 rounded-xl border border-slate-700 focus:outline-none uppercase tracking-widest max-w-[300px]">
                                                        <option value="ALL">All {unit} ({tree.length})</option>
                                                        {tree.map(x => { const left = recount(nodes.get(x.key).pieces).pending; return <option key={x.key} value={x.key}>{x.name}{left ? ` · ${left} to check` : ' · done'}</option>; })}
                                                    </select>
                                                );
                                            })()}
                                            <span className="ml-auto"><WhyPanel floorNo={q.floor_no} batchId={q.id} stageId={stageId} complete={view.progress.status === 'COMPLETED'} tick={tick} onFixed={() => { loadBatch(); loadQueue(); }} /></span>
                                        </div>
                                        {parts.size > 0 && !partNames.some(partVisible) && (
                                            <p className="text-base font-bold text-amber-800 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">None of this batch's parts are in your part filter. <button type="button" className="underline" onClick={() => setPartFilter(new Set())}>Show all parts</button></p>
                                        )}
                                        {tree.filter(s => secPick === 'ALL' || !tree.some(x => x.key === secPick) || s.key === secPick).map(s => {
                                            const vis = s.parts.filter(p => partVisible(p.name));
                                            if (!vis.length) return null;
                                            const sc = recount(nodes.get(s.key).pieces);
                                            return (
                                                <div key={s.key} className={`border-l-[6px] ${groupBy === 'size' ? 'border-violet-500' : 'border-indigo-500'} bg-white rounded-r-xl p-3 md:p-4 shadow-sm space-y-3`}>
                                                    <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b-2 border-slate-200">
                                                        <h3 className="font-black text-black flex items-center text-base uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-max border border-slate-300">
                                                            {groupBy === 'size' ? <Ruler className="w-4 h-4 mr-2 text-violet-600" /> : <Layers className="w-4 h-4 mr-2 text-indigo-600" />}{s.name}{s.meta ? <span className="ml-2 text-slate-500 normal-case tracking-normal font-bold">· {s.meta}</span> : null}</h3>
                                                        {st.station?.whole_roll !== false && (sc.pending > 0 || sc.rework + sc.earlier > 0) && <button type="button" onClick={() => setInspect({ key: s.key })} className="px-5 py-3 bg-black hover:bg-slate-800 text-white text-sm font-black rounded-xl shadow-lg active:scale-95 uppercase tracking-widest flex items-center"><CheckCircle2 className="w-4 h-4 mr-2 text-amber-400" /> Inspect whole {groupBy === 'size' ? 'size' : 'roll'}</button>}
                                                    </div>
                                                    {vis.map(p => (
                                                        <PartAccordion key={p.key} name={p.name} pieces={nodes.get(p.key).pieces} open={openParts.has(p.key)} onToggle={() => togglePart(p.key)}
                                                            onBulk={partBulk ? () => setInspect({ key: p.key }) : undefined} onFix={partBulk ? () => setInspect({ key: p.key, fix: true }) : undefined}>
                                                            {p.rows.map(r => {
                                                                const c = recount(r.pieces);
                                                                return <ProgressRow key={r.key} icon={r.bundle ? Package : Layers} label={r.label} sub={r.sub} notes={notesOf(c)}
                                                                    total={c.total} ok={c.approved} rework={c.rework} rejected={c.rejected} earlier={c.earlier} waiting={c.waiting} left={c.pending} fixCount={c.rework + c.earlier}
                                                                    onInspect={() => setInspect({ key: r.key })} onFix={() => setInspect({ key: r.key, fix: true })} busy={busy}
                                                                    onQuick={st.station?.whole_bundle !== false && r.bundle && c.waiting === 0 && r.bundle.pending > 0 ? () => quick((e) => productionApi.bundleCheck({ ...base(), bundle_ids: [r.bundle.id], status: 'APPROVED', ...e }), `Bundle ${r.bundle.bundle_code} approved`) : undefined}
                                                                    quickBlocked={blockedMsg} />;
                                                            })}
                                                        </PartAccordion>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            ))}

            {overlay}
            {scanCard && <ScanGarmentCard scan={scanCard} stageId={stageId} lineId={st.station ? undefined : lineId || undefined} codes={codes} multi={st.station?.multi !== false} act={act} askUndo={askUndo} tick={tick}
                onClose={() => setScanCard(null)} onActed={(no, what) => addRecent(no, `${what} at ${stage?.name || 'this stage'}`)}
                onMissing={(g) => { setScanCard(null); showProblem({ code: g.garment_no, title: 'Not loaded on your line', text: `Garment ${g.garment_no} — roll #${String(g.garment_no).split('-').slice(-3, -2)[0] || '?'}, size ${g.size} of batch #${g.floor_no} isn't loaded on your line at ${stage?.name || 'this stage'} yet.`, next: 'Ask the line loader to load it onto your line.', tone: 'amber', sound: 'not_loaded' }); }} />}
            {problem && createPortal(
                <div className="fixed inset-x-0 top-4 z-[340] flex justify-center px-4" onClick={() => setProblem(null)}>
                    <div className={`w-full max-w-2xl rounded-3xl shadow-2xl p-6 ${PROBLEM_TONE[problem.tone] || PROBLEM_TONE.rose}`}>
                        <div className="flex items-start gap-4">
                            <AlertTriangle className="w-10 h-10 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-2xl font-black uppercase tracking-tight">{problem.title}</p>
                                <p className="text-lg font-bold mt-1">{problem.text}</p>
                                {problem.next && <p className="text-lg font-black mt-2">→ {problem.next}</p>}
                                <p className="mt-3 font-mono font-black opacity-80">Scanned: {problem.code}</p>
                            </div>
                            <button type="button" onClick={() => setProblem(null)} className="p-2 rounded-full bg-black/20 hover:bg-black/30 shrink-0" aria-label="Close"><X className="w-6 h-6" /></button>
                        </div>
                    </div>
                </div>, document.body)}
            {ask && (ask.kind === 'rework'
                ? <StationDialog title="Rework limit reached" tone="rose" message={ask.message} reasonLabel="Why allow this approval?" quick={['Rework is with the tailor', 'Urgent shipment', 'Rework count is wrong']} submitLabel="Allow" onSubmit={ask.submit} onClose={() => setAsk(null)} />
                : <StationDialog title="Undo check" tone="amber" message={ask.message} reasonLabel="What was wrong?" quick={UNDO_REASONS} reasonRequired needPin={!perms.revert} submitLabel="Undo" onSubmit={ask.submit} onClose={() => setAsk(null)} />)}
            {toast && <div className={`fixed left-1/2 -translate-x-1/2 bottom-28 z-[400] px-6 py-4 rounded-2xl shadow-2xl font-black text-lg max-w-[92vw] text-center ${toast.tone === 'bad' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>{toast.text}</div>}
        </div>
    );
}

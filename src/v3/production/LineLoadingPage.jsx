// Line loader (18 Oct 2026, rebuilt as 2.0's line loader dashboard — "line loader on 3.0 is also complete mess …
// after batch creation everything is same as 2.0"): one card per finalised batch with its route as a pipeline of
// stage nodes (line, WIP, units done / forwarded, "n ready — tap to assign"). The unit is the ROLL for batches
// numbered per roll (mode 1) and the SIZE for continuous numbering (mode 2), as 2.0: a roll moves to the next stage
// as soon as all its pieces are done at the stage before. Tapping a stage opens it full screen: incoming (ready to
// assign), in progress, ready to forward, forwarded; assign = choose a line (WIP limit), then the rolls. One line per
// batch × stage; a manager can change the line with a reason. Stages complete by themselves — Recalculate re-runs it.
// Assembly stages (2.0's ASSEMBLY scope: assembly, post assembly, finishing) switch on together — loading one loads the
// same rolls onto the others, on the line chosen or the lowest-WIP line. The stage detail lists rework & rejected pieces;
// pieces in rework can be sent for material replacement (the cutting manager accepts and fulfils on the Re-cuts page).
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, ArrowRight, X, RefreshCw, Zap, Loader2, CheckCircle2, AlertTriangle, History, Layers, Ruler, Shirt } from 'lucide-react';
import { trimKitsApi } from '../api/trimKitsApi';
import { useV3Live } from '../live';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { inputCls, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { PriorityBadge } from '../cutting/cutShared';

const unitWord = (b, n = 2) => (b.mode === 'MODE_2' ? (n === 1 ? 'size' : 'sizes') : (n === 1 ? 'roll' : 'rolls'));
const stageState = (st) => {
    const units = st.units;
    if (st.status === 'COMPLETED') return 'COMPLETE';
    if (st.first || units.some(u => u.state === 'ON_LINE' || u.state === 'DONE')) return 'ACTIVE';
    if (units.some(u => u.state === 'READY')) return 'ACTIVATABLE';
    return 'LOCKED';
};
const STATE = {
    COMPLETE: { ring: 'ring-emerald-400', bg: 'bg-emerald-50', header: 'bg-emerald-600 text-white', label: 'COMPLETE', chip: 'bg-emerald-100 text-emerald-800' },
    ACTIVE: { ring: 'ring-blue-400', bg: 'bg-blue-50', header: 'bg-blue-600 text-white', label: 'ACTIVE', chip: 'bg-blue-100 text-blue-800' },
    ACTIVATABLE: { ring: 'ring-amber-400', bg: 'bg-amber-50', header: 'bg-slate-800 text-white', label: 'READY', chip: 'bg-amber-100 text-amber-800' },
    LOCKED: { ring: 'ring-slate-200', bg: 'bg-slate-50', header: 'bg-slate-300 text-slate-500', label: 'WAITING', chip: 'bg-slate-100 text-slate-500' },
};
const Wip = ({ line }) => (line ? (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border w-fit ${line.wip_limit != null && line.open_batches >= line.wip_limit ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
        WIP {line.open_batches}/{line.wip_limit ?? '∞'}{line.wip_limit != null && line.open_batches >= line.wip_limit ? ' ⚠' : ''}
    </span>
) : null);

// Per size of a roll (or one size): green ✓ = all done here, amber = some, grey = none yet.
function SizePills({ sizes }) {
    return (
        <div className="flex flex-wrap gap-1">
            {sizes.map(z => (
                <span key={z.size} title={`Size ${z.size}: ${z.done}/${z.items} done`}
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${z.done === z.items ? 'bg-emerald-500 border-emerald-500 text-white' : z.done > 0 ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-dashed border-slate-300 text-slate-500'}`}>
                    {z.done === z.items ? '✓ ' : ''}{z.size}
                </span>
            ))}
        </div>
    );
}

function UnitRow({ u, item }) {
    const pct = u.items ? Math.round((u.done / u.items) * 100) : 0;
    const edge = u.rejected ? 'border-l-rose-400' : u.rework ? 'border-l-amber-400' : 'border-l-transparent';
    return (
        <div className={`flex flex-wrap lg:flex-nowrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-b border-slate-100 last:border-0 border-l-4 ${edge}`}>
            <div className="w-40 shrink-0"><span className="font-black text-base text-slate-800">{u.label}</span></div>
            <div className="w-56 shrink-0"><SizePills sizes={u.sizes} /></div>
            <div className="flex items-center gap-2 w-44 shrink-0">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${u.rework || u.rejected ? 'bg-blue-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
                <span className="text-xs font-bold text-slate-500 tabular-nums">{u.done}/{u.items}</span>
            </div>
            <span className="flex flex-wrap gap-1.5 text-[11px] font-black">
                {u.rework > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">{u.rework} rework</span>}
                {u.rejected > 0 && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300">{u.rejected} rejected</span>}
                {u.state === 'WAITING' && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-300">{u.waiting} waiting · {u.blockers.join(', ')}</span>}
                {u.state === 'DONE' && !u.rework && !u.rejected && <CheckCircle2 size={16} className="text-emerald-500" />}
            </span>
            <span className="ml-auto text-[11px] font-bold text-slate-400">{u.items} {item}</span>
        </div>
    );
}

function StageNode({ batch, st, onOpen, onComplete, busy }) {
    const state = stageState(st);
    const cfg = STATE[state];
    const done = st.units.filter(u => u.state === 'DONE').length;
    const fwd = st.units.filter(u => u.state === 'DONE' && u.forwarded).length;
    const ready = st.units.filter(u => u.state === 'READY').length;
    const total = st.units.length;
    const w = unitWord(batch, ready);
    return (
        <div onClick={() => state !== 'LOCKED' && onOpen()} role="button" tabIndex={0}
            className={`flex flex-col rounded-2xl border-2 overflow-hidden ring-2 ${cfg.ring} ${cfg.bg} w-[210px] shrink-0 ${state !== 'LOCKED' ? 'cursor-pointer hover:shadow-lg active:scale-[0.99]' : 'opacity-60'}`}>
            <div className={`${cfg.header} px-3 py-2 flex justify-between items-center gap-2`}>
                <span className="flex items-center gap-1.5 min-w-0"><span className="font-black text-xs uppercase tracking-widest truncate">{st.first && st.name === 'Cutting' ? 'Numbering' : st.name}</span>
                    {st.scope === 'ASSEMBLY' && <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0" title="Assembly stages switch on together">Serial</span>}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${cfg.chip}`}>{cfg.label}</span>
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
                {st.line ? <span className="text-sm font-black text-slate-800 truncate">{st.line.name}</span>
                    : <span className="text-sm font-bold text-slate-400 italic">{st.first ? 'Numbering line' : 'No line assigned'}</span>}
                <Wip line={st.line} />
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{batch.mode === 'MODE_2' ? 'Sizes' : 'Rolls'}</span>
                        <span className="text-[10px] font-black text-slate-700">{done}/{total} done</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                        <div className="h-full bg-emerald-400" style={{ width: `${total ? ((done - fwd) / total) * 100 : 0}%` }} />
                        <div className="h-full bg-blue-400" style={{ width: `${total ? (fwd / total) * 100 : 0}%` }} />
                    </div>
                    {done - fwd > 0 && <span className="text-[10px] text-amber-600 font-bold mt-0.5 block">{done - fwd} ready to forward</span>}
                    {fwd > 0 && <span className="text-[10px] text-blue-500 font-bold mt-0.5 block">{fwd} forwarded</span>}
                </div>
                {state === 'ACTIVATABLE' && <span className="flex items-center text-[11px] font-black text-amber-700"><Zap size={11} className="mr-1" /> {ready} {w} ready — tap to assign</span>}
                {state === 'ACTIVE' && !st.first && ready > 0 && <span className="flex items-center text-[11px] font-black text-amber-700"><Zap size={11} className="mr-1" /> {ready} more {w} ready — tap to add</span>}
                {state === 'ACTIVE' && (st.first || ready === 0) && <span className="flex items-center text-[11px] font-black text-blue-600"><Loader2 size={11} className="mr-1 animate-spin" /> In progress</span>}
                {state === 'ACTIVE' && (
                    <button type="button" onClick={e => { e.stopPropagation(); onComplete(); }} disabled={busy} title="Recalculate: completes the stage when every piece is OK, and says what is holding it otherwise"
                        className="mt-1 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border-2 border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Check &amp; complete
                    </button>
                )}
            </div>
        </div>
    );
}

const Connector = ({ ready }) => (
    <div className="flex flex-col items-center justify-center shrink-0 gap-1 px-1">
        <ArrowRight size={18} className={ready ? 'text-amber-500' : 'text-slate-300'} />
        {ready > 0 && <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 rounded">{ready}</span>}
    </div>
);

function BatchCard({ b, focus, onOpen, onComplete, busyId }) {
    const last = b.stages[b.stages.length - 1];
    const lastDone = last ? last.units.filter(u => u.state === 'DONE').length : 0;
    const stagesDone = b.stages.filter(st => stageState(st) === 'COMPLETE').length;
    return (
        <div className={`bg-white rounded-[1.5rem] shadow-xl border-2 overflow-hidden ${focus ? 'border-indigo-400 ring-4 ring-indigo-200' : 'border-slate-200'}`}>
            <div className="bg-slate-900 px-5 py-4 flex flex-wrap justify-between items-center gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl font-black text-white tracking-tight">BATCH #{b.floor_no}</h2>
                        <span className="font-mono text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded">{b.batch_code}</span>
                        <PriorityBadge p={b.priority} note={b.priority_note} />
                        {b.mode === 'MODE_2' && <span className="text-[10px] font-black uppercase tracking-widest bg-violet-900 text-violet-300 px-2 py-0.5 rounded border border-violet-700">Size mode</span>}
                    </div>
                    <span className="text-sm text-slate-400">{b.style_code} {b.style_name || ''} · {b.customer_name} · ships {fmtDate(b.ship_date)}</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {b.trims.map(t => <span key={t.issue_no} className="text-[10px] font-bold bg-purple-900 text-purple-200 px-2 py-1 rounded border border-purple-700" title={`Material issue to ${t.stage}`}>{t.issue_no}</span>)}
                    <div className="text-right">
                        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Overall</span>
                        <span className="text-sm font-black text-white">{lastDone}/{last?.units.length || 0} {unitWord(b)} · {stagesDone}/{b.stages.length} stages</span>
                    </div>
                </div>
            </div>
            <div className="p-4 md:p-6 overflow-x-auto">
                <div className="flex items-stretch gap-1 w-max">
                    {b.stages.map((st, i) => [
                        i > 0 && <Connector key={`c${i}`} ready={st.units.filter(u => u.state === 'READY').length} />,
                        <StageNode key={st.stage_type_id} batch={b} st={st} onOpen={() => onOpen(b, st)} onComplete={() => onComplete(b, st)} busy={busyId === b.id} />,
                    ])}
                </div>
            </div>
        </div>
    );
}

// Step 1: line (with WIP); step 2: the rolls / sizes ready for it.
function AssignModal({ b, st, onClose, onDone }) {
    const siblings = st.scope === 'ASSEMBLY' ? b.stages.filter(x => x.scope === 'ASSEMBLY' && x.stage_type_id !== st.stage_type_id) : [];
    const [sibLines, setSibLines] = useState({});      // stage id → lines
    const [sibPick, setSibPick] = useState({});        // stage id → line id ('' = auto, lowest WIP)
    useEffect(() => {
        siblings.forEach(x => productionApi.lines(x.stage_type_id).then(r => setSibLines(m => ({ ...m, [x.stage_type_id]: r.data }))).catch(() => {}));
    }, [st.stage_type_id]); // eslint-disable-line react-hooks/exhaustive-deps
    const [lines, setLines] = useState(null);
    const [line, setLine] = useState(st.line?.id || '');
    const [step, setStep] = useState('line');
    const ready = st.units.filter(u => u.state === 'READY');
    const [sel, setSel] = useState(() => new Set(ready.map(u => u.key)));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { productionApi.lines(st.stage_type_id).then(r => setLines(r.data)).catch(err => setError(apiError(err, 'Failed to load the lines.'))); }, [st.stage_type_id]);
    const L = lines?.find(l => l.id === String(line));
    const onThis = st.line && String(st.line.id) === String(line);
    const blocked = L && L.wip_limit != null && L.open_batches >= L.wip_limit && !onThis;
    const lockedLine = Boolean(st.line && st.units.some(u => u.load_status === 'OPEN'));   // one line per batch × stage
    const save = async () => {
        setBusy(true); setError('');
        const picked = ready.filter(u => sel.has(u.key));
        try {
            const sibling_lines = Object.fromEntries(Object.entries(sibPick).filter(([, v]) => v));
            const r = await productionApi.load({ batch_id: b.id, stage_type_id: st.stage_type_id, production_line_id: line, sibling_lines,
                ...(b.mode === 'MODE_2' ? { size_ids: picked.map(u => u.size_id) } : { roll_ids: picked.map(u => u.batch_roll_id) }) });
            const co = (r.data.co_activated || []).map(x => `${x.stage} on ${x.line}`).join(', ');
            onDone(`${picked.length} ${unitWord(b, picked.length)} of batch #${b.floor_no} loaded onto ${L?.name || 'the line'} for ${st.name}${co ? ` — also switched on: ${co}` : ''}.`);
        } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <Modal title={`Assign ${st.name} — batch #${b.floor_no}`} onClose={onClose}>
            <div className="w-[min(640px,92vw)] p-1 space-y-4">
                <ErrorBox text={error} />
                {step === 'line' ? (<>
                    <p className="flex items-center gap-2 flex-wrap text-sm font-black text-slate-800">
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg uppercase tracking-wide">{st.name}</span>
                        <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg">{ready.length} {unitWord(b, ready.length)} ready</span>
                    </p>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Choose production line</label>
                        {!lines ? <Loading /> : (
                            <select value={line} onChange={e => setLine(e.target.value)} disabled={lockedLine}
                                className={`w-full p-3 border-2 rounded-xl bg-white font-bold text-slate-700 text-base ${blocked ? 'border-rose-400' : 'border-slate-300'}`}>
                                <option value="">— Select line —</option>
                                {lines.map(l => <option key={l.id} value={l.id}>{l.name}  (WIP: {l.open_batches}/{l.wip_limit ?? '∞'})</option>)}
                            </select>
                        )}
                        {lockedLine && <p className="mt-2 text-xs font-bold text-slate-600">This batch is already running on {st.line.name} for {st.name} — one line per batch and stage (a manager can change the line).</p>}
                        {L && <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-md border ${blocked ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {blocked ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} Line load: {L.open_batches} / {L.wip_limit ?? '∞'} batches{blocked ? ' — at limit' : onThis ? ' (this batch is already on it)' : ''}</p>}
                    </div>
                    {siblings.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-1 flex items-center gap-1.5"><Zap size={12} /> Co-activate assembly stages</p>
                            <p className="text-[11px] text-blue-600 mb-3 font-medium">These stages switch on with {st.name} for the same {unitWord(b)}. Leave on "Auto" for the line with the lowest WIP.</p>
                            <div className="space-y-3">{siblings.map(x => {
                                const fixed = x.units.some(u => u.load_status === 'OPEN') && x.line;
                                return (
                                    <div key={x.stage_type_id}>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">{x.name}</label>
                                        {fixed ? <p className="text-sm font-bold text-slate-700">Already running on {x.line.name}</p> : (
                                            <select value={sibPick[x.stage_type_id] || ''} onChange={e => setSibPick({ ...sibPick, [x.stage_type_id]: e.target.value })}
                                                className="w-full p-2.5 border-2 border-slate-300 rounded-xl bg-white text-sm font-bold text-slate-700">
                                                <option value="">Auto — lowest WIP</option>
                                                {(sibLines[x.stage_type_id] || []).map(l => <option key={l.id} value={l.id}>{l.name}  (WIP: {l.open_batches}/{l.wip_limit ?? '∞'})</option>)}
                                            </select>
                                        )}
                                    </div>
                                );
                            })}</div>
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                        <button type="button" onClick={onClose} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold">Cancel</button>
                        <button type="button" onClick={() => setStep('units')} disabled={!line || blocked} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold disabled:bg-slate-200 disabled:text-slate-400">Select {unitWord(b)} →</button>
                    </div>
                </>) : (<>
                    <div className="flex items-center justify-between">
                        <h3 className="text-base font-black text-slate-800">Select {unitWord(b)} <span className="text-sm font-bold text-slate-500">→ {L?.name}</span></h3>
                        <button type="button" onClick={() => setSel(sel.size === ready.length ? new Set() : new Set(ready.map(u => u.key)))} className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl">{sel.size === ready.length ? 'Deselect all' : 'Select all'}</button>
                    </div>
                    <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                        {ready.map(u => {
                            const on = sel.has(u.key);
                            return (
                                <div key={u.key} role="checkbox" aria-checked={on} tabIndex={0} onClick={() => { const x = new Set(sel); if (on) x.delete(u.key); else x.add(u.key); setSel(x); }}
                                    className={`flex flex-wrap justify-between items-center gap-2 p-3.5 rounded-xl border-2 cursor-pointer select-none ${on ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200'}`}>
                                    <span className="flex items-center gap-3"><span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>{on && <CheckCircle2 size={12} className="text-white" />}</span>
                                        <span className="font-black text-slate-800">{u.label}</span></span>
                                    <SizePills sizes={u.sizes} />
                                    <span className="text-xs font-bold text-slate-500">{u.items} {st.unit === 'GARMENT' ? 'garments' : 'pieces'}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex justify-between gap-3 pt-3 border-t border-slate-200">
                        <button type="button" onClick={() => setStep('line')} className="px-5 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold">← Line</button>
                        <button type="button" onClick={save} disabled={busy || !sel.size} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black disabled:opacity-40 flex items-center gap-2">{busy && <Loader2 size={16} className="animate-spin" />} Assign {sel.size} {unitWord(b, sel.size)}</button>
                    </div>
                </>)}
            </div>
        </Modal>
    );
}

function ChangeLineModal({ b, st, onClose, onDone }) {
    const [lines, setLines] = useState(null);
    const [line, setLine] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { productionApi.lines(st.stage_type_id).then(r => setLines(r.data.filter(l => l.id !== String(st.line?.id)))).catch(err => setError(apiError(err, 'Failed.'))); }, [st]);
    const save = async () => {
        setBusy(true); setError('');
        try { const r = await productionApi.changeLine({ batch_id: b.id, stage_type_id: st.stage_type_id, production_line_id: line, reason: reason.trim() }); onDone(`Batch #${b.floor_no} moved to ${r.data.line} for ${st.name}.`); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <Modal title={`Change line — ${st.name}, batch #${b.floor_no}`} onClose={onClose}>
            <div className="w-[min(520px,92vw)] space-y-3 p-1">
                <p className="text-sm text-slate-600">Now on <b>{st.line?.name}</b>. Everything of this batch still open at {st.name} moves to the new line.</p>
                {!lines ? <Loading /> : <select className={`${inputCls} !py-3 !text-base`} value={line} onChange={e => setLine(e.target.value)}><option value="">— New line —</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name}  (WIP: {l.open_batches}/{l.wip_limit ?? '∞'})</option>)}</select>}
                <input className={`${inputCls} !py-3`} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (e.g. line down, machines short)" maxLength={500} />
                <ErrorBox text={error} />
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-5 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold">Cancel</button>
                    <button type="button" onClick={save} disabled={busy || !line || !reason.trim()} className="px-6 py-3 bg-slate-800 text-white rounded-xl font-black disabled:opacity-40">Move</button>
                </div>
            </div>
        </Modal>
    );
}

// 2.0's "rework & rejected pieces — request material replacement": pieces in rework here can be flagged for new
// material (the cutting manager accepts and fulfils); rejected pieces show their re-cut.
const CAT = {
    REWORK: ['Rework', 'bg-amber-50 border-amber-300 text-amber-900'], REPLACEMENT: ['For replacement', 'bg-violet-50 border-violet-300 text-violet-800'],
    REJECTED: ['Rejected here', 'bg-rose-50 border-rose-300 text-rose-800'], REJECTED_EARLIER: ['Rejected earlier', 'bg-rose-50 border-rose-200 text-rose-700'],
};
function ProblemsPanel({ b, st, perms, onChanged }) {
    const [d, setD] = useState(null);
    const [sel, setSel] = useState(new Set());
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const load = useCallback(() => productionApi.problems(b.id, st.stage_type_id).then(r => setD(r.data)).catch(() => setD(null)), [b.id, st.stage_type_id]);
    useEffect(() => { load(); }, [load, st]);
    if (!d || (!d.pieces.length && !d.garments.length)) return null;
    const send = async () => {
        setBusy(true); setError(''); setMsg('');
        try { const r = await productionApi.requestReplacement({ batch_id: b.id, stage_type_id: st.stage_type_id, piece_ids: [...sel], notes: notes.trim() || undefined }); setMsg(`${r.data.requested} piece(s) sent for material replacement — the cutting manager accepts and fulfils it (Re-cuts page).`); setSel(new Set()); setNotes(''); load(); onChanged?.(); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const count = (c) => d.pieces.filter(p => p.category === c).length;
    return (
        <details className="bg-white rounded-xl border-2 border-violet-200" open={d.pieces.some(p => p.category === 'REWORK')}>
            <summary className="cursor-pointer px-4 py-3 text-xs font-black uppercase tracking-widest text-violet-700 flex flex-wrap items-center gap-2">
                Rework &amp; rejected pieces — request material replacement
                {Object.keys(CAT).filter(c => count(c)).map(c => <span key={c} className={`normal-case tracking-normal text-[11px] px-2 py-0.5 rounded border ${CAT[c][1]}`}>{count(c)} {CAT[c][0].toLowerCase()}</span>)}
                {d.garments.length > 0 && <span className="normal-case tracking-normal text-[11px] px-2 py-0.5 rounded border bg-amber-50 border-amber-300 text-amber-900">{d.garments.length} garment(s)</span>}
            </summary>
            <div className="px-4 pb-4 space-y-3">
                <ErrorBox text={error} />
                {msg && <p className="text-sm font-bold text-emerald-700">{msg}</p>}
                {d.garments.length > 0 && <div className="flex flex-wrap gap-2">{d.garments.map(g => (
                    <span key={g.id} className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${g.status === 'QC_REJECTED' ? CAT.REJECTED[1] : CAT.REWORK[1]}`}>{g.garment_no} · {g.status === 'QC_REJECTED' ? 'rejected' : 'rework'}{g.defect_code ? ` · ${g.defect_code}` : ''}</span>
                ))}</div>}
                <div className="flex flex-wrap gap-2">{d.pieces.map(p => {
                    const on = sel.has(p.id);
                    const pick = p.can_replace && perms.replaceRequest;
                    return (
                        <button key={p.id} type="button" disabled={!pick} onClick={() => { const x = new Set(sel); if (on) x.delete(p.id); else x.add(p.id); setSel(x); }} title={p.uid}
                            className={`text-left text-xs font-bold px-2.5 py-1.5 rounded-lg border-2 ${on ? 'bg-violet-600 border-violet-600 text-white' : CAT[p.category][1]} ${pick ? 'cursor-pointer' : 'cursor-default'}`}>
                            <span className="font-black">Roll #{p.roll_no ?? '—'} · {p.part_name} {p.size} #{p.no}</span>
                            <span className="block text-[11px] font-semibold opacity-80">{CAT[p.category][0]}{p.rejected_at ? ` at ${p.rejected_at}` : ''}{p.defect?.code ? ` · ${p.defect.code} ${p.defect.description || ''}` : ''}
                                {p.replacement && ['REQUESTED', 'ACCEPTED'].includes(p.replacement.status) ? ` · ${p.replacement.status.toLowerCase()}` : ''}{p.recut ? ` · re-cut ${p.recut.toLowerCase()}` : ''}</span>
                        </button>
                    );
                })}</div>
                {perms.replaceRequest && d.pieces.some(p => p.can_replace) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input className={`${inputCls} !w-72`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note for cutting (e.g. torn, wrong shade)" maxLength={500} />
                        <button type="button" onClick={send} disabled={busy || !sel.size} className="px-4 py-2.5 rounded-xl bg-violet-700 text-white text-xs font-black uppercase tracking-widest disabled:opacity-40">Request material replacement ({sel.size})</button>
                        <span className="text-[11px] text-slate-500">Tap pieces in rework. Rejected pieces are replaced by a re-cut (Re-cuts page).</span>
                    </div>
                )}
            </div>
        </details>
    );
}

function StageDetail({ b, st, prev, perms, onClose, onAssign, onChangeLine, onRefresh }) {
    const [tab, setTab] = useState(null);
    const ready = st.units.filter(u => u.state === 'READY');
    const sections = [
        { key: 'ON_LINE', label: 'In progress', on: 'bg-amber-100 border-amber-400 text-amber-900', box: 'border-amber-300', list: st.units.filter(u => u.state === 'ON_LINE') },
        { key: 'TO_FORWARD', label: 'Ready to forward', on: 'bg-emerald-100 border-emerald-400 text-emerald-900', box: 'border-emerald-300', list: st.units.filter(u => u.state === 'DONE' && !u.forwarded) },
        { key: 'FORWARDED', label: 'Forwarded', on: 'bg-blue-100 border-blue-400 text-blue-900', box: 'border-blue-300', list: st.units.filter(u => u.state === 'DONE' && u.forwarded) },
    ];
    const cur = sections.find(s => s.key === tab) || sections.find(s => s.list.length) || sections[0];
    const waiting = st.units.filter(u => u.state === 'WAITING');
    const item = st.unit === 'GARMENT' ? 'garments' : 'pieces';
    return (
        <div className="space-y-5">
            <div className="bg-slate-900 rounded-2xl px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black uppercase tracking-tight bg-amber-400 text-slate-900 px-3 py-1 rounded-lg">{st.first && st.name === 'Cutting' ? 'Numbering' : st.name}</h3>
                    <span className="text-xl font-black bg-white text-slate-900 px-3 py-1 rounded-lg">BATCH #{b.floor_no}</span>
                    {st.line && <span className="text-sm font-black text-white border border-slate-600 px-3 py-1.5 rounded-lg">{st.line.name}</span>}
                    <Wip line={st.line} />
                    <span className="ml-auto flex gap-2">
                        <button type="button" onClick={onRefresh} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-600 text-white text-xs font-black uppercase tracking-widest"><RefreshCw size={14} /> Refresh</button>
                        {perms.changeLine && st.line && !st.first && st.units.some(u => u.load_status === 'OPEN') && <button type="button" onClick={onChangeLine} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-600 text-white text-xs font-black uppercase tracking-widest"><RefreshCw size={14} /> Change line</button>}
                        <button type="button" onClick={onClose} className="p-2.5 rounded-xl bg-white/10 text-white" aria-label="Close"><X size={18} /></button>
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-white/10">
                    <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">{b.batch_code}</span>
                    <PriorityBadge p={b.priority} note={b.priority_note} />
                    {b.mode === 'MODE_2' && <span className="text-[10px] font-black uppercase tracking-widest bg-violet-900 text-violet-300 px-2 py-0.5 rounded border border-violet-700">Size mode</span>}
                    <span className="text-slate-400 text-xs font-medium">{b.style_code} {b.style_name || ''}</span>
                </div>
            </div>

            <ProblemsPanel b={b} st={st} perms={perms} onChanged={onRefresh} />

            {!st.first && ready.length > 0 && (
                <div className="border-2 border-dashed border-indigo-400 rounded-xl overflow-hidden">
                    <div className="bg-indigo-600 px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 text-white px-2 py-0.5 rounded">Incoming</span>
                        <span className="text-xs font-black uppercase tracking-widest text-white">Ready to assign ({ready.length})</span>
                        {prev && <span className="text-[11px] font-bold text-indigo-100">finished at {prev.name}</span>}
                        <button type="button" onClick={onAssign} className="ml-auto px-4 py-2.5 bg-white text-indigo-700 font-black rounded-lg flex items-center gap-1.5 text-xs uppercase tracking-widest"><Zap size={14} /> Assign {ready.length} {unitWord(b, ready.length)} to line</button>
                    </div>
                    <div className="bg-indigo-50/40">{ready.map(u => <UnitRow key={u.key} u={u} item={item} />)}</div>
                </div>
            )}

            <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    {sections.map(s => (
                        <button key={s.key} type="button" onClick={() => setTab(s.key)}
                            className={`px-4 py-2.5 rounded-xl border-2 text-xs font-black uppercase tracking-widest ${cur.key === s.key ? s.on : 'bg-white border-slate-200 text-slate-600'}`}>{s.label} <span className="tabular-nums">({s.list.length})</span></button>
                    ))}
                    <span className="ml-auto text-[11px] text-slate-500 flex items-center gap-1">Sizes: <span className="px-1.5 rounded bg-emerald-500 text-white font-black">✓ done</span><span className="px-1.5 rounded bg-amber-50 border border-amber-300 text-amber-800 font-black">some</span><span className="px-1.5 rounded border border-dashed border-slate-300 text-slate-500 font-black">none yet</span></span>
                </div>
                <div className={`bg-white rounded-xl border-2 ${cur.box}`}>
                    {cur.list.length === 0 ? <p className="py-8 text-center text-sm font-bold text-slate-400">No {unitWord(b)} {cur.label.toLowerCase()}.</p>
                        : cur.list.map(u => <UnitRow key={u.key} u={u} item={item} />)}
                </div>
            </div>
            {waiting.length > 0 && (
                <div>
                    <h5 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Not ready yet ({waiting.length})</h5>
                    <div className="bg-white rounded-xl border border-slate-200 opacity-80">{waiting.map(u => <UnitRow key={u.key} u={u} item={item} />)}</div>
                </div>
            )}
        </div>
    );
}

function HistoryModal({ onClose }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { productionApi.loadHistory().then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed.'))); }, []);
    const ACT = { LOADED: ['Loaded', 'text-blue-700'], COMPLETED: ['Done', 'text-emerald-700'], LINE_CHANGED: ['Line changed', 'text-amber-700'] };
    return (
        <Modal title="Batch history" onClose={onClose}>
            <div className="w-[min(760px,92vw)] max-h-[70vh] overflow-y-auto">
                <ErrorBox text={error} />
                {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">Nothing yet.</p> : (
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="py-2">When</th><th>Batch</th><th>Stage</th><th>What</th><th>Line</th><th>By</th></tr></thead>
                        <tbody>{rows.map(h => (
                            <tr key={h.id} className="border-t border-slate-100 align-top">
                                <td className="py-1.5 text-xs text-slate-500 whitespace-nowrap">{new Date(h.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="font-black">#{h.floor_no}</td><td>{h.stage}</td>
                                <td><span className={`font-bold ${ACT[h.action]?.[1] || ''}`}>{ACT[h.action]?.[0] || h.action}</span> {Array.isArray(h.units) ? h.units.join(', ') : ''}{h.reason ? <span className="block text-xs text-slate-500">{h.reason}</span> : null}</td>
                                <td className="text-xs">{h.from_line ? `${h.from_line} → ` : ''}{h.line || ''}</td><td className="text-xs text-slate-500">{h.by_name || ''}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
            </div>
        </Modal>
    );
}

export default function LineLoadingPage() {
    const [params] = useSearchParams();
    const focusBatch = params.get('batch');   // from the order tracker
    const [perms, setPerms] = useState({});
    const [rows, setRows] = useState(null);
    const [showDone, setShowDone] = useState(false);
    const [open, setOpen] = useState(null);       // { batchId, stageId }
    const [assign, setAssign] = useState(false);
    const [move, setMove] = useState(false);
    const [history, setHistory] = useState(false);
    const [kits, setKits] = useState(null);       // trim kits ready for pickup (13 Oct 2026)
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const load = useCallback(() => {
        productionApi.pipeline(showDone ? { all: true } : {}).then(r => { setRows(r.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load the batches.')));
        trimKitsApi.list({ status: 'READY' }).then(res => setKits(res.data)).catch(() => setKits(null));
    }, [showDone]);
    useEffect(() => { productionApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, []);
    useEffect(() => { load(); }, [load]);
    const live = useV3Live(load);
    const done = (text) => { setAssign(false); setMove(false); setMsg(text); load(); };
    // Check & complete (as 2.0): recalculate the batch; the stage closes once every piece / garment is OK (no Reject
    // since 18 Oct 2026 — rework and material replacement hold it open), else say what is holding it.
    const complete = async (b, st) => {
        const name = st.first && st.name === 'Cutting' ? 'Numbering' : st.name;
        setBusyId(b.id); setError(''); setMsg('');
        try {
            const now = (await productionApi.refresh(b.id)).data.stages[st.stage_type_id];
            if (now === 'COMPLETED') setMsg(`Batch #${b.floor_no} ${name}: complete.`);
            else {
                const why = (await productionApi.stageWhy(b.id, st.stage_type_id)).data;
                setError(`Batch #${b.floor_no} ${name} is not complete — ${why.reasons.length ? why.reasons.map(r => `${r.count} ${r.label}`).join(' · ') : 'nothing loaded yet'}.`);
            }
            load();
        } catch (err) { setError(apiError(err, 'Failed to check the stage.')); } finally { setBusyId(null); }
    };
    const ob = open && rows?.find(b => b.id === open.batchId);
    const oi = ob ? ob.stages.findIndex(s => s.stage_type_id === open.stageId) : -1;
    const ost = oi >= 0 ? ob.stages[oi] : null;
    const list = rows && (focusBatch ? [...rows].sort((a, b) => (b.id === focusBatch) - (a.id === focusBatch)) : rows);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Line Loader</h1>
                    <p className="text-sm text-slate-500">Track each batch through its production pipeline and assign lines per stage — roll by roll (size by size for size-mode batches).</p>
                </div>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest ${live ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />{live ? 'Live' : 'Offline'}</span>
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 px-3 py-2"><input type="checkbox" className="w-4 h-4" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show finished</label>
                    <button type="button" onClick={() => setHistory(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-bold"><History size={15} /> History</button>
                    <button type="button" onClick={load} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-700 text-sm font-bold"><RefreshCw size={15} /> Refresh</button>
                </span>
            </div>
            {kits?.length > 0 && (
                <Link to="/v3/trim-kits?status=READY" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:border-emerald-400 px-4 py-3">
                    <Package size={20} className="text-emerald-600 shrink-0" />
                    <span className="font-black text-slate-800">{kits.length} trim kit{kits.length === 1 ? '' : 's'} ready for pickup</span>
                    <span className="text-xs text-slate-600 hidden sm:inline">{kits.slice(0, 3).map(k => `${k.kit_no} (${k.order_no}${k.batch_code ? ` · ${k.batch_code}` : ''})`).join(', ')}{kits.length > 3 ? ' …' : ''} — count and sign</span>
                    <ArrowRight size={16} className="ml-auto text-emerald-600" />
                </Link>
            )}
            <ErrorBox text={error} />
            {msg && <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">{msg}</p>}
            {!list ? (!error && <Loading />) : list.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[2rem] border-4 border-dashed border-slate-300">
                    <Layers className="mx-auto text-slate-300" size={40} />
                    <h3 className="text-lg font-black text-slate-700 mt-2">No active batches</h3>
                    <p className="text-sm text-slate-500">Batches appear here once they are finalised at cutting.</p>
                </div>
            ) : list.map(b => <BatchCard key={b.id} b={b} focus={b.id === focusBatch} busyId={busyId} onComplete={complete} onOpen={(bt, st) => setOpen({ batchId: bt.id, stageId: st.stage_type_id })} />)}

            {ost && (
                <Modal title="" fullScreen hideCloseButton onClose={() => setOpen(null)}>
                    <StageDetail b={ob} st={ost} prev={oi > 0 ? ob.stages[oi - 1] : null} perms={perms} onClose={() => setOpen(null)} onRefresh={load}
                        onAssign={() => setAssign(true)} onChangeLine={() => setMove(true)} />
                </Modal>
            )}
            {assign && ost && <AssignModal b={ob} st={ost} onClose={() => setAssign(false)} onDone={done} />}
            {move && ost && <ChangeLineModal b={ob} st={ost} onClose={() => setMove(false)} onDone={done} />}
            {history && <HistoryModal onClose={() => setHistory(false)} />}
            <p className="text-[11px] text-slate-400 flex items-center gap-3"><Ruler size={12} /> Size mode = continuous numbering (loaded by size) <Shirt size={12} /> garment stages count garments</p>
        </div>
    );
}

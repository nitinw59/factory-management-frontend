// Stage check (the numbering check is the Cutting stage's check): the
// checker's 2.0 workstation decides the line and stage; managers without a
// workstation pick stage and line. Queue of finalised batches → groups of
// pieces (roll × part × size × colour): approve / rework / reject by quantity
// or by picking piece numbers; reworked pieces come back repaired or rejected.
// Pieces not cleared at an earlier stage of the route can't be checked (gate).
// Garment stages (assembly onwards) check whole garments — GarmentPanel.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Wrench, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import GarmentPanel from './GarmentPanel';

const STATUS_CLS = { APPROVED: 'bg-emerald-100 text-emerald-800', REPAIRED: 'bg-emerald-50 text-emerald-700', RECUT_CLEARED: 'bg-emerald-50 text-emerald-700', NEEDS_REWORK: 'bg-amber-100 text-amber-800', QC_REJECTED: 'bg-rose-100 text-rose-800' };

export default function StageCheckPage() {
    const [st, setSt] = useState(null);
    const [params] = useSearchParams();
    const focusStage = params.get('stage'), focusBatch = params.get('batch');   // from the order tracker: open this stage and batch
    const focusApplied = useRef(false);
    const [stageId, setStageId] = useState('');
    const [lineId, setLineId] = useState('');
    const [queue, setQueue] = useState(null);
    const [batchId, setBatchId] = useState(null);
    const [view, setView] = useState(null);
    const [codes, setCodes] = useState([]);
    const [code, setCode] = useState('');
    const [qty, setQty] = useState({});
    const [open, setOpen] = useState({});
    const [sel, setSel] = useState({});
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        productionApi.station().then(res => { setSt(res.data); if (res.data.stage) setStageId(res.data.stage.id); else if (focusStage && res.data.can_pick_line && res.data.stages.some(s => String(s.id) === focusStage)) setStageId(res.data.stages.find(s => String(s.id) === focusStage).id); }).catch(err => setError(apiError(err, 'Failed to load your workstation.')));
    }, [focusStage]);
    const loadQueue = useCallback(() => { if (stageId) productionApi.queue(stageId).then(res => { setQueue(res.data); if (focusBatch && !focusApplied.current && String(stageId) === focusStage) { focusApplied.current = true; setBatchId(focusBatch); } }).catch(err => setError(apiError(err, 'Failed to load the queue.'))); }, [stageId, focusStage, focusBatch]);
    useEffect(() => { setQueue(null); setBatchId(null); setView(null); loadQueue(); if (stageId) productionApi.defectCodes(stageId).then(res => setCodes(res.data)).catch(() => setCodes([])); }, [stageId, loadQueue]);
    const loadBatch = useCallback(() => { if (batchId && st?.stages.find(s => s.id === stageId)?.unit !== 'GARMENT') productionApi.batchStage(batchId, stageId).then(res => setView(res.data)).catch(err => setError(apiError(err, 'Failed to load the batch.'))); }, [batchId, stageId, st]);
    useEffect(() => { setView(null); setSel({}); loadBatch(); }, [loadBatch]);
    if (!st) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const stage = st.stages.find(s => s.id === stageId);
    const linesForStage = st.lines.filter(l => stage && l.line_type_id === stage.line_type_id);
    const base = () => ({ batch_id: batchId, stage_type_id: stageId, production_line_id: st.station ? undefined : lineId || undefined });
    const act = async (fn, label) => {
        setBusy(true); setError(''); setMsg('');
        try { const res = await fn(); setMsg(`${label}: ${res.data.checked ?? res.data.repaired} piece(s). Stage ${String(res.data.progress).toLowerCase().replace('_', ' ')}.`); setSel({}); loadBatch(); loadQueue(); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const groupBody = (g, n) => ({ group: { batch_roll_id: g.batch_roll_id, style_part_id: g.style_part_id, size_id: g.size_id, garment_colour_id: g.garment_colour_id, qty: n } });
    const picked = (g) => g.pieces.filter(p => sel[p.id]).map(p => p.id);
    const needCode = () => { if (!code) { setError('Choose the defect code first.'); return false; } return true; };

    return (
        <div>
            <PageHeader title={stage ? `${stage.name === 'Cutting' ? 'Numbering check' : `${stage.name} check`}` : 'Stage check'}
                subtitle={st.station ? `Workstation ${st.station.workstation} · ${st.station.line} (2.0 setup)` : 'No workstation assigned to you in 2.0 — managers choose the stage and line.'} />
            {!st.station && (
                st.can_pick_line ? (
                    <div className="flex flex-wrap gap-3 mb-3">
                        <Field label="Stage"><select className={inputCls} value={stageId} onChange={e => { setStageId(e.target.value); setLineId(''); }}><option value="">Choose…</option>{st.stages.map(s => <option key={s.id} value={s.id}>{s.name === 'Cutting' ? 'Cutting — numbering check' : s.name}</option>)}</select></Field>
                        <Field label="Line"><select className={inputCls} value={lineId} onChange={e => setLineId(e.target.value)}><option value="">Choose…</option>{linesForStage.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
                    </div>
                ) : <ErrorBox text="You are not assigned to a workstation. Ask the admin to assign one in 2.0 (workstations)." />
            )}
            {st.station && !st.stage && <ErrorBox text={`Your line ${st.station.line} works a stage 3.0 doesn't run yet.`} />}
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            {stage && (
                <div className="grid lg:grid-cols-[280px_1fr] gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden self-start">
                        <p className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-500 bg-slate-50">Batches waiting</p>
                        {!queue ? <Loading /> : queue.length === 0 ? <p className="px-3 py-4 text-sm text-slate-400">Nothing waiting.</p> : queue.map(q => (
                            <button key={q.id} type="button" onClick={() => setBatchId(q.id)} className={`block w-full text-left px-3 py-2 border-t border-slate-100 text-sm ${batchId === q.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                                <span className="font-semibold">{q.batch_code}</span><span className="block text-xs text-slate-500">{q.style_code} · {q.customer_name} · ships {fmtDate(q.ship_date)}</span>
                                <span className="block text-xs">{q.pending} {q.unit === 'GARMENT' ? 'garment(s) ' : ''}to check{q.rework ? ` · ${q.rework} in rework` : ''}{q.waiting_earlier ? ` · ${q.waiting_earlier} waiting earlier stage` : ''}</span>
                            </button>
                        ))}
                    </div>
                    <div>
                        {stage.unit === 'GARMENT' ? (batchId ? <GarmentPanel key={`${batchId}-${stageId}`} batchId={batchId} stageId={stageId} lineId={st.station ? undefined : lineId || undefined} codes={codes} onDone={loadQueue} onOpenBatch={setBatchId} /> : <p className="text-sm text-slate-500">Choose a batch.</p>)
                        : !batchId ? <p className="text-sm text-slate-500">Choose a batch.</p> : !view ? <Loading /> : (
                            <>
                                <div className="flex flex-wrap items-end gap-3 mb-3">
                                    <p className="text-sm"><b>{view.batch.batch_code}</b> · {view.batch.style_code} · stage {String(view.progress.status).toLowerCase().replace('_', ' ')} · route {view.route.map(r => r.name).join(' → ')}</p>
                                    <div className="ml-auto w-72"><Field label="Defect code (rework / reject)"><select className={inputCls} value={code} onChange={e => setCode(e.target.value)}><option value="">—</option>{codes.map(c => <option key={c.id} value={c.id}>{c.code} — {c.description}</option>)}</select></Field></div>
                                </div>
                                {!view.first && <p className="text-xs text-slate-600 mb-2">Loaded: {view.loads.length ? view.loads.map(l => `${l.size} → ${l.line}${l.status === 'COMPLETED' ? ' (done)' : ''}`).join(' · ') : 'nothing yet — the line loader loads sizes onto your line'}</p>}
                                {view.stage.unit === 'BUNDLE' && (
                                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
                                        <table className="w-full text-sm min-w-[820px]">
                                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Bundle</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2 text-right">To check</th><th className="px-3 py-2 text-right">OK</th><th className="px-3 py-2 text-right">Rework</th><th className="px-3 py-2">Check whole bundle</th></tr></thead>
                                            <tbody>{view.bundles.map(bu => (
                                                <tr key={bu.id} className="border-t border-slate-100">
                                                    <td className="px-3 py-2"><b>{bu.bundle_code}</b><span className="block text-xs text-slate-500">{bu.roll_no} · {bu.part_name} · {bu.size} · {bu.colour}</span>
                                                        {bu.waiting_earlier > 0 && <span className="block text-[11px] text-amber-700">{bu.waiting_earlier} piece(s) not cleared upstream — bundle waits</span>}
                                                        {bu.rejected_earlier > 0 && <span className="block text-[11px] text-rose-700">{bu.rejected_earlier} rejected upstream — repair them one by one below</span>}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{bu.piece_count}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-bold">{bu.pending}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{bu.approved}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{bu.rework || ''}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">{bu.pending > 0 && bu.waiting_earlier === 0 && <span className="flex gap-1">
                                                        <SecondaryButton onClick={() => act(() => productionApi.bundleCheck({ ...base(), bundle_ids: [bu.id], status: 'APPROVED' }), 'Approved')} disabled={busy}><CheckCircle2 size={13} /> OK</SecondaryButton>
                                                        <SecondaryButton onClick={() => needCode() && act(() => productionApi.bundleCheck({ ...base(), bundle_ids: [bu.id], status: 'NEEDS_REWORK', defect_code_id: code }), 'To rework')} disabled={busy}><Wrench size={13} /> Rework</SecondaryButton>
                                                        <SecondaryButton onClick={() => needCode() && act(() => productionApi.bundleCheck({ ...base(), bundle_ids: [bu.id], status: 'QC_REJECTED', defect_code_id: code }), 'Rejected')} disabled={busy}><XCircle size={13} /> Reject</SecondaryButton></span>}</td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                        <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Single pieces (re-cuts, pieces rejected upstream, reworked pieces) are handled below by picking their numbers.</p>
                                    </div>
                                )}
                                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                                    <table className="w-full text-sm min-w-[900px]">
                                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Roll · part · size · colour</th><th className="px-3 py-2 text-right">To check</th><th className="px-3 py-2 text-right">OK</th><th className="px-3 py-2 text-right">Rework</th><th className="px-3 py-2 text-right">Rejected</th><th className="px-3 py-2">Check</th></tr></thead>
                                        <tbody>
                                            {view.groups.map(g => {
                                                const n = Number(qty[g.key] || g.pending);
                                                const pk = picked(g);
                                                return [
                                                    <tr key={g.key} className="border-t border-slate-100 align-top">
                                                        <td className="px-3 py-2"><button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => setOpen({ ...open, [g.key]: !open[g.key] })}>{open[g.key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{g.roll_no} · {g.part_name} · {g.size} · {g.colour}</button>
                                                            {g.waiting_earlier > 0 && <span className="block text-[11px] text-amber-700">{g.waiting_earlier} not cleared at an earlier stage</span>}
                                                            {g.rejected_earlier > 0 && <span className="block text-[11px] text-rose-700">{g.rejected_earlier} rejected at an earlier stage — open the group, pick them, then Repaired (or Reject)</span>}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums font-bold">{g.pending}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{g.approved}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">{g.rework || ''}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-rose-700">{g.rejected || ''}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            {pk.length ? (
                                                                <span className="flex flex-wrap gap-1 items-center"><span className="text-xs">{pk.length} picked:</span>
                                                                    <SecondaryButton onClick={() => act(() => productionApi.check({ ...base(), status: 'APPROVED', piece_ids: pk }), 'Approved')} disabled={busy}><CheckCircle2 size={13} /> OK</SecondaryButton>
                                                                    <SecondaryButton onClick={() => needCode() && act(() => productionApi.check({ ...base(), status: 'NEEDS_REWORK', defect_code_id: code, piece_ids: pk }), 'To rework')} disabled={busy}><Wrench size={13} /> Rework</SecondaryButton>
                                                                    <SecondaryButton onClick={() => act(() => productionApi.repair({ ...base(), piece_ids: pk }), 'Repaired')} disabled={busy}>Repaired</SecondaryButton>
                                                                    <SecondaryButton onClick={() => needCode() && act(() => productionApi.check({ ...base(), status: 'QC_REJECTED', defect_code_id: code, piece_ids: pk }), 'Rejected')} disabled={busy}><XCircle size={13} /> Reject</SecondaryButton></span>
                                                            ) : g.pending > 0 && view.stage.unit !== 'BUNDLE' ? (
                                                                <span className="flex flex-wrap gap-1 items-center">
                                                                    <input className={`${inputCls} !w-16 !py-1`} type="number" min="1" max={g.pending} value={qty[g.key] ?? ''} placeholder={String(g.pending)} onChange={e => setQty({ ...qty, [g.key]: e.target.value })} aria-label="How many" />
                                                                    <SecondaryButton onClick={() => act(() => productionApi.check({ ...base(), status: 'APPROVED', ...groupBody(g, n) }), 'Approved')} disabled={busy}><CheckCircle2 size={13} /> OK</SecondaryButton>
                                                                    <SecondaryButton onClick={() => needCode() && act(() => productionApi.check({ ...base(), status: 'NEEDS_REWORK', defect_code_id: code, ...groupBody(g, n) }), 'To rework')} disabled={busy}><Wrench size={13} /> Rework</SecondaryButton>
                                                                    <SecondaryButton onClick={() => needCode() && act(() => productionApi.check({ ...base(), status: 'QC_REJECTED', defect_code_id: code, ...groupBody(g, n) }), 'Rejected')} disabled={busy}><XCircle size={13} /> Reject</SecondaryButton></span>
                                                            ) : g.rework > 0 ? <span className="text-xs text-amber-700">open the group to repair / reject reworked pieces</span> : <span className="text-xs text-slate-400">done</span>}
                                                        </td>
                                                    </tr>,
                                                    open[g.key] && (
                                                        <tr key={`${g.key}-p`} className="bg-slate-50"><td colSpan={6} className="px-3 py-2">
                                                            <div className="flex flex-wrap gap-1">{g.pieces.map(p => (
                                                                <label key={p.id} title={`${p.garment_no}${p.rejected_at ? ` — rejected at ${p.rejected_at}` : ''}`} className={`text-[11px] px-1.5 py-0.5 rounded border cursor-pointer ${STATUS_CLS[p.status] || (!p.gate_ok ? 'bg-slate-100 text-slate-400' : p.rejected_at ? 'bg-white border-rose-400 text-rose-700' : 'bg-white')} ${sel[p.id] ? 'ring-2 ring-indigo-500' : ''}`}>
                                                                    <input type="checkbox" className="hidden" disabled={!p.gate_ok || p.status === 'QC_REJECTED' || CLEAR(p.status)} checked={Boolean(sel[p.id])} onChange={e => setSel({ ...sel, [p.id]: e.target.checked })} />
                                                                    #{p.no}{p.replacement ? ' (re-cut)' : ''}{p.rejected_at ? ` ✗${p.rejected_at}` : ''}</label>
                                                            ))}</div>
                                                            <p className="mt-1 text-[11px] text-slate-500">Tap numbers to pick pieces (grey = waiting for an earlier stage). Amber = rework, red = rejected here, red outline = rejected at an earlier stage (Repaired here rescues it and cancels its re-cut). Re-cut pieces start at the stage that rejected the original.</p>
                                                        </td></tr>
                                                    ),
                                                ];
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
function CLEAR(s) { return s === 'APPROVED' || s === 'REPAIRED' || s === 'RECUT_CLEARED'; }

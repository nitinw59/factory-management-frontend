// Garment stage check (assembly onwards): one row per garment of the batch.
// A garment can be checked once its parts (and earlier garment stages) are
// cleared; a garment carrying a part rejected earlier is flagged — "Repaired"
// here rescues that part and cancels its re-cut (decision 10). Rejected is
// final: only a manager may change it, with a reason. Scan any piece label (or
// the garment number): the garment is picked only when all its parts are
// cleared at the earlier stages; a garment of another batch can be opened.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Wrench, XCircle, ScanLine, ShieldAlert } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const STATUS_CLS = { APPROVED: 'bg-emerald-100 text-emerald-800', REPAIRED: 'bg-emerald-50 text-emerald-700', NEEDS_REWORK: 'bg-amber-100 text-amber-800', QC_REJECTED: 'bg-rose-100 text-rose-800' };
const label = (s) => String(s || '').toLowerCase().replace('_', ' ');

export default function GarmentPanel({ batchId, stageId, lineId, codes, onDone, onOpenBatch }) {
    const [view, setView] = useState(null);
    const [perms, setPerms] = useState({});
    const [code, setCode] = useState('');
    const [sel, setSel] = useState({});
    const [scan, setScan] = useState('');
    const [found, setFound] = useState(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => { productionApi.permissions().then(res => setPerms(res.data)).catch(() => {}); }, []);
    const load = useCallback(() => productionApi.batchGarments(batchId, stageId).then(res => setView(res.data)).catch(err => setError(apiError(err, 'Failed to load the garments.'))), [batchId, stageId]);
    useEffect(() => { load(); }, [load]);
    if (!view) return error ? <ErrorBox text={error} /> : <Loading />;

    const ids = Object.keys(sel).filter(k => sel[k]);
    const picked = view.garments.filter(g => sel[g.id]);
    const base = () => ({ batch_id: batchId, stage_type_id: stageId, production_line_id: lineId, garment_ids: ids });
    const needCode = () => { if (!code) { setError('Choose the defect code first.'); return false; } return true; };
    const act = async (fn, what) => {
        setBusy(true); setError(''); setMsg('');
        try {
            const res = await fn();
            const n = res.data.checked ?? res.data.repaired;
            setMsg(`${what}: ${n} garment(s)${res.data.rescued_pieces ? ` · ${res.data.rescued_pieces} part(s) rejected earlier rescued (re-cut cancelled)` : ''}. Stage ${label(res.data.progress)}.`);
            setSel({}); setReason(''); load(); onDone?.();
        } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    // Scan a piece label (or type the garment number): the garment is picked only if all its parts are cleared earlier.
    const doScan = async (e) => {
        e.preventDefault(); setError(''); setMsg(''); setFound(null);
        const no = scan.trim(); if (!no) return;
        try {
            const d = (await productionApi.garmentLookup(no, stageId)).data;
            setScan('');
            if (d.batch_id !== String(batchId)) { setFound(d); return; }
            const a = d.at_stage;
            if (!a.gate_ok) { setError(`${d.garment_no} isn't ready: ${a.blocked_by.join(', ')} not cleared yet.`); return; }
            setSel({ [d.id]: true });
            if (a.status) setMsg(`${d.garment_no} is already ${label(a.status)} here.`);
            else if (a.flagged.length) setMsg(`${d.garment_no} picked — ${a.flagged.map(f => `${f.part_name} rejected at ${f.rejected_at}`).join(', ')}: repair it here (Repaired) or reject.`);
            else setMsg(`${d.garment_no} picked${d.scanned_part ? ` (scanned ${d.scanned_part})` : ''} — all parts cleared, ready to check.`);
        } catch (err) { setError(apiError(err, 'Not found.')); }
    };
    const rejectedPicked = picked.length > 0 && picked.every(g => g.status === 'QC_REJECTED');
    const canRepair = picked.length > 0 && picked.every(g => g.status === 'NEEDS_REWORK' || (!g.status && g.flagged.length));
    const c = view.counts;
    const sizes = [...new Set(view.garments.map(g => g.size))];

    return (
        <div>
            <div className="flex flex-wrap items-end gap-3 mb-3">
                <p className="text-sm"><b>{view.batch.batch_code}</b> · {view.batch.style_code} · stage {label(view.progress.status)} · route {view.route.map(r => r.name).join(' → ')}</p>
                <div className="ml-auto w-72"><Field label="Defect code (rework / reject)"><select className={inputCls} value={code} onChange={e => setCode(e.target.value)}><option value="">—</option>{codes.map(d => <option key={d.id} value={d.id}>{d.code} — {d.description}</option>)}</select></Field></div>
            </div>
            {!view.first && <p className="text-xs text-slate-600 mb-2">Loaded: {view.loads.length ? view.loads.map(l => `${l.size} → ${l.line}${l.status === 'COMPLETED' ? ' (done)' : ''}`).join(' · ') : 'nothing yet — the line loader loads sizes onto your line'}</p>}
            <p className="text-xs text-slate-600 mb-3">{c.total} garments · {c.pending} to check · {c.flagged ? <span className="text-rose-700">{c.flagged} flagged · </span> : ''}{c.waiting} waiting earlier stage · {c.approved} OK · {c.rework} rework · {c.rejected} rejected</p>
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}

            <form onSubmit={doScan} className="flex gap-2 items-end mb-3">
                <Field label="Scan piece label or garment number"><input className={`${inputCls} !w-80`} value={scan} onChange={e => setScan(e.target.value)} placeholder="scan any piece of the garment" autoFocus /></Field>
                <SecondaryButton type="submit"><ScanLine size={13} /> Find</SecondaryButton>
            </form>
            {found && (
                <div className="mb-3 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <b>{found.garment_no}</b> belongs to batch {found.batch_code} ({found.size} · {found.colour}) — {found.stages.length ? found.stages.map(s => `${s.name}: ${label(s.status)}${s.line ? ` (${s.line})` : ''}`).join(' · ') : 'not checked at any garment stage yet'}
                    {found.at_stage?.on_route === false ? <span className="block text-rose-700">This stage isn't on that batch's route.</span>
                        : found.at_stage && !found.at_stage.gate_ok ? <span className="block text-amber-700">Not ready here: {found.at_stage.blocked_by.join(', ')}</span>
                        : onOpenBatch && <button type="button" className="block mt-1 text-indigo-700 underline" onClick={() => onOpenBatch(found.batch_id)}>Open batch {found.batch_code}</button>}
                </div>
            )}

            <div className="sticky top-0 z-10 bg-white border border-slate-200 rounded-xl px-3 py-2 mb-3 flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold">{ids.length ? `${ids.length} picked` : 'Pick garments below'}</span>
                {ids.length > 0 && !rejectedPicked && <>
                    <SecondaryButton onClick={() => act(() => productionApi.garmentCheck({ ...base(), status: 'APPROVED' }), 'Approved')} disabled={busy}><CheckCircle2 size={13} /> OK</SecondaryButton>
                    <SecondaryButton onClick={() => needCode() && act(() => productionApi.garmentCheck({ ...base(), status: 'NEEDS_REWORK', defect_code_id: code }), 'To rework')} disabled={busy}><Wrench size={13} /> Rework</SecondaryButton>
                    {canRepair && <SecondaryButton onClick={() => act(() => productionApi.garmentRepair(base()), 'Repaired')} disabled={busy}>Repaired</SecondaryButton>}
                    <SecondaryButton onClick={() => needCode() && act(() => productionApi.garmentCheck({ ...base(), status: 'QC_REJECTED', defect_code_id: code }), 'Rejected')} disabled={busy}><XCircle size={13} /> Reject</SecondaryButton>
                </>}
                {rejectedPicked && (perms.override ? <>
                    <input className={`${inputCls} !w-72 !py-1`} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason to override the rejection" aria-label="Override reason" />
                    <SecondaryButton onClick={() => { if (!reason.trim()) { setError('Give the reason for the override.'); return; } act(() => productionApi.garmentCheck({ ...base(), status: 'APPROVED', override_reason: reason.trim() }), 'Overridden to approved'); }} disabled={busy}><ShieldAlert size={13} /> Override → OK</SecondaryButton>
                </> : <span className="text-xs text-rose-700">Rejected is final — only a manager can override it.</span>)}
                {ids.length > 0 && <button type="button" className="ml-auto text-xs text-slate-500 underline" onClick={() => setSel({})}>clear</button>}
            </div>

            {sizes.map(size => (
                <div key={size} className="bg-white border border-slate-200 rounded-xl mb-3 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-500 bg-slate-50">Size {size}</p>
                    <div className="divide-y divide-slate-100">{view.garments.filter(g => g.size === size).map(g => {
                        const disabled = !g.gate_ok || g.status === 'APPROVED' || g.status === 'REPAIRED';
                        return (
                            <label key={g.id} className={`flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm ${disabled ? 'text-slate-400' : 'cursor-pointer hover:bg-slate-50'} ${sel[g.id] ? 'bg-indigo-50' : ''}`}>
                                <input type="checkbox" disabled={disabled} checked={Boolean(sel[g.id])} onChange={e => setSel({ ...sel, [g.id]: e.target.checked })} />
                                <span className="font-mono text-xs">{g.garment_no}</span>
                                <span className="text-xs text-slate-500">{g.colour}</span>
                                {g.status && <span className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_CLS[g.status]}`}>{label(g.status)}</span>}
                                {!g.gate_ok && <span className="text-[11px] text-amber-700">waiting: {g.blocked_by.join(', ')}</span>}
                                {!g.status && g.flagged.length > 0 && <span className="text-[11px] text-rose-700">⚑ {g.flagged.map(f => `${f.part_name} rejected at ${f.rejected_at}`).join(', ')} — Repaired rescues it</span>}
                                {g.parts.some(p => p.replacement) && <span className="text-[11px] text-slate-500">has re-cut part</span>}
                            </label>
                        );
                    })}</div>
                </div>
            ))}
            <p className="text-[11px] text-slate-500">Grey = waiting for an earlier stage. A workstation set for one garment at a time (2.0) checks one garment per action.</p>
        </div>
    );
}

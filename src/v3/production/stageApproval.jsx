// Stage completion over rejected pieces (18 Oct 2026 — "it must not complete. On clicking Check and complete show
// popup which asks approval from floor in-charge or QA … send notification for approval. Once approved clear batch
// else show notification of rejection"). Three parts:
//   CompletionDialog     — Check & complete: completes the stage, or sends the rejections for approval and waits
//   StageApprovalCenter  — on every 3.0 screen: QA / floor in-charge get a popup per request (websocket), approve or
//                          reject; everyone gets a notice when their request is decided
//   CompletionsPage      — /v3/production/completions: waiting and decided requests
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Bell, X } from 'lucide-react';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { useV3Live, useV3Message } from '../live';
import { PageHeader, ErrorBox, Loading, inputCls } from '../components/ui';

export const APPROVER_ROLES = ['quality_manager', 'floor_incharge'];
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const ItemChips = ({ items }) => (
    <div className="flex flex-wrap gap-1.5">{(items || []).map(x => (
        <span key={x.id} title={x.uid || ''} className="text-xs font-bold px-2 py-1 rounded-lg bg-rose-50 border border-rose-300 text-rose-800">{x.label}{x.dropped ? ' · given up' : ''}</span>
    ))}</div>
);

// Check & complete for one batch × stage.
export function CompletionDialog({ batch, stageId, stageName, onClose, onDone }) {
    const [d, setD] = useState(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const load = useCallback(() => productionApi.completion(batch.id, stageId).then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [batch.id, stageId]);
    useEffect(() => { load(); }, [load]);
    useV3Message((m) => { if (m.type === 'V3_STAGE_APPROVAL_DECIDED' && d?.request && m.request.id === d.request.id) { load(); onDone?.(); } });
    const go = async () => {
        setBusy(true); setError(''); setMsg('');
        try {
            const r = await productionApi.requestCompletion(batch.id, stageId, note.trim() || undefined);
            if (r.data.completed) { setMsg(`${stageName} completed for batch #${batch.floor_no}.`); onDone?.(); }
            else if (r.data.pending) setMsg(r.data.created ? 'Sent to QA and the floor in-charge — you\'ll be notified when they decide.' : 'Already waiting for approval.');
            else setMsg(`${stageName} is ${String(r.data.status).toLowerCase().replace('_', ' ')}.`);
            load();
        } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const rq = d?.request;
    const waiting = rq?.status === 'PENDING';
    return (
        <Modal title={`Check & complete — ${stageName}, batch #${batch.floor_no}`} onClose={onClose}>
            <div className="w-[min(620px,92vw)] space-y-4 p-1">
                <ErrorBox text={error} />
                {!d ? (!error && <Loading />) : !d.all_checked ? (
                    <p className="text-base font-bold text-amber-800 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">Not every piece of {stageName} is checked yet — the stage can't be completed. (See "Why isn't this stage complete?" on the stage check.)</p>
                ) : d.status === 'COMPLETED' && !d.needs_approval ? (
                    <p className="text-base font-bold text-emerald-800 bg-emerald-50 border-2 border-emerald-300 rounded-xl px-4 py-3 flex items-center gap-2"><CheckCircle2 size={20} /> {stageName} is completed for batch #{batch.floor_no}.</p>
                ) : !d.needs_approval ? (
                    <p className="text-base font-bold text-slate-700">Every piece is checked and nothing is rejected — the stage can be completed.</p>
                ) : (<>
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-xl px-4 py-3">
                        <p className="text-base font-black text-rose-800 flex items-center gap-2"><ShieldCheck size={20} /> {d.held.length} rejected — approval needed</p>
                        <p className="text-sm text-rose-700 mb-2">Every piece is checked, but {d.held.length} {d.held.length === 1 ? 'is' : 'are'} rejected. The stage completes only when the quality manager or the floor in-charge approves.</p>
                        <ItemChips items={d.held} />
                    </div>
                    {rq && rq.status === 'REJECTED' && (
                        <p className="text-sm font-bold text-rose-800 bg-white border-2 border-rose-300 rounded-xl px-4 py-3 flex gap-2"><XCircle size={18} className="shrink-0" /> Last request rejected by {rq.decided_by || 'an approver'} ({when(rq.decided_at)}): “{rq.decision_note}”</p>
                    )}
                    {waiting ? (
                        <p className="text-base font-bold text-indigo-800 bg-indigo-50 border-2 border-indigo-300 rounded-xl px-4 py-3 flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Waiting for approval — sent {when(rq.created_at)}{rq.requested_by ? ` by ${rq.requested_by}` : ''}. You'll be notified.</p>
                    ) : (
                        <input className={`${inputCls} !py-3 !text-base`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Note for QA / floor in-charge (optional)" />
                    )}
                </>)}
                {msg && <p className="text-sm font-bold text-emerald-700">{msg}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-5 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold">Close</button>
                    {d && d.all_checked && (d.status !== 'COMPLETED' || d.needs_approval) && !waiting && (
                        <button type="button" onClick={go} disabled={busy} className={`px-6 py-3 rounded-xl font-black text-white flex items-center gap-2 disabled:opacity-40 ${d.needs_approval ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                            {busy && <Loader2 size={16} className="animate-spin" />}{d.needs_approval ? 'Send for approval' : 'Complete stage'}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}

function DecideBox({ rq, onDecided, compact = false }) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    const decide = async (approve) => {
        if (!approve && !note.trim()) { setError('Give the reason for rejecting.'); return; }
        setBusy(approve ? 'a' : 'r'); setError('');
        try { await (approve ? productionApi.approveCompletion(rq.id, note.trim() || undefined) : productionApi.rejectCompletion(rq.id, note.trim())); onDecided?.(); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(null); }
    };
    return (
        <div className="space-y-3">
            <div className={compact ? '' : 'bg-slate-50 rounded-xl p-3'}>
                <p className="text-sm text-slate-700"><b className="text-lg font-black text-slate-900">Batch #{rq.floor_no}</b> · {rq.batch_code} · {rq.style_code}</p>
                <p className="text-base font-black text-slate-800">{rq.stage === 'Cutting' ? 'Numbering' : rq.stage}: {rq.items.length} rejected</p>
                <p className="text-xs text-slate-500 mb-2">Asked by {rq.requested_by || '—'} · {when(rq.created_at)}{rq.note ? ` · “${rq.note}”` : ''}</p>
                <ItemChips items={rq.items} />
            </div>
            <input className={`${inputCls} !py-3`} value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Note (required to reject)" />
            <ErrorBox text={error} />
            <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => decide(false)} disabled={Boolean(busy)} className="py-3.5 rounded-xl bg-rose-600 text-white font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">{busy === 'r' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={18} />} Reject</button>
                <button type="button" onClick={() => decide(true)} disabled={Boolean(busy)} className="py-3.5 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">{busy === 'a' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={18} />} Approve</button>
            </div>
        </div>
    );
}

// Mounted once in the 3.0 layout.
export function StageApprovalCenter({ me }) {
    const approver = (me?.roles || []).some(r => APPROVER_ROLES.includes(r));
    const [pending, setPending] = useState([]);
    const [open, setOpen] = useState(false);
    const [notices, setNotices] = useState([]);
    const load = useCallback(() => { if (approver) productionApi.completionRequests({ status: 'PENDING' }).then(r => setPending(r.data)).catch(() => {}); }, [approver]);
    useEffect(() => { load(); }, [load]);
    useV3Live(load, approver);   // back-up refresh (a missed message, reconnect)
    useV3Message((m) => {
        if (m.type === 'V3_STAGE_APPROVAL' && approver) { setPending(p => (p.some(x => x.id === m.request.id) ? p : [...p, m.request])); setOpen(true); }
        if (m.type === 'V3_STAGE_APPROVAL_CLOSED') setPending(p => p.filter(x => x.id !== m.id));
        if (m.type === 'V3_STAGE_APPROVAL_DECIDED') {
            const id = `${m.request.id}-${m.request.status}`;
            setNotices(n => (n.some(x => x.id === id) ? n : [...n, { id, rq: m.request }]));
        }
    });
    const first = pending[0];
    return createPortal(
        <>
            {approver && pending.length > 0 && !open && (
                <button type="button" onClick={() => setOpen(true)} className="fixed right-4 bottom-4 z-[450] flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-rose-600 text-white font-black shadow-2xl animate-pulse">
                    <Bell size={18} /> {pending.length} stage approval{pending.length === 1 ? '' : 's'} waiting
                </button>
            )}
            {approver && open && first && (
                <div className="fixed inset-0 z-[460] bg-black/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-[min(600px,94vw)] overflow-hidden">
                        <div className="bg-rose-600 text-white px-5 py-4 flex items-center gap-3">
                            <ShieldCheck size={22} /><p className="text-lg font-black uppercase tracking-tight flex-1">Approve stage completion?</p>
                            {pending.length > 1 && <span className="text-xs font-black bg-white/20 px-2 py-1 rounded-lg">1 of {pending.length}</span>}
                            <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg bg-white/10" aria-label="Later"><X size={18} /></button>
                        </div>
                        <div className="p-5"><DecideBox key={first.id} rq={first} onDecided={() => { setPending(p => p.filter(x => x.id !== first.id)); if (pending.length <= 1) setOpen(false); }} /></div>
                    </div>
                </div>
            )}
            {notices.length > 0 && (
                <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[470] space-y-2 w-[min(560px,94vw)]">
                    {notices.map(({ id, rq }) => (
                        <div key={id} className={`rounded-2xl shadow-2xl px-5 py-4 text-white flex gap-3 ${rq.status === 'APPROVED' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                            {rq.status === 'APPROVED' ? <CheckCircle2 size={22} className="shrink-0" /> : <XCircle size={22} className="shrink-0" />}
                            <div className="flex-1 min-w-0">
                                <p className="font-black">{rq.status === 'APPROVED' ? 'Approved' : 'Rejected'}: batch #{rq.floor_no} {rq.stage === 'Cutting' ? 'numbering' : rq.stage}</p>
                                <p className="text-sm opacity-90">{rq.status === 'APPROVED' ? `${rq.decided_by || 'Approver'} approved ${rq.items.length} rejected — the stage is completed.` : `${rq.decided_by || 'Approver'}: “${rq.decision_note}” — the stage stays open.`}</p>
                            </div>
                            <button type="button" onClick={() => setNotices(n => n.filter(x => x.id !== id))} className="p-1 rounded-lg bg-white/10 self-start" aria-label="Dismiss"><X size={16} /></button>
                        </div>
                    ))}
                </div>
            )}
        </>,
        document.body,
    );
}

const ST = { PENDING: ['Waiting', 'bg-indigo-50 text-indigo-800 border-indigo-300'], APPROVED: ['Approved', 'bg-emerald-50 text-emerald-800 border-emerald-300'], REJECTED: ['Rejected', 'bg-rose-50 text-rose-800 border-rose-300'], CANCELLED: ['Cancelled', 'bg-slate-50 text-slate-500 border-slate-300'] };

export default function CompletionsPage() {
    const [status, setStatus] = useState('PENDING');
    const [rows, setRows] = useState(null);
    const [perms, setPerms] = useState({});
    const [open, setOpen] = useState(null);
    const [error, setError] = useState('');
    const load = useCallback(() => productionApi.completionRequests({ status }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [status]);
    useEffect(() => { load(); productionApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, [load]);
    useV3Live(load);
    return (
        <div>
            <PageHeader title="Stage completions" subtitle="A stage whose pieces are all checked but some are rejected completes only when the quality manager or the floor in-charge approves. Requests come from Check & complete."
                actions={<select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="PENDING">Waiting</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All</option></select>} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl px-4 py-8 text-center">Nothing here.</p> : (
                <div className="space-y-3">{rows.map(r => (
                    <div key={r.id} className="bg-white border-2 border-slate-200 rounded-2xl p-4">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                            <b className="text-lg font-black">Batch #{r.floor_no}</b><span className="text-sm text-slate-500">{r.batch_code} · {r.style_code}</span>
                            <span className="font-black text-slate-800">{r.stage === 'Cutting' ? 'Numbering' : r.stage}: {r.items.length} rejected</span>
                            <span className={`ml-auto text-[11px] font-black px-2 py-0.5 rounded border ${ST[r.status][1]}`}>{ST[r.status][0]}</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">Asked by {r.requested_by || '—'} · {when(r.created_at)}{r.note ? ` · “${r.note}”` : ''}{r.decided_by ? ` · ${r.status === 'APPROVED' ? 'approved' : 'rejected'} by ${r.decided_by} ${when(r.decided_at)}${r.decision_note ? ` — “${r.decision_note}”` : ''}` : ''}</p>
                        <ItemChips items={r.items} />
                        {r.status === 'PENDING' && perms.approveCompletion && (open === r.id
                            ? <div className="mt-3 border-t border-slate-100 pt-3"><DecideBox rq={r} compact onDecided={() => { setOpen(null); load(); }} /></div>
                            : <button type="button" onClick={() => setOpen(r.id)} className="mt-3 px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-black uppercase tracking-widest">Decide</button>)}
                    </div>
                ))}</div>
            )}
        </div>
    );
}

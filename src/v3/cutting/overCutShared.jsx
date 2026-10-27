// Over-cut (20 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Over-cut and trims"): garments cut above the order per colour ×
// size. Up to the free limit (1 % of the ordered quantity, rounded down) no approval; above it the cutting manager gives
// the reason at finalise and the merchandiser approves (trims from free stock) or refuses (garments written off).
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import Modal from '../../shared/Modal';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';

export const OVER_STATUS = {
    WITHIN: ['Within the free limit', 'bg-emerald-50 text-emerald-800 border-emerald-300'],
    PENDING: ['Waiting for the merchandiser', 'bg-amber-50 text-amber-800 border-amber-300'],
    APPROVED: ['Approved', 'bg-emerald-50 text-emerald-800 border-emerald-300'],
    REFUSED: ['Refused — written off', 'bg-rose-50 text-rose-700 border-rose-300'],
};
export const OverStatus = ({ s }) => (OVER_STATUS[s] ? <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${OVER_STATUS[s][1]}`}>{OVER_STATUS[s][0]}</span> : null);

// The colour × size table: ordered, earlier batches, this batch (within / free / above the limit).
export function OverCutCells({ cells }) {
    const rows = (cells || []).filter(c => c.free + c.approval > 0);
    if (!rows.length) return null;
    return (
        <table className="w-full text-sm">
            <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><tr><th className="py-1 text-left">Colour · size</th><th className="py-1">Ordered</th><th className="py-1" title="On earlier finalised batches">Earlier</th><th className="py-1">This batch</th><th className="py-1">Within</th><th className="py-1" title="Over-cut up to the free limit — no approval">Free</th><th className="py-1" title="Over-cut above the free limit">Above limit</th></tr></thead>
            <tbody>{rows.map(c => (
                <tr key={`${c.colour_id}|${c.size_id}`} className="border-t border-slate-100 text-right tabular-nums">
                    <td className="py-1 text-left">{c.colour} · <b>{c.size}</b></td><td className="py-1">{c.ordered}</td><td className="py-1">{c.before || '—'}</td><td className="py-1 font-semibold">{c.cut}</td>
                    <td className="py-1">{c.within}</td><td className="py-1 text-emerald-700">{c.free ? `+${c.free}` : '—'}<span className="block text-[10px] text-slate-400">limit {c.limit}</span></td>
                    <td className={`py-1 ${c.approval ? 'text-rose-700 font-bold' : ''}`}>{c.approval ? `+${c.approval}` : '—'}</td>
                </tr>
            ))}</tbody>
        </table>
    );
}

// Approve / refuse (merchandiser, factory admin).
export function DecideOverCut({ batchId, onDone, compact = false }) {
    const [mode, setMode] = useState(null);   // 'approve' | 'refuse'
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setBusy(true); setError('');
        try { const r = mode === 'approve' ? await cuttingApi.approveOverCut(batchId, text) : await cuttingApi.refuseOverCut(batchId, text); setMode(null); onDone(r.data); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <>
            <span className={`inline-flex gap-2 ${compact ? '' : 'mt-2'}`}>
                <PrimaryButton onClick={() => { setText(''); setError(''); setMode('approve'); }}><CheckCircle2 size={14} /> Approve</PrimaryButton>
                <SecondaryButton onClick={() => { setText(''); setError(''); setMode('refuse'); }}><XCircle size={14} /> Refuse</SecondaryButton>
            </span>
            {mode && (
                <Modal title={mode === 'approve' ? 'Approve the over-cut' : 'Refuse the over-cut'} onClose={() => setMode(null)}>
                    <div className="w-[min(480px,92vw)] space-y-3">
                        <p className="text-sm text-slate-600">{mode === 'approve'
                            ? 'Their trims are handed from the store\'s free stock (not the order\'s allocation). The garments go on as usual; surplus goes to the factory outlet at close.'
                            : 'The garments above the limit get no trims and are written off — they drop out of every stage. Their fabric shows on the fabric reconciliation. This can\'t be undone.'}</p>
                        <Field label={mode === 'approve' ? 'Note (optional)' : 'Reason'}><textarea className={inputCls} rows={3} value={text} onChange={e => setText(e.target.value)} /></Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setMode(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={save} busy={busy} disabled={busy || (mode === 'refuse' && !text.trim())}>{mode === 'approve' ? 'Approve' : 'Refuse and write off'}</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </>
    );
}

// On the batch: the preview while cutting, the kept decision once finalised.
export function OverCutPanel({ oc, batchId, canDecide, onDecided }) {
    if (!oc || (oc.preview && oc.free + oc.approval === 0)) return null;
    const free = oc.preview ? oc.free : oc.free_garments, above = oc.preview ? oc.approval : oc.approval_garments;
    const pct = oc.preview ? oc.pct : oc.free_pct;
    const tone = above > 0 && oc.status !== 'APPROVED' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white';
    return (
        <div className={`mb-4 rounded-xl border px-4 py-3 ${tone}`}>
            <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-black text-slate-800 flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-600" /> Over-cut against the order</p>
                {!oc.preview && <OverStatus s={oc.status} />}
                {canDecide && oc.status === 'PENDING' && <span className="ml-auto"><DecideOverCut batchId={batchId} onDone={onDecided} compact /></span>}
            </div>
            <p className="text-sm text-slate-700 mb-2">
                {oc.preview ? 'Finalising now gives: ' : ''}<b>{free}</b> garment(s) within {pct} % (no approval){above > 0 ? <>, <b className="text-rose-700">{above}</b> above it — {oc.preview ? 'you give the reason at finalise; their trims are kitted at once (free stock) — the merchandiser approves the garments or they are written off' : oc.status === 'PENDING' ? 'waiting for the merchandiser (the trim kit does not wait)' : oc.status === 'APPROVED' ? 'approved' : 'refused and written off'}</> : ''}.
                {' '}Trims for over-cut garments come from the store's free stock, never the order's allocation.
            </p>
            <OverCutCells cells={oc.cells} />
            {!oc.preview && (oc.cut_reason || oc.decision_note) && (
                <p className="text-xs text-slate-600 mt-2">{oc.cut_reason ? <>Cutting: <i>{oc.cut_reason}</i>{oc.created_by_name ? ` — ${oc.created_by_name}` : ''}</> : null}
                    {oc.decision_note ? <><br />{oc.status === 'REFUSED' ? 'Refused' : 'Approved'}: <i>{oc.decision_note}</i>{oc.decided_by_name ? ` — ${oc.decided_by_name}` : ''}</> : null}</p>
            )}
        </div>
    );
}

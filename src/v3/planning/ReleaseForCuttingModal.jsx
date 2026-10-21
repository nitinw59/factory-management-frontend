// Release a not-ready order for cutting (19 Oct 2026, SALES_ORDER_V3_PLAN.md §10.5 / MATERIAL_PLANNING_V3_PLAN.md):
// "merchandiser when tap release for cutting open modal and asked to upload documents" — a signed PPM for every
// active order line ("separate ppm for each order line") and an undertaking signed by the fabric store, trim store,
// floor in-charge or factory admin, uploaded here for this release. Items on no requisition and no PO line get a strong
// warning (warn only).
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

function FilePick({ label, busy, onPick }) {
    return (
        <label className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 bg-white ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-indigo-50'}`}>
            <Upload size={13} />{label}
            <input type="file" accept={ACCEPT} className="hidden" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
        </label>
    );
}

// order: { id, order_no }; readiness: the page's readiness (items_total / items_allocated)
export default function ReleaseForCuttingModal({ order, readiness, onClose, onDone }) {
    const [chk, setChk] = useState(null);
    const [undertaking, setUndertaking] = useState(null);   // { id, display_name } uploaded in this modal
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState('');                   // '' | 'ppm:<lineId>' | 'undertaking' | 'release'
    const [error, setError] = useState('');
    const loadCheck = () => planningApi.releaseCheck(order.id).then(r => setChk(r.data)).catch(err => setError(apiError(err, 'Failed to load the release check.')));
    useEffect(() => { loadCheck(); }, [order.id]);   // eslint-disable-line react-hooks/exhaustive-deps

    const uploadPpm = async (line, file) => {
        setBusy(`ppm:${line.id}`); setError('');
        try { await salesOrdersApi.uploadDocument(order.id, { file, doc_type: 'PPM', line_id: line.id }); await loadCheck(); }
        catch (err) { setError(apiError(err, 'Failed to upload the PPM.')); } finally { setBusy(''); }
    };
    const uploadUndertaking = async (file) => {
        setBusy('undertaking'); setError('');
        try {
            const res = await salesOrdersApi.uploadDocument(order.id, { file, doc_type: 'UNDERTAKING' });
            const docs = (res.data.documents || []).filter(d => d.doc_type === 'UNDERTAKING');
            const newest = docs.reduce((a, d) => (!a || Number(d.id) > Number(a.id) ? d : a), null);
            setUndertaking(newest ? { id: newest.id, display_name: newest.display_name, version: newest.version } : null);
        } catch (err) { setError(apiError(err, 'Failed to upload the undertaking.')); } finally { setBusy(''); }
    };
    const release = async () => {
        setBusy('release'); setError('');
        try { const res = await planningApi.overrideReadiness(order.id, reason.trim(), undertaking.id); onDone(res.data); }
        catch (err) { setError(apiError(err, 'Failed to release.')); setBusy(''); }
    };

    const missing = chk ? chk.lines.filter(l => !l.ppm).length : 0;
    const ready = chk && !missing && undertaking && reason.trim();
    return (
        <Modal title={`Release ${order.order_no} for cutting`} onClose={onClose}>
            <div className="space-y-4 w-[min(640px,92vw)]">
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {readiness.items_total - readiness.items_allocated} of {readiness.items_total} items are not allocated from stock. Releasing lets cutting start anyway; it needs a signed PPM for every order line and a signed undertaking, and is logged with your name and reason.
                </p>
                {!chk ? (!error && <Loading />) : (<>
                    {chk.unplanned.length > 0 && (
                        <div className="rounded-lg border-2 border-rose-300 bg-rose-50 px-3 py-2">
                            <p className="text-sm font-black text-rose-800 flex items-center gap-1.5"><AlertTriangle size={15} />{chk.unplanned.length} item{chk.unplanned.length === 1 ? ' is' : 's are'} on no requisition and no purchase order</p>
                            <p className="text-xs text-rose-700 mt-0.5">Nobody is buying these yet. Cutting may stop when they are needed.</p>
                            <ul className="mt-1.5 text-xs text-rose-900 space-y-0.5 max-h-32 overflow-y-auto">
                                {chk.unplanned.map(u => <li key={`${u.kind}:${u.item_id}`}><b>{u.kind === 'FABRIC' ? 'Fabric' : 'Trim'}</b> · {u.label} — {fmt(u.to_raise, u.uom)} {u.uom} to raise</li>)}
                            </ul>
                        </div>
                    )}
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Signed PPM — one per order line</p>
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                            {chk.lines.map(l => (
                                <div key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                                    <b className="text-slate-800">L{l.line_no}</b><span className="text-slate-600">{l.style_code}</span>
                                    {l.ppm
                                        ? <span className="text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13} />{l.ppm.display_name} v{l.ppm.version}</span>
                                        : <span className="text-xs font-bold text-rose-700">PPM missing</span>}
                                    <span className="ml-auto"><FilePick label={l.ppm ? 'Upload newer' : 'Upload PPM'} busy={Boolean(busy)} onPick={(f) => uploadPpm(l, f)} /></span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Undertaking</p>
                        <div className="flex flex-wrap items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                            {undertaking
                                ? <span className="text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13} />{undertaking.display_name}{undertaking.version ? ` v${undertaking.version}` : ''}</span>
                                : <span className="text-xs text-slate-600">Signed by the fabric store, trim store, floor in-charge or factory admin — upload it for this release.</span>}
                            <span className="ml-auto"><FilePick label={undertaking ? 'Replace' : 'Upload undertaking'} busy={Boolean(busy)} onPick={uploadUndertaking} /></span>
                        </div>
                    </div>
                    <Field label="Reason *"><textarea className={`${inputCls} min-h-[70px]`} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} /></Field>
                </>)}
                <ErrorBox text={error} />
                <div className="flex items-center justify-end gap-2">
                    {chk && (missing > 0 || !undertaking) && <span className="mr-auto text-xs font-semibold text-slate-500">{[missing ? `${missing} PPM${missing === 1 ? '' : 's'} missing` : '', !undertaking ? 'undertaking missing' : ''].filter(Boolean).join(' · ')}</span>}
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={release} busy={busy === 'release'} disabled={Boolean(busy) || !ready}>Release for cutting</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}

// One store issue slip: who / what it went to, lines with cost and value,
// returns (unused items back into stock, with a reason), PDF.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Undo2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { storeApi } from '../api/storeApi';
import { adminApi } from '../../api/adminApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { TARGET_LABEL, inr, fmt, useStorePermissions, exportIssueSlipPdf } from './storeShared';

export default function IssueSlipPage() {
    const { id } = useParams();
    const perms = useStorePermissions();
    const [s, setS] = useState(null);
    const [error, setError] = useState('');
    const [ret, setRet] = useState(null);
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => storeApi.issue(id).then(res => setS(res.data)).catch(err => setError(apiError(err, 'Failed to load the slip.'))), [id]);
    useEffect(() => { load(); }, [load]);
    if (!s) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const pdf = async () => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* letterhead is optional */ }
        exportIssueSlipPdf(s, company);
    };
    const saveReturn = async () => {
        setBusy(true); setFormError('');
        try {
            const res = await storeApi.returnIssue(id, { reason: ret.reason, lines: Object.entries(ret.qty).filter(([, q]) => Number(q) > 0).map(([lineId, q]) => ({ issue_line_id: lineId, qty: Number(q) })) });
            setS(res.data); setRet(null);
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const canReturn = perms.stock && s.lines.some(l => l.open_qty > 0);

    return (
        <div>
            <Link to="/v3/store/issues" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Issue slips</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{s.issue_no}</h1>
                {s.recover_from_salary && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">Recover from salary</span>}
                <span className="text-sm text-slate-500">{fmtDate(s.issue_date)} · issued by {s.issued_by_name || '—'}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs font-bold text-slate-500">Issued to ({TARGET_LABEL[s.target_type]})</p><p className="font-semibold">{s.target_name}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Department</p><p className="font-semibold">{s.department_name || '—'}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Purpose</p><p>{s.purpose || '—'}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Value</p><p className="font-black">₹{inr(s.net_value)}{s.returned_value > 0 && <span className="block text-xs font-normal text-slate-500">₹{inr(s.total_value)} issued − ₹{inr(s.returned_value)} returned</span>}</p></div>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
                {canReturn && <SecondaryButton onClick={() => { setFormError(''); setRet({ reason: '', qty: {} }); }}><Undo2 size={14} /> Return items</SecondaryButton>}
                <SecondaryButton onClick={pdf}><FileDown size={14} /> PDF</SecondaryButton>
            </div>
            <ErrorBox text={error} />
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Issued</th><th className="px-3 py-2.5 text-right">Returned</th><th className="px-3 py-2.5 text-right">Rate ₹</th><th className="px-3 py-2.5 text-right">Value ₹</th><th className="px-3 py-2.5">Note</th></tr>
                    </thead>
                    <tbody>
                        {s.lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100">
                                <td className="px-3 py-2">{l.line_no}</td>
                                <td className="px-3 py-2"><Link to={`/v3/store/items/${l.store_item_id}`} className="font-semibold text-indigo-700 hover:underline">{l.label}</Link></td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(l.qty, l.uom)} {l.uom}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.returned_qty ? `${fmt(l.returned_qty, l.uom)} ${l.uom}` : '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.unit_cost)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.value)}</td>
                                <td className="px-3 py-2 text-xs text-slate-500">{l.notes || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {s.returns.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Returns</p>
                    {s.returns.map(r => <p key={r.id} className="text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(r.created_at).toLocaleString()}</span>Line {r.line_no}: {fmt(r.qty)} back{r.user_name ? ` · ${r.user_name}` : ''} — {r.reason}</p>)}
                </div>
            )}
            {ret && (
                <Modal title={`Return items — ${s.issue_no}`} onClose={() => setRet(null)}>
                    <div className="space-y-3 w-[min(520px,90vw)]">
                        {s.lines.filter(l => l.open_qty > 0).map(l => (
                            <div key={l.id} className="flex items-center gap-2 text-sm">
                                <span className="flex-1">{l.label} <span className="text-xs text-slate-500">(up to {fmt(l.open_qty, l.uom)} {l.uom})</span></span>
                                <input className={`${inputCls} !w-28 !py-1`} type="number" min="0" max={l.open_qty} step="any" value={ret.qty[l.id] || ''} onChange={e => setRet({ ...ret, qty: { ...ret.qty, [l.id]: e.target.value } })} aria-label={`Return ${l.label}`} />
                            </div>
                        ))}
                        <Field label="Reason *"><input className={inputCls} value={ret.reason} onChange={e => setRet({ ...ret, reason: e.target.value })} placeholder="Not used, wrong size…" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setRet(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveReturn} busy={busy} disabled={busy || !ret.reason.trim() || !Object.values(ret.qty).some(q => Number(q) > 0)}>Return to stock</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

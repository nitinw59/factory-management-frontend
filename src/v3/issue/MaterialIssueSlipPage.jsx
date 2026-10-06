// One material issue slip: order, stage, receiver, lines (rolls for fabric),
// returns from production (fabric back to its roll), PDF.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Undo2, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from '../../shared/Modal';
import { materialIssueApi } from '../api/materialIssueApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { useAuth } from '../../context/AuthContext';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });

function pdf(s) {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(`MATERIAL ISSUE SLIP  ${s.issue_no}`, 14, 16); doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`Date: ${s.issue_date.split('-').reverse().join('/')}   Order: ${s.order_no} (${s.customer_name})   Stage: ${s.stage}`, 14, 23);
    doc.text(`Received by: ${s.received_by}${s.department_name ? `   Department: ${s.department_name}` : ''}   Issued by: ${s.issued_by_name || '—'}`, 14, 28);
    autoTable(doc, {
        startY: 33, head: [['#', 'Item', 'Qty', 'Returned', 'Rolls']],
        body: s.lines.map(l => [l.line_no, `${l.label}${l.mixed_lots ? ' (MIXED DYE LOTS)' : ''}`, `${fmt(l.qty, l.uom)} ${l.uom}`, l.returned_qty ? fmt(l.returned_qty, l.uom) : '', l.rolls.map(r => `${r.roll_no}${r.dye_lot ? `/${r.dye_lot}` : ''}: ${fmt(r.qty)}`).join(', ')]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] },
    });
    const y = doc.lastAutoTable.finalY + 22;
    doc.text('Issued by', 14, y); doc.text('Received by', 90, y); doc.text('Checked by', 160, y);
    doc.save(`MaterialIssue-${s.issue_no.replace(/[^\w-]+/g, '-')}.pdf`);
}

export default function MaterialIssueSlipPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const [s, setS] = useState(null);
    const [error, setError] = useState('');
    const [ret, setRet] = useState(null);
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => materialIssueApi.issue(id).then(res => setS(res.data)).catch(err => setError(apiError(err, 'Failed to load the slip.'))), [id]);
    useEffect(() => { load(); }, [load]);
    if (!s) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const role = user?.role;
    const mayKind = (k) => role === 'factory_admin' || (k === 'FABRIC' ? role === 'fabric_store_manager' : role === 'store_manager');
    const returnable = s.lines.filter(l => l.open_qty > 0 && mayKind(l.kind));
    const saveReturn = async () => {
        setBusy(true); setFormError('');
        const lines = returnable.flatMap(l => {
            if (l.kind === 'TRIM') return Number(ret.qty[l.id]) > 0 ? [{ issue_line_id: l.id, qty: Number(ret.qty[l.id]) }] : [];
            const rolls = l.rolls.filter(r => Number(ret.rolls[`${l.id}:${r.roll_id}`]) > 0).map(r => ({ roll_id: r.roll_id, qty: Number(ret.rolls[`${l.id}:${r.roll_id}`]) }));
            return rolls.length ? [{ issue_line_id: l.id, rolls }] : [];
        });
        try { setS((await materialIssueApi.returnMaterial(id, { reason: ret.reason, lines })).data); setRet(null); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <div>
            <Link to="/v3/material-issue?tab=slips" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Issue slips</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{s.issue_no}</h1>
                <span className="text-sm text-slate-500">{fmtDate(s.issue_date)} · <Link to={`/v3/planning/orders/${s.order_id}`} className="text-indigo-700 font-semibold hover:underline">{s.order_no}</Link> · {s.stage} · to {s.received_by}{s.department_name ? ` (${s.department_name})` : ''}{s.cut_batch_code ? ` · batch ${s.cut_batch_code}` : ''} · by {s.issued_by_name || '—'}</span>
            </div>
            {s.gate_override && <p className="mb-2 text-sm text-rose-700">Issued to cutting under the factory admin's readiness override.</p>}
            <div className="flex gap-2 mb-3">
                {returnable.length > 0 && <SecondaryButton onClick={() => { setFormError(''); setRet({ reason: '', qty: {}, rolls: {} }); }}><Undo2 size={14} /> Return from production</SecondaryButton>}
                <SecondaryButton onClick={() => pdf(s)}><FileDown size={14} /> PDF</SecondaryButton>
            </div>
            <ErrorBox text={error} />
            <div className="space-y-3 mb-4">
                {s.lines.map(l => (
                    <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="font-bold">{l.line_no}. {l.label} {l.mixed_lots && <span className="ml-1 text-[11px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">mixed dye lots</span>}</p>
                        <p className="text-sm">Issued <b>{fmt(l.qty, l.uom)} {l.uom}</b>{l.returned_qty > 0 && <> · returned {fmt(l.returned_qty, l.uom)} · net {fmt(l.open_qty, l.uom)}</>}</p>
                        {l.rolls.length > 0 && <p className="text-xs text-slate-600 mt-1">{l.rolls.map(r => `${r.roll_no}${r.dye_lot ? ` (lot ${r.dye_lot})` : ''}: ${fmt(r.qty)}${r.returned_qty ? `, ${fmt(r.returned_qty)} back` : ''}`).join(' · ')}</p>}
                    </div>
                ))}
            </div>
            {s.returns.length > 0 && <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Returns</p>{s.returns.map(r => <p key={r.id} className="text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(r.created_at).toLocaleString()}</span>Line {r.line_no}: {fmt(r.qty)} back{r.user_name ? ` · ${r.user_name}` : ''} — {r.reason}</p>)}</div>}
            {ret && (
                <Modal title={`Return from production — ${s.issue_no}`} onClose={() => setRet(null)}>
                    <div className="space-y-3 w-[min(560px,90vw)] max-h-[75vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">Goes back into stock and onto {s.order_no}'s allocation (planning can release it).</p>
                        {returnable.map(l => (
                            <div key={l.id} className="border-t border-slate-100 pt-2">
                                <p className="text-sm font-semibold">{l.label} <span className="text-xs font-normal text-slate-500">({fmt(l.open_qty, l.uom)} {l.uom} out)</span></p>
                                {l.kind === 'TRIM' ? <input className={`${inputCls} !w-40 !py-1`} type="number" min="0" max={l.open_qty} step="any" value={ret.qty[l.id] || ''} onChange={e => setRet({ ...ret, qty: { ...ret.qty, [l.id]: e.target.value } })} aria-label={`Return ${l.label}`} />
                                    : l.rolls.filter(r => r.qty > r.returned_qty).map(r => (
                                        <div key={r.roll_id} className="flex items-center gap-2 text-sm mt-1"><span className="w-40">{r.roll_no} (up to {fmt(r.qty - r.returned_qty)})</span>
                                            <input className={`${inputCls} !w-32 !py-1`} type="number" min="0" step="any" value={ret.rolls[`${l.id}:${r.roll_id}`] || ''} onChange={e => setRet({ ...ret, rolls: { ...ret.rolls, [`${l.id}:${r.roll_id}`]: e.target.value } })} aria-label={`Back to ${r.roll_no}`} /></div>
                                    ))}
                            </div>
                        ))}
                        <Field label="Reason *"><input className={inputCls} value={ret.reason} onChange={e => setRet({ ...ret, reason: e.target.value })} placeholder="End bit, not used, colour changed…" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setRet(null)}>Cancel</SecondaryButton><PrimaryButton onClick={saveReturn} busy={busy} disabled={busy || !ret.reason.trim()}>Return to stock</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

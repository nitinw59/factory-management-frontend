// One goods receipt: PO and challan, each line (label code typed vs the item,
// accepted / rejected, rolls), the orders it was bought for (allocate next),
// approve / reject / reverse for the purchase manager, scans, history.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Undo2, Upload, AlertTriangle, PackageX } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { API_BASE_URL } from '../../utils/api';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { GRN_STATUS } from './grnShared';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const ACTION = { RECEIVED: 'Received', PENDING_APPROVAL: 'Sent for approval', APPROVED: 'Approved', REJECTED: 'Rejected', REVERSED: 'Reversed', DOCUMENT: 'Document', RETURNED: 'Returned to supplier' };

export default function GrnPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [g, setG] = useState(null);
    const [perms, setPerms] = useState({ manage: false, receive: false });
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);
    const [askText, setAskText] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => purchasingApi.grn(id).then(res => setG(res.data)).catch(err => setError(apiError(err, 'Failed to load the goods receipt.'))), [id]);
    useEffect(() => { load(); purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {}); }, [load]);

    if (!g) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setG((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const orders = [...new Map(g.lines.flatMap(l => l.bought_for).map(o => [o.order_id, o])).values()];

    return (
        <div>
            <Link to="/v3/purchasing/grns" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Goods receipts</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{g.grn_no}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${GRN_STATUS[g.status].cls}`}>{GRN_STATUS[g.status].label}</span>
                <span className="text-sm text-slate-500">against <Link to={`/v3/purchasing/orders/${g.po_id}`} className="text-indigo-700 font-semibold hover:underline">{g.po_no}</Link> · {g.supplier_name}</span>
            </div>
            {g.status === 'PENDING_APPROVAL' && (
                <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={14} /> Waiting for the purchase manager — nothing is in stock yet.</p>
                    <ul className="list-disc pl-5 text-xs mt-1">{(g.approval_reasons || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
            )}
            {g.status === 'REJECTED' && <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2"><b>Rejected:</b> {g.rejected_reason}</div>}
            {g.status === 'REVERSED' && <div className="mb-3 text-sm bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-3 py-2"><b>Reversed</b>{g.reversed_by_name ? ` by ${g.reversed_by_name}` : ''}: {g.reversed_reason}</div>}

            <div className="flex flex-wrap gap-2 mb-3">
                {perms.manage && g.status === 'PENDING_APPROVAL' && <>
                    <PrimaryButton onClick={() => { if (window.confirm(`Approve ${g.grn_no} and put it into stock?`)) run(() => purchasingApi.grnAction(id, 'approve')); }} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Approve into stock</PrimaryButton>
                    <SecondaryButton onClick={() => { setAskText(''); setFormError(''); setAsk({ title: `Reject ${g.grn_no}`, action: 'reject', confirm: 'Reject' }); }}><XCircle size={14} /> Reject</SecondaryButton>
                </>}
                {(perms.manage || perms.receive) && g.status === 'APPROVED' && <SecondaryButton onClick={() => navigate(`/v3/purchasing/return-notes/new?grn=${id}`)}><PackageX size={14} /> Return to supplier</SecondaryButton>}
                {perms.manage && g.status === 'APPROVED' && <SecondaryButton onClick={() => { setAskText(''); setFormError(''); setAsk({ title: `Reverse ${g.grn_no}`, action: 'reverse', confirm: 'Reverse receipt', hint: 'Takes the goods back out of stock and off the PO. Only possible while the stock is untouched.' }); }}><Undo2 size={14} /> Reverse</SecondaryButton>}
            </div>
            <ErrorBox text={error} />

            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs font-bold text-slate-500">Challan / DC</p><p className="font-semibold">{g.challan_no}{g.challan_date ? ` · ${fmtDate(g.challan_date)}` : ''}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Received</p><p className="font-semibold">{fmtDate(g.received_date)}{g.received_by_name ? ` by ${g.received_by_name}` : ''}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Vehicle</p><p className="font-semibold">{g.vehicle_no || '—'}</p></div>
                <div><p className="text-xs font-bold text-slate-500">Approved</p><p className="font-semibold">{g.approved_at ? `${new Date(g.approved_at).toLocaleString()}${g.approved_by_name ? ` by ${g.approved_by_name}` : ' (within tolerance)'}` : '—'}</p></div>
                {g.notes && <div className="sm:col-span-4"><p className="text-xs font-bold text-slate-500">Notes</p><p>{g.notes}</p></div>}
            </div>

            <div className="space-y-3 mb-4">
                {g.lines.map(l => (
                    <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex flex-wrap items-start gap-3">
                            <div className="flex-1 min-w-[240px]">
                                <p className="font-bold text-slate-800">PO line {l.po_line_no}: {l.label}</p>
                                <p className="text-xs text-slate-500">Label typed at receipt: <span className="font-mono">{l.label_code}</span> ✓ matched</p>
                            </div>
                            <div className="text-right text-sm">
                                <p><b className="text-emerald-700">{fmt(l.accepted_qty)} {l.purchase_uom}</b> accepted <span className="text-xs text-slate-500">(= {fmt(l.usage_qty)} {l.uom})</span></p>
                                {l.rejected_qty > 0 && <p className="text-rose-700">{fmt(l.rejected_qty)} {l.purchase_uom} rejected — {l.rejection_reason}</p>}
                                <p className="text-xs text-slate-500">PO: {fmt(l.received_on_po)} of {fmt(l.ordered_qty)} received</p>
                                {(l.returned_rejected > 0 || l.returned_stock > 0) && <p className="text-xs text-rose-700">Returned to supplier: {[l.returned_rejected > 0 && `${fmt(l.returned_rejected)} rejected`, l.returned_stock > 0 && `${fmt(l.returned_stock)} from stock`].filter(Boolean).join(', ')}</p>}
                                {l.billed > 0 && <p className="text-xs text-indigo-700">Billed {fmt(l.billed)} {l.purchase_uom}</p>}
                            </div>
                        </div>
                        {l.rolls.length > 0 && (
                            <table className="w-full text-xs mt-2">
                                <thead className="text-slate-500 text-left"><tr><th className="py-1">Roll</th><th>Dye lot</th><th className="text-right">Qty</th><th className="text-right">Width</th><th className="pl-4">Location</th><th>In stock</th></tr></thead>
                                <tbody>
                                    {l.rolls.map(r => (
                                        <tr key={r.id} className="border-t border-slate-100"><td className="py-1 font-semibold">{r.roll_no}</td><td>{r.dye_lot || '—'}</td><td className="text-right">{fmt(r.qty)} {l.uom}</td><td className="text-right">{r.width ? `${r.width} ${r.width_unit}` : '—'}</td><td className="pl-4">{r.location || '—'}</td><td>{r.fabric_roll_id ? 'yes' : 'not yet'}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ))}
            </div>

            {g.status === 'APPROVED' && orders.length > 0 && (
                <div className="mb-4 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-3 py-2">
                    <b>Received for:</b> {orders.map(o => <Link key={o.order_id} to={`/v3/planning/orders/${o.order_id}`} className="underline mr-2">{o.order_no}</Link>)}
                    <span className="block text-xs">The goods are in free stock — allocate them on each order's requirements page (or Material position).</span>
                </div>
            )}

            {(g.return_notes.length > 0 || g.invoices.length > 0) && (
                <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4 text-sm grid sm:grid-cols-2 gap-3">
                    <div><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Returned to supplier</p>
                        {g.return_notes.length ? g.return_notes.map(r => <p key={r.id}><Link to={`/v3/purchasing/return-notes/${r.id}`} className="font-semibold text-indigo-700 hover:underline">{r.rn_no}</Link> {fmtDate(r.return_date)} — {r.reason}{r.replacement_expected ? ' (replacement expected)' : ''}</p>) : <p className="text-slate-400">—</p>}</div>
                    <div><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Supplier invoices</p>
                        {g.invoices.length ? g.invoices.map(x => <p key={x.id}><Link to={`/v3/purchasing/invoices/${x.id}`} className={`font-semibold hover:underline ${x.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-indigo-700'}`}>{x.invoice_no}</Link> {fmtDate(x.invoice_date)}</p>) : <p className="text-slate-400">—</p>}</div>
                </div>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Scans (challan, invoice)</p>
                    {g.documents.length === 0 ? <p className="text-sm text-slate-400 mb-2">None yet.</p> : (
                        <ul className="text-sm mb-3 space-y-1">{g.documents.map(d => <li key={d.id}><a href={`${API_BASE_URL}${d.file_url}`} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">{d.original_filename}</a><span className="text-xs text-slate-500"> · {new Date(d.created_at).toLocaleDateString('en-IN')}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</span></li>)}</ul>
                    )}
                    {(perms.receive || perms.manage) && (
                        <div className="flex flex-wrap items-center gap-2">
                            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="text-xs" aria-label="Scan file" />
                            <SecondaryButton onClick={() => run(() => purchasingApi.uploadGrnDocument(id, file), () => setFile(null))} disabled={busy || !file}><Upload size={14} /> Upload</SecondaryButton>
                        </div>
                    )}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                    <div className="divide-y divide-slate-100 text-sm">
                        {g.history.map(h => (
                            <div key={h.id} className="py-1.5"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                                {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>
                        ))}
                    </div>
                </div>
            </div>

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => purchasingApi.grnAction(id, ask.action, askText.trim()), () => setAsk(null))} busy={busy} disabled={busy || !askText.trim()}>{ask.confirm}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

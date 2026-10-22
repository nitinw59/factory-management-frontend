// Return slips (21 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Return to store — custody"): left-out fabric goes back from
// the cutting room to the fabric store with custody — the cutting manager drafts and submits, the fabric store manager
// receives (partial allowed). Trims (21 Oct 2026): the line loader drafts a trim return slip of the order's trims
// still with the line, the trim store receives it. This page: the slips by status and material, and a new draft.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Modal from '../../shared/Modal';
import { materialReturnsApi } from '../api/materialReturnsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { useV3Live } from '../live';

const TABS = [['SUBMITTED', 'To receive'], ['DRAFT', 'Drafts'], ['RECEIVED', 'Received'], ['CANCELLED', 'Cancelled'], ['', 'All']];
export const RETURN_STATUS = {
    DRAFT: ['Draft', 'bg-slate-50 text-slate-700 border-slate-300'],
    SUBMITTED: ['Submitted — to receive', 'bg-amber-50 text-amber-800 border-amber-300'],
    RECEIVED: ['Received', 'bg-emerald-50 text-emerald-800 border-emerald-300'],
    CANCELLED: ['Cancelled', 'bg-rose-50 text-rose-700 border-rose-300'],
};
export const ReturnChip = ({ status }) => { const [l, c] = RETURN_STATUS[status] || [status, '']; return <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${c}`}>{l}</span>; };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const totalsText = (t, received) => (t || []).map(x => `${Number(received ? x.received : x.listed).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${x.uom}`).join(' · ') || '—';

export default function MaterialReturnsPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [perm, setPerm] = useState({});
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [pick, setPick] = useState(null);   // { material, orders, orderId }
    const [busy, setBusy] = useState(false);
    const status = params.get('status') ?? 'SUBMITTED';
    // A trim-only or fabric-only role lands on its own material.
    const onlyTrim = (perm.prepare_trim || perm.receive_trim) && !perm.prepare_fabric && !perm.receive_fabric;
    const onlyFabric = (perm.prepare_fabric || perm.receive_fabric) && !perm.prepare_trim && !perm.receive_trim;
    const material = params.get('material') ?? (onlyTrim ? 'TRIM' : onlyFabric ? 'FABRIC' : '');
    const load = useCallback(() => materialReturnsApi.list({ status: status || undefined, material: material || undefined }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [status, material]);
    useEffect(() => { load(); materialReturnsApi.permissions().then(r => setPerm(r.data)).catch(() => {}); }, [load]);
    useV3Live(load);
    const loadOrders = async (m) => {
        setError('');
        try { const r = await materialReturnsApi.orders(m); setPick({ material: m, orders: r.data, orderId: '' }); } catch (err) { setError(apiError(err, 'Failed.')); }
    };
    const openNew = () => loadOrders(perm.prepare_fabric && (!perm.prepare_trim || material !== 'TRIM') ? 'FABRIC' : 'TRIM');
    const create = async () => {
        setBusy(true);
        try { const r = await materialReturnsApi.draft(pick.orderId, [], pick.material); navigate(`/v3/material-returns/${r.data.id}`); } catch (err) { setError(apiError(err, 'Failed.')); setBusy(false); setPick(null); }
    };
    const setParam = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p); };
    return (
        <div>
            <PageHeader title="Material returns" subtitle="Return slips with custody. Fabric: the cutting manager drafts and submits left-out fabric, the fabric store manager counts and receives it. Trims: the line loader drafts the trims not used, the trim store receives them. Partial receipt allowed; nothing moves until it is received."
                actions={perm.prepare && <PrimaryButton onClick={openNew}><Plus size={14} /> New return slip</PrimaryButton>} />
            <div className="flex flex-wrap items-center gap-1 mb-3 border-b border-slate-200">
                {TABS.map(([k, label]) => (
                    <button key={label} type="button" onClick={() => setParam('status', k)}
                        className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${status === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
                ))}
                <span className="ml-auto flex gap-1 pb-1">{[['', 'All'], ['FABRIC', 'Fabric'], ['TRIM', 'Trims']].map(([k, label]) => (
                    <button key={label} type="button" onClick={() => setParam('material', k)} className={`px-2.5 py-1 rounded-full border text-xs font-bold ${material === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>{label}</button>))}</span>
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No return slips here.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>
                            <th className="px-3 py-2">Return slip</th><th className="px-3 py-2">Material</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Lines</th>
                            <th className="px-3 py-2 text-right">Sent</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2">Prepared · submitted · received</th></tr></thead>
                        <tbody>{rows.map(x => (
                            <tr key={x.id} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2"><Link to={`/v3/material-returns/${x.id}`} className="font-black text-indigo-700 hover:underline">{x.return_no}</Link></td>
                                <td className="px-3 py-2 text-xs font-bold">{x.material === 'TRIM' ? 'Trims' : 'Fabric'}</td>
                                <td className="px-3 py-2"><b>{x.order_no}</b><span className="block text-xs text-slate-500">{x.customer_name}{x.styles ? ` · ${x.styles}` : ''}</span></td>
                                <td className="px-3 py-2"><ReturnChip status={x.status} /></td>
                                <td className="px-3 py-2 text-right tabular-nums">{x.line_count}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{totalsText(x.totals)}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{x.status === 'RECEIVED' ? totalsText(x.totals, true) : '—'}</td>
                                <td className="px-3 py-2 text-xs text-slate-600">{x.created_by_name} {when(x.created_at)}{x.submitted_at ? ` · ${x.submitted_by_name} ${when(x.submitted_at)}` : ''}{x.received_at ? ` · ${x.received_by_name} ${when(x.received_at)}` : ''}</td>
                            </tr>
                        ))}
                            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold"><td className="px-3 py-2" colSpan={4}>{rows.length} slip(s)</td><td className="px-3 py-2 text-right tabular-nums">{rows.reduce((a, x) => a + x.line_count, 0)}</td><td className="px-3 py-2" colSpan={3} /></tr>
                        </tbody>
                    </table>
                </div>
            )}
            {pick && (
                <Modal title="New return slip" onClose={() => setPick(null)}>
                    <div className="space-y-3 w-[min(460px,90vw)]">
                        {perm.prepare_fabric && perm.prepare_trim && <div className="flex gap-3 text-sm font-semibold">{[['FABRIC', 'Fabric (cutting room → fabric store)'], ['TRIM', 'Trims (line → trim store)']].map(([k, label]) => (
                            <label key={k} className="flex items-center gap-1.5"><input type="radio" checked={pick.material === k} onChange={() => loadOrders(k)} /> {label}</label>))}</div>}
                        <p className="text-sm text-slate-600">One {pick.material === 'TRIM' ? 'trim' : 'fabric'} slip per order. If the order already has a draft, it opens that draft.{pick.material === 'TRIM' ? ' Orders with trims still out with the line.' : ''}</p>
                        <Field label="Order *"><select className={inputCls} value={pick.orderId} onChange={e => setPick({ ...pick, orderId: e.target.value })}>
                            <option value="">Choose…</option>{pick.orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}{o.end_bits ? ` · ${o.end_bits} end bit(s)` : ''}{o.draft_id ? ' · draft open' : ''}</option>)}</select></Field>
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setPick(null)}>Back</SecondaryButton><PrimaryButton onClick={create} busy={busy} disabled={busy || !pick.orderId}>Open draft</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

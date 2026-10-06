// Issue material for one order: stage, receiver, department; per item the
// quantity (trims) or rolls and metres (fabric) — never more than allocated.
// Cutting needs the cutting gate; mixed dye lots need a confirmation.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PackageMinus, AlertTriangle } from 'lucide-react';
import { materialIssueApi } from '../api/materialIssueApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { useAuth } from '../../context/AuthContext';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });

export default function IssueForOrderPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [d, setD] = useState(null);
    const [form, setForm] = useState({ stage_type_id: '', received_by: '', department_id: '', issue_date: todayLocal(), notes: '', cut_batch_id: '' });
    const [qty, setQty] = useState({});        // trim item id → qty
    const [rolls, setRolls] = useState({});    // roll id → metres
    const [confirmLots, setConfirmLots] = useState(false);
    const [mixedAsk, setMixedAsk] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { materialIssueApi.order(orderId).then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load the order.'))); }, [orderId]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const role = user?.role;
    const mayKind = (k) => role === 'factory_admin' || (k === 'FABRIC' ? role === 'fabric_store_manager' : role === 'store_manager');
    const stageName = d.stage_types.find(s => s.id === form.stage_type_id)?.name || '';
    const cutting = /cutting/i.test(stageName);
    // Fabric goes to cutting; trims to the stage their BOM line names (any stage if it names none).
    const forStage = (i) => (i.kind === 'FABRIC' ? cutting : i.stages.length === 0 || i.stages.includes(stageName));
    const shown = stageName ? d.items.filter(i => mayKind(i.kind) && i.allocated > 0 && forStage(i)) : [];
    const lines = shown.flatMap(i => {
        if (i.kind === 'TRIM') return Number(qty[i.item_id]) > 0 ? [{ kind: 'TRIM', item_id: i.item_id, qty: Number(qty[i.item_id]) }] : [];
        const picks = i.rolls.filter(r => Number(rolls[r.id]) > 0).map(r => ({ roll_id: r.id, qty: Number(rolls[r.id]) }));
        return picks.length ? [{ kind: 'FABRIC', item_id: i.item_id, rolls: picks }] : [];
    });
    const save = async () => {
        setBusy(true); setError('');
        try {
            const res = await materialIssueApi.create({ order_id: orderId, ...form, cut_batch_id: form.cut_batch_id || undefined, confirm_mixed_lots: confirmLots, lines });
            navigate(`/v3/material-issue/issues/${res.data.id}`);
        } catch (err) {
            if (err?.response?.data?.mixed_lots) setMixedAsk(true);
            setError(apiError(err, 'Failed to issue.')); setBusy(false);
        }
    };

    return (
        <div>
            <Link to="/v3/material-issue" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Material issue</Link>
            <PageHeader title={`Issue for ${d.order.order_no}`} subtitle={`${d.order.customer_name} · ships ${fmtDate(d.order.ship_date)}. Only allocated material can be issued; ask planning to allocate the rest.`} />
            <div className={`mb-3 text-sm rounded-lg px-3 py-2 border ${d.cutting_gate.allowed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <b>Cutting gate:</b> {d.cutting_gate.allowed ? (d.cutting_gate.ready ? 'open — all materials covered.' : `open by override — ${d.cutting_gate.reason}`) : `closed — ${d.cutting_gate.reason}`}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                <Field label="Stage *"><select className={inputCls} value={form.stage_type_id} onChange={e => setForm({ ...form, stage_type_id: e.target.value })}><option value="">Choose…</option>{d.stage_types.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="Received by *"><input className={inputCls} value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })} placeholder="Name of the person taking it" /></Field>
                <Field label="Department"><select className={inputCls} value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}><option value="">—</option>{d.departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
                <Field label="Date"><input className={inputCls} type="date" max={todayLocal()} value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></Field>
                <Field label="For cut batch" hint="Optional — trims per batch"><select className={inputCls} value={form.cut_batch_id} onChange={e => setForm({ ...form, cut_batch_id: e.target.value })}><option value="">—</option>{(d.cut_batches || []).map(x => <option key={x.id} value={x.id}>{x.batch_code}</option>)}</select></Field>
                <div className="sm:col-span-3"><Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
            </div>
            {cutting && !d.cutting_gate.allowed && <ErrorBox text="This order can't be issued to cutting yet — the cutting gate is closed." />}
            <div className="space-y-3 mb-4">
                {form.stage_type_id && shown.length === 0 && <p className="text-sm text-slate-500">Nothing allocated for this stage{role !== 'factory_admin' ? ' that your store issues' : ''}.</p>}
                {!form.stage_type_id && <p className="text-sm text-slate-500">Choose the stage first.</p>}
                {form.stage_type_id && shown.map(i => (
                    <div key={`${i.kind}${i.item_id}`} className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="font-bold text-slate-800">{i.label} <span className="text-xs font-normal text-slate-500">{i.type_name}{i.stages.length ? ` · BOM stage ${i.stages.join(', ')}` : ''}</span></p>
                        <p className="text-xs text-slate-500 mb-2">Required {fmt(i.required, i.uom)} · issued {fmt(i.issued, i.uom)} · <b>allocated now {fmt(i.allocated, i.uom)} {i.uom}</b>{i.still_to_cover > 0 ? ` · ${fmt(i.still_to_cover, i.uom)} not yet covered` : ''}</p>
                        {i.kind === 'TRIM' ? (
                            <div className="w-48"><Field label={`Issue (${i.uom})`}><input className={inputCls} type="number" min="0" max={i.allocated} step="any" value={qty[i.item_id] || ''} onChange={e => setQty({ ...qty, [i.item_id]: e.target.value })} /></Field></div>
                        ) : (
                            <div>
                                <p className="text-xs font-bold text-slate-600 mb-1">Rolls — {fmt(i.rolls.reduce((s, r) => s + Number(rolls[r.id] || 0), 0), i.uom)} of {fmt(i.allocated, i.uom)} {i.uom} picked</p>
                                <table className="w-full text-sm"><thead className="text-xs text-slate-500 text-left"><tr><th className="py-1">Roll</th><th>Dye lot</th><th className="text-right">In roll</th><th>Width</th><th>Location</th><th className="w-36">Take ({i.uom})</th></tr></thead>
                                    <tbody>{i.rolls.map(r => (
                                        <tr key={r.id} className="border-t border-slate-100"><td className="py-1 font-semibold">{r.roll_no}</td><td>{r.dye_lot || '—'}</td><td className="text-right tabular-nums">{fmt(r.qty, i.uom)}</td><td>{r.width ? `${r.width} ${r.width_unit}` : '—'}</td><td>{r.location || '—'}</td>
                                            <td><div className="flex gap-1"><input className={`${inputCls} !py-1`} type="number" min="0" max={r.qty} step="any" value={rolls[r.id] || ''} onChange={e => setRolls({ ...rolls, [r.id]: e.target.value })} aria-label={`Metres from ${r.roll_no}`} />
                                                <button type="button" className="text-xs text-indigo-700 font-semibold" onClick={() => setRolls({ ...rolls, [r.id]: String(r.qty) })}>all</button></div></td></tr>
                                    ))}</tbody></table>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {mixedAsk && <label className="mb-3 flex items-center gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle size={15} /><input type="checkbox" checked={confirmLots} onChange={e => setConfirmLots(e.target.checked)} /> Issue rolls of different dye lots anyway (shades may differ — keep lots apart in the lay).</label>}
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !lines.length || !form.stage_type_id || !form.received_by.trim() || (cutting && !d.cutting_gate.allowed)}><PackageMinus size={15} /> Issue {lines.length} item(s)</PrimaryButton>
        </div>
    );
}

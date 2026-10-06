// Return goods to the supplier from an approved GRN (/v3/purchasing/return-notes/new?grn=ID):
// per line, what was rejected at receipt and / or what goes back from stock
// (fabric: pick the rolls). Replacement expected → the PO reopens for it.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function NewReturnNotePage() {
    const [params] = useSearchParams();
    const grnId = params.get('grn');
    const navigate = useNavigate();
    const [g, setG] = useState(null);
    const [vals, setVals] = useState({});   // line id → { rejected, stock, rolls: Set }
    const [form, setForm] = useState({ reason: '', replacement_expected: false, vehicle_no: '', notes: '', return_date: todayLocal() });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (grnId) purchasingApi.returnable(grnId).then(res => setG(res.data)).catch(err => setError(apiError(err, 'Failed to load the GRN.'))); }, [grnId]);
    if (!grnId) return <ErrorBox text="Open a GRN and choose “Return to supplier”." />;
    if (!g) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const v = (id) => vals[id] || { rejected: '', stock: '', rolls: [] };
    const set = (id, patch) => setVals({ ...vals, [id]: { ...v(id), ...patch } });
    const lines = g.lines.flatMap(l => {
        const x = v(l.id);
        const out = [];
        if (Number(x.rejected) > 0) out.push({ grn_line_id: l.id, source: 'REJECTED', qty: Number(x.rejected) });
        if (l.kind === 'FABRIC' ? x.rolls.length : Number(x.stock) > 0) out.push(l.kind === 'FABRIC' ? { grn_line_id: l.id, source: 'STOCK', roll_ids: x.rolls } : { grn_line_id: l.id, source: 'STOCK', qty: Number(x.stock) });
        return out;
    });
    const hasStock = lines.some(l => l.source === 'STOCK');
    const save = async () => {
        setBusy(true); setError('');
        try { const res = await purchasingApi.createReturnNote({ grn_id: grnId, ...form, lines }); navigate(`/v3/purchasing/return-notes/${res.data.id}`); } catch (err) { setError(apiError(err, 'Failed to save the return note.')); setBusy(false); }
    };

    return (
        <div>
            <Link to={`/v3/purchasing/grns/${grnId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> {g.grn_no}</Link>
            <PageHeader title={`Return to supplier — ${g.grn_no}`} subtitle="Send back what was rejected at receipt, or goods from stock found faulty later. Stock allocated to orders can't go back until it is released." />
            {g.status !== 'APPROVED' && <ErrorBox text={`This GRN is ${g.status.toLowerCase().replace('_', ' ')}; only goods of an approved GRN can be returned.`} />}
            <div className="space-y-3 mb-4">
                {g.lines.map(l => (
                    <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="font-bold text-slate-800">GRN line {l.line_no}: {l.label}</p>
                        <p className="text-xs text-slate-500 mb-2">Accepted {fmt(l.accepted)} {l.purchase_uom}{l.returned_stock ? ` (${fmt(l.returned_stock)} already returned)` : ''} · rejected {fmt(l.rejected)}{l.rejection_reason ? ` — ${l.rejection_reason}` : ''}{l.returned_rejected ? ` (${fmt(l.returned_rejected)} already returned)` : ''} · PO rate ₹{l.rate}</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label={`Rejected at receipt (${l.purchase_uom})`} hint={l.returnable_rejected ? `Up to ${fmt(l.returnable_rejected)}` : 'Nothing rejected left'}>
                                <input className={inputCls} type="number" min="0" max={l.returnable_rejected} step="any" disabled={!l.returnable_rejected} value={v(l.id).rejected} onChange={e => set(l.id, { rejected: e.target.value })} />
                            </Field>
                            {l.kind === 'FABRIC' ? (
                                <Field label="Rolls going back from stock" hint={l.rolls.length ? 'Whole rolls of this GRN still in stock' : 'No roll of this GRN is in stock'}>
                                    <div className="flex flex-wrap gap-2">{l.rolls.map(r => (
                                        <label key={r.roll_id} className="text-sm flex items-center gap-1.5 border border-slate-200 rounded-lg px-2 py-1">
                                            <input type="checkbox" checked={v(l.id).rolls.includes(r.roll_id)} onChange={e => set(l.id, { rolls: e.target.checked ? [...v(l.id).rolls, r.roll_id] : v(l.id).rolls.filter(x => x !== r.roll_id) })} />
                                            {r.roll_no} · {fmt(r.qty)} {l.uom}{r.qty !== r.original_qty ? ` (of ${fmt(r.original_qty)})` : ''}{r.dye_lot ? ` · lot ${r.dye_lot}` : ''}
                                        </label>
                                    ))}</div>
                                </Field>
                            ) : (
                                <Field label={`From stock (${l.purchase_uom})`} hint={l.returnable_stock ? `Up to ${fmt(l.returnable_stock)} (= ${fmt(l.returnable_stock * l.factor)} ${l.uom})` : 'Nothing left from this GRN'}>
                                    <input className={inputCls} type="number" min="0" max={l.returnable_stock} step="any" disabled={!l.returnable_stock} value={v(l.id).stock} onChange={e => set(l.id, { stock: e.target.value })} />
                                </Field>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2"><Field label="Reason *"><input className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Wrong shade, broken, short length…" /></Field></div>
                <Field label="Vehicle no."><input className={`${inputCls} uppercase`} value={form.vehicle_no} onChange={e => setForm({ ...form, vehicle_no: e.target.value })} /></Field>
                <Field label="Date"><input className={inputCls} type="date" max={todayLocal()} value={form.return_date} onChange={e => setForm({ ...form, return_date: e.target.value })} /></Field>
                <div className="sm:col-span-4"><Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
                <label className="sm:col-span-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.replacement_expected} disabled={!hasStock} onChange={e => setForm({ ...form, replacement_expected: e.target.checked })} />
                    Replacement expected — what goes back from stock comes off the PO's received quantity, so the PO reopens and planning counts it as on order again.</label>
            </div>
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !lines.length || !form.reason.trim()}><Undo2 size={15} /> Save return note</PrimaryButton>
        </div>
    );
}

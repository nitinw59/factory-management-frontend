// Receive goods (GRN) — only against an issued purchase order (decided:
// never without a PO). The receiver picks the PO, then for each line that
// arrived: types the code from the supplier's label (blind check — the item
// code is not shown), accepted and rejected quantities; fabric as rolls.
// Over-receipt beyond tolerance goes to the purchase manager for approval.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const blankRoll = () => ({ roll_no: '', dye_lot: '', qty: '', width: '', location: '' });

function LineForm({ l, value, onChange }) {
    const v = value;
    const set = (patch) => onChange({ ...v, ...patch });
    const rolls = v.rolls || [blankRoll()];
    const setRoll = (i, patch) => set({ rolls: rolls.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    const paste = (e) => {
        const t = e.clipboardData.getData('text');
        if (!/[\t\n]/.test(t.trim())) return;
        e.preventDefault();
        const parsed = t.replace(/\r/g, '').split('\n').map(x => x.split('\t')).filter(c => c[0]?.trim())
            .map(c => ({ roll_no: c[0].trim(), dye_lot: (c[1] || '').trim(), qty: (c[2] || '').replace(/[^\d.]/g, ''), width: (c[3] || '').replace(/[^\d.]/g, ''), location: (c[4] || '').trim() }));
        set({ rolls: [...rolls.filter(r => r.roll_no || r.qty), ...parsed] });
    };
    const rollTotal = rolls.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const accepted = l.kind === 'FABRIC' ? rollTotal : Number(v.accepted_qty || 0);
    const over = l.received_qty + l.pending_qty + accepted > l.ordered_qty + 1e-9;
    return (
        <div className={`border rounded-xl p-3 ${v.on ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white'}`}>
            <label className="flex flex-wrap items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={v.on} onChange={e => set({ on: e.target.checked })} />
                <span className="flex-1">
                    <span className="font-bold text-slate-800">PO line {l.line_no}: {l.label}</span>
                    <span className="block text-xs text-slate-500">Ordered {fmt(l.ordered_qty)} {l.purchase_uom} · received {fmt(l.received_qty)}{l.pending_qty ? ` · ${fmt(l.pending_qty)} waiting for approval` : ''} · <b>open {fmt(l.open_qty)}</b> · due {fmtDate(l.delivery_date)}</span>
                </span>
            </label>
            {v.on && (
                <div className="mt-3 space-y-3">
                    {l.kind !== 'FABRIC' ? (
                        <div className="grid sm:grid-cols-4 gap-3">
                            <Field label={l.kind === 'STORE' ? 'Part no. / code on the label *' : 'Code on the label *'} hint={l.po_code ? <>PO: <b className="font-mono">{l.po_code}</b> <button type="button" className="ml-1 font-bold text-indigo-700 underline" onClick={() => set({ label_code: l.po_code })}>Copy</button> — check it matches the label</> : 'Type it from the supplier\'s label / box.'}><input className={`${inputCls} font-mono uppercase`} value={v.label_code || ''} onChange={e => set({ label_code: e.target.value })} /></Field>
                            <Field label={`Accepted (${l.purchase_uom})`} hint={accepted ? `= ${fmt(accepted * l.factor)} ${l.uom}` : ' '}><input className={inputCls} type="number" min="0" step="any" value={v.accepted_qty ?? ''} onChange={e => set({ accepted_qty: e.target.value })} /></Field>
                            <Field label={`Rejected (${l.purchase_uom})`}><input className={inputCls} type="number" min="0" step="any" value={v.rejected_qty ?? ''} onChange={e => set({ rejected_qty: e.target.value })} /></Field>
                            <Field label="Rejection reason"><input className={inputCls} value={v.rejection_reason || ''} onChange={e => set({ rejection_reason: e.target.value })} disabled={!Number(v.rejected_qty)} /></Field>
                        </div>
                    ) : (
                        <>
                            <div className="grid sm:grid-cols-4 gap-3">
                                <Field label="Article on roll label *" hint={l.po_article ? <>PO: <b className="font-mono">{l.po_article} / {l.po_shade}</b> <button type="button" className="ml-1 font-bold text-indigo-700 underline" onClick={() => set({ label_article: l.po_article, label_shade: l.po_shade })}>Copy</button></> : ' '}><input className={`${inputCls} font-mono uppercase`} value={v.label_article || ''} onChange={e => set({ label_article: e.target.value })} /></Field>
                                <Field label="Shade on roll label *"><input className={`${inputCls} font-mono uppercase`} value={v.label_shade || ''} onChange={e => set({ label_shade: e.target.value })} /></Field>
                                <Field label={`Rejected (${l.purchase_uom})`}><input className={inputCls} type="number" min="0" step="any" value={v.rejected_qty ?? ''} onChange={e => set({ rejected_qty: e.target.value })} /></Field>
                                <Field label="Rejection reason"><input className={inputCls} value={v.rejection_reason || ''} onChange={e => set({ rejection_reason: e.target.value })} disabled={!Number(v.rejected_qty)} /></Field>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 mb-1">Accepted rolls — {rolls.filter(r => Number(r.qty) > 0).length} roll(s), {fmt(rollTotal)} {l.uom} <span className="font-normal text-slate-500">(paste from Excel: roll no. ⇥ dye lot ⇥ qty ⇥ width ⇥ location)</span></p>
                                <table className="w-full text-sm">
                                    <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Roll no. *</th><th>Dye lot</th><th>Qty ({l.uom}) *</th><th>Width ({l.width_unit || 'in'})</th><th>Location</th><th /></tr></thead>
                                    <tbody>
                                        {rolls.map((r, i) => (
                                            <tr key={i}>
                                                <td className="pr-1 py-0.5"><input className={inputCls} value={r.roll_no} onPaste={paste} onChange={e => setRoll(i, { roll_no: e.target.value })} aria-label={`Roll ${i + 1} number`} /></td>
                                                <td className="pr-1"><input className={inputCls} value={r.dye_lot} onChange={e => setRoll(i, { dye_lot: e.target.value })} aria-label={`Roll ${i + 1} dye lot`} /></td>
                                                <td className="pr-1"><input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r.qty} onChange={e => setRoll(i, { qty: e.target.value })} aria-label={`Roll ${i + 1} quantity`} /></td>
                                                <td className="pr-1"><input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r.width} onChange={e => setRoll(i, { width: e.target.value })} aria-label={`Roll ${i + 1} width`} /></td>
                                                <td className="pr-1"><input className={inputCls} value={r.location} onChange={e => setRoll(i, { location: e.target.value })} aria-label={`Roll ${i + 1} location`} /></td>
                                                <td><button type="button" className="p-1 text-rose-500" onClick={() => set({ rolls: rolls.filter((_, j) => j !== i) })} aria-label={`Remove roll ${i + 1}`}><Trash2 size={14} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <SecondaryButton onClick={() => set({ rolls: [...rolls, blankRoll()] })}><Plus size={13} /> Add roll</SecondaryButton>
                            </div>
                        </>
                    )}
                    {over && <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> More than ordered: beyond the tolerance this receipt will wait for the purchase manager's approval before it goes into stock.</p>}
                </div>
            )}
        </div>
    );
}

export default function ReceiveGoodsPage() {
    const navigate = useNavigate();
    const { poId } = useParams();
    const [pos, setPos] = useState(null);
    const [search, setSearch] = useState('');
    const [po, setPo] = useState(null);
    const [header, setHeader] = useState({ challan_no: '', challan_date: '', vehicle_no: '', received_date: todayLocal(), notes: '' });
    const [vals, setVals] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => purchasingApi.receivablePos({ q: search.trim() || undefined }).then(res => setPos(res.data)).catch(err => setError(apiError(err, 'Failed to load purchase orders.'))), 250);
        return () => clearTimeout(t);
    }, [search]);

    // /v3/purchasing/receive/:poId — opened straight from the PO page.
    useEffect(() => { if (poId) openPo(poId); }, [poId]); // eslint-disable-line react-hooks/exhaustive-deps

    const openPo = async (id) => {
        setError('');
        try {
            const res = await purchasingApi.receivingView(id);
            setPo(res.data);
            setVals(Object.fromEntries(res.data.lines.map(l => [l.id, { on: false }])));
            setHeader({ challan_no: '', challan_date: '', vehicle_no: '', received_date: todayLocal(), notes: '' });
        } catch (err) { setError(apiError(err, 'Failed to open the PO.')); }
    };
    const submit = async () => {
        setBusy(true); setError('');
        const lines = po.lines.filter(l => vals[l.id]?.on).map(l => {
            const v = vals[l.id];
            const base = { po_line_id: l.id, rejected_qty: v.rejected_qty || 0, rejection_reason: v.rejection_reason };
            return l.kind !== 'FABRIC'
                ? { ...base, label_code: v.label_code, accepted_qty: v.accepted_qty || 0 }
                : { ...base, label_article: v.label_article, label_shade: v.label_shade, rolls: (v.rolls || []).filter(r => r.roll_no || r.qty).map(r => ({ ...r, qty: Number(r.qty), width: r.width ? Number(r.width) : null })) };
        });
        try {
            const res = await purchasingApi.createGrn({ po_id: po.id, ...header, lines });
            navigate(`/v3/purchasing/grns/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to save the receipt.')); setBusy(false); }
    };

    if (po) {
        return (
            <div>
                <button type="button" onClick={() => { setPo(null); if (poId) navigate('/v3/purchasing/receive'); }} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Choose another PO</button>
                <PageHeader title={`Receive against ${po.po_no}`} subtitle={`${po.supplier_name}. Tick each line that arrived and type the code from the label — it is checked against the PO. Over ${po.tolerance_pct}% more than ordered needs the purchase manager's approval.`} />
                {!po.receivable && <ErrorBox text={`${po.po_no} is ${po.status.toLowerCase().replace('_', ' ')} — nothing can be received on it.`} />}
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                    <Field label="Supplier challan / DC no. *"><input className={inputCls} value={header.challan_no} onChange={e => setHeader({ ...header, challan_no: e.target.value })} autoFocus /></Field>
                    <Field label="Challan date"><input className={inputCls} type="date" value={header.challan_date} onChange={e => setHeader({ ...header, challan_date: e.target.value })} /></Field>
                    <Field label="Vehicle no."><input className={`${inputCls} uppercase`} value={header.vehicle_no} onChange={e => setHeader({ ...header, vehicle_no: e.target.value })} /></Field>
                    <Field label="Received on *"><input className={inputCls} type="date" max={todayLocal()} value={header.received_date} onChange={e => setHeader({ ...header, received_date: e.target.value })} /></Field>
                    <div className="sm:col-span-4"><Field label="Notes"><input className={inputCls} value={header.notes} onChange={e => setHeader({ ...header, notes: e.target.value })} /></Field></div>
                </div>
                <div className="space-y-3 mb-4">
                    {po.lines.map(l => <LineForm key={l.id} l={l} value={vals[l.id] || { on: false }} onChange={(v) => setVals({ ...vals, [l.id]: v })} />)}
                </div>
                <ErrorBox text={error} />
                <PrimaryButton onClick={submit} busy={busy} disabled={busy || !po.receivable || !header.challan_no.trim() || !Object.values(vals).some(v => v.on)}><PackageCheck size={15} /> Save goods receipt</PrimaryButton>
            </div>
        );
    }

    return (
        <div>
            <PageHeader title="Receive goods" subtitle="Goods are received only against an issued purchase order. No PO? Keep the goods aside and ask the purchase manager to raise one."
                actions={<SearchInput value={search} onChange={setSearch} placeholder="PO number, supplier" />} />
            <ErrorBox text={error} />
            {!pos ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[620px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">PO</th><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5 text-right">Open lines</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5 w-32" /></tr>
                        </thead>
                        <tbody>
                            {pos.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No issued purchase orders waiting for goods.</td></tr>}
                            {pos.map(p => (
                                <tr key={p.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold">{p.po_no}{p.status === 'PARTLY_RECEIVED' && <span className="block text-xs font-normal text-amber-700">partly received</span>}</td>
                                    <td className="px-4 py-2.5">{p.supplier_name}</td>
                                    <td className="px-4 py-2.5 text-right">{p.open_lines}</td>
                                    <td className="px-4 py-2.5">{fmtDate(p.next_delivery || p.delivery_date)}</td>
                                    <td className="px-4 py-2.5 text-right"><SecondaryButton onClick={() => openPo(p.id)}><PackageCheck size={14} /> Receive</SecondaryButton></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-slate-500 mt-3"><Link to="/v3/purchasing/grns" className="text-indigo-700 font-semibold">Goods receipts</Link> lists everything received.</p>
        </div>
    );
}

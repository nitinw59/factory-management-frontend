// Receive goods (GRN) — only against an issued purchase order (decided:
// never without a PO). The receiver picks the PO, then for each line that
// arrived: types the code from the supplier's label (blind check — the item
// code is not shown), accepted and rejected quantities; fabric as rolls.
// Over-receipt beyond tolerance goes to the purchase manager for approval.
// 20 Oct 2026: the receipt being typed is kept as a draft in this browser (per user and PO) on every change —
// ticks, fields, rolls, pastes — and comes back when the PO is opened again; cleared once the GRN saves or on
// "Discard draft". Browser storage only: it never reaches the server or another device.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PackageCheck, Plus, Trash2, AlertTriangle, Save } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { readDraft, writeDraft, dropDraft, draftPoIds } from './grnShared';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const blankRoll = () => ({ roll_no: '', dye_lot: '', qty: '', width: '', location: '' });
const blankHeader = () => ({ challan_no: '', challan_date: '', vehicle_no: '', received_date: todayLocal(), notes: '' });
// Summary figures (20 Oct 2026): accepted quantity (purchase unit; fabric = its rolls), rolls, metres, value at the PO rate.
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TO_M = { m: 1, yd: 0.9144 };
const rollsOf = (v) => (v.rolls || []).filter(r => Number(r.qty) > 0);
const acceptedOf = (l, v) => (l.kind === 'FABRIC' ? rollsOf(v).reduce((s, r) => s + Number(r.qty), 0) : Number(v.accepted_qty || 0));
const metresText = (qty, uom) => (uom === 'yd' && qty ? ` (= ${fmt(qty * TO_M.yd)} m)` : '');

// Nothing typed yet (only the default received date): no draft to keep.
const isBlank = (header, vals) => !Object.values(vals).some(v => v.on)
    && !['challan_no', 'challan_date', 'vehicle_no', 'notes'].some(k => String(header[k] || '').trim())
    && header.received_date === todayLocal();
const timeText = (ms) => new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Ordered / received / waiting / open / due as chips — open is what can be received now; the due date turns
// amber within 3 days and red when overdue.
function QtyChips({ l }) {
    const today = todayLocal();
    const days = l.delivery_date ? Math.round((Date.parse(l.delivery_date) - Date.parse(today)) / 86400000) : null;
    const due = days == null ? 'bg-slate-50 border-slate-200 text-slate-600' : days < 0 ? 'bg-rose-50 border-rose-300 text-rose-700' : days <= 3 ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700';
    const chip = 'inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md border text-xs';
    return (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`${chip} bg-slate-50 border-slate-200 text-slate-700`}>Ordered <b className="tabular-nums">{fmt(l.ordered_qty)}</b> {l.purchase_uom}</span>
            <span className={`${chip} ${l.received_qty > 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Received <b className="tabular-nums">{fmt(l.received_qty)}</b></span>
            {l.pending_qty > 0 && <span className={`${chip} bg-amber-50 border-amber-300 text-amber-800`}>Waiting for approval <b className="tabular-nums">{fmt(l.pending_qty)}</b></span>}
            <span className={`${chip} text-sm bg-indigo-600 border-indigo-600 text-white`}>Open <b className="tabular-nums text-base leading-none">{fmt(l.open_qty)}</b> {l.purchase_uom}</span>
            <span className={`${chip} ${due}`}>Due <b>{fmtDate(l.delivery_date)}</b>{days != null && days < 0 ? ` · ${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? ' · today' : ''}</span>
        </span>
    );
}

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
                    <QtyChips l={l} />
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
                                                <td className="pr-1"><input className={inputCls} value={r.location} list="v3-store-locations" onChange={e => setRoll(i, { location: e.target.value })} aria-label={`Roll ${i + 1} location`} /></td>
                                                <td><button type="button" className="p-1 text-rose-500" onClick={() => set({ rolls: rolls.filter((_, j) => j !== i) })} aria-label={`Remove roll ${i + 1}`}><Trash2 size={14} /></button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-xs">
                                        <tr>
                                            <td className="py-1.5 px-1" colSpan={2}>Total · {rollsOf(v).length} roll{rollsOf(v).length === 1 ? '' : 's'}</td>
                                            <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">{fmt(rollTotal)} {l.uom}{metresText(rollTotal, l.uom)}</td>
                                            <td className="py-1.5 text-right tabular-nums whitespace-nowrap" colSpan={3}>{l.rate ? <>{money(rollTotal * l.rate)} <span className="font-normal text-slate-500">at {money(l.rate)}/{l.purchase_uom}</span></> : ''}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <SecondaryButton onClick={() => set({ rolls: [...rolls, blankRoll()] })}><Plus size={13} /> Add roll</SecondaryButton>
                            </div>
                        </>
                    )}
                    {l.kind !== 'FABRIC' && accepted > 0 && l.rate > 0 && <p className="text-xs text-slate-600">Value: <b>{money(accepted * l.rate)}</b> at {money(l.rate)}/{l.purchase_uom} (before GST)</p>}
                    {over && <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> More than ordered: beyond the tolerance this receipt will wait for the purchase manager's approval before it goes into stock.</p>}
                </div>
            )}
        </div>
    );
}

// Receipt summary (20 Oct 2026): each ticked line — rolls, accepted quantity (+ metres for yard fabric), rate, value
// before GST — and a Total row: lines, rolls, quantity per unit (+ metres), value, GST and value with GST.
function ReceiptSummary({ lines, vals }) {
    const rows = lines.filter(l => vals[l.id]?.on).map(l => {
        const v = vals[l.id]; const qty = acceptedOf(l, v);
        return { l, rolls: l.kind === 'FABRIC' ? rollsOf(v).length : null, qty, amount: qty * (l.rate || 0), gst: qty * (l.rate || 0) * (l.gst_pct || 0) / 100 };
    });
    if (!rows.length) return <p className="mb-4 text-sm text-slate-400">Tick the lines that arrived — their rolls, quantity and value add up here.</p>;
    const byUom = rows.reduce((m, r) => { m[r.l.purchase_uom] = (m[r.l.purchase_uom] || 0) + r.qty; return m; }, {});
    const metres = rows.reduce((s, r) => s + (TO_M[r.l.purchase_uom] ? r.qty * TO_M[r.l.purchase_uom] : 0), 0);
    const rollCount = rows.reduce((s, r) => s + (r.rolls || 0), 0);
    const amount = rows.reduce((s, r) => s + r.amount, 0); const gst = rows.reduce((s, r) => s + r.gst, 0);
    const TH = 'px-3 py-2 text-[11px] font-bold uppercase tracking-wider';
    return (
        <div className="mb-4 bg-white border border-slate-200 border-l-4 border-l-indigo-500 rounded-xl overflow-x-auto shadow-sm">
            <p className="px-4 py-2.5 border-b bg-indigo-50 border-indigo-100 text-sm font-black uppercase tracking-wider text-indigo-900">Receipt summary</p>
            <table className="w-full text-sm min-w-[620px]">
                <thead className="bg-indigo-50/60 text-indigo-900/70 text-left"><tr><th className={TH}>PO line</th><th className={`${TH} text-right`}>Rolls</th><th className={`${TH} text-right`}>Accepted</th><th className={`${TH} text-right`}>Rate</th><th className={`${TH} text-right`}>Value (before GST)</th></tr></thead>
                <tbody>{rows.map(({ l, rolls, qty, amount: a }) => (
                    <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5"><b>{l.line_no}</b> <span className="text-xs text-slate-500">{l.label}</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{rolls == null ? '—' : rolls}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{fmt(qty)} {l.purchase_uom}{metresText(qty, l.purchase_uom)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{l.rate ? `${money(l.rate)}/${l.purchase_uom}` : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(a)}</td>
                    </tr>
                ))}</tbody>
                <tfoot className="bg-indigo-50/70 border-t-2 border-indigo-200 font-bold">
                    <tr>
                        <td className="px-3 py-2">Total · {rows.length} line{rows.length === 1 ? '' : 's'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rollCount || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{Object.entries(byUom).map(([u, q]) => `${fmt(q)} ${u}`).join(' + ')}{metres > 0 && <span className="block text-[11px] font-semibold text-slate-600">= {fmt(metres)} m</span>}</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(amount)}{gst > 0 && <span className="block text-[11px] font-semibold text-slate-600">+ GST {money(gst)} = {money(amount + gst)}</span>}</td>
                    </tr>
                </tfoot>
            </table>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Accepted quantities only (rejected goods are not paid for) at the PO rate.</p>
        </div>
    );
}

export default function ReceiveGoodsPage() {
    const navigate = useNavigate();
    const { poId } = useParams();
    const { user } = useAuth();
    const userId = user?.id;
    const [pos, setPos] = useState(null);
    const [search, setSearch] = useState('');
    const [po, setPo] = useState(null);
    const [header, setHeader] = useState(blankHeader);
    const [vals, setVals] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [restored, setRestored] = useState(null);   // { at, fromGrn } of the draft brought back on opening the PO
    const [savedAt, setSavedAt] = useState(null);     // last draft write (null = nothing saved / storage blocked)
    const [drafts, setDrafts] = useState(() => draftPoIds(userId));

    // Every change while a PO is open → the draft (removed again when the form is back to blank).
    useEffect(() => {
        if (!po) return;
        if (isBlank(header, vals)) { dropDraft(userId, po.id); setSavedAt(null); return; }
        const at = Date.now();
        if (writeDraft(userId, po.id, { savedAt: at, poNo: po.po_no, header, vals, fromGrn: restored?.fromGrn })) setSavedAt(at);
    }, [po, header, vals, userId, restored]);

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
            const fresh = Object.fromEntries(res.data.lines.map(l => [l.id, { on: false }]));
            const draft = readDraft(userId, res.data.id);
            // A draft brings back the header and the lines still on the PO (a line since removed is dropped).
            setVals(draft ? { ...fresh, ...Object.fromEntries(Object.entries(draft.vals || {}).filter(([lid]) => lid in fresh)) } : fresh);
            setHeader(draft ? { ...blankHeader(), ...draft.header } : blankHeader());
            setRestored(draft ? { at: draft.savedAt, fromGrn: draft.fromGrn || null } : null);
            setSavedAt(draft ? draft.savedAt : null);
            setPo(res.data);
        } catch (err) { setError(apiError(err, 'Failed to open the PO.')); }
    };
    const discardDraft = () => {
        if (!window.confirm(`Discard the draft for ${po.po_no}? Everything typed on this receipt is cleared.`)) return;
        dropDraft(userId, po.id);
        setVals(Object.fromEntries(po.lines.map(l => [l.id, { on: false }])));
        setHeader(blankHeader());
        setRestored(null); setSavedAt(null);
    };
    const backToList = () => { setPo(null); setRestored(null); setDrafts(draftPoIds(userId)); if (poId) navigate('/v3/purchasing/receive'); };
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
            dropDraft(userId, po.id);   // saved for real — the draft is done
            navigate(`/v3/purchasing/grns/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to save the receipt.')); setBusy(false); }
    };

    if (po) {
        return (
            <div>
                <button type="button" onClick={backToList} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Choose another PO{savedAt ? ' (draft kept)' : ''}</button>
                <PageHeader title={`Receive against ${po.po_no}`} subtitle={`${po.supplier_name}. Tick each line that arrived and type the code from the label — it is checked against the PO. Over ${po.tolerance_pct}% more than ordered needs the purchase manager's approval.`} />
                {!po.receivable && <ErrorBox text={`${po.po_no} is ${po.status.toLowerCase().replace('_', ' ')} — nothing can be received on it.`} />}
                {restored && (
                    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <Save size={15} />
                        <span>{restored.fromGrn
                            ? <><b>Entries of {restored.fromGrn} (withdrawn)</b> — correct what was wrong and save the receipt again. It keeps its challan; check the open quantities.</>
                            : <><b>Draft restored</b> — saved {timeText(restored.at)} on this browser. Check the open quantities: other receipts may have come in since.</>}</span>
                        <button type="button" className="ml-auto text-xs font-bold text-rose-700 hover:underline" onClick={discardDraft}>Discard draft</button>
                    </div>
                )}
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                    <Field label="Supplier challan / DC no. *"><input className={inputCls} value={header.challan_no} onChange={e => setHeader({ ...header, challan_no: e.target.value })} autoFocus /></Field>
                    <Field label="Challan date"><input className={inputCls} type="date" value={header.challan_date} onChange={e => setHeader({ ...header, challan_date: e.target.value })} /></Field>
                    <Field label="Vehicle no."><input className={`${inputCls} uppercase`} value={header.vehicle_no} onChange={e => setHeader({ ...header, vehicle_no: e.target.value })} /></Field>
                    <Field label="Received on *"><input className={inputCls} type="date" max={todayLocal()} value={header.received_date} onChange={e => setHeader({ ...header, received_date: e.target.value })} /></Field>
                    <div className="sm:col-span-4"><Field label="Notes"><input className={inputCls} value={header.notes} onChange={e => setHeader({ ...header, notes: e.target.value })} /></Field></div>
                </div>
                <div className="space-y-3 mb-4">
                    {/* Settings → Stores: locations offered for roll locations (free text still allowed) */}
                    <datalist id="v3-store-locations">{(po.locations || []).filter(x => x.area === 'ALL' || x.area === 'FABRIC').map(x => <option key={x.code} value={x.code}>{x.name || ''}</option>)}</datalist>
                    {po.label_check === 'BLIND' && <p className="text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">Blind label check: type the code exactly as printed on the supplier's label — the PO's code is not shown (Settings → Stores).</p>}
                    {po.lines.map(l => <LineForm key={l.id} l={l} value={vals[l.id] || { on: false }} onChange={(v) => setVals({ ...vals, [l.id]: v })} />)}
                </div>
                <ReceiptSummary lines={po.lines} vals={vals} />
                <ErrorBox text={error} />
                <div className="flex flex-wrap items-center gap-3">
                    <PrimaryButton onClick={submit} busy={busy} disabled={busy || !po.receivable || !header.challan_no.trim() || !Object.values(vals).some(v => v.on)}><PackageCheck size={15} /> Save goods receipt</PrimaryButton>
                    {savedAt
                        ? <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Save size={12} /> Draft saved on this browser · {timeText(savedAt)}{!restored && <button type="button" className="ml-2 font-semibold text-rose-700 hover:underline" onClick={discardDraft}>Discard</button>}</span>
                        : <span className="text-xs text-slate-400">Your entries are kept as a draft on this browser as you type.</span>}
                </div>
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
                                    <td className="px-4 py-2.5 font-semibold">{p.po_no}{drafts.has(String(p.id)) && <span className="ml-2 align-middle text-[10px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">DRAFT</span>}{p.status === 'PARTLY_RECEIVED' && <span className="block text-xs font-normal text-amber-700">partly received</span>}</td>
                                    <td className="px-4 py-2.5">{p.supplier_name}</td>
                                    <td className="px-4 py-2.5 text-right">{p.open_lines}</td>
                                    <td className="px-4 py-2.5">{fmtDate(p.next_delivery || p.delivery_date)}</td>
                                    <td className="px-4 py-2.5 text-right"><SecondaryButton onClick={() => openPo(p.id)}>{drafts.has(String(p.id)) ? <><Save size={14} /> Continue draft</> : <><PackageCheck size={14} /> Receive</>}</SecondaryButton></td>
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

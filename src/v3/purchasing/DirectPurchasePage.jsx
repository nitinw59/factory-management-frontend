// Direct purchase (25 Oct 2026, migration 66; owner: "for spares and general items it is very tough … imagine for pen
// box or 1 needle packet waiting for purchase department to generate po" → option A → "build"). The store enters the
// shop's bill — supplier (or Local / cash purchase + shop name), bill no. / date, the spares / general items with
// quantity, rate and GST — and the system makes the PO from it (marked Direct purchase) and the GRN in one go. Up to
// the limits (Settings → Stores) the stock goes in at once; above them the GRN waits for the purchase manager.
// Trims and fabric always need a purchase order.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ShoppingBag, AlertTriangle, Paperclip } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const itemText = (i) => `${i.code} — ${i.name}${i.make ? ` · ${i.make}` : ''}`;

export default function DirectPurchasePage() {
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [head, setHead] = useState({ supplier_id: '', shop_name: '', bill_no: '', bill_date: todayLocal(), received_date: todayLocal(), notes: '' });
    const [lines, setLines] = useState([]);          // { item, qty, rate, gst_pct }
    const [pick, setPick] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        purchasingApi.directSetup().then(res => {
            setD(res.data);
            const cash = res.data.suppliers.find(s => s.is_cash_purchase);
            setHead(h => ({ ...h, supplier_id: cash ? cash.id : '' }));
        }).catch(err => setError(apiError(err, 'Failed to load.')));
    }, []);

    const supplier = d?.suppliers.find(s => s.id === head.supplier_id);
    const byText = useMemo(() => new Map((d?.items || []).map(i => [itemText(i), i])), [d]);
    const addPicked = (v) => {
        const it = byText.get(v);
        if (!it) { setPick(v); return; }
        setPick('');
        if (lines.some(l => l.item.id === it.id)) return;
        setLines(ls => [...ls, { item: it, qty: '', rate: it.last_rate != null ? String(it.last_rate) : '', gst_pct: String(it.gst_pct ?? 0) }]);
    };
    const setLine = (i, patch) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    const amount = (l) => (Number(l.qty) || 0) * (Number(l.rate) || 0);
    const value = lines.reduce((t, l) => t + amount(l), 0);
    const gst = lines.reduce((t, l) => t + amount(l) * (Number(l.gst_pct) || 0) / 100, 0);
    const lim = d?.limits;
    const overReceipt = lim && value > lim.per_receipt + 1e-9;
    const overMonth = lim && lim.month_used + value > lim.per_month + 1e-9;
    const ready = head.supplier_id && head.bill_no.trim() && (!supplier?.is_cash_purchase || head.shop_name.trim())
        && lines.length > 0 && lines.every(l => Number(l.qty) > 0 && l.rate !== '' && Number(l.rate) >= 0) && (!lim?.bill_required || file);

    const save = async () => {
        setBusy(true); setError('');
        try {
            const res = await purchasingApi.createDirect({
                ...head, shop_name: supplier?.is_cash_purchase ? head.shop_name : undefined,
                lines: lines.map(l => ({ store_item_id: l.item.id, qty: Number(l.qty), rate: Number(l.rate), gst_pct: Number(l.gst_pct) })),
            }, file);
            navigate(`/v3/purchasing/grns/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to save.')); setBusy(false); }
    };

    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    if (!d.can) return <ErrorBox text="Direct purchase is for the store manager (spares and general items)." />;
    return (
        <div>
            <PageHeader title="Direct purchase" subtitle="Spares and general items bought on a shop's bill — the purchase order is made from the bill. Trims and fabric always need a purchase order." />
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Up to <b>{money(lim.per_receipt)}</b> per bill and <b>{money(lim.per_month)}</b> a month (before GST) goes into stock at once — you've bought <b>{money(lim.month_used)}</b> directly this month.
                Above that, the purchase manager approves it first.
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-4 gap-3">
                <Field label="Supplier *">
                    <select className={inputCls} value={head.supplier_id} onChange={e => setHead({ ...head, supplier_id: e.target.value })}>
                        <option value="">Choose…</option>
                        {d.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.gstin ? ` · ${s.gstin}` : ''}</option>)}
                    </select>
                </Field>
                {supplier?.is_cash_purchase
                    ? <Field label="Shop name (from the bill) *"><input className={inputCls} value={head.shop_name} onChange={e => setHead({ ...head, shop_name: e.target.value })} placeholder="e.g. Shree Hardware" /></Field>
                    : <div />}
                <Field label="Bill / invoice no. *"><input className={inputCls} value={head.bill_no} onChange={e => setHead({ ...head, bill_no: e.target.value })} /></Field>
                <Field label="Bill date"><input className={inputCls} type="date" max={todayLocal()} value={head.bill_date} onChange={e => setHead({ ...head, bill_date: e.target.value })} /></Field>
                <Field label="Received on *"><input className={inputCls} type="date" max={todayLocal()} value={head.received_date} onChange={e => setHead({ ...head, received_date: e.target.value })} /></Field>
                <div className="sm:col-span-2"><Field label="Notes"><input className={inputCls} value={head.notes} onChange={e => setHead({ ...head, notes: e.target.value })} /></Field></div>
                <Field label={`Bill photo / scan${lim.bill_required ? ' *' : ''}`}>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-indigo-700 font-semibold">
                        <Paperclip size={14} /> {file ? file.name : 'Attach (PDF / JPG / PNG)'}
                        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                    </label>
                </Field>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right w-32">Qty</th><th className="px-3 py-2 text-right w-36">Rate (₹, before GST)</th><th className="px-3 py-2 text-right w-24">GST %</th><th className="px-3 py-2 text-right w-32">Amount</th><th className="w-10" /></tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Add the items on the bill below.</td></tr>}
                        {lines.map((l, i) => (
                            <tr key={l.item.id} className="border-t border-slate-100">
                                <td className="px-3 py-1.5"><b>{l.item.code}</b> — {l.item.name}{l.item.make ? <span className="text-slate-500"> · {l.item.make}</span> : null}
                                    <span className="block text-[11px] text-slate-500">{l.item.item_group === 'SPARE' ? 'Spare' : 'General'} · {l.item.category}{l.item.last_rate != null ? ` · last rate ₹${l.item.last_rate}` : ''}</span></td>
                                <td className="px-3 py-1.5 text-right whitespace-nowrap"><input className={`${inputCls} !w-20 text-right inline-block`} type="number" min="0" step="any" value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} aria-label={`${l.item.name} quantity`} /> <span className="text-xs text-slate-500">{l.item.purchase_uom}</span></td>
                                <td className="px-3 py-1.5 text-right"><input className={`${inputCls} !w-28 text-right inline-block`} type="number" min="0" step="0.01" value={l.rate} onChange={e => setLine(i, { rate: e.target.value })} aria-label={`${l.item.name} rate`} /></td>
                                <td className="px-3 py-1.5 text-right"><input className={`${inputCls} !w-16 text-right inline-block`} type="number" min="0" max="40" step="any" value={l.gst_pct} onChange={e => setLine(i, { gst_pct: e.target.value })} aria-label={`${l.item.name} GST`} /></td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{money(amount(l))}</td>
                                <td className="px-2"><button type="button" className="p-1 text-rose-500" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.item.name}`}><Trash2 size={14} /></button></td>
                            </tr>
                        ))}
                        <tr className="border-t border-slate-100">
                            <td className="px-3 py-2" colSpan={6}>
                                <div className="flex items-center gap-2">
                                    <Plus size={14} className="text-slate-400" />
                                    <input className={`${inputCls} max-w-md`} list="v3-direct-items" value={pick} onChange={e => addPicked(e.target.value)} placeholder="Add an item — type its code or name" aria-label="Add an item" />
                                    <datalist id="v3-direct-items">{d.items.filter(i => !lines.some(l => l.item.id === i.id)).map(i => <option key={i.id} value={itemText(i)} />)}</datalist>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <tr>
                            <td className="px-3 py-2">Total · {lines.length} item{lines.length === 1 ? '' : 's'}</td>
                            <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">+ GST {money(gst)} = {money(value + gst)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(value)}</td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>

            {(overReceipt || overMonth) && (
                <p className="mb-3 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 flex items-start gap-1.5">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>{overReceipt ? `${money(value)} is over the ${money(lim.per_receipt)} limit per bill` : `This takes you to ${money(lim.month_used + value)} this month — over the ${money(lim.per_month)} monthly limit`}. It will wait for the purchase manager's approval before it goes into stock.</span>
                </p>
            )}
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !ready}><ShoppingBag size={15} /> {overReceipt || overMonth ? 'Save — send for approval' : 'Save — stock in'}</PrimaryButton>
        </div>
    );
}

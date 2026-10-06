// Reorder list: store items below their minimum after counting what is
// already requested (store requisitions not yet on a PO) and on order (open
// PO quantity). Tick items, adjust the quantity (purchase units) → a draft
// store requisition for the purchase manager to approve.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2 } from 'lucide-react';
import { storeApi } from '../api/storeApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { inr, fmt, useStorePermissions } from './storeShared';
import StoreItemPicker from './StoreItemPicker';

export default function ReorderPage() {
    const perms = useStorePermissions();
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [extra, setExtra] = useState([]);      // items added by hand (not below minimum)
    const [picks, setPicks] = useState({});      // item id → purchase qty
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => storeApi.reorder().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load the reorder list.'))), []);
    useEffect(() => { load(); }, [load]);

    const all = [...(rows || []), ...extra.filter(e => !(rows || []).some(r => r.id === e.id))];
    const chosen = Object.entries(picks).filter(([, q]) => Number(q) > 0);
    const toggle = (r) => setPicks(p => { const n = { ...p }; if (n[r.id] !== undefined) delete n[r.id]; else n[r.id] = String(r.suggest_purchase_qty || 1); return n; });
    const raise = async () => {
        setBusy(true); setError('');
        try {
            const res = await storeApi.createRequisition({ items: chosen.map(([id, q]) => ({ store_item_id: id, purchase_qty: Number(q) })), notes: notes.trim() || undefined });
            navigate(`/v3/store/requisitions/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to raise the requisition.')); setBusy(false); }
    };

    return (
        <div>
            <PageHeader title="Reorder list" subtitle="Store items below their minimum stock, after what is already requested or on order. Raise a store requisition; the purchase manager approves it and orders it on a PO." />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
                        <table className="w-full text-sm min-w-[1000px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <tr><th className="px-3 py-2.5 w-8" /><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">On hand</th><th className="px-3 py-2.5 text-right">Requested</th><th className="px-3 py-2.5 text-right">On order</th>
                                    <th className="px-3 py-2.5 text-right">Minimum</th><th className="px-3 py-2.5 text-right">Short</th><th className="px-3 py-2.5">Last bought</th><th className="px-3 py-2.5 w-40">Request</th></tr>
                            </thead>
                            <tbody>
                                {all.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Nothing is below its minimum. Set minimum stock on store items to watch them.</td></tr>}
                                {all.map(r => {
                                    const on = picks[r.id] !== undefined;
                                    return (
                                        <tr key={r.id} className={`border-t border-slate-100 ${on ? 'bg-indigo-50/40' : ''}`}>
                                            <td className="px-3 py-2"><input type="checkbox" checked={on} disabled={!perms.requisition} onChange={() => toggle(r)} aria-label={`Pick ${r.label}`} /></td>
                                            <td className="px-3 py-2"><Link to={`/v3/store/items/${r.id}`} className="font-semibold text-indigo-700 hover:underline">{r.label}</Link><span className="block text-xs text-slate-500">{r.group_label} · {r.category_name}</span></td>
                                            <td className="px-3 py-2 text-right tabular-nums">{fmt(r.on_hand, r.usage_uom)} {r.usage_uom}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.requested != null ? fmt(r.requested, r.usage_uom) : '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.on_order != null ? fmt(r.on_order, r.usage_uom) : '—'}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{fmt(r.min_stock, r.usage_uom)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums font-bold text-rose-700">{r.short ? fmt(r.short, r.usage_uom) : '—'}</td>
                                            <td className="px-3 py-2 text-xs text-slate-600">{r.last_rate ? `₹${inr(r.last_rate)} / ${r.purchase_uom} · ${r.last_supplier}` : '—'}</td>
                                            <td className="px-3 py-2">{on ? <div className="flex items-center gap-1"><input className={`${inputCls} !py-1`} type="number" min="1" step="1" value={picks[r.id]} onChange={e => setPicks({ ...picks, [r.id]: e.target.value })} aria-label={`Quantity of ${r.label}`} /><span className="text-xs text-slate-500">{r.purchase_uom}</span></div>
                                                : r.suggest_purchase_qty ? <span className="text-xs text-slate-500">suggest {r.suggest_purchase_qty} {r.purchase_uom}</span> : null}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {perms.requisition && (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                            <Field label="Add another item (not below its minimum)"><StoreItemPicker exclude={all.map(r => String(r.id))} onPick={(item) => { setExtra([...extra, item]); setPicks({ ...picks, [item.id]: '1' }); }} /></Field>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="flex-1 min-w-[240px]"><Field label="Notes"><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Monthly pantry, machine breakdown…" /></Field></div>
                                <PrimaryButton onClick={raise} busy={busy} disabled={busy || !chosen.length || chosen.some(([, q]) => !Number.isInteger(Number(q)))}><FilePlus2 size={15} /> Raise store requisition ({chosen.length})</PrimaryButton>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

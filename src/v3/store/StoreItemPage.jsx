// One store item: stock, average cost and value, what is requested / on
// order, minimum and reorder quantity, adjustments (with reason) and the full
// stock history with costs and references (GRN, issue slip).
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import Modal from '../../shared/Modal';
import { storeApi } from '../api/storeApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { inr, fmt, LEDGER_LABEL, useStorePermissions } from './storeShared';

export default function StoreItemPage() {
    const { id } = useParams();
    const perms = useStorePermissions();
    const [item, setItem] = useState(null);
    const [error, setError] = useState('');
    const [adj, setAdj] = useState(null);
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => storeApi.item(id).then(res => setItem(res.data)).catch(err => setError(apiError(err, 'Failed to load the item.'))), [id]);
    useEffect(() => { load(); }, [load]);
    if (!item) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const saveAdj = async () => {
        setBusy(true); setFormError('');
        const qty = Number(adj.qty) * (adj.dir === 'out' ? -1 : 1);
        try {
            await storeApi.adjust({ store_item_id: id, quantity: qty, unit_cost: adj.dir === 'in' && adj.cost !== '' ? Number(adj.cost) : undefined, reason: adj.reason });
            setAdj(null); load();
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const refLink = (l) => {
        if (l.reference_type === 'GRN') return <Link to={`/v3/purchasing/grns/${l.reference_id}`} className="text-indigo-700 hover:underline">{l.reference_no}</Link>;
        if (l.reference_type === 'STORE_ISSUE') return <Link to={`/v3/store/issues/${l.reference_id}`} className="text-indigo-700 hover:underline">{l.reference_no}</Link>;
        return null;
    };

    return (
        <div>
            <Link to="/v3/store/items" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Store items</Link>
            <h1 className="text-2xl font-black text-slate-900">{item.label}</h1>
            <p className="text-sm text-slate-500 mb-3">{item.group_label} · {item.category_name}{item.description ? ` · ${item.description}` : ''}{item.location ? ` · ${item.location}` : ''}{!item.is_active ? ' · inactive' : ''}</p>
            <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                {[
                    ['On hand', `${fmt(item.on_hand, item.usage_uom)} ${item.usage_uom}`, item.below_min ? 'text-rose-700' : ''],
                    ['Average cost', `₹${inr(item.avg_cost)} / ${item.usage_uom}`],
                    ['Stock value', `₹${inr(item.stock_value)}`],
                    ['Minimum / reorder', item.min_stock ? `${fmt(item.min_stock, item.usage_uom)} / ${fmt(item.reorder_qty, item.usage_uom)}` : 'not watched'],
                    ['Requested', `${fmt(item.requested, item.usage_uom)} ${item.usage_uom}`],
                    ['On order (PO)', `${fmt(item.on_order, item.usage_uom)} ${item.usage_uom}`],
                ].map(([k, v, cls]) => <div key={k} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className={`font-black ${cls || 'text-slate-800'}`}>{v}</p></div>)}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
                {perms.stock && <SecondaryButton onClick={() => { setFormError(''); setAdj({ dir: 'out', qty: '', cost: '', reason: '' }); }}><SlidersHorizontal size={14} /> Adjust stock</SecondaryButton>}
                {perms.stock && !item.has_movements && <Link to="/v3/store/opening-stock" className="text-sm font-semibold text-indigo-700 hover:underline self-center">Enter opening stock →</Link>}
                <span className="text-xs text-slate-500 self-center">Bought in {item.purchase_uom}{item.purchase_uom !== item.usage_uom ? ` of ${fmt(item.factor)} ${item.usage_uom}` : ''}{item.hsn_code ? ` · HSN ${item.hsn_code}` : ''}{item.gst_pct != null ? ` · GST ${item.gst_pct}%` : ''}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-3 py-2.5">When</th><th className="px-3 py-2.5">Movement</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Balance</th><th className="px-3 py-2.5 text-right">Rate ₹</th><th className="px-3 py-2.5 text-right">Value ₹</th><th className="px-3 py-2.5 text-right">Avg after ₹</th><th className="px-3 py-2.5">Reference / reason</th></tr>
                    </thead>
                    <tbody>
                        {item.ledger.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No stock movements yet.</td></tr>}
                        {item.ledger.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString()}{l.user_name ? <span className="block">{l.user_name}</span> : null}</td>
                                <td className="px-3 py-2">{LEDGER_LABEL[l.kind] || l.kind}</td>
                                <td className={`px-3 py-2 text-right tabular-nums font-bold ${l.quantity < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{l.quantity > 0 ? '+' : ''}{fmt(l.quantity, item.usage_uom)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(l.balance_after, item.usage_uom)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.unit_cost)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.value)}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{inr(l.avg_cost_after)}</td>
                                <td className="px-3 py-2 text-xs">{refLink(l)}{l.reason ? <span className="block text-slate-500">{l.reason}</span> : null}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {adj && (
                <Modal title={`Adjust stock — ${item.label}`} onClose={() => setAdj(null)}>
                    <div className="space-y-3 w-[min(460px,88vw)]">
                        <div className="flex gap-4 text-sm">
                            <label className="flex items-center gap-1.5"><input type="radio" checked={adj.dir === 'out'} onChange={() => setAdj({ ...adj, dir: 'out' })} /> Reduce (damage, loss, count short)</label>
                            <label className="flex items-center gap-1.5"><input type="radio" checked={adj.dir === 'in'} onChange={() => setAdj({ ...adj, dir: 'in' })} /> Add (found)</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={`Quantity (${item.usage_uom}) *`}><input className={inputCls} type="number" min="0" step="any" value={adj.qty} onChange={e => setAdj({ ...adj, qty: e.target.value })} autoFocus /></Field>
                            {adj.dir === 'in' && <Field label={`Rate ₹ / ${item.usage_uom}`} hint={`Blank = average ₹${inr(item.avg_cost)}`}><input className={inputCls} type="number" min="0" step="any" value={adj.cost} onChange={e => setAdj({ ...adj, cost: e.target.value })} /></Field>}
                        </div>
                        <Field label="Reason *"><input className={inputCls} value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdj(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveAdj} busy={busy} disabled={busy || !(Number(adj.qty) > 0) || !adj.reason.trim()}>Post adjustment</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

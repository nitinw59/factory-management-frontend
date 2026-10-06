// Store opening stock: the one-time physical count per store item, with its
// unit cost (posts OPENING ledger rows; starts the average cost). Only items
// with no stock movement yet are listed; later corrections are adjustments.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { storeApi } from '../api/storeApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { inr, useStorePermissions } from './storeShared';

export default function StoreOpeningStockPage() {
    const perms = useStorePermissions();
    const [items, setItems] = useState(null);
    const [counts, setCounts] = useState({}); // item id → { qty, cost }
    const [search, setSearch] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => storeApi.items({ active: 'true' }).then(res => setItems(res.data.filter(i => !i.has_movements))).catch(err => setError(apiError(err, 'Failed to load items.'))), []);
    useEffect(() => { load(); }, [load]);
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (items || []).filter(i => !q || `${i.label} ${i.category_name} ${i.location || ''}`.toLowerCase().includes(q));
    }, [items, search]);
    const filled = Object.entries(counts).filter(([, c]) => c.qty !== '' && Number(c.qty) > 0);
    const total = filled.reduce((s, [, c]) => s + Number(c.qty) * Number(c.cost || 0), 0);
    const set = (id, patch) => setCounts({ ...counts, [id]: { qty: '', cost: '', ...counts[id], ...patch } });

    const post = async () => {
        setSaving(true); setError(''); setDone('');
        try {
            const res = await storeApi.opening(filled.map(([id, c]) => ({ store_item_id: id, quantity: Number(c.qty), unit_cost: c.cost === '' ? '' : Number(c.cost) })), note.trim() || undefined);
            setDone(`Opening stock posted for ${res.data.posted} item(s).`); setCounts({}); load();
        } catch (err) { setError(apiError(err, 'Failed to post opening stock.')); } finally { setSaving(false); }
    };

    return (
        <div>
            <PageHeader title="Store opening stock" subtitle="Count each item once, with what it cost (₹ per unit; 0 if unknown). Items that already have stock movements are corrected with an adjustment on the item page."
                actions={<SearchInput value={search} onChange={setSearch} placeholder="Item, category, location" />} />
            <ErrorBox text={error} />
            {done && <p className="mb-3 text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> {done}</p>}
            {!items ? <Loading /> : (
                <>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3">
                        <table className="w-full text-sm min-w-[760px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <tr><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Category</th><th className="px-3 py-2.5">Location</th><th className="px-3 py-2.5 w-36">Counted</th><th className="px-3 py-2.5 w-36">Rate ₹ / unit</th></tr>
                            </thead>
                            <tbody>
                                {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Every active item already has stock movements.</td></tr>}
                                {shown.map(i => (
                                    <tr key={i.id} className="border-t border-slate-100">
                                        <td className="px-3 py-2 font-semibold text-slate-800">{i.label}</td>
                                        <td className="px-3 py-2 text-slate-600">{i.group_label} · {i.category_name}</td>
                                        <td className="px-3 py-2 text-xs text-slate-600">{i.location || '—'}</td>
                                        <td className="px-3 py-2"><div className="flex items-center gap-1"><input className={`${inputCls} !py-1`} type="number" min="0" step="any" value={counts[i.id]?.qty ?? ''} disabled={!perms.stock} onChange={e => set(i.id, { qty: e.target.value })} aria-label={`Count of ${i.label}`} /><span className="text-xs text-slate-500">{i.usage_uom}</span></div></td>
                                        <td className="px-3 py-2"><input className={`${inputCls} !py-1`} type="number" min="0" step="any" value={counts[i.id]?.cost ?? ''} disabled={!perms.stock} onChange={e => set(i.id, { cost: e.target.value })} aria-label={`Rate of ${i.label}`} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {perms.stock && (
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="w-72"><Field label="Note"><input className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="Opening stock count" /></Field></div>
                            <PrimaryButton onClick={post} busy={saving} disabled={saving || !filled.length || filled.some(([, c]) => c.cost === '')}>Post {filled.length} item(s) · ₹{inr(total)}</PrimaryButton>
                            {filled.some(([, c]) => c.cost === '') && <span className="text-xs text-amber-700">Enter a rate for every counted item (0 if unknown).</span>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

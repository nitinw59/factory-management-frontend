// Opening stock: the one-time physical count per trim item (posts OPENING
// ledger rows). Only items with no stock movement yet are listed; later
// corrections are adjustments on the item's stock history.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, ErrorBox, Loading, fmtQty, useMastersPermissions } from '../components/ui';

export default function OpeningStockPage() {
    const perms = useMastersPermissions();
    const [items, setItems] = useState(null);
    const [counts, setCounts] = useState({}); // item id → { qty, inPurchase }
    const [search, setSearch] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        mastersApi.trimItems({ active: 'true' })
            .then(res => setItems(res.data.filter(i => !i.has_movements)))
            .catch(err => setError(apiError(err, 'Failed to load items.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (items || []).filter(it => !q || `${it.brand} ${it.code} ${it.description || ''} ${it.trim_type_name}`.toLowerCase().includes(q));
    }, [items, search]);

    // Entered in purchase units (e.g. 15 cones) or usage units (75,000 m);
    // always posted in usage units.
    const usageQty = (it) => {
        const c = counts[it.id];
        if (!c || c.qty === '' || c.qty == null) return null;
        const n = Number(c.qty);
        if (!Number.isFinite(n) || n <= 0) return NaN;
        return c.inPurchase ? Math.round(n * Number(it.usage_per_purchase_uom) * 1000) / 1000 : n;
    };

    const lines = (items || []).map(it => ({ it, q: usageQty(it) })).filter(l => l.q !== null);
    const invalid = lines.filter(l => !Number.isFinite(l.q) || (l.it.usage_uom === 'pcs' && !Number.isInteger(l.q)));

    const post = async () => {
        setSaving(true); setError(''); setDone('');
        try {
            const res = await mastersApi.postOpeningStock(lines.map(l => ({ trim_item_id: l.it.id, quantity: l.q })), note);
            setDone(`Opening stock posted for ${res.data.posted} item${res.data.posted !== 1 ? 's' : ''}.`);
            setCounts({}); setNote(''); load();
        } catch (err) {
            setError(apiError(err, 'Failed to post opening stock.'));
        } finally {
            setSaving(false);
        }
    };

    if (!perms.stock) {
        return <div><PageHeader title="Opening stock" /><p className="text-sm text-slate-500">Only the store manager or factory admin can enter opening stock.</p></div>;
    }

    return (
        <div>
            <PageHeader
                title="Opening stock"
                subtitle="Enter the physical count once per item. Items that already have stock movements aren't listed."
                actions={<SearchInput value={search} onChange={setSearch} placeholder="Search items" />}
            />
            {done && <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3"><CheckCircle2 size={15} /> {done}</div>}
            <ErrorBox text={error} />
            {!items ? <Loading /> : items.length === 0 ? (
                <p className="text-sm text-slate-500 py-6">Every active trim item already has stock. Corrections go through an adjustment in Trim items &amp; stock.</p>
            ) : (
                <>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                        <table className="w-full text-sm min-w-[760px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <tr><th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5 w-44">Counted</th><th className="px-4 py-2.5 w-40">Counted in</th><th className="px-4 py-2.5 text-right">Will post</th></tr>
                            </thead>
                            <tbody>
                                {shown.map(it => {
                                    const c = counts[it.id] || { qty: '', inPurchase: false };
                                    const q = usageQty(it);
                                    const hasConversion = Number(it.usage_per_purchase_uom) !== 1 || it.purchase_uom !== it.usage_uom;
                                    const bad = q !== null && (!Number.isFinite(q) || (it.usage_uom === 'pcs' && !Number.isInteger(q)));
                                    return (
                                        <tr key={it.id} className="border-t border-slate-100">
                                            <td className="px-4 py-2"><span className="font-semibold text-slate-800">{it.brand} · {it.code}</span>{it.description && <span className="block text-xs text-slate-500">{it.description}</span>}</td>
                                            <td className="px-4 py-2 text-slate-600">{it.trim_type_name}</td>
                                            <td className="px-4 py-2">
                                                <input className={`${inputCls} ${bad ? 'border-rose-400' : ''}`} type="number" min="0" step="any" value={c.qty}
                                                    onChange={e => setCounts({ ...counts, [it.id]: { ...c, qty: e.target.value } })} aria-label={`Count for ${it.brand} ${it.code}`} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <select className={inputCls} value={c.inPurchase ? 'p' : 'u'} disabled={!hasConversion}
                                                    onChange={e => setCounts({ ...counts, [it.id]: { ...c, inPurchase: e.target.value === 'p' } })}>
                                                    <option value="u">{it.usage_uom}</option>
                                                    {hasConversion && <option value="p">{it.purchase_uom}</option>}
                                                </select>
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">
                                                {q === null ? <span className="text-slate-300">—</span>
                                                    : bad ? <span className="text-xs font-bold text-rose-600">{it.usage_uom === 'pcs' ? 'whole pieces only' : 'invalid'}</span>
                                                        : <span className="font-bold text-slate-800">{fmtQty(q)} {it.usage_uom}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[240px]"><Field label="Note (optional)"><input className={inputCls} placeholder="e.g. Store count 4 Oct 2026" value={note} onChange={e => setNote(e.target.value)} /></Field></div>
                        <PrimaryButton onClick={post} busy={saving} disabled={saving || lines.length === 0 || invalid.length > 0}>
                            Post opening stock ({lines.length} item{lines.length !== 1 ? 's' : ''})
                        </PrimaryButton>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Posted all together; if any line fails, nothing is posted.</p>
                </>
            )}
        </div>
    );
}

// Store items (spares and general items): one master, filtered by group /
// category; stock, average cost and value per item; add / edit / copy;
// categories. The code is what is printed on the box or label — the goods
// receipt checks it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Copy, Tags, FileSpreadsheet } from 'lucide-react';
import Modal from '../../shared/Modal';
import { storeApi } from '../api/storeApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, ActiveBadge } from '../components/ui';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { UNITS, GROUP_LABEL, inr, fmt, useStorePermissions, exportStock } from './storeShared';

const blank = { category_id: '', name: '', code: '', make: '', description: '', usage_uom: 'pcs', purchase_uom: '', usage_per_purchase_uom: '1', hsn_code: '', gst_pct: '', min_stock: '', reorder_qty: '', location: '', is_active: true };

export default function StoreItemsPage() {
    const perms = useStorePermissions();
    const [items, setItems] = useState(null);
    const [cats, setCats] = useState([]);
    const [search, setSearch] = useState('');
    const [group, setGroup] = useState('');
    const [catId, setCatId] = useState('');
    const [belowMin, setBelowMin] = useState(false);
    const [form, setForm] = useState(null);
    const [catForm, setCatForm] = useState(null);
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);

    const loadCats = useCallback(() => storeApi.categories().then(res => setCats(res.data)).catch(() => {}), []);
    const load = useCallback(() => storeApi.items({ q: search.trim() || undefined, group: group || undefined, category_id: catId || undefined, below_min: belowMin ? 'true' : undefined })
        .then(res => setItems(res.data)).catch(err => setError(apiError(err, 'Failed to load store items.'))), [search, group, catId, belowMin]);
    useEffect(() => { loadCats(); }, [loadCats]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    const totalValue = useMemo(() => (items || []).reduce((s, i) => s + i.stock_value, 0), [items]);
    const openForm = (item, copy = false) => {
        setFormError('');
        if (!item) return setForm({ ...blank, category_id: catId || '' });
        const f = { ...blank };
        for (const k of Object.keys(blank)) f[k] = item[k] ?? blank[k];
        f.usage_per_purchase_uom = String(item.factor);
        f.gst_pct = item.gst_pct ?? '';
        f.min_stock = item.min_stock ? String(item.min_stock) : '';
        f.reorder_qty = item.reorder_qty ? String(item.reorder_qty) : '';
        if (copy) { f.code = ''; f.is_active = true; return setForm({ ...f, copyOf: item.label }); }
        return setForm({ ...f, id: item.id, has_movements: item.has_movements });
    };
    const save = async () => {
        setBusy(true); setFormError('');
        const { id, has_movements: _m, copyOf: _c, ...data } = form;
        try {
            if (id) await storeApi.updateItem(id, data); else await storeApi.createItem(data);
            setForm(null); load();
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const saveCat = async () => {
        setBusy(true); setFormError('');
        try {
            if (catForm.id) await storeApi.updateCategory(catForm.id, catForm); else await storeApi.createCategory(catForm);
            setCatForm({ list: true }); loadCats();
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const shownCats = cats.filter(c => !group || c.item_group === group);
    const set = (patch) => setForm({ ...form, ...patch });

    return (
        <div>
            <PageHeader title="Store items" subtitle={`Spares and general items, with stock at average cost. Stock value shown: ₹${inr(totalValue)}.`}
                actions={<>
                    <SecondaryButton onClick={() => exportStock(items || [], todayLocal())} disabled={!items?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                    {perms.items && <SecondaryButton onClick={() => { setFormError(''); setCatForm({ list: true }); }}><Tags size={14} /> Categories</SecondaryButton>}
                    {perms.items && <PrimaryButton onClick={() => openForm(null)}><Plus size={14} /> Add item</PrimaryButton>}
                </>} />
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Name, code, make, location" />
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={group} onChange={e => { setGroup(e.target.value); setCatId(''); }} aria-label="Group">
                    <option value="">Spares and general</option><option value="SPARE">Spares</option><option value="GENERAL">General items</option>
                </select>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={catId} onChange={e => setCatId(e.target.value)} aria-label="Category">
                    <option value="">All categories</option>
                    {shownCats.map(c => <option key={c.id} value={c.id}>{GROUP_LABEL[c.item_group]} · {c.name}</option>)}
                </select>
                <label className="text-sm text-slate-700 flex items-center gap-1.5"><input type="checkbox" checked={belowMin} onChange={e => setBelowMin(e.target.checked)} /> Below minimum</label>
                <Link to="/v3/store/reorder" className="text-sm font-semibold text-indigo-700 hover:underline ml-auto">Reorder list →</Link>
            </div>
            <ErrorBox text={error} />
            {!items ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[980px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Category</th><th className="px-3 py-2.5 text-right">On hand</th><th className="px-3 py-2.5 text-right">Min</th>
                                <th className="px-3 py-2.5 text-right">Avg cost ₹</th><th className="px-3 py-2.5 text-right">Value ₹</th><th className="px-3 py-2.5">Buying</th><th className="px-3 py-2.5">Location</th><th className="px-3 py-2.5 w-20" /></tr>
                        </thead>
                        <tbody>
                            {items.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No store items{search || group || catId || belowMin ? ' match' : ' yet'}.</td></tr>}
                            {items.map(i => (
                                <tr key={i.id} className={`border-t border-slate-100 ${i.is_active ? '' : 'opacity-60'}`}>
                                    <td className="px-3 py-2.5"><Link to={`/v3/store/items/${i.id}`} className="font-semibold text-indigo-700 hover:underline">{i.label}</Link>
                                        {i.description && <span className="block text-xs text-slate-500">{i.description}</span>}{!i.is_active && <ActiveBadge active={false} />}</td>
                                    <td className="px-3 py-2.5 text-slate-600">{i.group_label} · {i.category_name}</td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${i.below_min ? 'text-rose-700' : ''}`}>{fmt(i.on_hand, i.usage_uom)} <span className="text-xs font-normal text-slate-500">{i.usage_uom}</span></td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{i.min_stock ? fmt(i.min_stock, i.usage_uom) : '—'}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(i.avg_cost)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(i.stock_value)}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600">{i.purchase_uom !== i.usage_uom ? `${i.purchase_uom} of ${fmt(i.factor)} ${i.usage_uom}` : i.usage_uom}{i.hsn_code ? ` · HSN ${i.hsn_code}` : ''}{i.gst_pct != null ? ` · GST ${i.gst_pct}%` : ''}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600">{i.location || '—'}</td>
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                        {perms.items && <>
                                            <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit ${i.label}`} onClick={() => openForm(i)}><Pencil size={14} /></button>
                                            <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Copy ${i.label}`} onClick={() => openForm(i, true)}><Copy size={14} /></button>
                                        </>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {form && (
                <Modal title={form.id ? 'Edit store item' : form.copyOf ? `Add item (copy of ${form.copyOf})` : 'Add store item'} onClose={() => setForm(null)}>
                    <div className="space-y-3 w-[min(640px,92vw)] max-h-[75vh] overflow-y-auto">
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Category *"><select className={inputCls} value={form.category_id} onChange={e => set({ category_id: e.target.value })}>
                                <option value="">Choose…</option>{cats.filter(c => c.is_active || String(c.id) === String(form.category_id)).map(c => <option key={c.id} value={c.id}>{GROUP_LABEL[c.item_group]} · {c.name}</option>)}</select></Field>
                            <Field label="Name *"><input className={inputCls} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="DB needle size 14" /></Field>
                            <Field label="Code on the label / part no. *" hint="As printed on the box or label — checked at goods receipt."><input className={`${inputCls} font-mono`} value={form.code} onChange={e => set({ code: e.target.value })} autoFocus={Boolean(form.copyOf)} /></Field>
                            <Field label="Make / brand"><input className={inputCls} value={form.make} onChange={e => set({ make: e.target.value })} /></Field>
                        </div>
                        <Field label="Description"><input className={inputCls} value={form.description || ''} onChange={e => set({ description: e.target.value })} /></Field>
                        <div className="grid sm:grid-cols-3 gap-3">
                            <Field label="Unit *" hint={form.has_movements ? 'Locked: stock has moved.' : ' '}><select className={inputCls} value={form.usage_uom} disabled={form.has_movements} onChange={e => set({ usage_uom: e.target.value })}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
                            <Field label="Bought in" hint="Purchase unit, e.g. pkt, box, can"><input className={inputCls} value={form.purchase_uom} placeholder={form.usage_uom} onChange={e => set({ purchase_uom: e.target.value })} /></Field>
                            <Field label={`${form.usage_uom} per ${form.purchase_uom || form.usage_uom}`}><input className={inputCls} type="number" min="0" step="any" value={form.usage_per_purchase_uom} disabled={!form.purchase_uom || form.purchase_uom === form.usage_uom} onChange={e => set({ usage_per_purchase_uom: e.target.value })} /></Field>
                            <Field label="HSN code"><input className={inputCls} value={form.hsn_code || ''} onChange={e => set({ hsn_code: e.target.value })} /></Field>
                            <Field label="GST %"><input className={inputCls} type="number" min="0" max="40" step="0.01" value={form.gst_pct} onChange={e => set({ gst_pct: e.target.value })} /></Field>
                            <Field label="Location"><input className={inputCls} value={form.location || ''} onChange={e => set({ location: e.target.value })} placeholder="Shelf 3, row 2" /></Field>
                            <Field label={`Minimum stock (${form.usage_uom})`} hint="Reorder level; 0 = not watched"><input className={inputCls} type="number" min="0" step="any" value={form.min_stock} onChange={e => set({ min_stock: e.target.value })} /></Field>
                            <Field label={`Reorder quantity (${form.usage_uom})`} hint="Usual quantity to buy"><input className={inputCls} type="number" min="0" step="any" value={form.reorder_qty} onChange={e => set({ reorder_qty: e.target.value })} /></Field>
                            {form.id && <Field label="Status"><label className="flex items-center gap-2 text-sm py-2"><input type="checkbox" checked={form.is_active} onChange={e => set({ is_active: e.target.checked })} /> Active</label></Field>}
                        </div>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={busy} disabled={busy || !form.category_id || !form.name.trim() || !form.code.trim()}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {catForm && (
                <Modal title="Store categories" onClose={() => setCatForm(null)}>
                    <div className="space-y-3 w-[min(560px,92vw)] max-h-[75vh] overflow-y-auto">
                        <table className="w-full text-sm">
                            <tbody>
                                {cats.map(c => (
                                    <tr key={c.id} className="border-t border-slate-100"><td className="py-1.5">{GROUP_LABEL[c.item_group]}</td><td className="py-1.5 font-semibold">{c.name}{!c.is_active && <span className="ml-1 text-xs text-slate-400">(inactive)</span>}</td>
                                        <td className="py-1.5 text-xs text-slate-500">{c.item_count} item(s)</td>
                                        <td className="py-1.5 text-right"><button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit ${c.name}`} onClick={() => setCatForm({ id: c.id, item_group: c.item_group, name: c.name, description: c.description || '', is_active: c.is_active })}><Pencil size={13} /></button></td></tr>
                                ))}
                            </tbody>
                        </table>
                        {catForm.list ? <SecondaryButton onClick={() => setCatForm({ item_group: 'SPARE', name: '', description: '' })}><Plus size={14} /> Add category</SecondaryButton> : (
                            <div className="border-t border-slate-200 pt-3 grid sm:grid-cols-2 gap-3">
                                <Field label="Group"><select className={inputCls} value={catForm.item_group} disabled={Boolean(catForm.id)} onChange={e => setCatForm({ ...catForm, item_group: e.target.value })}><option value="SPARE">Spare</option><option value="GENERAL">General</option></select></Field>
                                <Field label="Name *"><input className={inputCls} value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} autoFocus /></Field>
                                <div className="sm:col-span-2"><Field label="Description"><input className={inputCls} value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} /></Field></div>
                                {catForm.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={catForm.is_active} onChange={e => setCatForm({ ...catForm, is_active: e.target.checked })} /> Active</label>}
                                <div className="sm:col-span-2 flex justify-end gap-2">
                                    <SecondaryButton onClick={() => setCatForm({ list: true })}>Back</SecondaryButton>
                                    <PrimaryButton onClick={saveCat} busy={busy} disabled={busy || !catForm.name.trim()}>Save category</PrimaryButton>
                                </div>
                            </div>
                        )}
                        <ErrorBox text={formError} />
                    </div>
                </Modal>
            )}
        </div>
    );
}

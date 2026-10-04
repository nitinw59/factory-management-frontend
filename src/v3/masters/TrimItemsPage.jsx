// Trim items (v3.trim_items): one record per vendor item (brand + code), with
// usage unit, purchase unit and conversion, plus on-hand stock, the movement
// ledger and stock adjustments.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, History } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading, fmtQty, useMastersPermissions } from '../components/ui';

const PURCHASE_UNITS = ['pcs', 'cone', 'gross', 'box', 'roll', 'packet', 'dozen'];
const UOM_LABEL = { pcs: 'pcs', m: 'm' };

const conversionText = (it) => (it.purchase_uom === it.usage_uom && Number(it.usage_per_purchase_uom) === 1
    ? `bought in ${it.usage_uom}`
    : `1 ${it.purchase_uom} = ${fmtQty(it.usage_per_purchase_uom)} ${UOM_LABEL[it.usage_uom]}`);

const inPurchaseUnits = (it) => {
    const n = Number(it.on_hand) / Number(it.usage_per_purchase_uom);
    return `${fmtQty(Math.round(n * 100) / 100)} ${it.purchase_uom}`;
};

export default function TrimItemsPage() {
    const perms = useMastersPermissions();
    const [items, setItems] = useState(null);
    const [types, setTypes] = useState([]);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [ledgerItem, setLedgerItem] = useState(null);

    const load = useCallback(() => {
        Promise.all([mastersApi.trimItems(), mastersApi.trimTypes()])
            .then(([i, t]) => { setItems(i.data); setTypes(t.data); })
            .catch(err => setError(apiError(err, 'Failed to load trim items.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (items || []).filter(it =>
            (!typeFilter || String(it.trim_type_id) === typeFilter)
            && (!q || `${it.brand} ${it.code} ${it.description || ''}`.toLowerCase().includes(q)));
    }, [items, search, typeFilter]);

    const editingType = editing ? types.find(t => String(t.id) === String(editing.trim_type_id)) : null;

    const startNew = () => {
        const t = types.find(x => x.is_active);
        setFormError('');
        setEditing({ trim_type_id: t ? String(t.id) : '', brand: '', code: '', description: '', specs: {}, usage_uom: t?.default_usage_uom || 'pcs', purchase_uom: 'pcs', usage_per_purchase_uom: 1, is_active: true });
    };

    const save = async () => {
        setSaving(true); setFormError('');
        try {
            if (editing.id) await mastersApi.updateTrimItem(editing.id, editing);
            else await mastersApi.createTrimItem(editing);
            setEditing(null); load();
        } catch (err) {
            setFormError(apiError(err, 'Failed to save.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Trim items & stock"
                subtitle="One item per vendor item (brand + code). Stock is kept in the usage unit."
                actions={<>
                    <select className={`${inputCls} w-44`} value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter by type">
                        <option value="">All types</option>
                        {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search brand, code, description" />
                    {perms.trims && <PrimaryButton onClick={startNew} disabled={types.length === 0}><Plus size={15} /> Add item</PrimaryButton>}
                </>}
            />
            {perms.trims && types.length === 0 && items && <p className="text-sm text-amber-700 mb-3">Add a trim type first.</p>}
            <ErrorBox text={error} />
            {!items ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5">Brand · code</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Specs</th>
                                <th className="px-4 py-2.5">Units</th><th className="px-4 py-2.5 text-right">On hand</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-20" />
                            </tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No trim items.</td></tr>}
                            {shown.map(it => (
                                <tr key={it.id} className="border-t border-slate-100 align-top">
                                    <td className="px-4 py-2.5">
                                        <span className="font-semibold text-slate-800">{it.brand} · {it.code}</span>
                                        {it.description && <span className="block text-xs text-slate-500">{it.description}</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600">{it.trim_type_name}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">
                                        {(it.spec_fields || []).filter(f => it.specs?.[f.key] !== undefined).map(f => `${f.label}: ${it.specs[f.key]}${f.unit ? ` ${f.unit}` : ''}`).join(' · ') || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">{UOM_LABEL[it.usage_uom]} · {conversionText(it)}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">
                                        <span className="font-bold text-slate-800">{fmtQty(it.on_hand)} {UOM_LABEL[it.usage_uom]}</span>
                                        {Number(it.usage_per_purchase_uom) !== 1 && <span className="block text-xs text-slate-400">≈ {inPurchaseUnits(it)}</span>}
                                        {!it.has_opening && <span className="block text-[11px] font-bold text-amber-600">no opening stock</span>}
                                    </td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={it.is_active} /></td>
                                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                        <button type="button" onClick={() => setLedgerItem(it)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Stock history of ${it.brand} ${it.code}`}><History size={15} /></button>
                                        {perms.trims && <button type="button" onClick={() => { setFormError(''); setEditing({ ...it, trim_type_id: String(it.trim_type_id), description: it.description || '' }); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Edit ${it.brand} ${it.code}`}><Pencil size={15} /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? 'Edit trim item' : 'Add trim item'} onClose={() => setEditing(null)}>
                    <div className="space-y-4 w-[min(620px,85vw)]">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Brand / vendor *" hint='As written by the vendor, e.g. "Coats".'><input className={inputCls} value={editing.brand} onChange={e => setEditing({ ...editing, brand: e.target.value })} autoFocus /></Field>
                            <Field label="Code *" hint='Vendor code incl. shade, e.g. "1234".'><input className={inputCls} value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} /></Field>
                        </div>
                        <Field label="Description" hint='e.g. "Navy", "Epic TKT 120".'><input className={inputCls} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></Field>
                        <Field label="Trim type *">
                            <select className={inputCls} value={editing.trim_type_id}
                                onChange={e => {
                                    const t = types.find(x => String(x.id) === e.target.value);
                                    setEditing({ ...editing, trim_type_id: e.target.value, specs: {}, usage_uom: editing.has_movements ? editing.usage_uom : (t?.default_usage_uom || editing.usage_uom) });
                                }}>
                                {types.filter(t => t.is_active || String(t.id) === String(editing.trim_type_id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </Field>
                        {editingType?.spec_fields?.length > 0 && (
                            <div className="grid grid-cols-2 gap-3">
                                {editingType.spec_fields.map(f => (
                                    <Field key={f.key} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`}>
                                        <input className={inputCls} type={f.type === 'number' ? 'number' : 'text'} value={editing.specs?.[f.key] ?? ''}
                                            onChange={e => setEditing({ ...editing, specs: { ...editing.specs, [f.key]: e.target.value } })} />
                                    </Field>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="Usage unit *" hint={editing.has_movements ? 'Locked: stock has moved.' : 'Unit for BOM and stock.'}>
                                <select className={inputCls} value={editing.usage_uom} disabled={editing.has_movements} onChange={e => setEditing({ ...editing, usage_uom: e.target.value })}>
                                    <option value="pcs">pieces</option><option value="m">metres</option>
                                </select>
                            </Field>
                            <Field label="Purchase unit *">
                                <input className={inputCls} list="v3-purchase-units" value={editing.purchase_uom} onChange={e => setEditing({ ...editing, purchase_uom: e.target.value })} />
                                <datalist id="v3-purchase-units">{PURCHASE_UNITS.map(u => <option key={u} value={u} />)}</datalist>
                            </Field>
                            <Field label={`${UOM_LABEL[editing.usage_uom]} per ${editing.purchase_uom || 'unit'} *`} hint="e.g. 5000 m per cone, 144 pcs per gross.">
                                <input className={inputCls} type="number" min="0" step="any" value={editing.usage_per_purchase_uom} onChange={e => setEditing({ ...editing, usage_per_purchase_uom: e.target.value })} />
                            </Field>
                        </div>
                        {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={saving} disabled={saving || !editing.brand.trim() || !editing.code.trim() || !editing.trim_type_id}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {ledgerItem && <LedgerModal item={ledgerItem} canAdjust={perms.stock} onClose={() => setLedgerItem(null)} onChanged={load} />}
        </div>
    );
}

const KIND_STYLE = {
    OPENING: 'bg-indigo-50 text-indigo-700', GRN: 'bg-emerald-50 text-emerald-700', ISSUE: 'bg-amber-50 text-amber-700',
    RETURN: 'bg-sky-50 text-sky-700', ADJUSTMENT: 'bg-slate-100 text-slate-700',
};

function LedgerModal({ item, canAdjust, onClose, onChanged }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [adj, setAdj] = useState({ direction: '-', quantity: '', reason: '' });
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        mastersApi.trimItemLedger(item.id).then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load history.')));
    }, [item.id]);
    useEffect(() => { load(); }, [load]);

    const saveAdjustment = async () => {
        setSaving(true); setError('');
        try {
            await mastersApi.postAdjustment({ trim_item_id: item.id, quantity: Number(`${adj.direction}${adj.quantity}`), reason: adj.reason });
            setAdj({ direction: '-', quantity: '', reason: '' });
            load(); onChanged();
        } catch (err) {
            setError(apiError(err, 'Failed to post the adjustment.'));
        } finally {
            setSaving(false);
        }
    };

    const unit = UOM_LABEL[item.usage_uom];
    return (
        <Modal title={`${item.brand} · ${item.code} — stock history`} onClose={onClose}>
            <div className="space-y-4 w-[min(760px,88vw)]">
                {data && <p className="text-sm text-slate-600">On hand: <span className="font-black text-slate-900">{fmtQty(data.item.on_hand)} {unit}</span></p>}
                {canAdjust && data?.movements?.length > 0 && (
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-bold text-slate-600">Adjustment (count correction, damage …)</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <select className={`${inputCls} w-28`} value={adj.direction} onChange={e => setAdj({ ...adj, direction: e.target.value })} aria-label="Add or reduce">
                                <option value="-">Reduce</option><option value="">Add</option>
                            </select>
                            <input className={`${inputCls} w-32`} type="number" min="0" step="any" placeholder={`qty (${unit})`} value={adj.quantity} onChange={e => setAdj({ ...adj, quantity: e.target.value })} />
                            <input className={`${inputCls} flex-1 min-w-[180px]`} placeholder="Reason (required)" value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} />
                            <PrimaryButton onClick={saveAdjustment} busy={saving} disabled={saving || !(Number(adj.quantity) > 0) || !adj.reason.trim()}>Post</PrimaryButton>
                        </div>
                    </div>
                )}
                <ErrorBox text={error} />
                {!data ? <Loading /> : data.movements.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">No movements yet. Enter the opening stock first.</p>
                ) : (
                    <div className="max-h-[50vh] overflow-y-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0">
                                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2 text-right">Change</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Reason · by</th></tr>
                            </thead>
                            <tbody>
                                {data.movements.map(m => (
                                    <tr key={m.id} className="border-t border-slate-100">
                                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</td>
                                        <td className="px-3 py-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${KIND_STYLE[m.kind]}`}>{m.kind}</span></td>
                                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Number(m.quantity) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{Number(m.quantity) > 0 ? '+' : ''}{fmtQty(m.quantity)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(m.balance_after)}</td>
                                        <td className="px-3 py-2 text-xs text-slate-600">{m.reason || '—'}{m.user_name ? ` · ${m.user_name}` : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Modal>
    );
}

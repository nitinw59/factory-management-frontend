// Fabric items (v3.fabric_items): mill + article + shade = one item.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading, useMastersPermissions } from '../components/ui';

const empty = { mill: '', article_code: '', shade_code: '', shade_name: '', composition: '', gsm: '', width: '', width_unit: 'in', usage_uom: 'm', hsn_code: '', gst_pct: '', is_active: true };

export default function FabricItemsPage() {
    const perms = useMastersPermissions();
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => {
        mastersApi.fabricItems().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load fabric items.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (rows || []).filter(r => !q || `${r.mill} ${r.article_code} ${r.shade_code} ${r.shade_name || ''}`.toLowerCase().includes(q));
    }, [rows, search]);

    const save = async () => {
        setSaving(true); setFormError('');
        try {
            if (editing.id) await mastersApi.updateFabricItem(editing.id, editing);
            else await mastersApi.createFabricItem(editing);
            setEditing(null); load();
        } catch (err) {
            setFormError(apiError(err, 'Failed to save.'));
        } finally {
            setSaving(false);
        }
    };

    const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.value });
    const canSave = editing && editing.mill.trim() && editing.article_code.trim() && editing.shade_code.trim();

    return (
        <div>
            <PageHeader
                title="Fabric items"
                subtitle="Mill + article + shade is one item. Rolls with dye lot come with fabric inward."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search mill, article, shade" />
                    {perms.fabric && <PrimaryButton onClick={() => { setFormError(''); setEditing({ ...empty }); }}><Plus size={15} /> Add fabric item</PrimaryButton>}
                </>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Mill · article</th><th className="px-4 py-2.5">Shade</th><th className="px-4 py-2.5">Composition</th><th className="px-4 py-2.5">GSM</th><th className="px-4 py-2.5">Width</th><th className="px-4 py-2.5">Unit</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-16" /></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No fabric items yet.</td></tr>}
                            {shown.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.mill} · {r.article_code}</td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.shade_code}{r.shade_name ? ` · ${r.shade_name}` : ''}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.composition || '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.gsm ? Number(r.gsm) : '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.width ? `${Number(r.width)} ${r.width_unit}` : '—'}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.usage_uom}</td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                        {perms.fabric && <button type="button" onClick={() => { setFormError(''); setEditing({ ...empty, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])), gsm: r.gsm ? Number(r.gsm) : '', width: r.width ? Number(r.width) : '', gst_pct: r.gst_pct != null ? Number(r.gst_pct) : '' }); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Edit ${r.mill} ${r.article_code} ${r.shade_code}`}><Pencil size={15} /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? 'Edit fabric item' : 'Add fabric item'} onClose={() => setEditing(null)}>
                    <div className="space-y-4 w-[min(600px,85vw)]">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Mill *" hint='e.g. "Arvind"'><input className={inputCls} value={editing.mill} onChange={set('mill')} autoFocus /></Field>
                            <Field label="Article code *" hint='e.g. "DN-401"'><input className={inputCls} value={editing.article_code} onChange={set('article_code')} /></Field>
                            <Field label="Shade code *" hint='e.g. "826"'><input className={inputCls} value={editing.shade_code} onChange={set('shade_code')} /></Field>
                            <Field label="Shade name" hint='e.g. "Black"'><input className={inputCls} value={editing.shade_name} onChange={set('shade_name')} /></Field>
                        </div>
                        <Field label="Composition" hint='e.g. "98% cotton 2% elastane"'><input className={inputCls} value={editing.composition} onChange={set('composition')} /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="HSN code" hint="4, 6 or 8 digits — printed on purchase orders."><input className={inputCls} inputMode="numeric" value={editing.hsn_code} onChange={set('hsn_code')} /></Field>
                            <Field label="GST %" hint="Default GST on purchase orders, e.g. 5."><input className={inputCls} type="number" min="0" max="40" step="0.01" value={editing.gst_pct} onChange={set('gst_pct')} /></Field>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            <Field label="GSM"><input className={inputCls} type="number" min="0" step="any" value={editing.gsm} onChange={set('gsm')} /></Field>
                            <Field label="Width"><input className={inputCls} type="number" min="0" step="any" value={editing.width} onChange={set('width')} /></Field>
                            <Field label="Width unit">
                                <select className={inputCls} value={editing.width_unit} onChange={set('width_unit')}><option value="in">inches</option><option value="cm">cm</option></select>
                            </Field>
                            <Field label="Unit">
                                <select className={inputCls} value={editing.usage_uom} onChange={set('usage_uom')}><option value="m">metres</option><option value="kg">kg (knits)</option></select>
                            </Field>
                        </div>
                        {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={saving} disabled={saving || !canSave}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

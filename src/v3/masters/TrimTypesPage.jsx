// Trim types (v3.trim_types): thread, button, zipper … each with its own
// specification fields that trim items of that type fill in.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading, useMastersPermissions } from '../components/ui';

const UOM_LABEL = { pcs: 'pieces', m: 'metres' };

export default function TrimTypesPage() {
    const perms = useMastersPermissions();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => {
        mastersApi.trimTypes().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load trim types.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const setField = (i, patch) => setEditing(e => ({ ...e, spec_fields: e.spec_fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));

    const save = async () => {
        setSaving(true); setFormError('');
        try {
            const payload = { ...editing, spec_fields: editing.spec_fields.filter(f => f.label.trim()) };
            if (editing.id) await mastersApi.updateTrimType(editing.id, payload);
            else await mastersApi.createTrimType(payload);
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
                title="Trim types"
                subtitle="Each type lists the specification fields its items fill in (e.g. button: ligne, holes)."
                actions={perms.trims && <PrimaryButton onClick={() => { setFormError(''); setEditing({ name: '', default_usage_uom: 'pcs', spec_fields: [], is_active: true }); }}><Plus size={15} /> Add trim type</PrimaryButton>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Usage unit</th><th className="px-4 py-2.5">Specification fields</th><th className="px-4 py-2.5">Items</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-16" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No trim types yet.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.name}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{UOM_LABEL[r.default_usage_uom]}</td>
                                    <td className="px-4 py-2.5 text-slate-600">
                                        {r.spec_fields.length === 0 ? '—' : r.spec_fields.map(f => `${f.label}${f.unit ? ` (${f.unit})` : ''}`).join(', ')}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.item_count}</td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                        {perms.trims && <button type="button" onClick={() => { setFormError(''); setEditing({ ...r, spec_fields: r.spec_fields.map(f => ({ ...f, unit: f.unit || '' })) }); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Edit ${r.name}`}><Pencil size={15} /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? 'Edit trim type' : 'Add trim type'} onClose={() => setEditing(null)}>
                    <div className="space-y-4 w-[min(560px,85vw)]">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Name *"><input className={inputCls} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
                            <Field label="Default usage unit *" hint="New items of this type start with it.">
                                <select className={inputCls} value={editing.default_usage_uom} onChange={e => setEditing({ ...editing, default_usage_uom: e.target.value })}>
                                    <option value="pcs">pieces</option><option value="m">metres</option>
                                </select>
                            </Field>
                        </div>
                        <div>
                            <div className="flex items-center mb-2">
                                <span className="text-xs font-bold text-slate-600">Specification fields</span>
                                <button type="button" onClick={() => setEditing(e => ({ ...e, spec_fields: [...e.spec_fields, { label: '', type: 'text', unit: '' }] }))}
                                    className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-indigo-600"><Plus size={13} /> Add field</button>
                            </div>
                            {editing.spec_fields.length === 0 && <p className="text-xs text-slate-400">None yet, e.g. button: Ligne (number), Holes (number), Material (text).</p>}
                            <div className="space-y-2">
                                {editing.spec_fields.map((f, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input className={inputCls} placeholder="Label, e.g. Ligne" value={f.label} onChange={e => setField(i, { label: e.target.value })} />
                                        <select className={`${inputCls} w-32`} value={f.type} onChange={e => setField(i, { type: e.target.value })}>
                                            <option value="text">text</option><option value="number">number</option>
                                        </select>
                                        <input className={`${inputCls} w-24`} placeholder="unit" value={f.unit} onChange={e => setField(i, { unit: e.target.value })} />
                                        <button type="button" onClick={() => setEditing(e => ({ ...e, spec_fields: e.spec_fields.filter((_, j) => j !== i) }))}
                                            className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50" aria-label="Remove field"><Trash2 size={15} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={saving} disabled={saving || !editing.name.trim()}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

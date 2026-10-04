// Garment colours (v3.garment_colours). Tone is shown here but edited only in
// Trim settings (agreed in docs/TRIM_MANAGEMENT_PLAN.md).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading, useMastersPermissions } from '../components/ui';

const empty = { name: '', buyer_colour_code: '', is_active: true };

export default function GarmentColoursPage() {
    const perms = useMastersPermissions();
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null); // {id?, ...fields}
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => {
        mastersApi.garmentColours().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load colours.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (rows || []).filter(r => !q || r.name.toLowerCase().includes(q) || (r.buyer_colour_code || '').toLowerCase().includes(q));
    }, [rows, search]);

    const save = async () => {
        setSaving(true); setFormError('');
        try {
            const payload = { ...editing, tone_group_id: editing.tone_group_id ?? null };
            if (editing.id) await mastersApi.updateGarmentColour(editing.id, payload);
            else await mastersApi.createGarmentColour(payload);
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
                title="Garment colours"
                subtitle="Colour names as used on orders. Names are unique (case and spaces ignored)."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search name or code" />
                    {perms.colours && <PrimaryButton onClick={() => { setFormError(''); setEditing({ ...empty }); }}><Plus size={15} /> Add colour</PrimaryButton>}
                </>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Colour</th><th className="px-4 py-2.5">Buyer code</th><th className="px-4 py-2.5">Tone</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-16" /></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No colours yet.</td></tr>}
                            {shown.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.name}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.buyer_colour_code || '—'}</td>
                                    <td className="px-4 py-2.5">
                                        {r.tone_name
                                            ? <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{r.tone_name}</span>
                                            : <span className="text-xs font-bold text-amber-600">Not set</span>}
                                    </td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                        {perms.colours && (
                                            <button type="button" onClick={() => { setFormError(''); setEditing({ ...r, buyer_colour_code: r.buyer_colour_code || '' }); }}
                                                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Edit ${r.name}`}><Pencil size={15} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? 'Edit garment colour' : 'Add garment colour'} onClose={() => setEditing(null)}>
                    <div className="space-y-4 min-w-[320px]">
                        <Field label="Colour name *"><input className={inputCls} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
                        <Field label="Buyer colour code"><input className={inputCls} value={editing.buyer_colour_code} onChange={e => setEditing({ ...editing, buyer_colour_code: e.target.value })} /></Field>
                        <p className="text-xs text-slate-500">The tone (Dark / Light) is set in <Link to="/v3/masters/trim-settings" className="font-semibold text-indigo-600 underline">Trim settings</Link>.</p>
                        {editing.id && (
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>
                        )}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2 pt-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={saving} disabled={saving || !editing.name.trim()}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

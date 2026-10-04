// Stage types (v3.stage_types): the production stages 3.0 knows, each with its
// unit and which parts it handles. Styles' routes are built from these.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading } from '../components/ui';

export const UNIT_LABEL = { PIECE: 'Piece', BUNDLE: 'Bundle', GARMENT: 'Garment' };
export const SCOPE_LABEL = { ALL: 'All parts', MAIN_ONLY: 'Main parts only', SUPPORTING_ONLY: 'Supporting parts only' };

export default function StageTypesPage() {
    const [rows, setRows] = useState(null);
    const [canEdit, setCanEdit] = useState(false);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => {
        stylesApi.stageTypes().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load stage types.')));
    }, []);
    useEffect(() => {
        load();
        stylesApi.permissions().then(res => setCanEdit(res.data.stages)).catch(() => {});
    }, [load]);

    const save = async () => {
        setSaving(true); setFormError('');
        try {
            if (editing.id) await stylesApi.updateStageType(editing.id, editing);
            else await stylesApi.createStageType(editing);
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
                title="Stage types"
                subtitle="The production stages a style's route is built from. Only a factory admin can change them."
                actions={canEdit && <PrimaryButton onClick={() => { setFormError(''); setEditing({ name: '', unit: 'PIECE', part_scope: 'ALL', sort_order: ((rows?.length || 0) + 1) * 10, is_active: true }); }}><Plus size={15} /> Add stage</PrimaryButton>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Stage</th><th className="px-4 py-2.5">Unit</th><th className="px-4 py-2.5">Handles</th><th className="px-4 py-2.5">Styles using it</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-16" /></tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.name}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{UNIT_LABEL[r.unit]}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{SCOPE_LABEL[r.part_scope]}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.style_count}</td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                        {canEdit && <button type="button" onClick={() => { setFormError(''); setEditing({ ...r }); }} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Edit ${r.name}`}><Pencil size={15} /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? 'Edit stage type' : 'Add stage type'} onClose={() => setEditing(null)}>
                    <div className="space-y-4 w-[min(520px,85vw)]">
                        <Field label="Name *"><input className={inputCls} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Unit *" hint="What the stage checks: single pieces, bundles or whole garments.">
                                <select className={inputCls} value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })}>
                                    {Object.entries(UNIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                            <Field label="Handles *">
                                <select className={inputCls} value={editing.part_scope} onChange={e => setEditing({ ...editing, part_scope: e.target.value })}>
                                    {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </Field>
                        </div>
                        <Field label="Order" hint="Lower numbers are listed first."><input type="number" className={inputCls} value={editing.sort_order} onChange={e => setEditing({ ...editing, sort_order: e.target.value })} /></Field>
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

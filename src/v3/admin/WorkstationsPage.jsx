// Admin: workstations and workstation types — 2.0 tables managed from 3.0 under the decided
// shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md section 9), through 2.0's own handlers.
// A workstation's operator, its process role and its approval rights (multi-piece, whole bundle,
// whole roll) are what 2.0 and 3.0 checkers work with. Delete = 2.0's archive (inactive, operator
// freed). Every change logged in 3.0. Which line a workstation is on: Lines & line types → layout.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Archive, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { adminApi } from '../api/adminApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import SharedLog from './SharedLog';

const ROLES = [['loader', 'Loader (scans into line)'], ['regular', 'Regular (inline)'], ['unloader', 'Unloader (completes stage)']];

export default function WorkstationsPage() {
    const [tab, setTab] = useState('ws');
    const [rows, setRows] = useState(null);
    const [types, setTypes] = useState([]);
    const [portals, setPortals] = useState([]);
    const [users, setUsers] = useState([]);
    const [q, setQ] = useState('');
    const [edit, setEdit] = useState(null);
    const [editType, setEditType] = useState(null);
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const load = useCallback(() => {
        adminApi.workstations().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load workstations.')));
        adminApi.workstationTypes().then(res => setTypes(res.data)).catch(() => {});
        adminApi.portals().then(res => setPortals(res.data)).catch(() => {});
        setTick(t => t + 1);
    }, []);
    useEffect(() => { load(); }, [load]);
    const run = async (fn, done) => {
        setBusy(true); setFormError(''); setError('');
        try { await fn(); done(); load(); } catch (err) { const m = apiError(err, 'Failed.'); setFormError(m); setError(m); } finally { setBusy(false); }
    };
    const open = (w) => {
        setFormError('');
        adminApi.workstationUsers(w?.id).then(res => setUsers(res.data)).catch(() => setUsers([]));
        setEdit(w ? { id: w.id, name: w.name, workstation_type_id: String(w.workstation_type_id), type: w.process_type || 'regular', assigned_user_id: w.assigned_user_id ? String(w.assigned_user_id) : '',
            can_approve_multiple_piece: Boolean(w.can_approve_multiple_piece), can_approve_whole_bundle: Boolean(w.can_approve_whole_bundle), can_approve_whole_roll: Boolean(w.can_approve_whole_roll) }
            : { name: '', workstation_type_id: '', type: 'regular', assigned_user_id: '', can_approve_multiple_piece: false, can_approve_whole_bundle: false, can_approve_whole_roll: false });
    };
    const list = (rows || []).filter(w => !q || `${w.name} ${w.type_name} ${w.assigned_user_name || ''} ${w.production_line_name || ''}`.toLowerCase().includes(q.toLowerCase()));
    const yes = (b) => (b ? '✓' : '');

    return (
        <div>
            <PageHeader title="Workstations" subtitle="Shared with 2.0 — checkers sign in to their workstation in both versions. Changes go through 2.0's own rules and are logged in 3.0."
                actions={tab === 'ws' ? <PrimaryButton onClick={() => open(null)}><Plus size={14} /> Add workstation</PrimaryButton>
                    : <PrimaryButton onClick={() => { setFormError(''); setEditType({ type_name: '', portal_id: '' }); }}><Plus size={14} /> Add type</PrimaryButton>} />
            <div className="flex flex-wrap gap-2 mb-3 items-center">{[['ws', 'Workstations'], ['types', 'Workstation types']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-1 rounded-lg text-xs font-bold border ${tab === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{l}</button>
            ))}{tab === 'ws' && <div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="Search name, operator, line…" /></div>}</div>
            <ErrorBox text={!edit && !editType ? error : ''} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            {!rows ? <Loading /> : tab === 'ws' ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Workstation</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Line</th><th className="px-3 py-2">Operator</th><th className="px-3 py-2">Role</th><th className="px-3 py-2 text-center">Multi</th><th className="px-3 py-2 text-center">Bundle</th><th className="px-3 py-2 text-center">Roll</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{list.map(w => (
                            <tr key={w.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">{w.name}</td><td className="px-3 py-2">{w.type_name}</td>
                                <td className="px-3 py-2 text-xs">{w.production_line_name || '—'}</td><td className="px-3 py-2 text-xs">{w.assigned_user_name || '—'}</td>
                                <td className="px-3 py-2 text-xs">{w.process_type}</td>
                                <td className="px-3 py-2 text-center">{yes(w.can_approve_multiple_piece)}</td><td className="px-3 py-2 text-center">{yes(w.can_approve_whole_bundle)}</td><td className="px-3 py-2 text-center">{yes(w.can_approve_whole_roll)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                    <button type="button" aria-label={`Edit ${w.name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => open(w)}><Pencil size={14} /></button>
                                    <button type="button" aria-label={`Archive ${w.name}`} title="Archive (inactive, operator freed)" className="p-1 text-slate-400 hover:text-rose-600" onClick={() => window.confirm(`Archive workstation ${w.name}? Its operator is freed.`) && run(() => adminApi.archiveWorkstation(w.id), () => setMsg(`${w.name} archived.`))}><Archive size={14} /></button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-2xl">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Portal</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{types.map(t => (
                            <tr key={t.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">{t.type_name}</td><td className="px-3 py-2 text-xs">{t.portal_name || '—'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                    <button type="button" aria-label={`Edit ${t.type_name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => { setFormError(''); setEditType({ id: t.id, type_name: t.type_name, portal_id: String(portals.find(p => p.name === t.portal_name)?.id || '') }); }}><Pencil size={14} /></button>
                                    <button type="button" aria-label={`Delete ${t.type_name}`} className="p-1 text-slate-400 hover:text-rose-600" onClick={() => window.confirm(`Delete type ${t.type_name}?`) && run(() => adminApi.deleteWorkstationType(t.id), () => setMsg(`Type ${t.type_name} deleted.`))}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            <SharedLog entity={tab === 'ws' ? 'WORKSTATION' : 'WORKSTATION_TYPE'} refresh={tick} />

            {edit && (
                <Modal title={edit.id ? `Edit ${edit.name}` : 'Add workstation'} onClose={() => setEdit(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Workstation name"><input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
                        <Field label="Workstation type"><select className={inputCls} value={edit.workstation_type_id} onChange={e => setEdit({ ...edit, workstation_type_id: e.target.value })}><option value="">Choose…</option>{types.map(t => <option key={t.id} value={t.id}>{t.type_name}</option>)}</select></Field>
                        <Field label="Process role"><select className={inputCls} value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                        <Field label="Operator (checkers, cutting operators)"><select className={inputCls} value={edit.assigned_user_id} onChange={e => setEdit({ ...edit, assigned_user_id: e.target.value })}><option value="">— none —</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></Field>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                        {[['can_approve_multiple_piece', 'Approve several pieces / garments at once'], ['can_approve_whole_bundle', 'Approve a whole bundle'], ['can_approve_whole_roll', 'Approve a whole roll']].map(([k, l]) => (
                            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={edit[k]} onChange={e => setEdit({ ...edit, [k]: e.target.checked })} /> {l}</label>
                        ))}
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !edit.name.trim() || !edit.workstation_type_id} onClick={() => run(() => adminApi.saveWorkstation(edit.id, { ...edit, assigned_user_id: edit.assigned_user_id || null }), () => { setMsg(`${edit.name} saved.`); setEdit(null); })}>Save</PrimaryButton></div>
                </Modal>
            )}
            {editType && (
                <Modal title={editType.id ? `Edit ${editType.type_name}` : 'Add workstation type'} onClose={() => setEditType(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Type name"><input className={inputCls} value={editType.type_name} onChange={e => setEditType({ ...editType, type_name: e.target.value })} /></Field>
                        <Field label="2.0 portal"><select className={inputCls} value={editType.portal_id} onChange={e => setEditType({ ...editType, portal_id: e.target.value })}><option value="">Choose…</option>{portals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setEditType(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !editType.type_name.trim() || !editType.portal_id} onClick={() => run(() => adminApi.saveWorkstationType(editType.id, editType), () => { setMsg(`Type ${editType.type_name} saved.`); setEditType(null); })}>Save</PrimaryButton></div>
                </Modal>
            )}
        </div>
    );
}

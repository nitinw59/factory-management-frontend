// Admin: defect codes and which codes each line type uses — 2.0 tables managed from 3.0 under the
// decided shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md section 9), through 2.0's own
// handlers. 2.0 and 3.0 checkers pick from the codes of their line type. Delete = 2.0's deactivate
// (history keeps the code). Every change logged in 3.0.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Ban } from 'lucide-react';
import Modal from '../../shared/Modal';
import { adminApi } from '../api/adminApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import SharedLog from './SharedLog';

export default function DefectCodesPage() {
    const [codes, setCodes] = useState(null);
    const [types, setTypes] = useState([]);
    const [q, setQ] = useState('');
    const [edit, setEdit] = useState(null);
    const [map, setMap] = useState(null);   // { lineType, ids: Set }
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const load = useCallback(() => {
        adminApi.defectCodes().then(res => setCodes(res.data)).catch(err => setError(apiError(err, 'Failed to load defect codes.')));
        adminApi.lineTypes().then(res => setTypes(res.data)).catch(() => {});
        setTick(t => t + 1);
    }, []);
    useEffect(() => { load(); }, [load]);
    const run = async (fn, done) => {
        setBusy(true); setFormError(''); setError('');
        try { await fn(); done(); load(); } catch (err) { const m = apiError(err, 'Failed.'); setFormError(m); setError(m); } finally { setBusy(false); }
    };
    const list = useMemo(() => (codes || []).filter(c => !q || `${c.code} ${c.category} ${c.description}`.toLowerCase().includes(q.toLowerCase())), [codes, q]);
    const typesOf = (c) => (c.line_types || []).filter(x => x && x.line_type_id).map(x => x.line_type_name);
    const openMap = (lt) => setMap({ lineType: lt, ids: new Set((codes || []).filter(c => (c.line_types || []).some(x => x && String(x.line_type_id) === String(lt.id))).map(c => String(c.id))) });

    return (
        <div>
            <PageHeader title="Defect codes" subtitle="Shared with 2.0 — checkers in both versions choose from the codes of their line type. Changes go through 2.0's own rules and are logged in 3.0."
                actions={<PrimaryButton onClick={() => { setFormError(''); setEdit({ category: '', code: '', description: '', is_active: true }); }}><Plus size={14} /> Add code</PrimaryButton>} />
            <ErrorBox text={!edit && !map ? error : ''} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Codes per line type</p>
                <div className="flex flex-wrap gap-2">{types.map(t => (
                    <SecondaryButton key={t.id} onClick={() => openMap(t)}>{t.type_name} <span className="text-xs text-slate-500">({(codes || []).filter(c => c.is_active && (c.line_types || []).some(x => x && String(x.line_type_id) === String(t.id))).length})</span></SecondaryButton>
                ))}</div>
            </div>
            <div className="mb-2 max-w-sm"><SearchInput value={q} onChange={setQ} placeholder="Search code, category…" /></div>
            {!codes ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Line types</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{list.map(c => (
                            <tr key={c.id} className={`border-t border-slate-100 ${c.is_active ? '' : 'text-slate-400'}`}>
                                <td className="px-3 py-2 font-mono font-semibold">{c.code}</td><td className="px-3 py-2 text-xs">{c.category}</td>
                                <td className="px-3 py-2">{c.description}{!c.is_active && <span className="ml-1 text-xs">(inactive)</span>}</td>
                                <td className="px-3 py-2 text-xs">{typesOf(c).join(', ') || '—'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                    <button type="button" aria-label={`Edit ${c.code}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => { setFormError(''); setEdit({ id: c.id, category: c.category, code: c.code, description: c.description, is_active: c.is_active }); }}><Pencil size={14} /></button>
                                    {c.is_active && <button type="button" aria-label={`Deactivate ${c.code}`} title="Deactivate" className="p-1 text-slate-400 hover:text-rose-600" onClick={() => window.confirm(`Deactivate ${c.code}? Checkers can no longer pick it; history keeps it.`) && run(() => adminApi.deactivateDefectCode(c.id), () => setMsg(`${c.code} deactivated.`))}><Ban size={14} /></button>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            <SharedLog entity="DEFECT_CODE" refresh={tick} />

            {edit && (
                <Modal title={edit.id ? `Edit ${edit.code}` : 'Add defect code'} onClose={() => setEdit(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Code"><input className={inputCls} value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} /></Field>
                        <Field label="Category"><input className={inputCls} list="dc-categories" value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} /></Field>
                        <datalist id="dc-categories">{[...new Set((codes || []).map(c => c.category))].map(c => <option key={c} value={c} />)}</datalist>
                        <div className="sm:col-span-2"><Field label="Description"><input className={inputCls} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field></div>
                        {edit.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>}
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !edit.code.trim() || !edit.category.trim() || !edit.description.trim()} onClick={() => run(() => adminApi.saveDefectCode(edit.id, { category: edit.category.trim(), code: edit.code.trim(), description: edit.description.trim(), is_active: edit.is_active }), () => { setMsg(`${edit.code} saved.`); setEdit(null); })}>Save</PrimaryButton></div>
                </Modal>
            )}
            {map && (
                <Modal title={`Defect codes for ${map.lineType.type_name}`} onClose={() => setMap(null)}>
                    <p className="text-xs text-slate-500 mb-2">Ticked codes are what checkers on {map.lineType.type_name} lines can choose (2.0 and 3.0).</p>
                    <div className="max-h-96 overflow-y-auto grid sm:grid-cols-2 gap-1">{(codes || []).filter(c => c.is_active).map(c => (
                        <label key={c.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={map.ids.has(String(c.id))} onChange={e => { const ids = new Set(map.ids); if (e.target.checked) ids.add(String(c.id)); else ids.delete(String(c.id)); setMap({ ...map, ids }); }} />
                            <span><b className="font-mono">{c.code}</b> {c.description} <span className="text-xs text-slate-400">{c.category}</span></span></label>
                    ))}</div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setMap(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => adminApi.setLineTypeDefects(map.lineType.id, [...map.ids]), () => { setMsg(`Codes for ${map.lineType.type_name} saved.`); setMap(null); })}>Save</PrimaryButton></div>
                </Modal>
            )}
        </div>
    );
}

// Admin: production lines and line types — 2.0 tables managed from 3.0 under the decided
// shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md section 9). 3.0 calls 2.0's own handlers,
// so 2.0's rules apply (e.g. the line-type engine checks); every change is logged in 3.0, and a
// line / line type 3.0 production uses can't be deleted. Layout = the line's workstations, in order.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, LayoutList } from 'lucide-react';
import Modal from '../../shared/Modal';
import { adminApi } from '../api/adminApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import SharedLog from './SharedLog';

const TRACKING = [
    ['SKIP', 'Do not track (e.g. staging)'], ['cut_piece_log', 'Cut piece log'], ['numbering_piece_log', 'Numbering piece log'],
    ['preparation_bundle_log', 'Preparation bundle log'], ['sewing_piece_log', 'Sewing piece log'], ['assembly_garment_log', 'Assembly garment log'],
    ['finishing_garment_log', 'Finishing garment log'], ['post_assembly_garment_log', 'Post assembly garment log'],
    ['generic_standard_piece_log', 'Generic piece table'], ['generic_standard_bundle_log', 'Generic bundle table'],
];
const MODES = [['PIECE', 'Piece by piece'], ['BUNDLE', 'Bundle'], ['ROLL', 'Raw roll'], ['SERIALIZED', 'Serialized (garment)']];
const SCOPES = [['ALL_PARTS', 'All parts'], ['PRIMARY_ONLY', 'Primary panels only'], ['SUPPORTING_ONLY', 'Supporting parts only'], ['ASSEMBLY', 'Garment assembly'], ['FINISHING', 'Finishing & packing']];

export default function LinesPage() {
    const [tab, setTab] = useState('lines');
    const [lines, setLines] = useState(null);
    const [types, setTypes] = useState([]);
    const [workstations, setWorkstations] = useState([]);
    const [edit, setEdit] = useState(null);       // line form
    const [editType, setEditType] = useState(null);
    const [layout, setLayout] = useState(null);   // { line, list: [{id,name,type_name}] }
    const [pick, setPick] = useState('');
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const load = useCallback(() => {
        adminApi.lines().then(res => setLines(res.data)).catch(err => setError(apiError(err, 'Failed to load lines.')));
        adminApi.lineTypes().then(res => setTypes(res.data)).catch(() => {});
        adminApi.workstations().then(res => setWorkstations(res.data)).catch(() => {});
        setTick(t => t + 1);
    }, []);
    useEffect(() => { load(); }, [load]);
    const run = async (fn, done) => {
        setBusy(true); setFormError(''); setError('');
        try { const res = await fn(); done(res); load(); } catch (err) { setFormError(apiError(err, 'Failed.')); setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };

    const openLine = async (l) => {
        setFormError('');
        if (!l) { setEdit({ name: '', production_line_type_id: '', wip_limit: '', is_job_work: false }); return; }
        try { const r = (await adminApi.line(l.id)).data; setEdit({ ...r, production_line_type_id: String(r.production_line_type_id), wip_limit: r.wip_limit ?? '' }); }
        catch (err) { setError(apiError(err, 'Failed to open the line.')); }
    };
    const saveLine = () => run(() => adminApi.saveLine(edit.id, { name: edit.name, production_line_type_id: edit.production_line_type_id, wip_limit: edit.wip_limit === '' ? null : Number(edit.wip_limit), is_job_work: Boolean(edit.is_job_work) }),
        () => { setMsg(`Line ${edit.name} saved.`); setEdit(null); });
    const openLayout = async (l) => {
        setPick(''); setFormError('');
        try { setLayout({ line: l, list: (await adminApi.lineLayout(l.id)).data }); } catch (err) { setError(apiError(err, 'Failed to load the layout.')); }
    };
    const move = (i, d) => { const list = [...layout.list]; const [x] = list.splice(i, 1); list.splice(i + d, 0, x); setLayout({ ...layout, list }); };
    const onLine = new Set(layout?.list.map(w => String(w.id)));

    return (
        <div>
            <PageHeader title="Lines & line types" subtitle="Shared with 2.0 — the same lines run 2.0 and 3.0 production. Changes go through 2.0's own rules and are logged in 3.0."
                actions={tab === 'lines' ? <PrimaryButton onClick={() => openLine(null)}><Plus size={14} /> Add line</PrimaryButton>
                    : <PrimaryButton onClick={() => { setFormError(''); setEditType({ type_name: '', tracking_table_name: 'SKIP', processing_mode: 'PIECE', processing_scope: 'ALL_PARTS' }); }}><Plus size={14} /> Add line type</PrimaryButton>} />
            <div className="flex gap-2 mb-3">{[['lines', 'Lines'], ['types', 'Line types']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-1 rounded-lg text-xs font-bold border ${tab === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{l}</button>
            ))}</div>
            <ErrorBox text={!edit && !editType && !layout ? error : ''} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            {!lines ? <Loading /> : tab === 'lines' ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">WIP limit</th><th className="px-3 py-2">Job work</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">{l.name}{l.is_active === false ? <span className="ml-1 text-xs text-slate-400">(inactive)</span> : null}</td>
                                <td className="px-3 py-2">{l.type_name}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{l.wip_limit ?? '—'}</td>
                                <td className="px-3 py-2 text-xs">{l.is_job_work ? 'yes' : ''}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                    <button type="button" aria-label={`Layout of ${l.name}`} title="Workstations on this line" className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => openLayout(l)}><LayoutList size={14} /></button>
                                    <button type="button" aria-label={`Edit ${l.name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => openLine(l)}><Pencil size={14} /></button>
                                    <button type="button" aria-label={`Delete ${l.name}`} className="p-1 text-slate-400 hover:text-rose-600" onClick={() => window.confirm(`Delete line ${l.name}?`) && run(() => adminApi.deleteLine(l.id), () => setMsg(`Line ${l.name} deleted.`))}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Line type</th><th className="px-3 py-2">Tracking (2.0)</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{types.map(t => (
                            <tr key={t.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">{t.type_name}</td>
                                <td className="px-3 py-2 text-xs font-mono">{t.tracking_table_name}</td>
                                <td className="px-3 py-2 text-xs">{t.processing_mode}</td>
                                <td className="px-3 py-2 text-xs">{t.processing_scope}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                    <button type="button" aria-label={`Edit ${t.type_name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => { setFormError(''); setEditType({ ...t }); }}><Pencil size={14} /></button>
                                    <button type="button" aria-label={`Delete ${t.type_name}`} className="p-1 text-slate-400 hover:text-rose-600" onClick={() => window.confirm(`Delete line type ${t.type_name}?`) && run(() => adminApi.deleteLineType(t.id), () => setMsg(`Line type ${t.type_name} deleted.`))}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                    <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Tracking, mode and scope drive 2.0's production engine; 3.0 maps its stages to line types. 2.0 checks the combination when you save.</p>
                </div>
            )}
            <SharedLog entity={tab === 'lines' ? 'LINE' : 'LINE_TYPE'} refresh={tick} />

            {edit && (
                <Modal title={edit.id ? `Edit ${edit.name}` : 'Add line'} onClose={() => setEdit(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Line name"><input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
                        <Field label="Line type"><select className={inputCls} value={edit.production_line_type_id} onChange={e => setEdit({ ...edit, production_line_type_id: e.target.value })}><option value="">Choose…</option>{types.map(t => <option key={t.id} value={t.id}>{t.type_name}</option>)}</select></Field>
                        <Field label="WIP limit (batches at once)"><input className={inputCls} type="number" min="0" value={edit.wip_limit} onChange={e => setEdit({ ...edit, wip_limit: e.target.value })} /></Field>
                        <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={Boolean(edit.is_job_work)} onChange={e => setEdit({ ...edit, is_job_work: e.target.checked })} /> Job-work line (outside)</label>
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton><PrimaryButton busy={busy} disabled={busy || !edit.name.trim() || !edit.production_line_type_id} onClick={saveLine}>Save</PrimaryButton></div>
                </Modal>
            )}
            {editType && (
                <Modal title={editType.id ? `Edit ${editType.type_name}` : 'Add line type'} onClose={() => setEditType(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Line type name"><input className={inputCls} value={editType.type_name} onChange={e => setEditType({ ...editType, type_name: e.target.value })} /></Field>
                        <Field label="Tracking table (2.0)"><select className={inputCls} value={editType.tracking_table_name} onChange={e => setEditType({ ...editType, tracking_table_name: e.target.value })}>{TRACKING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{!TRACKING.some(([v]) => v === editType.tracking_table_name) && <option value={editType.tracking_table_name}>{editType.tracking_table_name}</option>}</select></Field>
                        <Field label="Processing mode"><select className={inputCls} value={editType.processing_mode} onChange={e => setEditType({ ...editType, processing_mode: e.target.value })}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                        <Field label="Scope"><select className={inputCls} value={editType.processing_scope} onChange={e => setEditType({ ...editType, processing_scope: e.target.value })}>{SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setEditType(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !editType.type_name.trim()} onClick={() => run(() => adminApi.saveLineType(editType.id, editType), () => { setMsg(`Line type ${editType.type_name} saved.`); setEditType(null); })}>Save</PrimaryButton></div>
                </Modal>
            )}
            {layout && (
                <Modal title={`Workstations on ${layout.line.name}`} onClose={() => setLayout(null)}>
                    <ol className="space-y-1 mb-3">{layout.list.length === 0 ? <li className="text-sm text-slate-400">No workstations on this line.</li> : layout.list.map((w, i) => (
                        <li key={w.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded px-2 py-1">
                            <span className="w-6 text-slate-400 tabular-nums">{i + 1}.</span><span className="font-semibold">{w.name}</span><span className="text-xs text-slate-500">{w.type_name}</span>
                            <span className="ml-auto flex gap-1">
                                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-slate-400 disabled:opacity-30"><ArrowUp size={13} /></button>
                                <button type="button" aria-label="Move down" disabled={i === layout.list.length - 1} onClick={() => move(i, 1)} className="p-1 text-slate-400 disabled:opacity-30"><ArrowDown size={13} /></button>
                                <button type="button" aria-label="Remove" onClick={() => setLayout({ ...layout, list: layout.list.filter(x => x.id !== w.id) })} className="p-1 text-slate-400 hover:text-rose-600"><X size={13} /></button>
                            </span>
                        </li>
                    ))}</ol>
                    <div className="flex gap-2 items-end">
                        <Field label="Add workstation"><select className={`${inputCls} !w-72`} value={pick} onChange={e => setPick(e.target.value)}><option value="">Choose…</option>{workstations.filter(w => !onLine.has(String(w.id))).map(w => <option key={w.id} value={w.id}>{w.name} — {w.type_name}{w.production_line_name ? ` (on ${w.production_line_name})` : ''}</option>)}</select></Field>
                        <SecondaryButton disabled={!pick} onClick={() => { const w = workstations.find(x => String(x.id) === pick); setLayout({ ...layout, list: [...layout.list, { id: String(w.id), name: w.name, type_name: w.type_name }] }); setPick(''); }}><Plus size={13} /> Add</SecondaryButton>
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2"><SecondaryButton onClick={() => setLayout(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => adminApi.saveLineLayout(layout.line.id, layout.list.map(w => w.id)), () => { setMsg(`Layout of ${layout.line.name} saved.`); setLayout(null); })}>Save layout</PrimaryButton></div>
                </Modal>
            )}
        </div>
    );
}

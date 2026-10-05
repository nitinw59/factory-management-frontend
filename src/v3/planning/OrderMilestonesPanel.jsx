// One order's milestones: planned vs actual, status, notes; edit planned
// (with reason) and the manual actual dates; change log. Automatic milestones
// (materials) come from allocation / readiness and can't be typed in.
import { useCallback, useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { MsChip, shortDate } from './milestoneShared';

export default function OrderMilestonesPanel({ orderId, canEdit }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [edit, setEdit] = useState(null);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => planningApi.orderMilestones(orderId).then(res => setData(res.data))
        .catch(err => setError(apiError(err, 'Failed to load milestones.'))), [orderId]);
    useEffect(() => { load(); }, [load]);

    if (!data) return error ? <ErrorBox text={error} /> : <Loading />;
    const open = (m) => { setFormError(''); setEdit({ m, planned: m.planned_overridden ? m.planned : '', actual: m.actual || '', notes: m.notes || '', reason: '' }); };
    const save = async () => {
        setBusy(true); setFormError('');
        const body = { reason: edit.reason, notes: edit.notes };
        if ((edit.planned || '') !== (edit.m.planned_overridden ? edit.m.planned : '')) body.planned_date = edit.planned || null;
        if (edit.m.actual_source === 'MANUAL' && (edit.actual || '') !== (edit.m.actual || '')) body.actual_date = edit.actual || null;
        try { setData((await planningApi.updateMilestone(orderId, edit.m.code, body)).data); setEdit(null); }
        catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-4 py-2">Milestone</th><th className="px-4 py-2">Planned</th><th className="px-4 py-2">Actual</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Notes</th><th className="px-4 py-2 w-10" /></tr>
                    </thead>
                    <tbody>
                        {data.milestones.map(m => (
                            <tr key={m.code} className="border-t border-slate-100">
                                <td className="px-4 py-2 font-semibold text-slate-800">{m.name}<span className="block text-[11px] font-normal text-slate-400">{m.actual_source === 'AUTO' ? 'recorded by the system' : 'entered by hand'}</span></td>
                                <td className="px-4 py-2 whitespace-nowrap">{shortDate(m.planned)}{m.planned_overridden && <span className="block text-[11px] text-indigo-700">moved (standard {shortDate(m.derived_planned)})</span>}</td>
                                <td className="px-4 py-2 whitespace-nowrap">{m.status === 'NA' ? <span className="text-slate-400">not needed</span> : shortDate(m.actual)}{m.via === 'OVERRIDE' && <span className="block text-[11px] text-indigo-700">released by override</span>}</td>
                                <td className="px-4 py-2"><MsChip m={m} /></td>
                                <td className="px-4 py-2 text-xs text-slate-600">{m.notes || ''}</td>
                                <td className="px-4 py-2">{canEdit && m.status !== 'NA' && <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" onClick={() => open(m)} aria-label={`Edit ${m.name}`}><Pencil size={14} /></button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.log.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
                    <p className="font-bold text-slate-500 uppercase tracking-wider">Milestone changes</p>
                    {data.log.map(g => (
                        <p key={g.id}>{new Date(g.created_at).toLocaleString()} · <b>{g.name}</b> {g.field.toLowerCase()}: {g.field === 'NOTES' ? 'changed' : `${shortDate(g.from_value)} → ${shortDate(g.to_value)}`}{g.reason ? ` — ${g.reason}` : ''}{g.user_name ? ` (${g.user_name})` : ''}</p>
                    ))}
                </div>
            )}

            {edit && (
                <Modal title={edit.m.name} onClose={() => setEdit(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        <Field label="Planned date" hint={`Standard: ${shortDate(edit.m.derived_planned)} (from the ship date). Leave empty to use the standard.`}>
                            <input className={inputCls} type="date" value={edit.planned} onChange={e => setEdit({ ...edit, planned: e.target.value })} />
                        </Field>
                        {edit.m.actual_source === 'MANUAL'
                            ? <Field label="Actual date" hint="When it really happened (not in the future)."><input className={inputCls} type="date" value={edit.actual} max={data.today} onChange={e => setEdit({ ...edit, actual: e.target.value })} /></Field>
                            : <p className="text-xs text-slate-500">The actual date is recorded by the system (allocation / readiness).</p>}
                        <Field label="Notes"><input className={inputCls} value={edit.notes} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field>
                        <Field label="Reason" hint="Needed when moving the planned date or clearing the actual date."><input className={inputCls} value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={busy} disabled={busy}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

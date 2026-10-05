// Planning settings (one record): default cut allowance for newly planned
// order lines, and lead days before ship (used for needed-by dates).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';

export default function PlanningSettingsPage() {
    const [form, setForm] = useState(null);
    const [meta, setMeta] = useState(null);
    const [canEdit, setCanEdit] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [templates, setTemplates] = useState([]);
    const [tplError, setTplError] = useState('');

    const apply = (s) => {
        setMeta(s);
        setForm({ default_cut_allowance_pct: String(s.default_cut_allowance_pct), fabric_lead_days: String(s.fabric_lead_days), trim_lead_days: String(s.trim_lead_days) });
    };
    useEffect(() => {
        planningApi.settings().then(res => apply(res.data)).catch(err => setError(apiError(err, 'Failed to load settings.')));
        planningApi.permissions().then(res => setCanEdit(res.data.settings)).catch(() => {});
        planningApi.milestoneTemplates().then(res => setTemplates(res.data)).catch(() => {});
    }, []);

    const save = async () => {
        setSaving(true); setError(''); setSaved(false);
        try { apply((await planningApi.saveSettings(form)).data); setSaved(true); } catch (err) { setError(apiError(err, 'Failed to save.')); } finally { setSaving(false); }
    };

    const saveTemplate = async (t, patch) => {
        setTplError('');
        try { setTemplates((await planningApi.saveMilestoneTemplate(t.code, patch)).data); } catch (err) { setTplError(apiError(err, 'Failed to save.')); }
    };

    if (!form) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    return (
        <div className="max-w-xl">
            <PageHeader title="Planning settings" subtitle="Defaults for material planning. Only factory admins can change them." />
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <Field label="Default cut allowance %" hint="Extra pieces planned on top of the ordered quantity (e.g. 2 = order 100, plan 102). Fixed on each order line when it is first planned; change a line's own allowance on its requirements page.">
                    <input className={inputCls} type="number" min="0" max="50" step="0.5" disabled={!canEdit} value={form.default_cut_allowance_pct} onChange={e => setForm({ ...form, default_cut_allowance_pct: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Fabric needed (days before ship)"><input className={inputCls} type="number" min="0" max="365" disabled={!canEdit} value={form.fabric_lead_days} onChange={e => setForm({ ...form, fabric_lead_days: e.target.value })} /></Field>
                    <Field label="Trims needed (days before ship)"><input className={inputCls} type="number" min="0" max="365" disabled={!canEdit} value={form.trim_lead_days} onChange={e => setForm({ ...form, trim_lead_days: e.target.value })} /></Field>
                </div>
                <p className="text-xs text-slate-500">Needed-by date = ship date − lead days. Used on the buy list, purchase requisitions and material readiness (an order not ready after its needed-by date turns red).</p>
                {meta?.updated_by_name && <p className="text-xs text-slate-400">Last changed {new Date(meta.updated_at).toLocaleString()} by {meta.updated_by_name}</p>}
                <ErrorBox text={error} />
                {saved && <p className="text-sm font-semibold text-emerald-700">Saved.</p>}
                {canEdit && <PrimaryButton onClick={save} busy={saving} disabled={saving}>Save</PrimaryButton>}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-4">
                <p className="font-bold text-slate-800">Order milestones</p>
                <p className="text-xs text-slate-500 mb-2">Planned dates count back from each order's first ship date. Materials milestones follow the lead days above and are recorded by the system. See <Link to="/v3/planning/milestones" className="text-indigo-700 font-semibold">Order milestones</Link>.</p>
                <table className="w-full text-sm">
                    <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Milestone</th><th>Planned</th><th>Actual from</th><th className="text-right">Active</th></tr></thead>
                    <tbody>
                        {templates.map(t => (
                            <tr key={t.code} className="border-t border-slate-100">
                                <td className="py-1.5 font-semibold">{t.name}</td>
                                <td>{t.planned_rule === 'DAYS_BEFORE_SHIP'
                                    ? <span className="inline-flex items-center gap-1"><input className={`${inputCls} !w-20 !py-1`} type="number" min="0" max="365" disabled={!canEdit} defaultValue={t.days_before_ship}
                                        onBlur={e => { const v = Number(e.target.value); if (v !== t.days_before_ship) saveTemplate(t, { days_before_ship: v }); }} aria-label={`${t.name} days before ship`} /> days before ship</span>
                                    : <span className="text-xs text-slate-500">{t.planned_rule === 'FABRIC_LEAD' ? 'fabric lead days' : t.planned_rule === 'TRIM_LEAD' ? 'trim lead days' : 'later of fabric / trims'}</span>}</td>
                                <td className="text-xs text-slate-500">{t.actual_source === 'AUTO' ? 'system' : 'entered by hand'}</td>
                                <td className="text-right"><input type="checkbox" disabled={!canEdit} checked={t.is_active} onChange={e => saveTemplate(t, { is_active: e.target.checked })} aria-label={`${t.name} active`} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <ErrorBox text={tplError} />
            </div>
        </div>
    );
}

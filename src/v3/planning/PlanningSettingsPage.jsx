// Planning settings (one record): default cut allowance for newly planned
// order lines, and lead days before ship (used for needed-by dates).
import { useEffect, useState } from 'react';
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

    const apply = (s) => {
        setMeta(s);
        setForm({ default_cut_allowance_pct: String(s.default_cut_allowance_pct), fabric_lead_days: String(s.fabric_lead_days), trim_lead_days: String(s.trim_lead_days) });
    };
    useEffect(() => {
        planningApi.settings().then(res => apply(res.data)).catch(err => setError(apiError(err, 'Failed to load settings.')));
        planningApi.permissions().then(res => setCanEdit(res.data.settings)).catch(() => {});
    }, []);

    const save = async () => {
        setSaving(true); setError(''); setSaved(false);
        try { apply((await planningApi.saveSettings(form)).data); setSaved(true); } catch (err) { setError(apiError(err, 'Failed to save.')); } finally { setSaving(false); }
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
        </div>
    );
}

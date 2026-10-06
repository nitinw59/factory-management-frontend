// Admin: sizes — 2.0's sizes master, shared by both versions, managed here under the decided
// shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md section 9). Names unique; display order
// can always change; once a size is used anywhere it can't be renamed or deleted (2.0 keeps sizes
// by name in 17 tables, so a rename would detach their history). Every change logged in 3.0.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { adminApi } from '../api/adminApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import SharedLog from './SharedLog';

export default function SizesPage() {
    const [rows, setRows] = useState(null);
    const [edit, setEdit] = useState(null);       // { id?, name, display_order, usage? }
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const load = useCallback(() => { adminApi.sizes().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load sizes.'))); setTick(t => t + 1); }, []);
    useEffect(() => { load(); }, [load]);

    const open = async (s) => {
        setFormError('');
        if (!s) { setEdit({ name: '', display_order: rows?.length ? Math.max(...rows.map(r => r.display_order || 0)) + 1 : 1 }); return; }
        setEdit({ ...s, usage: null });
        try { const u = (await adminApi.sizeUsage(s.id)).data; setEdit(e => (e && e.id === s.id ? { ...e, usage: u } : e)); } catch { /* shown on save */ }
    };
    const save = async () => {
        setBusy(true); setFormError('');
        try {
            const res = await adminApi.saveSize(edit.id, { name: edit.name, display_order: Number(edit.display_order) });
            setMsg(res.data.unchanged ? 'Nothing changed.' : `Size ${res.data.name} saved.`); setEdit(null); load();
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const remove = async () => {
        if (!window.confirm(`Delete size ${edit.name}?`)) return;
        setBusy(true); setFormError('');
        try { await adminApi.deleteSize(edit.id); setMsg(`Size ${edit.name} deleted.`); setEdit(null); load(); }
        catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const locked = edit?.id && (!edit.usage || !edit.usage.can_rename);

    return (
        <div>
            <PageHeader title="Sizes" subtitle="The sizes master, shared with 2.0. Order = how sizes are listed everywhere (styles, orders, grids)."
                actions={<PrimaryButton onClick={() => open(null)}><Plus size={14} /> Add size</PrimaryButton>} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-w-xl">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2 w-24">Order</th><th className="px-3 py-2">Size</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{rows.map(s => (
                            <tr key={s.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 tabular-nums text-slate-500">{s.display_order}</td>
                                <td className="px-3 py-2 font-semibold">{s.name}</td>
                                <td className="px-3 py-2 text-right"><button type="button" aria-label={`Edit size ${s.name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => open(s)}><Pencil size={14} /></button></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            <SharedLog entity="SIZE" refresh={tick} />
            {edit && (
                <Modal title={edit.id ? `Size ${edit.name}` : 'Add size'} onClose={() => setEdit(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Size name"><input className={inputCls} value={edit.name} disabled={locked} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
                        <Field label="Display order"><input className={inputCls} type="number" min="0" value={edit.display_order} onChange={e => setEdit({ ...edit, display_order: e.target.value })} /></Field>
                    </div>
                    {edit.id && (edit.usage === null ? <p className="mt-2 text-xs text-slate-500">Checking where this size is used…</p>
                        : edit.usage && edit.usage.used_in.length > 0 ? <p className="mt-2 text-xs text-amber-800">Used in {edit.usage.used_in.slice(0, 6).join(', ')}{edit.usage.used_in.length > 6 ? ' …' : ''} — the name is locked and it can't be deleted (2.0 keeps sizes by name). Only the order can change.</p>
                            : <p className="mt-2 text-xs text-slate-500">Not used anywhere yet — can be renamed or deleted.</p>)}
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex gap-2">
                        {edit.id && edit.usage?.can_delete && <SecondaryButton onClick={remove} disabled={busy}><Trash2 size={14} /> Delete</SecondaryButton>}
                        <span className="ml-auto" />
                        <SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !String(edit.name).trim()} onClick={save}>{edit.id ? 'Save' : 'Add size'}</PrimaryButton>
                    </div>
                </Modal>
            )}
        </div>
    );
}

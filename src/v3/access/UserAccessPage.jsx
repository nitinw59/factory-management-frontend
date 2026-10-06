// Admin: users and their access ("Users & access").
// - Users (name, email, mobile, role) live in 2.0's user table, which login reads — managed here
//   under the decided shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md section 9): same
//   fields as 2.0, every change logged in 3.0. Email = the Google account the person signs in with.
// - Extra 3.0 roles per user (v3 only): each with a reason and an optional end date.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, X, Plus, Pencil, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { adminApi, ROLE_LABELS } from '../api/adminApi';
import SharedLog from '../admin/SharedLog';
import { accessApi } from '../api/accessApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { useV3Access } from '../V3Access';

const fmtTs = (t) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function UserAccessPage() {
    const { reload } = useV3Access();
    const [data, setData] = useState(null);
    const [history, setHistory] = useState([]);
    const [q, setQ] = useState('');
    const [form, setForm] = useState({ user_id: '', role: '', reason: '', valid_until: '' });
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [master, setMaster] = useState(null);   // 2.0 users: mobile, Google link, roles list
    const [edit, setEdit] = useState(null);       // user form: {} = new, user = edit
    const [formError, setFormError] = useState('');
    const [tick, setTick] = useState(0);
    const load = useCallback(() => {
        accessApi.users().then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load users.')));
        adminApi.users().then(res => setMaster(res.data)).catch(() => {});
        setTick(t => t + 1);
        accessApi.grants().then(res => setHistory(res.data)).catch(() => {});
    }, []);
    useEffect(() => { load(); }, [load]);
    const users = useMemo(() => (data?.users || []).filter(u => !q || `${u.name} ${u.email} ${ROLE_LABELS[u.role] || u.role}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
    if (!data) return error ? <ErrorBox text={error} /> : <Loading />;
    const label = (r) => data.grantable.find(g => g.role === r)?.label || r;

    const give = async () => {
        setBusy(true); setError(''); setMsg('');
        try {
            const res = await accessApi.grant({ ...form, valid_until: form.valid_until || undefined });
            setMsg(`${res.data.user} now also has ${label(res.data.role)} in 3.0.`);
            setForm({ user_id: '', role: '', reason: '', valid_until: '' }); load(); reload();
        } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const roleName = (r) => ROLE_LABELS[r] || r;
    const mOf = (id) => master?.users.find(x => x.id === id) || {};
    const saveUser = async () => {
        setBusy(true); setFormError('');
        try {
            const body = { name: edit.name, email: edit.email, mobile_no: edit.mobile_no || '', role: edit.role };
            const res = edit.id ? await adminApi.updateUser(edit.id, body) : await adminApi.createUser(body);
            setMsg(edit.id ? `${res.data.name} saved${res.data.google_unlinked ? ' — new email: they sign in with that Google account from now on' : ''}.` : `${res.data.name} added — they can sign in with ${res.data.email}.`);
            setEdit(null); load(); reload();
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const removeUser = async (u) => {
        if (!window.confirm(`Delete ${u.name} (${u.email})? They will no longer be able to sign in.`)) return;
        setError(''); setMsg('');
        try { await adminApi.deleteUser(u.id); setMsg(`${u.name} deleted.`); load(); }
        catch (err) { setError(apiError(err, 'Failed.')); }
    };
    const revoke = async (g, u) => {
        const reason = window.prompt(`Remove ${label(g.role)} from ${u.name}? Reason:`);
        if (!reason) return;
        setError(''); setMsg('');
        try { await accessApi.revoke(g.id, reason); setMsg(`Removed ${label(g.role)} from ${u.name}.`); load(); reload(); }
        catch (err) { setError(apiError(err, 'Failed.')); }
    };

    return (
        <div>
            <PageHeader title="Users & access" subtitle="Users are shared with 2.0 (same sign-in, same role in both). Extra roles given here count in 3.0 only."
                actions={<PrimaryButton onClick={() => { setFormError(''); setEdit({ name: '', email: '', mobile_no: '', role: '' }); }}><Plus size={14} /> Add user</PrimaryButton>} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid gap-3 md:grid-cols-[1.3fr_1fr_1.5fr_150px_auto] items-end">
                <Field label="User"><select className={inputCls} value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}><option value="">Choose…</option>{data.users.map(u => <option key={u.id} value={u.id}>{u.name} — {roleName(u.role)}</option>)}</select></Field>
                <Field label="Extra role"><select className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="">Choose…</option>{data.grantable.map(g => <option key={g.role} value={g.role}>{g.label}</option>)}</select></Field>
                <Field label="Reason"><input className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. covers cutting during leave" /></Field>
                <Field label="Until (optional)"><input type="date" className={inputCls} value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></Field>
                <PrimaryButton onClick={give} busy={busy} disabled={busy || !form.user_id || !form.role || !form.reason.trim()}><UserPlus size={14} /> Give access</PrimaryButton>
            </div>
            <div className="mb-2 max-w-sm"><SearchInput value={q} onChange={setQ} placeholder="Search users…" /></div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-6">
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Extra 3.0 roles</th><th className="px-3 py-2"></th></tr></thead>
                    <tbody>{users.map(u => (
                        <tr key={u.id} className="border-t border-slate-100">
                            <td className="px-3 py-2"><b>{u.name}</b><span className="block text-xs text-slate-500">{u.email}{mOf(u.id).mobile_no ? ` · ${mOf(u.id).mobile_no}` : ''}{master && !mOf(u.id).google_linked ? ' · not signed in yet' : ''}</span></td>
                            <td className="px-3 py-2">{roleName(u.role)}</td>
                            <td className="px-3 py-2"><span className="flex flex-wrap gap-1">{u.grants.length ? u.grants.map(g => (
                                <span key={g.id} title={`${g.reason} — by ${g.granted_by || '?'}`} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-800 rounded px-2 py-0.5">
                                    {label(g.role)}{g.valid_until ? ` · until ${fmtDate(g.valid_until)}` : ''}
                                    <button type="button" aria-label="Remove" onClick={() => revoke(g, u)} className="text-indigo-500 hover:text-rose-600"><X size={12} /></button>
                                </span>
                            )) : <span className="text-xs text-slate-400">—</span>}</span></td>
                            <td className="px-3 py-2 whitespace-nowrap text-right">
                                <button type="button" aria-label={`Edit ${u.name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => { setFormError(''); setEdit({ id: u.id, name: u.name, email: u.email, mobile_no: mOf(u.id).mobile_no || '', role: u.role }); }}><Pencil size={14} /></button>
                                <button type="button" aria-label={`Delete ${u.name}`} className="p-1 text-slate-400 hover:text-rose-600" onClick={() => removeUser(u)}><Trash2 size={14} /></button>
                            </td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">History</p>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Extra role</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Given</th><th className="px-3 py-2">Status</th></tr></thead>
                    <tbody>{history.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-slate-400">No extra access given yet.</td></tr> : history.map(g => (
                        <tr key={g.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{g.user_name}</td>
                            <td className="px-3 py-2">{label(g.role)}</td>
                            <td className="px-3 py-2">{g.reason}</td>
                            <td className="px-3 py-2 text-xs">{fmtTs(g.granted_at)} · {g.granted_by || '—'}{g.valid_until ? <span className="block">until {fmtDate(g.valid_until)}</span> : null}</td>
                            <td className="px-3 py-2 text-xs">{g.active ? <span className="text-emerald-700 font-bold">Active</span> : g.revoked_at ? <span>Removed {fmtTs(g.revoked_at)} · {g.revoked_by || '—'}<span className="block text-slate-500">{g.revoked_reason}</span></span> : <span className="text-slate-500">Expired</span>}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            <div className="mt-3"><SecondaryButton onClick={load}>Refresh</SecondaryButton></div>
            <SharedLog entity="USER" refresh={tick} />
            {edit && (
                <Modal title={edit.id ? `Edit ${edit.name}` : 'Add user'} onClose={() => setEdit(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Full name"><input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
                        <Field label="Email (Google sign-in)"><input className={inputCls} type="email" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
                        <Field label="Mobile"><input className={inputCls} value={edit.mobile_no} onChange={e => setEdit({ ...edit, mobile_no: e.target.value })} /></Field>
                        <Field label="Role (2.0 and 3.0)"><select className={inputCls} value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}><option value="">Choose…</option>{(master?.roles || []).map(r => <option key={r} value={r}>{roleName(r)}</option>)}</select></Field>
                    </div>
                    {edit.id && <p className="mt-2 text-xs text-slate-500">Changing the email moves sign-in to the new Google account. A new role applies from the user's next sign-in.</p>}
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2">
                        <SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !edit.name.trim() || !edit.email.trim() || !edit.role} onClick={saveUser}>{edit.id ? 'Save' : 'Add user'}</PrimaryButton>
                    </div>
                </Modal>
            )}
        </div>
    );
}

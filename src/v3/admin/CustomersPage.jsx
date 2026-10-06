// Admin: customers — 2.0's customer table, shared by 2.0 and 3.0 sales orders, managed here under
// the decided shared-masters exception (V3_ROLE_NAVIGATION_PLAN.md section 9). Same fields as 2.0;
// names unique; a customer with orders (2.0 or 3.0) can't be deleted; every change logged in 3.0.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { adminApi } from '../api/adminApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import SharedLog from './SharedLog';

export default function CustomersPage() {
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [edit, setEdit] = useState(null);
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [tick, setTick] = useState(0);
    const load = useCallback(() => { adminApi.customers().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load customers.'))); setTick(t => t + 1); }, []);
    useEffect(() => { load(); }, [load]);
    const list = useMemo(() => (rows || []).filter(c => !q || `${c.name} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);

    const save = async () => {
        setBusy(true); setFormError('');
        try {
            const { id, name, email, phone, billing_address } = edit;
            const res = await adminApi.saveCustomer(id, { name, email: email || '', phone: phone || '', billing_address: billing_address || '' });
            setMsg(res.data.unchanged ? 'Nothing changed.' : `${res.data.name} saved.`); setEdit(null); load();
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const remove = async (c) => {
        if (!window.confirm(`Delete customer ${c.name}?`)) return;
        setError(''); setMsg('');
        try { await adminApi.deleteCustomer(c.id); setMsg(`${c.name} deleted.`); load(); } catch (err) { setError(apiError(err, 'Failed.')); }
    };

    return (
        <div>
            <PageHeader title="Customers" subtitle="Shared with 2.0 — a customer added here is available for orders in both versions."
                actions={<PrimaryButton onClick={() => { setFormError(''); setEdit({ name: '', email: '', phone: '', billing_address: '' }); }}><Plus size={14} /> Add customer</PrimaryButton>} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            <div className="mb-2 max-w-sm"><SearchInput value={q} onChange={setQ} placeholder="Search customers…" /></div>
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Billing address</th><th className="px-3 py-2 text-right">Orders 2.0 / 3.0</th><th className="px-3 py-2"></th></tr></thead>
                        <tbody>{list.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No customers.</td></tr> : list.map(c => (
                            <tr key={c.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">{c.name}</td>
                                <td className="px-3 py-2 text-xs">{c.email || '—'}{c.phone ? <span className="block text-slate-500">{c.phone}</span> : null}</td>
                                <td className="px-3 py-2 text-xs text-slate-600 max-w-xs whitespace-pre-line">{c.billing_address || '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{c.orders_v2} / {c.orders_v3}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                    <button type="button" aria-label={`Edit ${c.name}`} className="p-1 text-slate-400 hover:text-indigo-600" onClick={() => { setFormError(''); setEdit({ ...c }); }}><Pencil size={14} /></button>
                                    {c.orders_v2 + c.orders_v3 === 0 && <button type="button" aria-label={`Delete ${c.name}`} className="p-1 text-slate-400 hover:text-rose-600" onClick={() => remove(c)}><Trash2 size={14} /></button>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            <SharedLog entity="CUSTOMER" refresh={tick} />
            {edit && (
                <Modal title={edit.id ? `Edit ${edit.name}` : 'Add customer'} onClose={() => setEdit(null)}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Name"><input className={inputCls} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
                        <Field label="Email"><input className={inputCls} type="email" value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
                        <Field label="Phone"><input className={inputCls} value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
                        <div className="sm:col-span-2"><Field label="Billing address"><textarea className={inputCls} rows={3} value={edit.billing_address || ''} onChange={e => setEdit({ ...edit, billing_address: e.target.value })} /></Field></div>
                    </div>
                    <ErrorBox text={formError} />
                    <div className="mt-4 flex justify-end gap-2">
                        <SecondaryButton onClick={() => setEdit(null)}>Cancel</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !edit.name.trim()} onClick={save}>{edit.id ? 'Save' : 'Add customer'}</PrimaryButton>
                    </div>
                </Modal>
            )}
        </div>
    );
}

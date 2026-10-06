// 3.0 supplier master: GSTIN (checked; sets the state), state (decides
// CGST + SGST vs IGST on purchase orders), contact, payment terms.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import Modal from '../../shared/Modal';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading } from '../components/ui';

const empty = { name: '', gstin: '', state_code: '', address: '', city: '', pincode: '', contact_person: '', phone: '', email: '', payment_terms_days: 30, notes: '', is_active: true };

export default function SuppliersPage() {
    const [rows, setRows] = useState(null);
    const [states, setStates] = useState([]);
    const [canManage, setCanManage] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => purchasingApi.suppliers({ q: search.trim() || undefined }).then(res => setRows(res.data))
        .catch(err => setError(apiError(err, 'Failed to load suppliers.'))), [search]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
    useEffect(() => {
        purchasingApi.states().then(res => setStates(res.data)).catch(() => {});
        purchasingApi.permissions().then(res => setCanManage(res.data.manage)).catch(() => {});
    }, []);

    const set = (k) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        const next = { ...editing, [k]: v };
        // The GSTIN's first two digits are the state.
        if (k === 'gstin') { const g = String(v).toUpperCase().trim(); next.gstin = g; if (/^[0-9]{2}/.test(g) && states.some(s => s.code === g.slice(0, 2))) next.state_code = g.slice(0, 2); }
        setEditing(next);
    };
    const save = async () => {
        setSaving(true); setFormError('');
        try {
            if (editing.id) await purchasingApi.updateSupplier(editing.id, editing); else await purchasingApi.createSupplier(editing);
            setEditing(null); load();
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setSaving(false); }
    };

    return (
        <div>
            <PageHeader title="Suppliers" subtitle="3.0 supplier list. The state (from the GSTIN) decides CGST + SGST or IGST on purchase orders."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Name, GSTIN, city" />
                    {canManage && <PrimaryButton onClick={() => { setFormError(''); setEditing({ ...empty }); }}><Plus size={15} /> Add supplier</PrimaryButton>}
                </>} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Supplier</th><th className="px-4 py-2.5">GSTIN</th><th className="px-4 py-2.5">State</th><th className="px-4 py-2.5">Contact</th><th className="px-4 py-2.5 text-right">Terms</th><th className="px-4 py-2.5 text-right">POs</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No suppliers yet.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold text-slate-800">{r.name}<span className="block text-xs font-normal text-slate-500">{[r.city, r.pincode].filter(Boolean).join(' ')}</span></td>
                                    <td className="px-4 py-2.5 font-mono text-xs">{r.gstin || <span className="text-slate-400 font-sans">unregistered</span>}</td>
                                    <td className="px-4 py-2.5">{r.state_name}</td>
                                    <td className="px-4 py-2.5 text-xs text-slate-600">{[r.contact_person, r.phone, r.email].filter(Boolean).join(' · ') || '—'}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.payment_terms_days} d</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{r.po_count}</td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                    <td className="px-4 py-2.5">{canManage && <button type="button" className="p-1.5 rounded text-slate-500 hover:bg-slate-100" onClick={() => { setFormError(''); setEditing({ ...empty, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])) }); }} aria-label={`Edit ${r.name}`}><Pencil size={15} /></button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? `Edit ${editing.name}` : 'Add supplier'} onClose={() => setEditing(null)}>
                    <div className="space-y-3 w-[min(620px,90vw)] max-h-[75vh] overflow-y-auto pr-1">
                        <Field label="Name *"><input className={inputCls} value={editing.name} onChange={set('name')} autoFocus /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="GSTIN" hint="Leave empty for an unregistered supplier. Checked, and sets the state."><input className={`${inputCls} font-mono uppercase`} maxLength={15} value={editing.gstin} onChange={set('gstin')} /></Field>
                            <Field label="State *">
                                <select className={inputCls} value={editing.state_code} onChange={set('state_code')} disabled={/^[0-9]{2}/.test(editing.gstin || '')}>
                                    <option value="">— pick —</option>
                                    {states.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                                </select>
                            </Field>
                        </div>
                        <Field label="Address"><textarea className={`${inputCls} min-h-[56px]`} value={editing.address} onChange={set('address')} /></Field>
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="City"><input className={inputCls} value={editing.city} onChange={set('city')} /></Field>
                            <Field label="Pincode"><input className={inputCls} inputMode="numeric" maxLength={6} value={editing.pincode} onChange={set('pincode')} /></Field>
                            <Field label="Payment terms (days)"><input className={inputCls} type="number" min="0" max="365" value={editing.payment_terms_days} onChange={set('payment_terms_days')} /></Field>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="Contact person"><input className={inputCls} value={editing.contact_person} onChange={set('contact_person')} /></Field>
                            <Field label="Phone"><input className={inputCls} value={editing.phone} onChange={set('phone')} /></Field>
                            <Field label="Email"><input className={inputCls} type="email" value={editing.email} onChange={set('email')} /></Field>
                        </div>
                        <Field label="Notes"><input className={inputCls} value={editing.notes} onChange={set('notes')} /></Field>
                        {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={set('is_active')} /> Active</label>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={saving} disabled={saving || !editing.name.trim() || !editing.state_code}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

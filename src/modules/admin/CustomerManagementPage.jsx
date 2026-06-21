import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Pencil, Trash2, Search, X, AlertTriangle, Users } from 'lucide-react';
import { customerApi } from '../../api/customerApi';

const EMPTY_FORM = { name: '', email: '', phone: '', city: '', address: '', gstn: '' };

function CustomerModal({ customer, onClose, onSaved }) {
    const isEdit = !!customer;
    const [form, setForm] = useState(isEdit ? {
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        city: customer.city || '',
        address: customer.address || '',
        gstn: customer.gstn || '',
    } : { ...EMPTY_FORM });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { setErr('Customer name is required.'); return; }
        setBusy(true); setErr(null);
        try {
            if (isEdit) {
                await customerApi.updateCustomer(customer.id, form);
            } else {
                await customerApi.createCustomer(form);
            }
            onSaved();
        } catch (ex) {
            setErr(ex?.response?.data?.error || ex.message || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-black text-gray-800">
                        {isEdit ? `Edit · ${customer.name}` : 'New Customer'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                        <X size={16} className="text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer Name *</label>
                            <input
                                autoFocus
                                type="text"
                                value={form.name}
                                onChange={e => set('name', e.target.value)}
                                placeholder="Acme Corp"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={e => set('email', e.target.value)}
                                placeholder="contact@acme.com"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Phone</label>
                            <input
                                type="text"
                                value={form.phone}
                                onChange={e => set('phone', e.target.value)}
                                placeholder="+91 98765 43210"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">City</label>
                            <input
                                type="text"
                                value={form.city}
                                onChange={e => set('city', e.target.value)}
                                placeholder="Mumbai"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">GSTN</label>
                            <input
                                type="text"
                                value={form.gstn}
                                onChange={e => set('gstn', e.target.value)}
                                placeholder="27AAPFU0939F1ZV"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 font-mono text-xs"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Address</label>
                            <textarea
                                value={form.address}
                                onChange={e => set('address', e.target.value)}
                                rows={2}
                                placeholder="Street, area…"
                                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 resize-none"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                        <button type="button" onClick={onClose} disabled={busy}
                            className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-100 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={busy}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition">
                            {busy && <Loader2 size={13} className="animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Create Customer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function CustomerManagementPage() {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [search, setSearch] = useState('');
    const [modalCustomer, setModalCustomer] = useState(undefined); // undefined=closed, null=create, obj=edit
    const [deleting, setDeleting] = useState(null);
    const [deleteErr, setDeleteErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const res = await customerApi.getCustomers();
            setCustomers(res.data?.data ?? res.data ?? []);
        } catch (ex) {
            setErr(ex?.response?.data?.error || 'Failed to load customers.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleDelete = async (customer) => {
        if (!window.confirm(`Delete "${customer.name}"?\n\nThis cannot be undone.`)) return;
        setDeleting(customer.id); setDeleteErr(null);
        try {
            await customerApi.deleteCustomer(customer.id);
            setCustomers(prev => prev.filter(c => c.id !== customer.id));
        } catch (ex) {
            const status = ex?.response?.status;
            const msg = ex?.response?.data?.error || ex.message || 'Delete failed.';
            setDeleteErr(status === 409
                ? `Cannot delete "${customer.name}" — they have existing sales orders.`
                : msg);
        } finally {
            setDeleting(null);
        }
    };

    const filtered = customers.filter(c => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return [c.name, c.email, c.phone, c.city, c.gstn]
            .some(v => (v || '').toLowerCase().includes(q));
    });

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Users size={20} className="text-blue-500" /> Customer Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Add, edit, or remove customers. Cannot delete customers with active sales orders.</p>
                </div>
                <button
                    onClick={() => setModalCustomer(null)}
                    className="flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl shadow-sm transition shrink-0"
                >
                    <Plus size={14} /> Add Customer
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search by name, email, phone, city, GSTN…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-blue-400"
                />
                {search && (
                    <button onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wider">
                        Clear
                    </button>
                )}
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}

            {deleteErr && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-center gap-2"><AlertTriangle size={15} /> {deleteErr}</div>
                    <button onClick={() => setDeleteErr(null)}><X size={14} /></button>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-blue-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <Users size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{search ? 'No customers match your search' : 'No customers yet'}</p>
                    {!search && <p className="text-sm mt-1">Click "Add Customer" to create the first one.</p>}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Name</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Contact</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">City</th>
                                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">GSTN</th>
                                <th className="px-4 py-2.5 w-20" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="font-semibold text-gray-800">{c.name}</p>
                                        {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{c.phone || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{c.city || '—'}</td>
                                    <td className="px-4 py-3">
                                        {c.gstn
                                            ? <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{c.gstn}</span>
                                            : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setModalCustomer(c)}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c)}
                                                disabled={deleting === c.id}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                                                title="Delete"
                                            >
                                                {deleting === c.id
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400">
                        {filtered.length} customer{filtered.length !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}
                    </div>
                </div>
            )}

            {modalCustomer !== undefined && (
                <CustomerModal
                    customer={modalCustomer}
                    onClose={() => setModalCustomer(undefined)}
                    onSaved={() => { setModalCustomer(undefined); load(); }}
                />
            )}
        </div>
    );
}

// Sales orders (v3.sales_orders): list with status filter and search, and
// "New order" for the accounts team. Lines and quantities are edited on the
// order's own page.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, FileSpreadsheet } from 'lucide-react';
import Modal from '../../shared/Modal';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import SalesOrderStatusBadge, { SO_STATUS, fmtDate } from './SalesOrderStatusBadge';
import { exportOrderListExcel } from './orderSheetExport';

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function SalesOrdersPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [perms, setPerms] = useState({ edit: false });
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [customers, setCustomers] = useState([]);
    const [creating, setCreating] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => {
        salesOrdersApi.orders({ status: status || undefined, q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load sales orders.')));
    }, [status, search]);
    useEffect(() => {
        const t = setTimeout(load, 250); // debounce typing
        return () => clearTimeout(t);
    }, [load]);
    useEffect(() => {
        salesOrdersApi.permissions().then(res => setPerms(res.data)).catch(() => {});
        salesOrdersApi.customers().then(res => setCustomers(res.data)).catch(() => {});
    }, []);

    const create = async () => {
        setSaving(true); setFormError('');
        try {
            const res = await salesOrdersApi.createOrder(creating);
            navigate(`/v3/sales-orders/${res.data.id}`);
        } catch (err) {
            setFormError(apiError(err, 'Failed to create the order.'));
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                title="Sales orders"
                subtitle="Accounts create orders; merchandisers approve them. Numbers run in sequence per financial year."
                actions={<>
                    <select className={`${inputCls} w-40`} value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        {Object.entries(SO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="Order no., buyer PO, customer, style" />
                    <SecondaryButton onClick={() => exportOrderListExcel(rows || [])} disabled={!rows?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                    {perms.edit && <PrimaryButton onClick={() => { setFormError(''); setCreating({ customer_id: '', buyer_po_no: '', order_date: today(), notes: '' }); }}><Plus size={15} /> New order</PrimaryButton>}
                </>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[880px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Customer</th><th className="px-4 py-2.5">Styles</th>
                                <th className="px-4 py-2.5 text-right">Pieces</th><th className="px-4 py-2.5">First ship</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No sales orders{status || search ? ' match' : ' yet'}.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2.5">
                                        <Link to={`/v3/sales-orders/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.order_no}</Link>
                                        <span className="block text-xs text-slate-500">{fmtDate(r.order_date)}{r.buyer_po_no ? ` · PO ${r.buyer_po_no}` : ''}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-700">{r.customer_name}</td>
                                    <td className="px-4 py-2.5 text-slate-600 text-xs">{r.styles || '—'}<span className="block text-slate-400">{r.line_count} line{r.line_count === 1 ? '' : 's'}</span></td>
                                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.total_qty.toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtDate(r.first_ship_date)}</td>
                                    <td className="px-4 py-2.5"><SalesOrderStatusBadge status={r.status} />{r.revision_no > 0 && <span className="ml-1 text-[11px] text-slate-500">rev {r.revision_no}</span>}</td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/sales-orders/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.order_no}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {creating && (
                <Modal title="New sales order" onClose={() => setCreating(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <p className="text-xs text-slate-500">The order number is given when you save, and can't be reused or deleted (cancel instead).</p>
                        <Field label="Customer *" hint="Customers are added in the admin portal (Customer Management).">
                            <select className={inputCls} value={creating.customer_id} onChange={e => setCreating({ ...creating, customer_id: e.target.value })} autoFocus>
                                <option value="">— pick —</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Buyer PO no."><input className={inputCls} value={creating.buyer_po_no} onChange={e => setCreating({ ...creating, buyer_po_no: e.target.value })} /></Field>
                            <Field label="Order date *"><input className={inputCls} type="date" value={creating.order_date} onChange={e => setCreating({ ...creating, order_date: e.target.value })} /></Field>
                        </div>
                        <Field label="Notes"><textarea className={`${inputCls} min-h-[60px]`} value={creating.notes} onChange={e => setCreating({ ...creating, notes: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCreating(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={create} busy={saving} disabled={saving || !creating.customer_id || !creating.order_date}>Create order</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

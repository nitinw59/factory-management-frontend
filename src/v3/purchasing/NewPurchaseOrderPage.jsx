// New purchase order: pick open approved requisition lines (all or part of
// each), a supplier and an optional delivery date → a draft PO with one line
// per item. Rates are set on the PO before issuing.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import RequisitionLinePicker from './RequisitionLinePicker';

export default function NewPurchaseOrderPage() {
    const navigate = useNavigate();
    const [lines, setLines] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [picks, setPicks] = useState(new Map());
    const [form, setForm] = useState({ supplier_id: '', delivery_date: '', notes: '' });
    const [kind, setKind] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        purchasingApi.openRequisitionLines().then(res => setLines(res.data)).catch(err => setError(apiError(err, 'Failed to load requisition lines.')));
        purchasingApi.suppliers().then(res => setSuppliers(res.data.filter(s => s.is_active))).catch(() => {});
    }, []);
    const shown = useMemo(() => (lines || []).filter(l => !kind || l.kind === kind), [lines, kind]);
    const supplier = suppliers.find(s => String(s.id) === form.supplier_id);

    const create = async () => {
        setBusy(true); setError('');
        try {
            const res = await purchasingApi.createOrder({ ...form, lines: [...picks].map(([pr_line_id, qty]) => ({ pr_line_id, qty: Number(qty) })) });
            navigate(`/v3/purchasing/orders/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to create the purchase order.')); setBusy(false); }
    };

    return (
        <div>
            <Link to="/v3/purchasing/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Purchase orders</Link>
            <PageHeader title="New purchase order" subtitle="Pick approved requisition lines (all or part — the rest can go to another supplier), then the supplier. Each item becomes one PO line, rounded up to purchase units." />
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 gap-3">
                <Field label="Supplier *" hint={supplier ? `${supplier.state_name}${supplier.gstin ? ` · GSTIN ${supplier.gstin}` : ' · unregistered'} — CGST + SGST if in the company's state, otherwise IGST` : 'Add suppliers under Purchasing → Suppliers.'}>
                    <select className={inputCls} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                        <option value="">— pick —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.state_name})</option>)}
                    </select>
                </Field>
                <Field label="Delivery date" hint="Leave empty to use each line's needed-by date."><input className={inputCls} type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></Field>
                <Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-2 mb-2">
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Fabric or trims">
                    <option value="">Fabric and trims</option><option value="FABRIC">Fabric</option><option value="TRIM">Trims</option>
                </select>
                <span className="text-sm text-slate-600">{picks.size} line(s) selected</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl mb-4">
                {!lines ? <Loading /> : <RequisitionLinePicker lines={shown} picks={picks} setPicks={setPicks} />}
            </div>
            <ErrorBox text={error} />
            <PrimaryButton onClick={create} busy={busy} disabled={busy || !form.supplier_id || !picks.size || [...picks.values()].some(v => !(Number(v) > 0))}>Create draft purchase order</PrimaryButton>
        </div>
    );
}

// New purchase order: pick open approved requisition lines (all or part of
// each), a supplier and an optional delivery date → a draft PO with one line
// per item. Rates are set on the PO before issuing. Items with no requisition (fabric, trims, spares, general
// items) can be added too, with a reason each. Every PO above the approval limit (Settings → Purchasing) is issued after factory admin approval.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { settingsApi } from '../api/settingsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import RequisitionLinePicker from './RequisitionLinePicker';
import DirectItemsEditor, { directProblem, directPayload } from './DirectItemsEditor';

export default function NewPurchaseOrderPage() {
    const navigate = useNavigate();
    const [lines, setLines] = useState(null);
    const [suppliers, setSuppliers] = useState([]);
    const [picks, setPicks] = useState(new Map());
    const [form, setForm] = useState({ supplier_id: '', delivery_date: '', notes: '', delivery_address_id: '' });
    const [addresses, setAddresses] = useState([]);   // Settings → Company: works / warehouse addresses
    const [kind, setKind] = useState('');
    const [type, setType] = useState('');   // trim type (store: category) — only the types on the open lines
    const [direct, setDirect] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        purchasingApi.openRequisitionLines().then(res => setLines(res.data)).catch(err => setError(apiError(err, 'Failed to load requisition lines.')));
        purchasingApi.suppliers().then(res => setSuppliers(res.data.filter(s => s.is_active))).catch(() => {});
        settingsApi.addresses().then(res => { setAddresses(res.data); const d = res.data.find(a => a.is_default_delivery); if (d) setForm(f => ({ ...f, delivery_address_id: f.delivery_address_id || d.id })); }).catch(() => {});
    }, []);
    const ofKind = useMemo(() => (lines || []).filter(l => !kind || l.kind === kind), [lines, kind]);
    // Types on the lines of the chosen kind (fabric lines have none), with how many lines each.
    const types = useMemo(() => {
        const m = new Map();
        for (const l of ofKind) if (l.kind !== 'FABRIC' && l.type_name) m.set(l.type_name, (m.get(l.type_name) || 0) + 1);
        return [...m].sort((a, b) => a[0].localeCompare(b[0]));
    }, [ofKind]);
    useEffect(() => { if (type && !types.some(([t]) => t === type)) setType(''); }, [types, type]);
    const shown = useMemo(() => ofKind.filter(l => !type || l.type_name === type), [ofKind, type]);
    const hiddenPicks = [...picks.keys()].filter(id => !shown.some(l => String(l.id) === String(id))).length;
    const supplier = suppliers.find(s => String(s.id) === form.supplier_id);

    const create = async () => {
        setBusy(true); setError('');
        try {
            const res = await purchasingApi.createOrder({ ...form, delivery_address_id: form.delivery_address_id || null, lines: [...picks].map(([pr_line_id, qty]) => ({ pr_line_id, qty: Number(qty) })), direct: directPayload(direct) });
            navigate(`/v3/purchasing/orders/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to create the purchase order.')); setBusy(false); }
    };

    return (
        <div>
            <Link to="/v3/purchasing/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Purchase orders</Link>
            <PageHeader title="New purchase order" subtitle="Pick approved requisition lines (all or part — the rest can go to another supplier) and / or items with no requisition, then the supplier. Each item becomes one PO line, rounded up to purchase units." />
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid sm:grid-cols-3 gap-3">
                <Field label="Supplier *" hint={supplier ? `${supplier.state_name}${supplier.gstin ? ` · GSTIN ${supplier.gstin}` : ' · unregistered'} — CGST + SGST if in the company's state, otherwise IGST` : 'Add suppliers under Purchasing → Suppliers.'}>
                    <select className={inputCls} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                        <option value="">— pick —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.state_name})</option>)}
                    </select>
                </Field>
                <Field label="Delivery date" hint="Leave empty to use each line's needed-by date."><input className={inputCls} type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></Field>
                <Field label="Notes"><input className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
                {addresses.length > 0 && (
                    <Field label="Deliver to" hint={(() => { const a = addresses.find(x => x.id === form.delivery_address_id); return a ? `${[a.address_line1, a.city].filter(Boolean).join(', ')}${a.gstin ? ` · billed on GSTIN ${a.gstin}` : ''}` : 'The registered address (Company profile).'; })()}>
                        <select className={inputCls} value={form.delivery_address_id} onChange={e => setForm({ ...form, delivery_address_id: e.target.value })}>
                            <option value="">Registered address</option>
                            {addresses.map(a => <option key={a.id} value={a.id}>{a.name}{a.is_default_delivery ? ' (default)' : ''}</option>)}
                        </select>
                    </Field>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Fabric or trims">
                    <option value="">All items</option><option value="FABRIC">Fabric</option><option value="TRIM">Trims</option><option value="STORE">Store (spares / general)</option>
                </select>
                {types.length > 0 && (
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={type} onChange={e => setType(e.target.value)} aria-label={kind === 'STORE' ? 'Category' : 'Trim type'}>
                        <option value="">{kind === 'STORE' ? 'All categories' : kind === 'TRIM' ? 'All trim types' : 'All types'}</option>
                        {types.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
                    </select>
                )}
                <span className="text-sm text-slate-600">{picks.size} line(s) selected{hiddenPicks > 0 && <span className="text-slate-400"> · {hiddenPicks} not shown by the filter</span>}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl mb-4">
                {!lines ? <Loading /> : <RequisitionLinePicker lines={shown} picks={picks} setPicks={setPicks} />}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                <p className="font-bold text-slate-800">Items with no requisition</p>
                <p className="text-xs text-slate-500 mb-3">For buying ahead of a requisition — an expected order, a supplier minimum, a better rate, samples, store stock. Each needs a reason. The PO follows the approval limit like any other (above it, the factory admin approves before issue). Planning counts it as on order, so later requisitions for the item ask for less.</p>
                <DirectItemsEditor items={direct} setItems={setDirect} supplierId={form.supplier_id} />
            </div>
            {direct.length > 0 && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{direct.length} item(s) with no requisition — each needs a reason. Like every PO, it needs factory admin approval if its total is above the approval limit.</p>}
            <ErrorBox text={error || (direct.length ? directProblem(direct) : '')} />
            <PrimaryButton onClick={create} busy={busy} disabled={busy || !form.supplier_id || (!picks.size && !direct.length) || [...picks.values()].some(v => !(Number(v) > 0)) || !!directProblem(direct)}>Create draft purchase order</PrimaryButton>
        </div>
    );
}

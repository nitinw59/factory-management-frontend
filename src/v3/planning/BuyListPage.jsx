// Buy list: everything approved orders still need after item-level netting —
// allocated stock, free stock, and all requisition quantities including MOQ /
// pack surplus raised for other orders (supplyPegging.js) — summed per item across
// orders and rounded up to purchase units, earliest needed-by first. Select
// items → new requisition, or add them to a draft one.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileSpreadsheet, Plus, AlertTriangle } from 'lucide-react';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { exportBuyListExcel } from './prShared';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });

export default function BuyListPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [kind, setKind] = useState('');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [open, setOpen] = useState(new Set());
    const [canPlan, setCanPlan] = useState(false);
    const [error, setError] = useState('');
    const [raising, setRaising] = useState(null); // { mode: 'new' | 'add', notes, prId, drafts }
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => planningApi.buyList({ kind: kind || undefined, q: search.trim() || undefined })
        .then(res => { setRows(res.data); setPicked(new Set()); }).catch(err => setError(apiError(err, 'Failed to load the buy list.'))), [kind, search]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
    useEffect(() => { planningApi.permissions().then(res => setCanPlan(res.data.plan)).catch(() => {}); }, []);

    const toggle = (set, setter, key) => { const nx = new Set(set); if (nx.has(key)) nx.delete(key); else nx.add(key); setter(nx); };
    const items = () => rows.filter(r => picked.has(r.key)).map(r => ({ kind: r.kind, item_id: r.item_id }));

    const openRaise = async (mode) => {
        setFormError('');
        if (mode === 'add') {
            const [d, rj] = await Promise.all([planningApi.prs({ status: 'DRAFT' }), planningApi.prs({ status: 'REJECTED' })]).catch(() => [{ data: [] }, { data: [] }]);
            const drafts = [...d.data, ...rj.data];
            setRaising({ mode, drafts, prId: drafts[0] ? String(drafts[0].id) : '' });
        } else setRaising({ mode, notes: '' });
    };
    const raise = async () => {
        setBusy(true); setFormError('');
        try {
            const res = raising.mode === 'new'
                ? await planningApi.createPr({ items: items(), notes: raising.notes })
                : await planningApi.addPrLines(raising.prId, items());
            navigate(`/v3/planning/purchase-requisitions/${res.data.id}`);
        } catch (err) {
            setFormError(apiError(err, 'Failed.'));
            setBusy(false);
        }
    };

    return (
        <div>
            <PageHeader title="Buy list" subtitle="What approved orders still need after stock (allocated and free) and everything already on requisitions — including surplus from minimum orders — is counted. Summed across orders, then rounded up to purchase units."
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Fabric or trims">
                        <option value="">Fabric and trims</option><option value="FABRIC">Fabric</option><option value="TRIM">Trims</option>
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="Item, brand, code, type" />
                    <SecondaryButton onClick={() => exportBuyListExcel(rows || [])} disabled={!rows?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </>} />
            <ErrorBox text={error} />
            {canPlan && rows?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-sm text-slate-600">{picked.size} selected</span>
                    <PrimaryButton onClick={() => openRaise('new')} disabled={!picked.size}><Plus size={14} /> New requisition</PrimaryButton>
                    <SecondaryButton onClick={() => openRaise('add')} disabled={!picked.size}>Add to a draft requisition</SecondaryButton>
                </div>
            )}
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-left">
                                <th className="px-3 py-2.5 w-10">{canPlan && rows.length > 0 && <input type="checkbox" aria-label="Select all" checked={picked.size === rows.length} onChange={e => setPicked(e.target.checked ? new Set(rows.map(r => r.key)) : new Set())} />}</th>
                                <th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Still needed</th><th className="px-3 py-2.5 text-right">Buy</th><th className="px-3 py-2.5">Needed by</th><th className="px-3 py-2.5">Orders</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nothing to buy: every need is allocated or already on a requisition.</td></tr>}
                            {rows.map(r => (
                                <Fragment key={r.key}>
                                    <tr className="border-t border-slate-100 align-top">
                                        <td className="px-3 py-2.5">{canPlan && <input type="checkbox" aria-label={`Select ${r.label}`} checked={picked.has(r.key)} onChange={() => toggle(picked, setPicked, r.key)} />}</td>
                                        <td className="px-3 py-2.5">
                                            <Link to={`/v3/planning/position/${r.kind}/${r.item_id}`} className="font-semibold text-indigo-700 hover:underline">{r.label}</Link>
                                            <span className="block text-xs text-slate-500">{r.type_name}{!r.active && <span className="ml-1 font-bold text-rose-600">inactive</span>}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right tabular-nums">{fmt(r.to_raise, r.uom)} <span className="text-xs text-slate-500">{r.uom}</span></td>
                                        <td className="px-3 py-2.5 text-right tabular-nums font-black">{fmt(r.purchase_qty, 'pcs')} <span className="text-xs font-normal text-slate-500">{r.purchase_uom}</span></td>
                                        <td className={`px-3 py-2.5 whitespace-nowrap ${r.late ? 'text-rose-700 font-bold' : ''}`}>{fmtDate(r.needed_by)}{r.late && <span className="flex items-center gap-1 text-[11px]"><AlertTriangle size={11} /> already late</span>}</td>
                                        <td className="px-3 py-2.5">
                                            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700" onClick={() => toggle(open, setOpen, r.key)}>
                                                {open.has(r.key) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{r.orders.length} order{r.orders.length === 1 ? '' : 's'}
                                            </button>
                                        </td>
                                    </tr>
                                    {open.has(r.key) && (
                                        <tr className="bg-slate-50/60"><td /><td colSpan={5} className="px-3 py-2">
                                            <table className="w-full text-xs">
                                                <thead className="text-slate-500 text-right"><tr><th className="text-left py-1">Order</th><th className="text-left">Customer</th><th className="text-left">Ship</th><th>Required</th><th>Allocated</th><th>Free stock</th><th>On requisition</th><th>Still needed</th></tr></thead>
                                                <tbody>
                                                    {r.orders.map(o => (
                                                        <tr key={o.order_id} className="border-t border-slate-200 text-right tabular-nums">
                                                            <td className="text-left py-1"><Link to={`/v3/planning/orders/${o.order_id}`} className="font-semibold text-indigo-700 hover:underline">{o.order_no}</Link></td>
                                                            <td className="text-left">{o.customer_name}</td><td className="text-left">{fmtDate(o.ship_date)}</td>
                                                            <td>{fmt(o.required, r.uom)}</td><td>{fmt(o.allocated, r.uom)}</td><td>{fmt(o.from_stock, r.uom)}</td><td>{fmt(o.pr_pending + o.pr_approved, r.uom)}</td><td className="font-bold">{fmt(o.to_raise, r.uom)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </td></tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {raising && (
                <Modal title={raising.mode === 'new' ? 'New purchase requisition' : 'Add to a draft requisition'} onClose={() => setRaising(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <p className="text-sm text-slate-600">{picked.size} item{picked.size === 1 ? '' : 's'}: each becomes one line covering everything still needed for it, rounded up to purchase units. You can raise a quantity (e.g. for a minimum order) on the requisition before submitting.</p>
                        {raising.mode === 'new' ? (
                            <Field label="Notes"><textarea className={`${inputCls} min-h-[60px]`} value={raising.notes} onChange={e => setRaising({ ...raising, notes: e.target.value })} /></Field>
                        ) : raising.drafts.length === 0 ? <p className="text-sm text-amber-700">There is no draft or rejected requisition to add to.</p> : (
                            <Field label="Requisition">
                                <select className={inputCls} value={raising.prId} onChange={e => setRaising({ ...raising, prId: e.target.value })}>
                                    {raising.drafts.map(d => <option key={d.id} value={d.id}>{d.pr_no} — {d.status.toLowerCase()}, {d.line_count} line(s)</option>)}
                                </select>
                            </Field>
                        )}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setRaising(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={raise} busy={busy} disabled={busy || (raising.mode === 'add' && !raising.prId)}>{raising.mode === 'new' ? 'Create requisition' : 'Add lines'}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

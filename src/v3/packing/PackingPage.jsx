// Dispatch (production step 6, 17 Oct 2026; no packing since 20 Oct 2026, phase 7): orders with garments finished at the
// last stage of their route, dispatched by quantity — and the dispatch notes. Each order opens its dispatch page.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PackageCheck, Truck } from 'lucide-react';
import { packingApi } from '../api/packingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

const STATUS = { DRAFT: 'bg-slate-50 text-slate-700 border-slate-300', DISPATCHED: 'bg-emerald-50 text-emerald-800 border-emerald-300', CANCELLED: 'bg-slate-50 text-slate-400 border-slate-200' };
export const DispatchStatus = ({ s }) => <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${STATUS[s] || ''}`}>{s.toLowerCase()}</span>;

function Bar({ o }) {
    const t = Math.max(o.ordered, 1);
    const seg = (v, cls) => (v > 0 ? <span className={cls} style={{ width: `${Math.min(100, (v / t) * 100)}%` }} /> : null);
    return (
        <div className="min-w-[200px]">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">{seg(o.dispatched, 'bg-emerald-500')}{seg(o.ready, 'bg-amber-400')}</div>
            <p className="mt-1 text-xs text-slate-600 tabular-nums">{o.finished} finished · <b>{o.dispatched}</b> of {o.ordered} dispatched</p>
        </div>
    );
}

function Orders() {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const t = setTimeout(() => packingApi.orders({ q: q.trim() || undefined }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), 250);
        return () => clearTimeout(t);
    }, [q]);
    return (
        <>
            <div className="flex mb-3"><div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="Order, customer, buyer PO" /></div></div>
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">No approved order.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr className="text-left"><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5 text-right">Ready to ship</th><th className="px-3 py-2.5">Progress</th><th className="px-3 py-2.5">Ship</th></tr></thead>
                        <tbody>
                            {rows.map(o => (
                                <tr key={o.id} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/v3/packing/orders/${o.id}`)}>
                                    <td className="px-3 py-2.5"><Link to={`/v3/packing/orders/${o.id}`} className="font-bold text-slate-800 hover:text-indigo-700" onClick={e => e.stopPropagation()}>{o.order_no}</Link><span className="block text-xs text-slate-500">{o.customer_name}{o.buyer_po_no ? ` · PO ${o.buyer_po_no}` : ''}</span></td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums font-black ${o.ready > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{o.ready}{o.status === 'SHIPPED' && <span className="block text-[10px] font-black text-sky-700">SHIPPED</span>}</td>
                                    <td className="px-3 py-2.5"><Bar o={o} /></td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{fmtDate(o.ship_date)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

function Dispatches() {
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const t = setTimeout(() => packingApi.dispatches({ q: q.trim() || undefined }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), 250);
        return () => clearTimeout(t);
    }, [q]);
    return (
        <>
            <div className="flex mb-3"><div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="DN no., order, customer, invoice, vehicle" /></div></div>
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">No dispatch notes yet — make one from an order's packing page.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr className="text-left"><th className="px-3 py-2.5">Dispatch note</th><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5">Vehicle · invoice</th><th className="px-3 py-2.5 text-right">Cartons · pcs</th><th className="px-3 py-2.5">Status</th></tr></thead>
                        <tbody>
                            {rows.map(d => (
                                <tr key={d.id} className="border-t border-slate-100">
                                    <td className="px-3 py-2.5"><Link to={`/v3/packing/dispatches/${d.id}`} className="font-bold text-slate-800 hover:text-indigo-700 hover:underline">{d.dispatch_no}</Link><span className="block text-xs text-slate-500">{fmtDate(d.dispatch_date)}</span></td>
                                    <td className="px-3 py-2.5">{d.order_no}<span className="block text-xs text-slate-500">{d.customer_name}</span></td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600">{d.vehicle_no || '—'}{d.invoice_no ? ` · ${d.invoice_no}` : ''}{d.transporter ? <span className="block">{d.transporter}</span> : null}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{d.cartons} · {d.qty}</td>
                                    <td className="px-3 py-2.5"><DispatchStatus s={d.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

export default function PackingPage({ initialTab = 'orders' }) {
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || initialTab;
    return (
        <div>
            <PageHeader title="Dispatch" subtitle="Garments finished at the last stage of their route (finishing on the tablet, no scanning) leave on a dispatch note by quantity — no packing in 3.0." />
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 mb-4" role="tablist">
                {[['orders', 'Orders to pack', PackageCheck], ['dispatches', 'Dispatch notes', Truck]].map(([k, l, Icon]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}><Icon size={14} /> {l}</button>
                ))}
            </div>
            {tab === 'dispatches' ? <Dispatches /> : <Orders />}
        </div>
    );
}

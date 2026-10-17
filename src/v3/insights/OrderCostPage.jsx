// Material cost of one order (production insights → Cost): per item, the Order BOM requirement and what was
// issued to production (net of returns), the rate and where it came from (the roll's own GRN, the item's GRN
// average, its last PO, or none), planned vs actual cost, and fabric used for re-cuts. Ex-GST. Price viewers only.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { insightsApi } from '../api/insightsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading } from '../components/ui';
import { money } from './InsightsPage';

const q3 = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const SOURCE = { ROLL: ['roll GRN', 'bg-emerald-50 text-emerald-800 border-emerald-200'], GRN: ['GRN avg', 'bg-emerald-50 text-emerald-800 border-emerald-200'], PO: ['PO rate', 'bg-sky-50 text-sky-800 border-sky-200'] };

function Card({ label, value, sub, tone = '' }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[150px]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`text-xl font-black tabular-nums ${tone}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
    );
}

export default function OrderCostPage() {
    const { orderId } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [kind, setKind] = useState('');
    useEffect(() => { insightsApi.cost(orderId).then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load the cost.'))); }, [orderId]);
    const items = useMemo(() => (data?.items || []).filter(i => !kind || i.kind === kind), [data, kind]);
    if (error) return <ErrorBox text={error} />;
    if (!data) return <Loading />;
    const s = data.summary;
    const variance = s.planned_cost > 0 ? s.actual_cost - s.planned_cost : null;
    return (
        <div>
            <PageHeader title={<>Material cost <span className="text-slate-400">—</span> <Link to={`/v3/tracker/orders/${data.order.id}`} className="text-indigo-700 hover:underline">{data.order.order_no}</Link></>}
                subtitle={`${data.order.customer_name}${data.order.buyer_po_no ? ` · PO ${data.order.buyer_po_no}` : ''} — issued to production (net of returns) × rate, against the Order BOM. Ex-GST.`}
                actions={<Link to="/v3/insights?tab=cost" className="text-sm font-semibold text-slate-600 hover:underline">All orders</Link>} />
            <div className="flex flex-wrap gap-3 mb-4">
                <Card label="Planned" value={money(s.planned_cost)} sub={s.planned_per_garment != null ? `${money(s.planned_per_garment)} per garment ordered (${s.ordered})` : `${s.ordered} ordered`} />
                <Card label="Issued so far" value={money(s.actual_cost)} sub={s.planned_cost > 0 ? `${Math.round((s.actual_cost / s.planned_cost) * 100)}% of planned` : ''} />
                <Card label="Per garment cut" value={money(s.per_garment_cut)} sub={`${s.cut} cut`} />
                <Card label="Fabric · trims" value={`${money(s.fabric_actual)} · ${money(s.trims_actual)}`} sub={`planned ${money(s.fabric_planned)} · ${money(s.trims_planned)}`} />
                {s.recut_metres > 0 && <Card label="Re-cuts" value={money(s.recut_cost)} sub={`${q3(s.recut_metres)} fabric`} tone="text-rose-700" />}
                {variance != null && s.cut >= s.ordered && s.ordered > 0 && <Card label="Over / under plan" value={money(variance)} tone={variance > 0 ? 'text-rose-700' : 'text-emerald-700'} />}
            </div>
            {s.unpriced_items > 0 && (
                <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5"><AlertTriangle size={14} /> {s.unpriced_items} item(s) have no GRN or PO rate — their cost is not counted.</p>
            )}
            <div className="flex gap-1 mb-2">
                {[['', 'All'], ['FABRIC', 'Fabric'], ['TRIM', 'Trims']].map(([k, l]) => (
                    <button key={k || 'all'} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                        className={`px-3 py-1 text-xs font-bold rounded-full border ${kind === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-600'}`}>{l}</button>
                ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr className="text-left"><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Required</th><th className="px-3 py-2.5 text-right">Issued − returned</th>
                            <th className="px-3 py-2.5 text-right">Rate</th><th className="px-3 py-2.5 text-right">Planned</th><th className="px-3 py-2.5 text-right">Issued cost</th><th className="px-3 py-2.5 text-right">Re-cuts</th></tr>
                    </thead>
                    <tbody>
                        {items.map(i => (
                            <tr key={i.key} className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2.5"><span className="font-semibold text-slate-800">{i.label}</span><span className="block text-xs text-slate-500">{i.type_name}</span></td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{q3(i.required, i.uom)} <span className="text-xs text-slate-500">{i.uom}</span></td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{q3(i.net, i.uom)} <span className="text-xs text-slate-500">{i.uom}</span>{i.returned > 0 && <span className="block text-[11px] text-slate-500">{q3(i.issued, i.uom)} − {q3(i.returned, i.uom)}</span>}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                                    {i.rate == null ? <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5">no rate</span> : <>
                                        ₹{Number(i.rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}<span className="text-xs text-slate-500">/{i.uom}</span>
                                        {SOURCE[i.rate_source] && <span className={`block ml-auto w-fit text-[10px] font-bold border rounded px-1 ${SOURCE[i.rate_source][1]}`}>{SOURCE[i.rate_source][0]}</span>}
                                    </>}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{money(i.planned_cost)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums font-bold">{money(i.actual_cost)}{i.unpriced_qty > 0 && <span className="block text-[11px] font-normal text-amber-800">{q3(i.unpriced_qty, i.uom)} {i.uom} without rate</span>}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{i.recut_metres > 0 ? <>{money(i.recut_cost)}<span className="block text-[11px] text-slate-500">{q3(i.recut_metres)} {i.uom}</span></> : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

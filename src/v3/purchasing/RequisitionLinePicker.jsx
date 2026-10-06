// Table of approved requisition lines still open to order, with a checkbox
// and "quantity to order" per line. Used by New purchase order and "Add lines".
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });

// picks: Map lineId → qty string
export default function RequisitionLinePicker({ lines, picks, setPicks }) {
    const toggle = (l) => {
        const nx = new Map(picks);
        if (nx.has(l.id)) nx.delete(l.id); else nx.set(l.id, String(l.remaining));
        setPicks(nx);
    };
    if (!lines.length) return <p className="text-sm text-slate-400 py-4">No approved requisition lines are open. Requisitions are raised from the buy list and approved by the purchase manager.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
                <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                    <tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">Item</th><th className="px-3 py-2">Requisition</th><th className="px-3 py-2">Needed by</th><th className="px-3 py-2 text-right">Open</th><th className="px-3 py-2 text-right w-40">Order now</th><th className="px-3 py-2">For orders</th></tr>
                </thead>
                <tbody>
                    {lines.map(l => {
                        const on = picks.has(l.id);
                        return (
                            <tr key={l.id} className={`border-t border-slate-100 ${on ? 'bg-indigo-50/40' : ''}`}>
                                <td className="px-3 py-2"><input type="checkbox" checked={on} onChange={() => toggle(l)} aria-label={`Order ${l.label}`} /></td>
                                <td className="px-3 py-2"><span className="font-semibold text-slate-800">{l.label}</span><span className="block text-xs text-slate-500">{l.type_name}{l.hsn_code ? ` · HSN ${l.hsn_code}` : ''}{l.gst_pct != null ? ` · GST ${l.gst_pct}%` : ' · no GST % set'}</span></td>
                                <td className="px-3 py-2 text-xs">{l.pr_no} · line {l.line_no}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.needed_by)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(l.remaining, l.uom)} {l.uom}<span className="block text-[11px] text-slate-500">≈ {l.remaining_purchase_units} {l.purchase_uom}</span></td>
                                <td className="px-3 py-2 text-right">
                                    {on && <input className="w-28 px-2 py-1 text-sm text-right border border-slate-300 rounded" type="number" min="0" max={l.remaining} step="any" value={picks.get(l.id)}
                                        onChange={e => setPicks(new Map(picks).set(l.id, e.target.value))} aria-label={`Quantity of ${l.label} to order`} />}
                                    {on && <span className="ml-1 text-xs text-slate-500">{l.uom}</span>}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-600">{l.orders.join(', ') || '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

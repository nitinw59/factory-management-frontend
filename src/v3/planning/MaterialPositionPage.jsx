// Material position: one row per item that approved orders need (or that is
// allocated): on hand, allocated, free, required, shortfall. Open an item to
// allocate it to orders, earliest ship date first.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';

function exportExcel(rows) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
        Type: r.kind === 'FABRIC' ? 'Fabric' : r.type_name, Item: r.label, Unit: r.uom, 'On hand': r.kind === 'FABRIC' ? '' : r.on_hand, Allocated: r.allocated, Free: r.free,
        Required: r.required, Shortfall: r.shortfall, 'Free stock covers': r.from_stock, 'On requisition (pending)': r.pr_pending, 'On order (approved PR)': r.pr_approved, 'Incoming uncommitted': r.incoming_uncommitted, 'Still to raise': r.to_raise,
        Orders: r.orders, 'Orders short': r.short_orders, 'Over-allocated': r.over_allocated ? 'yes' : '',
    }))), 'Material position');
    XLSX.writeFile(wb, `MaterialPosition-${todayLocal()}.xlsx`);
}

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });

export default function MaterialPositionPage() {
    const [rows, setRows] = useState(null);
    const [kind, setKind] = useState('');
    const [shortOnly, setShortOnly] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => planningApi.position({ kind: kind || undefined, q: search.trim() || undefined, shortfall: shortOnly ? 1 : undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))), 250);
        return () => clearTimeout(t);
    }, [kind, search, shortOnly]);

    return (
        <div>
            <PageHeader title="Material position" subtitle="Stock against what approved orders need. Allocation reserves stock for an order without moving it."
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Fabric or trims">
                        <option value="">Fabric and trims</option><option value="FABRIC">Fabric</option><option value="TRIM">Trims</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600"><input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} /> Shortfall only</label>
                    <SearchInput value={search} onChange={setSearch} placeholder="Item, brand, code, type" />
                    <SecondaryButton onClick={() => exportExcel(rows || [])} disabled={!rows?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </>} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-right"><th className="px-4 py-2.5 text-left">Item</th><th className="px-4 py-2.5">On hand</th><th className="px-4 py-2.5">Allocated</th><th className="px-4 py-2.5">Free</th>
                                <th className="px-4 py-2.5">Required</th><th className="px-4 py-2.5">Shortfall</th><th className="px-4 py-2.5">On requisition</th><th className="px-4 py-2.5">To raise</th><th className="px-4 py-2.5">Orders</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Nothing {shortOnly ? 'short' : 'needed by approved orders'}.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.key} className="border-t border-slate-100 hover:bg-slate-50 text-right tabular-nums">
                                    <td className="px-4 py-2.5 text-left">
                                        <Link to={`/v3/planning/position/${r.kind}/${r.item_id}`} className="font-semibold text-indigo-700 hover:underline">{r.label}</Link>
                                        <span className="block text-xs text-slate-500">{r.type_name}{!r.active && <span className="ml-1 font-bold text-rose-600">inactive</span>}</span>
                                    </td>
                                    <td className="px-4 py-2.5">{fmt(r.on_hand, r.uom)}</td>
                                    <td className="px-4 py-2.5">{fmt(r.allocated, r.uom)}</td>
                                    <td className={`px-4 py-2.5 font-semibold ${r.free < 0 ? 'text-rose-700' : ''}`}>{fmt(r.free, r.uom)}
                                        {r.over_allocated && <span className="flex justify-end items-center gap-1 text-[11px] font-bold text-rose-700"><AlertTriangle size={11} /> over-allocated</span>}</td>
                                    <td className="px-4 py-2.5">{fmt(r.required, r.uom)} <span className="text-xs text-slate-500">{r.uom}</span></td>
                                    <td className={`px-4 py-2.5 font-bold ${r.shortfall > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{r.shortfall > 0 ? fmt(r.shortfall, r.uom) : 'covered'}</td>
                                    <td className="px-4 py-2.5">{r.pr_pending + r.pr_approved > 0 ? <>{fmt(r.pr_pending + r.pr_approved, r.uom)}{r.pr_approved > 0 && <span className="block text-[11px] text-emerald-700">{fmt(r.pr_approved, r.uom)} approved</span>}</> : '—'}</td>
                                    <td className={`px-4 py-2.5 font-bold ${r.to_raise > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{r.to_raise > 0 ? fmt(r.to_raise, r.uom) : '—'}
                                        {r.from_stock > 0 && <span className="block text-[11px] font-semibold text-emerald-700">{fmt(r.from_stock, r.uom)} in free stock</span>}
                                        {r.incoming_uncommitted > 0 && <span className="block text-[11px] font-semibold text-sky-700">+{fmt(r.incoming_uncommitted, r.uom)} incoming, uncommitted</span>}</td>
                                    <td className="px-4 py-2.5">{r.orders}{r.short_orders > 0 && <span className="block text-[11px] text-rose-600">{r.short_orders} short</span>}</td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/planning/position/${r.kind}/${r.item_id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.label}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

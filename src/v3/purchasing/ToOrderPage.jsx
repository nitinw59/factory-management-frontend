// To order (3 Nov 2026, owner: "there is no way for purchase manager to see line items to order"): one row per item on an approved
// requisition that is not yet fully on a purchase order, earliest need first. Tick lines and create the PO; a DTM need still waiting
// for its code gets it on the PO, or goes In-house from the order page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { useV3Live } from '../live';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
const th = 'px-3 py-2', td = 'px-3 py-2';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function ToOrderPage() {
    const navigate = useNavigate();
    const [lines, setLines] = useState(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState('');
    const [lateOnly, setLateOnly] = useState(false);
    const [type, setType] = useState('');
    const [brand, setBrand] = useState('');
    const [order, setOrder] = useState('');
    const [colour, setColour] = useState('');
    const [dtmOnly, setDtmOnly] = useState(false);
    const [picked, setPicked] = useState(() => new Set());
    const load = useCallback(() => purchasingApi.openRequisitionLines().then(r => setLines(r.data)).catch(err => setError(apiError(err, 'Failed to load the lines to order.'))), []);
    useEffect(() => { load(); }, [load]);
    useV3Live(load);
    const isLate = (l) => Boolean(l.needed_by) && l.needed_by < today();
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (lines || []).filter(l => (!kind || l.kind === kind) && (!lateOnly || isLate(l)) && (!type || l.type_name === type) && (!brand || l.brand === brand)
            && (!order || l.orders.includes(order)) && (!colour || (l.colours || []).includes(colour)) && (!dtmOnly || l.dtm_pending)
            && (!q || `${l.label} ${l.type_name || ''} ${l.pr_no} ${l.orders.join(' ')} ${(l.colours || []).join(' ')}`.toLowerCase().includes(q)));
    }, [lines, search, kind, lateOnly, type, brand, order, colour, dtmOnly]);
    // Each list offers what the lines hold (of the chosen kind); a choice with nothing left is cleared.
    const ofKind = useMemo(() => (lines || []).filter(l => !kind || l.kind === kind), [lines, kind]);
    const sorted = (list) => [...new Set(list.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const types = useMemo(() => sorted(ofKind.map(l => l.type_name)), [ofKind]);
    const brands = useMemo(() => sorted(ofKind.map(l => l.brand)), [ofKind]);
    const orders = useMemo(() => sorted(ofKind.flatMap(l => l.orders)), [ofKind]);
    const colours = useMemo(() => sorted(ofKind.flatMap(l => l.colours || [])), [ofKind]);
    useEffect(() => { if (type && !types.includes(type)) setType(''); if (brand && !brands.includes(brand)) setBrand(''); if (order && !orders.includes(order)) setOrder(''); if (colour && !colours.includes(colour)) setColour(''); }, [types, brands, orders, colours]); // eslint-disable-line react-hooks/exhaustive-deps
    const filtered = Boolean(search || kind || lateOnly || type || brand || order || colour || dtmOnly);
    const clearAll = () => { setSearch(''); setKind(''); setLateOnly(false); setType(''); setBrand(''); setOrder(''); setColour(''); setDtmOnly(false); };
    const pick = (label, value, set, list) => (
        <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg max-w-[190px]" value={value} onChange={e => set(e.target.value)} aria-label={label}>
            <option value="">{label}: all</option>
            {list.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
    );
    const toggle = (id) => setPicked(cur => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const allOn = shown.length > 0 && shown.every(l => picked.has(l.id));
    const toggleAll = () => setPicked(cur => { const n = new Set(cur); shown.forEach(l => { if (allOn) n.delete(l.id); else n.add(l.id); }); return n; });
    const stillThere = [...picked].filter(id => (lines || []).some(l => l.id === id));
    const units = [...new Set(shown.map(l => l.uom))];
    const late = (lines || []).filter(isLate).length;

    return (
        <div>
            <PageHeader title="To order" subtitle="Items on approved requisitions that are not yet on a purchase order, earliest need first. Tick the lines for one supplier and create the PO." />
            <ErrorBox text={error} />
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="w-72"><SearchInput value={search} onChange={setSearch} placeholder="Item, type, colour, order, requisition" /></div>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Kind of item">
                    <option value="">All items</option><option value="TRIM">Trims</option><option value="FABRIC">Fabric</option><option value="STORE">Store (spares / general)</option>
                </select>
                {pick('Trim type', type, setType, types)}
                {pick('Brand', brand, setBrand, brands)}
                {pick('Order', order, setOrder, orders)}
                {pick('Colour', colour, setColour, colours)}
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={lateOnly} onChange={e => setLateOnly(e.target.checked)} /> Late only{late > 0 ? ` (${late})` : ''}</label>
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={dtmOnly} onChange={e => setDtmOnly(e.target.checked)} /> DTM code needed</label>
                {filtered && <button type="button" onClick={clearAll} className="text-sm font-bold text-slate-600 hover:underline">Clear filters</button>}
                <div className="ml-auto flex items-center gap-3">
                    {stillThere.length > 0 && <span className="text-sm text-slate-600">{stillThere.length} line(s) ticked</span>}
                    <PrimaryButton disabled={!stillThere.length} onClick={() => navigate(`/v3/purchasing/orders/new?lines=${stillThere.join(',')}`)}><ShoppingBag size={14} /> Create purchase order</PrimaryButton>
                </div>
            </div>
            {!lines ? (!error && <Loading />) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[980px]">
                        <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                            <tr>
                                <th className={`${th} w-8`}><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Tick all lines shown" /></th>
                                <th className={th}>Item</th><th className={th}>Garment colour</th><th className={th}>Order</th><th className={th}>Requisition</th><th className={th}>Needed by</th>
                                <th className={`${th} text-right`}>To order</th><th className={`${th} text-right`}>In purchase unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Nothing to order{filtered ? ' with these filters' : ''}.</td></tr>}
                            {shown.map(l => (
                                <tr key={l.id} className={`border-t border-slate-100 align-top ${picked.has(l.id) ? 'bg-indigo-50/40' : ''}`}>
                                    <td className={td}><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Tick ${l.label}`} /></td>
                                    <td className={td}>
                                        <span className="font-semibold text-slate-800">{l.label}</span>
                                        <span className="block text-xs text-slate-500">{l.type_name}{l.hsn_code ? ` · HSN ${l.hsn_code}` : ''}</span>
                                        {l.dtm_pending && <span className="mt-0.5 inline-block text-[11px] font-black px-1.5 py-0.5 rounded border bg-violet-50 text-violet-800 border-violet-300">DTM: code needed on the PO</span>}
                                        {l.not_needed_qty > 0 && <span className="block text-[11px] text-amber-800">{fmt(l.not_needed_qty, l.uom)} {l.uom} already covered by a firm PO</span>}
                                    </td>
                                    <td className={`${td} text-xs text-slate-700`}>{(l.colours || []).join(', ') || '—'}</td>
                                    <td className={`${td} text-xs whitespace-nowrap`}>{(l.order_refs || []).length ? l.order_refs.map(o => <Link key={o.id} to={`/v3/planning/orders/${o.id}?tab=${l.kind === 'FABRIC' ? 'FABRIC' : 'TRIM'}`} className="block text-indigo-700 hover:underline">{o.order_no}</Link>) : '—'}</td>
                                    <td className={`${td} text-xs whitespace-nowrap`}><Link to={`/v3/planning/purchase-requisitions/${l.pr_id}`} className="text-indigo-700 hover:underline">{l.pr_no}</Link><span className="block text-slate-500">line {l.line_no}</span></td>
                                    <td className={`${td} whitespace-nowrap ${isLate(l) ? 'font-bold text-rose-700' : ''}`}>{l.needed_by ? fmtDate(l.needed_by) : '—'}{isLate(l) && <span className="block text-[11px]">late</span>}</td>
                                    <td className={`${td} text-right tabular-nums whitespace-nowrap font-semibold`}>{fmt(l.remaining, l.uom)} {l.uom}</td>
                                    <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{Number(l.factor) !== 1 && l.purchase_uom ? `${fmt(l.remaining_purchase_units, 'pcs')} ${l.purchase_uom}` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                        {shown.length > 0 && (
                            <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                                <td className={td} colSpan={6}>Total · {shown.length} line(s)</td>
                                <td className={`${td} text-right tabular-nums whitespace-nowrap`}>{units.map(u => `${fmt(shown.filter(l => l.uom === u).reduce((t, l) => t + l.remaining, 0), u)} ${u}`).join(' + ')}</td>
                                <td />
                            </tr></tfoot>
                        )}
                    </table>
                </div>
            )}
        </div>
    );
}

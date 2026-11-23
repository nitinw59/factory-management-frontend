// Material position: one row per item that approved orders need (or that is
// allocated): on hand, allocated, free, required, shortfall. Open an item to
// allocate it to orders, earliest ship date first.
// 23 Nov 2026 (owner): the trim store sees trims only, the fabric store fabric only (the server filters; view_kinds hides
// the picker); a Trim type column; a totals row. Then "build phase A and B" (a PC screen — every column stays):
//   A — count chips that filter (opens on Needs action), rows grouped by trim type (fabric: mill · article) with a group
//       line, groups with a shortfall open, expand / collapse all, a coverage bar in Shortfall, sticky header, sort.
//   B — purchase units next to the usage unit (≈ 4 gross, ≈ 21 × 5,000 m), an Earliest ship column and sort.
// 23 Nov 2026 (owner): groups collapsed by default (open while searching); stock no order needs is listed too (chip "No order
// needs it", last issued / received); coming back from an item keeps the context — chip, sort, kind and search in the URL,
// open groups and scroll in this session, the last list shown at once and refreshed behind.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, SecondaryButton, ErrorBox, Loading, useRowLink } from '../components/ui';
import { todayLocal, fmtDate } from '../salesOrders/SalesOrderStatusBadge';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
// Purchase units: a real unit name when the master has one (gross, cone, roll …); else the size of one unit — thread masters
// often say "pcs" or "METER" for a 5,000 m cone.
const NAMED = /^(gross|cones?|reels?|rolls?|box(es)?|kgs?|pkts?|packets?|dozens?|doz|bundles?|spools?|tubes?)$/i;
function inPurchase(r, qty) {
    const f = Number(r.usage_per_purchase_uom || 0);
    if (r.kind !== 'TRIM' || !(f > 1) || !qty) return null;
    const n = Math.round((qty / f) * 10) / 10;
    return NAMED.test(String(r.purchase_uom || '').trim()) ? `≈ ${n.toLocaleString('en-IN')} ${String(r.purchase_uom).toLowerCase()}` : `≈ ${n.toLocaleString('en-IN')} × ${fmt(f, r.uom)} ${r.uom}`;
}
const Pu = ({ r, q }) => { const t = inPurchase(r, q); return t ? <span className="block text-[11px] font-normal text-slate-500">{t}</span> : null; };

// The chips: what each one shows.
const VIEWS = [
    { key: 'ACTION', label: 'Needs action', test: r => r.shortfall > 0 || r.from_stock > 0 || r.over_allocated, hint: 'short, waiting for allocation or over-allocated' },
    { key: 'SHORT', label: 'Short', test: r => r.shortfall > 0, tone: 'rose' },
    { key: 'RAISE', label: 'To raise', test: r => r.to_raise > 0, tone: 'amber', hint: 'short and not on a requisition yet' },
    { key: 'ALLOC', label: 'Waiting for allocation', test: r => r.from_stock > 0, tone: 'emerald', hint: 'in free stock, needed by an approved order, not reserved yet' },
    { key: 'COVERED', label: 'Covered', test: r => !r.no_demand && r.shortfall <= 0 && !r.over_allocated, tone: 'slate' },
    { key: 'OVER', label: 'Over-allocated', test: r => r.over_allocated, tone: 'rose' },
    { key: 'IDLE', label: 'No order needs it', test: r => r.no_demand, tone: 'slate', hint: 'in stock, no approved order needs it — slow-moving stock (last issued / received shown)' },
    { key: 'ALL', label: 'All', test: () => true },
];
const SORTS = { ship: 'Earliest ship first', short: 'Biggest shortfall first', name: 'Name' };
const byShip = (a, b) => (a.earliest_ship || '9999').localeCompare(b.earliest_ship || '9999') || b.shortfall - a.shortfall || a.label.localeCompare(b.label);
const SORTERS = { ship: byShip, short: (a, b) => b.shortfall - a.shortfall || byShip(a, b), name: (a, b) => a.label.localeCompare(b.label) };
const COLS = 11;

function exportExcel(rows) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(r => ({
        Group: r.group, Type: r.kind === 'FABRIC' ? 'Fabric' : r.type_name, Item: r.label, Unit: r.uom, 'On hand': r.on_hand, Allocated: r.allocated, Free: r.free,
        Required: r.required, Shortfall: r.shortfall, 'Free stock covers': r.from_stock, 'On requisition (pending)': r.pr_pending, 'On order (approved PR)': r.pr_approved, 'Incoming uncommitted': r.incoming_uncommitted, 'Still to raise': r.to_raise,
        'Purchase unit': r.kind === 'TRIM' && r.usage_per_purchase_uom > 1 ? `${r.purchase_uom} = ${r.usage_per_purchase_uom} ${r.uom}` : '',
        Orders: r.orders, 'Orders short': r.short_orders, 'Earliest ship': r.earliest_ship || '', 'Needed by (lead time)': r.needed_by || '', 'Over-allocated': r.over_allocated ? 'yes' : '',
        'No order needs it': r.no_demand ? 'yes' : '', 'Last issued': r.last_issue || '', 'Last received': r.last_in || '',
    }))), 'Material position');
    XLSX.writeFile(wb, `MaterialPosition-${todayLocal()}.xlsx`);
}

// Coming back from an item: the list last shown (this browser tab), and the open groups + scroll of this session.
const cache = { key: null, rows: null };
const UI_KEY = 'v3.position.ui';
const readUi = () => { try { return JSON.parse(sessionStorage.getItem(UI_KEY) || 'null') || {}; } catch { return {}; } };
const writeUi = (patch) => { try { sessionStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch })); } catch { /* private mode */ } };
export const POSITION_LAST = 'v3.position.last';   // the item page's "back" link

export default function MaterialPositionPage() {
    const rowLink = useRowLink();   // the whole row opens the record
    const [params, setParams] = useSearchParams();   // ?kind=TRIM&to_allocate=1 from the My work banner; ?view=&sort=&q= kept by this page
    const [kind, setKind] = useState(['FABRIC', 'TRIM'].includes(params.get('kind')) ? params.get('kind') : '');
    const [view, setView] = useState(params.get('to_allocate') === '1' ? 'ALLOC' : VIEWS.some(v => v.key === params.get('view')) ? params.get('view') : 'ACTION');
    const [sort, setSort] = useState(SORTS[params.get('sort')] ? params.get('sort') : 'ship');
    const [search, setSearch] = useState(params.get('q') || '');
    const cacheKey = `${kind}|${search.trim()}`;
    const [rows, setRows] = useState(() => (cache.key === cacheKey ? cache.rows : null));
    const [error, setError] = useState('');
    const ui = useRef(readUi());
    const [open, setOpen] = useState(() => (ui.current.key === cacheKey && Array.isArray(ui.current.open) ? new Set(ui.current.open) : null));   // null = default: collapsed (open while searching)
    const scroller = useRef(null);
    const restored = useRef(false);
    // The page's state in the URL (replace: no extra history entries), so Back from an item returns to it.
    useEffect(() => {
        const next = new URLSearchParams();
        if (kind) next.set('kind', kind);
        if (view !== 'ACTION') next.set('view', view);
        if (sort !== 'ship') next.set('sort', sort);
        if (search.trim()) next.set('q', search.trim());
        if (next.toString() !== params.toString()) setParams(next, { replace: true });
        try { sessionStorage.setItem(POSITION_LAST, `/v3/planning/position${next.toString() ? `?${next}` : ''}`); } catch { /* private mode */ }
    }, [kind, view, sort, search]);   // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { writeUi({ key: cacheKey, open: open ? [...open] : null }); }, [open, cacheKey]);
    // Scroll back to where the list was, once, when it is first shown.
    useLayoutEffect(() => {
        if (restored.current || !rows || !scroller.current) return;
        restored.current = true;
        if (ui.current.key === cacheKey && ui.current.scroll) scroller.current.scrollTop = ui.current.scroll;
    }, [rows, cacheKey]);
    const onScroll = (e) => { const top = e.currentTarget.scrollTop; window.requestAnimationFrame(() => writeUi({ scroll: top, key: cacheKey })); };
    const [viewKinds, setViewKinds] = useState(['FABRIC', 'TRIM']);
    useEffect(() => { planningApi.permissions().then(res => { if (Array.isArray(res.data.view_kinds)) setViewKinds(res.data.view_kinds); }).catch(() => {}); }, []);
    const oneKind = viewKinds.length === 1 ? viewKinds[0] : null;

    useEffect(() => {
        const key = cacheKey;
        const t = setTimeout(() => planningApi.position({ kind: kind || undefined, q: search.trim() || undefined })
            .then(res => { cache.key = key; cache.rows = res.data; setRows(res.data); }).catch(err => setError(apiError(err, 'Failed to load.'))), cache.key === key ? 0 : 250);
        return () => clearTimeout(t);
    }, [kind, search, cacheKey]);

    const counts = useMemo(() => Object.fromEntries(VIEWS.map(v => [v.key, (rows || []).filter(v.test).length])), [rows]);
    const shown = useMemo(() => (rows || []).filter(VIEWS.find(v => v.key === view).test), [rows, view]);
    const groups = useMemo(() => {
        const m = new Map();
        for (const r of shown) { if (!m.has(r.group)) m.set(r.group, { name: r.group, kind: r.kind, rows: [] }); m.get(r.group).rows.push(r); }
        return [...m.values()].map(g => {
            g.rows.sort(SORTERS[sort]);
            const uoms = [...new Set(g.rows.map(r => r.uom))];
            g.uom = uoms.length === 1 ? uoms[0] : null;
            g.short = g.rows.filter(r => r.shortfall > 0).length;
            g.raise = g.rows.filter(r => r.to_raise > 0).length;
            g.alloc = g.rows.filter(r => r.from_stock > 0).length;
            g.idle = g.rows.filter(r => r.no_demand).length;
            g.shortQty = g.rows.reduce((n, r) => n + Math.max(0, r.shortfall), 0);
            g.raiseQty = g.rows.reduce((n, r) => n + Math.max(0, r.to_raise), 0);
            g.ship = g.rows.map(r => r.earliest_ship).filter(Boolean).sort()[0] || null;
            return g;
        }).sort((a, b) => (a.kind === b.kind ? (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'short' ? b.short - a.short || a.name.localeCompare(b.name) : (a.ship || '9999').localeCompare(b.ship || '9999') || a.name.localeCompare(b.name)) : a.kind === 'FABRIC' ? -1 : 1));
    }, [shown, sort]);
    // Default (owner, 23 Nov 2026): every group collapsed; all open while searching. Expand / collapse all, or click a group.
    const isOpen = (g) => (open ? open.has(g.name) : Boolean(search.trim()));
    const toggle = (g) => setOpen(prev => { const n = new Set(prev || groups.filter(isOpen).map(x => x.name)); if (n.has(g.name)) n.delete(g.name); else n.add(g.name); return n; });
    const tone = { rose: 'border-rose-300 text-rose-700', amber: 'border-amber-300 text-amber-800', emerald: 'border-emerald-300 text-emerald-700', slate: 'border-slate-300 text-slate-600' };

    return (
        <div>
            <PageHeader title={oneKind ? `Stock position — ${oneKind === 'FABRIC' ? 'fabric' : 'trims'}` : 'Stock position'} subtitle="Stock against what approved orders need. Allocation reserves stock for an order without moving it."
                actions={<>
                    {!oneKind && <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => setKind(e.target.value)} aria-label="Fabric or trims">
                        <option value="">Fabric and trims</option><option value="FABRIC">Fabric</option><option value="TRIM">Trims</option>
                    </select>}
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
                        {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="Item, brand, code, type" />
                    <SecondaryButton onClick={() => exportExcel(shown)} disabled={!shown.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </>} />
            <ErrorBox text={error} />
            {/* Chips: counts that filter */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                {VIEWS.map(v => (
                    <button key={v.key} type="button" onClick={() => { setView(v.key); setOpen(null); if (scroller.current) scroller.current.scrollTop = 0; }} title={v.hint || ''} aria-pressed={view === v.key}
                        className={`rounded-full border px-3 py-1 text-sm font-semibold ${view === v.key ? 'border-indigo-600 bg-indigo-600 text-white' : `bg-white hover:bg-slate-50 ${tone[v.tone] || 'border-slate-300 text-slate-700'}`}`}>
                        {v.label} <span className="tabular-nums">{rows ? counts[v.key] : '…'}</span>
                    </button>
                ))}
                {groups.length > 0 && <span className="ml-auto flex gap-3 text-sm">
                    <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={() => setOpen(new Set(groups.map(g => g.name)))}>Expand all</button>
                    <button type="button" className="font-semibold text-indigo-700 hover:underline" onClick={() => setOpen(new Set())}>Collapse all</button>
                </span>}
            </div>
            {!rows ? <Loading /> : (
                <div ref={scroller} onScroll={onScroll} className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[calc(100vh-15rem)]">
                    <table className="w-full text-sm min-w-[1080px]">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider shadow-[0_1px_0_#e2e8f0]">
                            <tr className="text-right"><th className="px-2.5 py-2.5 text-left w-24">Trim type</th><th className="px-2.5 py-2.5 text-left min-w-[200px]">Item</th><th className="px-2.5 py-2.5">On hand</th><th className="px-2.5 py-2.5">Allocated</th><th className="px-2.5 py-2.5">Free</th>
                                <th className="px-2.5 py-2.5">Required</th><th className="px-2.5 py-2.5 w-32">Shortfall</th><th className="px-2.5 py-2.5">On requisition</th><th className="px-2.5 py-2.5">To raise</th><th className="px-2.5 py-2.5">Orders</th><th className="px-2.5 py-2.5 w-28">Earliest ship</th></tr>
                        </thead>
                        {groups.length === 0 && <tbody><tr><td colSpan={COLS} className="px-4 py-8 text-center text-slate-400">{view === 'ACTION' ? 'Nothing needs action — everything is covered.' : 'Nothing here.'}</td></tr></tbody>}
                        {groups.map(g => (
                            <tbody key={g.name}>
                                <tr className="border-t border-slate-200 bg-slate-100/70 cursor-pointer hover:bg-slate-100" onClick={() => toggle(g)}>
                                    <td colSpan={COLS} className="px-3 py-2 text-left text-sm">
                                        <span className="inline-flex items-center gap-1 font-black text-slate-800">{isOpen(g) ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {g.name}</span>
                                        <span className="ml-2 text-xs font-semibold text-slate-500">{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
                                        {g.short > 0 && <span className="ml-2 text-xs font-bold text-rose-700">· {g.short} short{g.uom ? ` (${fmt(g.shortQty, g.uom)} ${g.uom})` : ''}</span>}
                                        {g.raise > 0 && <span className="ml-2 text-xs font-bold text-amber-700">· {g.raise} to raise{g.uom ? ` (${fmt(g.raiseQty, g.uom)} ${g.uom})` : ''}</span>}
                                        {g.alloc > 0 && <span className="ml-2 text-xs font-bold text-emerald-700">· {g.alloc} waiting for allocation</span>}
                                        {g.idle > 0 && <span className="ml-2 text-xs font-semibold text-slate-500">· {g.idle} not needed by any order</span>}
                                        {g.ship && <span className="ml-2 text-xs font-semibold text-slate-500">· first ship {fmtDate(g.ship)}</span>}
                                    </td>
                                </tr>
                                {isOpen(g) && g.rows.map(r => {
                                    const cover = r.required > 0 ? Math.min(1, (r.allocated + (r.issued || 0)) / r.required) : 1;
                                    return (
                                        <tr key={r.key} {...rowLink(`/v3/planning/position/${r.kind}/${r.item_id}`)} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 focus-visible:bg-indigo-50 focus:outline-none text-right tabular-nums align-top">
                                            <td className="px-2.5 py-2.5 text-left text-xs font-semibold text-slate-600 w-24">{r.kind === 'FABRIC' ? 'Fabric' : r.type_name}</td>
                                            <td className="px-2.5 py-2.5 text-left">
                                                <Link to={`/v3/planning/position/${r.kind}/${r.item_id}`} className="font-semibold text-indigo-700 hover:underline">{r.label}</Link>
                                                {!r.active && <span className="ml-1 text-xs font-bold text-rose-600">inactive</span>}
                                            </td>
                                            <td className="px-2.5 py-2.5">{fmt(r.on_hand, r.uom)}<Pu r={r} q={r.on_hand} /></td>
                                            <td className="px-2.5 py-2.5">{fmt(r.allocated, r.uom)}</td>
                                            <td className={`px-2.5 py-2.5 font-semibold ${r.free < 0 ? 'text-rose-700' : ''}`}>{fmt(r.free, r.uom)}<Pu r={r} q={r.free} />
                                                {r.over_allocated && <span className="flex justify-end items-center gap-1 text-[11px] font-bold text-rose-700"><AlertTriangle size={11} /> over-allocated</span>}</td>
                                            <td className="px-2.5 py-2.5">{r.no_demand ? <span className="text-slate-400">—</span> : <>{fmt(r.required, r.uom)} <span className="text-xs text-slate-500">{r.uom}</span></>}</td>
                                            {r.no_demand ? (
                                                <td className="px-2.5 py-2.5 text-xs font-semibold text-slate-500">no order needs it</td>
                                            ) : (
                                                <td className={`px-2.5 py-2.5 font-bold ${r.shortfall > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                                    {r.shortfall > 0 ? fmt(r.shortfall, r.uom) : 'covered'}
                                                    <Pu r={r} q={r.shortfall} />
                                                    <span className="mt-1 block h-1.5 w-full rounded bg-rose-100" title={`${Math.round(cover * 100)}% of the need allocated or issued`}>
                                                        <span className="block h-1.5 rounded bg-emerald-500" style={{ width: `${Math.round(cover * 100)}%` }} />
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-2.5 py-2.5">{r.pr_pending + r.pr_approved > 0 ? <>{fmt(r.pr_pending + r.pr_approved, r.uom)}{r.pr_approved > 0 && <span className="block text-[11px] text-emerald-700">{fmt(r.pr_approved, r.uom)} approved</span>}</> : '—'}</td>
                                            <td className={`px-2.5 py-2.5 font-bold ${r.to_raise > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{r.to_raise > 0 ? fmt(r.to_raise, r.uom) : '—'}
                                                {r.to_raise > 0 && <Pu r={r} q={r.to_raise} />}
                                                {r.from_stock > 0 && <span className="block text-[11px] font-semibold text-emerald-700">{fmt(r.from_stock, r.uom)} in free stock</span>}
                                                {r.incoming_uncommitted > 0 && <span className="block text-[11px] font-semibold text-sky-700">+{fmt(r.incoming_uncommitted, r.uom)} incoming, uncommitted</span>}</td>
                                            <td className="px-2.5 py-2.5">{r.orders}{r.short_orders > 0 && <span className="block text-[11px] text-rose-600">{r.short_orders} short</span>}</td>
                                            <td className="px-2.5 py-2.5 w-28">{r.earliest_ship ? <span className="whitespace-nowrap">{fmtDate(r.earliest_ship)}</span> : '—'}
                                                {r.no_demand && <span className="block text-[11px] text-slate-500">{r.last_issue ? `last issued ${fmtDate(r.last_issue)}` : 'never issued'}{r.last_in ? ` · in ${fmtDate(r.last_in)}` : ''}</span>}
                                                {r.needed_by && r.shortfall > 0 && <span className={`block text-[11px] font-semibold ${r.needed_by < todayLocal() ? 'text-rose-600' : 'text-slate-500'}`}>needed by {fmtDate(r.needed_by)}</span>}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        ))}
                        {shown.length > 0 && (
                            // Units differ per item, so the total counts items rather than adding quantities.
                            <tfoot className="sticky bottom-0 border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                                <tr><td colSpan={COLS} className="px-2.5 py-2.5 text-left">Total · {shown.length} item{shown.length === 1 ? '' : 's'} in {groups.length} group{groups.length === 1 ? '' : 's'}{view !== 'ALL' ? ` (of ${rows.length})` : ''} · <span className="text-rose-700">{shown.filter(r => r.shortfall > 0).length} short</span> · <span className="text-amber-700">{shown.filter(r => r.to_raise > 0).length} still to raise</span> · <span className="text-emerald-700">{shown.filter(r => r.from_stock > 0).length} waiting for allocation</span> · {shown.filter(r => r.over_allocated).length} over-allocated · {shown.filter(r => r.no_demand).length} not needed by any order</td></tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}
        </div>
    );
}

// Trims tab of an order's requirements: a grid with one ROW per trim type (Thread, Button, Zip …,
// all placements and order lines together) and one COLUMN per garment colour. Each cell is a large
// box coloured by the status of the item(s) that colour uses of that type (a colour-matched thread is
// a different item in every colour; several items → the worst status shows). Click a box for the
// detail of each item — total, to buy in, allocated, short — and the actions (allocate / release /
// raise) the user's role allows for trims.
// Colour-matched items (EXACT, e.g. thread) are allocated per colour from their cell. Items common to
// all colours (ALL) or matched by tone (TONE) are ONE item for many colours: the last column shows each
// once per trim type with the quantity summed over its colours, to allocate in one go.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../shared/Modal';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });

// Status of an item for this order (allocation is per item across colours and lines).
export function trimStatus(it) {
    if (it.cover === 'FULL') return { key: 'COVERED', label: 'Covered', cls: 'bg-emerald-500 hover:bg-emerald-600 text-white', rank: 4 };
    if (it.to_raise > 0) return { key: 'RAISE', label: 'To raise', cls: 'bg-rose-500 hover:bg-rose-600 text-white', rank: 0 };
    if (it.from_stock > 0) return { key: 'ALLOCATE', label: 'Allocate', cls: 'bg-amber-400 hover:bg-amber-500 text-amber-950', rank: 1 };
    if (it.pr_pending + it.pr_approved > 0) return { key: 'ON_ORDER', label: 'On order', cls: 'bg-sky-500 hover:bg-sky-600 text-white', rank: 2 };
    return { key: 'SHORT', label: 'Short', cls: 'bg-rose-500 hover:bg-rose-600 text-white', rank: 0 };
}
const LEGEND = [['bg-emerald-500', 'Covered (allocated / issued)'], ['bg-sky-500', 'On order (requisition / PO)'], ['bg-amber-400', 'Free stock — allocate'], ['bg-rose-500', 'To raise / short']];

export default function TrimStatusGrid({ data, approved, canAct, onAllocate, onRelease, orderId }) {
    const [open, setOpen] = useState(null);   // { row, colour, items: [{ it, qty }] }
    const [onlyAction, setOnlyAction] = useState(false);
    const trims = useMemo(() => data.items.filter(i => i.kind === 'TRIM'), [data.items]);
    const manyLines = data.lines.length > 1;

    // Rows: trim types; cells: per colour, the items of that type with their quantity and where used.
    const rows = useMemo(() => {
        const byType = new Map();
        for (const it of trims) for (const r of it.rows) {
            const type = r.trim_type || r.bom_line;
            if (!byType.has(type)) byType.set(type, { key: type, label: type, sort: r.bom_sort ?? 0, cells: {}, items: new Set(), uses: new Set(), grouped: new Map() });
            const row = byType.get(type);
            row.sort = Math.min(row.sort, r.bom_sort ?? 0);
            row.items.add(it.key);
            row.uses.add(manyLines ? `${r.bom_line} · ${r.style_code}` : r.bom_line);
            const cell = row.cells[r.colour_id] || (row.cells[r.colour_id] = new Map());
            const e = cell.get(it.key) || { qty: 0, uses: new Set(), grouped: false };
            e.qty += r.required_qty;
            if (r.source === 'ALL' || r.source === 'TONE') {
                e.grouped = true;
                const g = row.grouped.get(it.key) || { qty: 0, colours: new Set(), sources: new Set(), uses: new Set() };
                g.qty += r.required_qty; g.colours.add(r.colour_id); g.sources.add(r.source);
                g.uses.add(manyLines ? `${r.bom_line} (line ${r.line_no} · ${r.style_code})` : r.bom_line);
                row.grouped.set(it.key, g);
            }
            e.uses.add(manyLines ? `${r.bom_line} (line ${r.line_no} · ${r.style_code})` : r.bom_line);
            cell.set(it.key, e);
        }
        const itemOf = new Map(trims.map(i => [i.key, i]));
        return [...byType.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label)).map(row => ({
            ...row,
            cells: Object.fromEntries(Object.entries(row.cells).map(([cid, m]) => {
                const items = [...m.entries()].map(([k, e]) => ({ it: itemOf.get(k), qty: e.qty, uses: [...e.uses], grouped: e.grouped }));
                const worst = items.map(x => trimStatus(x.it)).sort((a, b) => a.rank - b.rank)[0];
                return [cid, { items, status: worst, grouped: items.every(x => x.grouped) }];
            })),
            groupedItems: [...row.grouped.entries()].map(([k, g]) => ({ it: itemOf.get(k), qty: g.qty, colours: g.colours.size, how: g.sources.has('ALL') ? 'all colours' : 'by tone', uses: [...g.uses] })),
        }));
    }, [trims, manyLines]);
    const counts = useMemo(() => {
        const c = { COVERED: 0, ON_ORDER: 0, ALLOCATE: 0, RAISE: 0, SHORT: 0 };
        for (const it of trims) c[trimStatus(it).key] += 1;
        return c;
    }, [trims]);
    const shownRows = onlyAction ? rows.filter(r => Object.values(r.cells).some(c => c.status.key !== 'COVERED')) : rows;
    const anyGrouped = rows.some(r => r.groupedItems.length);

    if (!trims.length) return <p className="text-sm text-slate-400">No trim requirements.</p>;
    return (
        <div>
            <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
                <span className="font-semibold text-slate-600">{rows.length} trim type{rows.length === 1 ? '' : 's'} · {trims.length} item{trims.length === 1 ? '' : 's'}:</span>
                <span className="text-emerald-700 font-bold">{counts.COVERED} covered</span>
                <span className="text-sky-700 font-bold">{counts.ON_ORDER} on order</span>
                <span className="text-amber-700 font-bold">{counts.ALLOCATE} to allocate</span>
                <span className="text-rose-700 font-bold">{counts.RAISE + counts.SHORT} to raise / short</span>
                <label className="ml-auto inline-flex items-center gap-1.5 font-bold text-slate-700"><input type="checkbox" checked={onlyAction} onChange={e => setOnlyAction(e.target.checked)} /> Trim types needing action only</label>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[70vh]">
                <table className="border-separate border-spacing-1 text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                        <tr>
                            <th className="sticky left-0 z-20 bg-white px-2 py-2 text-left text-xs font-bold text-slate-500 min-w-[220px]">Trim type</th>
                            {data.colours.map(c => <th key={c.id} className="px-1 py-2 text-center text-xs font-black text-slate-700 min-w-[96px] max-w-[120px] truncate" title={c.name}>{c.name}</th>)}
                            {anyGrouped && <th className="px-2 py-2 text-left text-xs font-black text-indigo-700 min-w-[230px] border-l-2 border-indigo-100">Common / by tone — allocate together</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {shownRows.map(row => (
                            <tr key={row.key}>
                                <td className="sticky left-0 z-10 bg-white px-2 py-1 align-middle">
                                    <p className="font-semibold text-slate-800 leading-tight">{row.label}</p>
                                    <p className="text-[11px] text-slate-500 leading-tight" title={[...row.uses].join(', ')}>{row.items.size} item{row.items.size === 1 ? '' : 's'}{row.uses.size > 1 ? ` · ${row.uses.size} placements` : ''}</p>
                                </td>
                                {data.colours.map(c => {
                                    const cell = row.cells[c.id];
                                    if (!cell) return <td key={c.id} className="p-0"><div className="h-14 rounded-lg bg-slate-50 border border-dashed border-slate-200" title="Not used for this colour" /></td>;
                                    const short = cell.items.reduce((s, x) => s + (x.it.cover === 'FULL' ? 0 : 1), 0);
                                    return (
                                        <td key={c.id} className="p-0">
                                            <button type="button" onClick={() => setOpen({ row, colour: c, items: cell.items })}
                                                className={`w-full h-14 rounded-lg px-1.5 text-left transition shadow-sm ${cell.status.cls}`}
                                                title={cell.items.map(x => x.it.label).join(', ')}>
                                                <span className="block text-[11px] font-black uppercase tracking-wide leading-tight">{cell.status.label}</span>
                                                <span className="block text-[11px] leading-tight truncate opacity-90">{cell.items.length > 1 ? `${cell.items.length} items${short ? ` · ${short} open` : ''}` : `${fmt(cell.items[0].qty, cell.items[0].it.uom)} ${cell.items[0].it.uom}`}</span>
                                                {cell.grouped && <span className="block text-[10px] leading-tight opacity-80">↦ grouped</span>}
                                            </button>
                                        </td>
                                    );
                                })}
                                {anyGrouped && (
                                    <td className="p-0 align-top border-l-2 border-indigo-100">
                                        <div className="flex flex-col gap-1 pl-1">{row.groupedItems.length === 0 ? <span className="text-[11px] text-slate-300 px-1 py-4">— colour-matched: allocate per colour</span> : row.groupedItems.map(g => {
                                            const st = trimStatus(g.it);
                                            return (
                                                <button key={g.it.key} type="button" onClick={() => setOpen({ row, colour: { name: `${g.colours} colours (${g.how})` }, items: [{ it: g.it, qty: g.qty, uses: g.uses }] })}
                                                    className={`w-full min-h-14 rounded-lg px-2 py-1 text-left transition shadow-sm ${st.cls}`} title={g.it.label}>
                                                    <span className="block text-[11px] font-black uppercase tracking-wide leading-tight">{st.label} · {g.colours} colours {g.how}</span>
                                                    <span className="block text-[11px] leading-tight truncate">{g.it.label}</span>
                                                    <span className="block text-xs font-bold leading-tight tabular-nums">{fmt(g.qty, g.it.uom)} {g.it.uom}{g.it.shortfall > 0 ? ` · short ${fmt(g.it.shortfall, g.it.uom)}` : ''}</span>
                                                </button>
                                            );
                                        })}</div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-600">{LEGEND.map(([cls, l]) => <span key={l} className="inline-flex items-center gap-1"><span className={`w-3 h-3 rounded ${cls}`} />{l}</span>)}
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-50 border border-dashed border-slate-300" />not used for that colour</span>
                <span>↦ grouped = a common or tone-matched item: allocate it once in the last column</span></div>

            {open && (
                <Modal title={`${open.row.label} · ${open.colour.name}`} onClose={() => setOpen(null)}>
                    <div className="space-y-3">{open.items.map(({ it, qty, uses }) => {
                        const st = trimStatus(it);
                        const act = approved && canAct(it.kind);
                        return (
                            <div key={it.key} className="border border-slate-200 rounded-xl p-3">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                                    <span className="font-semibold text-slate-800">{it.label}</span>
                                    {!it.active && <span className="text-[10px] font-bold text-rose-600">inactive</span>}
                                </div>
                                <p className="text-xs text-slate-500 mb-2">{open.colour.name}: <b>{fmt(qty, it.uom)} {it.uom}</b> for {uses.join(', ')}{it.issue_stages.length ? ` · issued at ${it.issue_stages.join(', ')}` : ''}. The figures below are this item for the whole order{it.usage.length > 1 ? ` (all its uses: ${it.usage.join(', ')})` : ''}.</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] font-bold uppercase text-slate-500">Total</p><p className="font-bold tabular-nums">{fmt(it.required_display, it.uom)} {it.uom}</p></div>
                                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] font-bold uppercase text-slate-500">To buy in</p><p className="font-bold tabular-nums">{it.purchase_qty != null ? `${fmt(it.purchase_qty, 'pcs')} ${it.purchase_uom}` : '—'}</p></div>
                                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] font-bold uppercase text-slate-500">Allocated</p><p className="font-bold tabular-nums">{fmt(it.allocated, it.uom)}{it.issued > 0 ? <span className="block text-[11px] text-indigo-700">+ {fmt(it.issued, it.uom)} issued</span> : null}</p><p className="text-[11px] text-slate-500">free {fmt(it.free, it.uom)}</p></div>
                                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] font-bold uppercase text-slate-500">Short</p><p className={`font-bold tabular-nums ${it.shortfall > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{it.shortfall > 0 ? fmt(it.shortfall, it.uom) : '—'}</p>
                                        {it.pr_pending + it.pr_approved > 0 && <p className="text-[11px] text-sky-700">{fmt(it.pr_pending + it.pr_approved, it.uom)} on requisition</p>}
                                        {it.to_raise > 0 && <p className="text-[11px] text-rose-700">{fmt(it.to_raise, it.uom)} to raise</p>}</div>
                                </div>
                                {act && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {it.shortfall > 0 && <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => { setOpen(null); onAllocate(it); }}>Allocate</button>}
                                        {it.allocated > 0 && <button type="button" className="px-3 py-1.5 rounded-lg text-sm font-bold border border-slate-300 text-slate-700 hover:bg-slate-50" onClick={() => { setOpen(null); onRelease(it); }}>Release</button>}
                                        {it.to_raise > 0 && <Link to={`/v3/planning/buy-list?order=${orderId}&kind=TRIM`} className="px-3 py-1.5 rounded-lg text-sm font-bold border border-amber-400 text-amber-800 hover:bg-amber-50">Raise requisition</Link>}
                                    </div>
                                )}
                            </div>
                        );
                    })}</div>
                </Modal>
            )}
        </div>
    );
}

// Order BOM → Fabric and Trims tabs (one layout for both, 16 Oct 2026; replaces the Fabric list of the same day and
// the old trim status grid). A one-line summary (covered / part / none, totals per unit, bulk actions); rows grouped
// by fabric line + article, or by trim type; a List (item · garment colours · required · one status · actions) or the
// item × colour matrix ("By colour"). Both scroll in their own box with the heading and the item column frozen.
// Under each status: the purchase orders reserved for this order with their due date — red when it is after the
// item's needed-by date. Fabric spelled two ways on one order (two fabric records) is flagged.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const dmy = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
const COVER = { FULL: ['covered', 'bg-emerald-50 text-emerald-700 border-emerald-200'], PARTIAL: ['part', 'bg-amber-50 text-amber-800 border-amber-200'], NONE: ['none', 'bg-rose-50 text-rose-700 border-rose-200'] };
const ROLE_ORDER = ['Shell fabric', 'Contrast fabric', 'Lining fabric', 'Pocketing fabric', 'Other fabric'];
const onPr = (it) => (it.pr_pending || 0) + (it.pr_approved || 0);
// "On requisition but no PO yet" (16 Oct 2026): still short, on a requisition, and no purchase order reserved for this order.
const reqNoPo = (it) => it.shortfall > 0 && onPr(it) > 0 && !(it.incoming_pos || []).length;
const STICKY_COL = 'sticky left-0 z-[1]';

function statusOf(it) {
    const u = it.uom;
    if (it.shortfall <= 0) return { text: it.issued > 0 ? `Covered · ${fmt(it.issued, u)} issued` : 'Covered', cls: 'text-emerald-700' };
    if (it.from_stock > 0) return { text: `${fmt(it.from_stock, u)} ${u} in free stock — allocate`, cls: 'text-blue-900' };
    if (it.to_raise > 0) return { text: `${fmt(it.to_raise, u)} ${u} to raise`, cls: 'text-rose-700' };
    if (it.incoming_pos?.length) return { text: `${fmt(it.shortfall, u)} ${u} short · on PO`, cls: 'text-sky-700' };
    // light blue, the bar's requisition colour (17 Oct 2026; was amber)
    if (onPr(it) > 0) return { text: `${fmt(it.shortfall, u)} ${u} short · on requisition`, cls: 'text-sky-500' };
    return { text: `${fmt(it.shortfall, u)} ${u} short`, cls: 'text-rose-700' };
}

function StatusBar({ it }) {
    const req = Math.max(it.required_display || 0, 0.0001);
    const issued = Math.min(it.issued || 0, req);
    const alloc = Math.min(it.allocated || 0, req - issued);
    const po = Math.min((it.incoming_pos || []).reduce((n, p) => n + p.qty, 0), Math.max(req - issued - alloc, 0));
    const pr = Math.min(onPr(it), Math.max(req - issued - alloc - po, 0));
    // free stock that can be allocated (16 Oct 2026: dark navy, not counted as "to raise")
    const free = Math.min(it.from_stock || 0, Math.max(req - issued - alloc - po - pr, 0));
    const raise = Math.max(req - issued - alloc - po - pr - free, 0);
    const seg = (v, cls) => (v > 0 ? <span className={cls} style={{ width: `${(v / req) * 100}%` }} /> : null);
    const u = it.uom;
    const tip = [`Required ${fmt(it.required_display, u)} ${u}`, `Issued ${fmt(it.issued, u)}`, `Allocated ${fmt(it.allocated, u)}`, `On PO for this order ${fmt(po, u)}`,
        `On requisition ${fmt(onPr(it), u)}`, `Short ${fmt(it.shortfall, u)}`, `Still to raise ${fmt(it.to_raise, u)}`, it.from_stock > 0 ? `In free stock ${fmt(it.from_stock, u)}` : '',
        it.needed_by ? `Needed by ${dmy(it.needed_by)}` : '', 'Bar: issued (indigo) · allocated (green) · on PO (blue) · on requisition (light blue) · free stock to allocate (dark navy) · to raise (red)'].filter(Boolean).join('\n');
    const s = statusOf(it);
    return (
        <div title={tip} className="min-w-[190px]">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                {seg(issued, 'bg-indigo-500')}{seg(alloc, 'bg-emerald-500')}{seg(po, 'bg-sky-600')}{seg(pr, 'bg-sky-300')}{seg(free, 'bg-blue-900')}{seg(raise, 'bg-rose-400')}
            </div>
            <p className={`mt-1 text-xs font-bold ${s.cls}`}>{s.text}</p>
            {(it.incoming_pos || []).map(p => (
                <p key={p.po_id} className={`text-[11px] ${p.late ? 'font-bold text-rose-700' : 'text-slate-500'}`}>
                    <Link to={`/v3/purchasing/orders/${p.po_id}`} className="hover:underline">{p.po_no}</Link> {fmt(p.qty, u)} {u} · due {p.due ? dmy(p.due) : '—'}{p.late ? ` — after needed-by ${dmy(it.needed_by)}` : ''}{p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL' ? ' (not issued)' : ''}
                </p>
            ))}
            {!it.incoming_pos?.length && it.shortfall > 0 && it.needed_by && <p className="text-[11px] text-slate-500">needed by {dmy(it.needed_by)}</p>}
        </div>
    );
}

function Actions({ it, orderId, can, onAllocate, onRelease }) {
    if (!can) return null;
    return (
        <span className="whitespace-nowrap">
            {it.to_raise > 0 && <Link to={`/v3/planning/buy-list?order=${orderId}&kind=${it.kind}`} className="text-xs font-bold text-amber-700 hover:underline mr-3">Raise</Link>}
            {it.shortfall > 0 && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline mr-3" onClick={() => onAllocate(it)}>Allocate</button>}
            {it.allocated > 0 && <button type="button" className="text-xs font-bold text-slate-600 hover:underline" onClick={() => onRelease(it)}>Release</button>}
        </span>
    );
}

// Group (fabric line + article, or trim type) and the row's own name.
const groupOf = (it) => {
    if (it.kind === 'FABRIC') {
        const role = [...it.usage].sort((a, b) => ((ROLE_ORDER.indexOf(a) + 99) % 99) - ((ROLE_ORDER.indexOf(b) + 99) % 99))[0] || 'Fabric';
        const article = it.info?.mill || it.info?.code ? [it.info?.mill, it.info?.code].filter(Boolean).join(' · ') : it.label;
        return { key: `${role}|${article}`, title: role, sub: article, sort: (ROLE_ORDER.indexOf(role) + 99) % 99 };
    }
    const type = it.rows?.[0]?.trim_type || [...it.usage][0] || 'Trim';
    return { key: type, title: type, sub: '', sort: Math.min(...(it.rows || []).map(r => r.bom_sort ?? 9999)) };
};
const nameOf = (it) => {
    if (it.kind === 'FABRIC') return it.info?.shade_code || it.info?.shade_name ? [it.info?.shade_code, it.info?.shade_name].filter(Boolean).join(' ') : it.label;
    return [it.info?.brand, it.info?.code].filter(Boolean).join(' · ') || it.label;
};
const subOf = (it, groupTitle) => {
    if (it.kind === 'FABRIC') return it.usage.length > 1 ? `also ${it.usage.filter(x => x !== groupTitle).join(', ')}` : '';
    // placements only ("(BONE)"), not the trim type the group already shows
    const places = it.usage.map(x => (groupTitle && x.startsWith(groupTitle) ? x.slice(groupTitle.length).trim() : x)).filter(Boolean);
    return [it.info?.description, places.join(', '), it.issue_stages?.length ? `issued at ${it.issue_stages.join(', ')}` : ''].filter(Boolean).join(' · ');
};

export default function MaterialRequirements({ data, kind, approved, showActions, canAct, filter, view, onCell, onAllocate, onRelease, onAllocateFree, busy }) {
    const items = data.items.filter(i => i.kind === kind);
    const colours = data.colours;
    // Filters (16 Oct 2026): the tab bar's All / Short / Covered, plus a clicked count chip (covered / part / none),
    // a group (trim type, or fabric line + article) and a search on name, code and description.
    const [coverPick, setCoverPick] = useState('');
    const [groupPick, setGroupPick] = useState('');
    const [q, setQ] = useState('');
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = items.filter(i => (filter === 'short' ? i.shortfall > 0 : filter === 'covered' ? i.shortfall <= 0 : true)
        && (!coverPick || (coverPick === 'REQ_NO_PO' ? reqNoPo(i) : i.cover === coverPick))
        && (!groupPick || groupOf(i).key === groupPick)
        && (!words.length || words.every(w => `${i.label} ${nameOf(i)} ${i.info?.description || ''} ${i.usage.join(' ')}`.toLowerCase().includes(w))));
    const groupChoices = [...new Map(items.map(i => { const g = groupOf(i); return [g.key, g]; })).values()]
        .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title) || a.sub.localeCompare(b.sub));
    const noun = kind === 'FABRIC' ? 'fabric' : 'trims';

    const byUnit = new Map();
    for (const it of items) {
        const t = byUnit.get(it.uom) || { req: 0, alloc: 0, pr: 0, raise: 0 };
        t.req += it.required_display || 0; t.alloc += (it.allocated || 0) + (it.issued || 0); t.pr += onPr(it); t.raise += it.to_raise || 0;
        byUnit.set(it.uom, t);
    }
    const cover = { FULL: 0, PARTIAL: 0, NONE: 0 };
    items.forEach(i => { cover[i.cover] = (cover[i.cover] || 0) + 1; });
    const freeToTake = items.filter(i => i.shortfall > 0 && i.free > 0);
    const toRaise = items.filter(i => i.to_raise > 0);
    const late = items.filter(i => i.incoming_pos?.some(p => p.late));

    const groups = new Map();
    for (const it of shown) {
        const g = groupOf(it);
        if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
        groups.get(g.key).items.push(it);
    }
    const ordered = [...groups.values()].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title) || a.sub.localeCompare(b.sub));
    const allColours = (it) => colours.length > 1 && colours.every(c => it.by_colour[c.id]);
    const colourLinks = (it) => (allColours(it) ? <span>All {colours.length} colours</span>
        : colours.filter(c => it.by_colour[c.id]).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<button type="button" className="text-indigo-700 hover:underline" onClick={() => onCell(it, c)} title={`${fmt(it.by_colour[c.id], it.uom)} ${it.uom} — how it's calculated`}>{c.name}</button></span>));
    const reqCell = (it) => (
        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
            <b>{fmt(it.required_display, it.uom)}</b> <span className="text-xs text-slate-500">{it.uom}</span>
            {it.kind === 'TRIM' && it.purchase_qty != null && it.purchase_uom && Number(it.usage_per_purchase_uom) !== 1 && <span className="block text-[11px] text-slate-500">buy {fmt(it.purchase_qty, 'pcs')} {it.purchase_uom}</span>}
        </td>
    );
    const nameCell = (it, g) => (
        <td className={`px-3 py-2 bg-white ${STICKY_COL}`}>
            <p className="font-semibold text-slate-800">{nameOf(it)}{!it.active && <span className="ml-1 text-[10px] font-bold text-rose-600">inactive</span>}</p>
            {subOf(it, g?.title) && <p className="text-[11px] text-slate-500">{subOf(it, g?.title)}</p>}
            {it.duplicate_note && <p className="mt-0.5 text-[11px] font-semibold text-amber-800 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{it.duplicate_note}</p>}
        </td>
    );

    return (
        <div className="space-y-2">
            {/* One-line summary + bulk actions */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                <span className="flex items-center gap-1 font-bold">{['FULL', 'PARTIAL', 'NONE'].map(k => (
                    <button key={k} type="button" onClick={() => setCoverPick(coverPick === k ? '' : k)} title={coverPick === k ? 'Show all again' : `Show only ${COVER[k][0]} items`}
                        className={`px-1.5 py-0.5 rounded border ${COVER[k][1]} ${coverPick === k ? 'ring-2 ring-offset-1 ring-indigo-500' : coverPick ? 'opacity-50 hover:opacity-100' : 'hover:brightness-95'}`}>{cover[k] || 0} {COVER[k][0]}</button>
                ))}
                    <button type="button" onClick={() => setCoverPick(coverPick === 'REQ_NO_PO' ? '' : 'REQ_NO_PO')} title={coverPick === 'REQ_NO_PO' ? 'Show all again' : 'Show only items on a requisition with no purchase order yet'}
                        className={`px-1.5 py-0.5 rounded border bg-sky-50 text-sky-800 border-sky-200 ${coverPick === 'REQ_NO_PO' ? 'ring-2 ring-offset-1 ring-indigo-500' : coverPick ? 'opacity-50 hover:opacity-100' : 'hover:brightness-95'}`}>{items.filter(reqNoPo).length} on req. · no PO</button>
                </span>
                {[...byUnit.entries()].map(([u, t]) => (
                    <span key={u} className="text-slate-600"><b className="text-slate-800">{fmt(t.req, u)} {u}</b> · {fmt(t.alloc, u)} allocated · {fmt(t.pr, u)} on req. · <b className={t.raise > 0 ? 'text-rose-700' : 'text-emerald-700'}>{fmt(t.raise, u)} {u} to raise</b></span>
                ))}
                {late.length > 0 && <span className="font-bold text-rose-700">{late.length} item{late.length === 1 ? '' : 's'} on a PO due after needed-by</span>}
                {showActions && canAct(kind) && (
                    <span className="ml-auto flex items-center gap-3">
                        {freeToTake.length > 0 && <button type="button" disabled={busy} onClick={onAllocateFree} className="font-bold text-emerald-700 hover:underline disabled:opacity-50">Allocate free stock ({freeToTake.length})</button>}
                        {toRaise.length > 0 && <Link to={`/v3/planning/buy-list?order=${data.order.id}&kind=${kind}`} className="font-bold text-amber-700 hover:underline">Raise all short ({toRaise.length})</Link>}
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <select value={groupPick} onChange={e => setGroupPick(e.target.value)} aria-label={kind === 'FABRIC' ? 'Fabric line' : 'Trim type'}
                    className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white max-w-[280px]">
                    <option value="">{kind === 'FABRIC' ? 'All fabric lines' : 'All trim types'} ({items.length})</option>
                    {groupChoices.map(g => <option key={g.key} value={g.key}>{g.title}{g.sub ? ` — ${g.sub}` : ''} ({items.filter(i => groupOf(i).key === g.key).length})</option>)}
                </select>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'FABRIC' ? 'Search shade, article, mill…' : 'Search item, code, description…'} aria-label="Search items"
                    className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white w-60" />
                {(coverPick || groupPick || q) && <button type="button" onClick={() => { setCoverPick(''); setGroupPick(''); setQ(''); }} className="text-xs font-bold text-indigo-700 hover:underline">Clear filters</button>}
                {(coverPick || groupPick || q || filter !== 'all') && <span className="text-xs text-slate-500">{shown.length} of {items.length} shown</span>}
            </div>

            {shown.length === 0 ? <p className="text-sm text-slate-400">{items.length ? 'Nothing matches this filter.' : `No ${noun} requirements.`}</p> : view === 'list' ? (
                <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[72vh]">
                    <table className="border-collapse text-sm min-w-full">
                        <thead className="sticky top-0 z-[2] bg-slate-50">
                            <tr className="text-left text-xs font-bold text-slate-500">
                                <th className={`px-3 py-2 min-w-[220px] bg-slate-50 ${STICKY_COL}`}>{kind === 'FABRIC' ? 'Shade' : 'Item'}</th>
                                <th className="px-3 py-2">Garment colours</th>
                                <th className="px-3 py-2 text-right min-w-[110px]">Required</th>
                                <th className="px-3 py-2 min-w-[230px]">Status</th>
                                {showActions && <th className="px-3 py-2 w-40" />}
                            </tr>
                        </thead>
                        <tbody>
                            {ordered.map(g => {
                                const u = g.items[0].uom;
                                const same = g.items.every(i => i.uom === u);
                                const sum = (f) => g.items.reduce((n, i) => n + (f(i) || 0), 0);
                                return [
                                    <tr key={`g:${g.key}`} className="bg-slate-50 border-t border-slate-200">
                                        <td colSpan={2} className={`px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-600 bg-slate-50 ${STICKY_COL}`}>{g.title}{g.sub && <> — <span className="normal-case tracking-normal">{g.sub}</span></>} <span className="font-semibold text-slate-400 normal-case tracking-normal">({g.items.length})</span></td>
                                        <td className="px-3 py-1.5 text-right text-xs font-black tabular-nums text-slate-700">{same ? `${fmt(sum(i => i.required_display), u)} ${u}` : ''}</td>
                                        <td className="px-3 py-1.5 text-xs font-bold">{same && sum(i => i.to_raise) > 0 ? <span className="text-rose-700">{fmt(sum(i => i.to_raise), u)} {u} to raise</span> : same && sum(i => i.shortfall) <= 0 ? <span className="text-emerald-700">covered</span> : ''}</td>
                                        {showActions && <td />}
                                    </tr>,
                                    ...g.items.map(it => (
                                        <tr key={it.key} className="border-t border-slate-100 align-top">
                                            {nameCell(it, g)}
                                            <td className="px-3 py-2 text-xs text-slate-700">{colourLinks(it)}</td>
                                            {reqCell(it)}
                                            <td className="px-3 py-2"><StatusBar it={it} /></td>
                                            {showActions && <td className="px-3 py-2 text-right"><Actions it={it} orderId={data.order.id} can={canAct(it.kind)} onAllocate={onAllocate} onRelease={onRelease} /></td>}
                                        </tr>
                                    )),
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-auto max-h-[72vh]">
                    <table className="border-collapse text-sm min-w-full">
                        <thead className="sticky top-0 z-[2] bg-slate-50">
                            <tr>
                                <th className={`px-3 py-2 text-left text-xs font-bold text-slate-500 min-w-[220px] bg-slate-50 ${STICKY_COL}`}>Item</th>
                                {colours.map(c => <th key={c.id} className="px-3 py-2 text-right text-xs font-black text-slate-700 min-w-[90px]">{c.name}</th>)}
                                <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 min-w-[100px]">Total</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 min-w-[230px]">Status</th>
                                {showActions && <th className="px-3 py-2 w-40" />}
                            </tr>
                        </thead>
                        <tbody>
                            {ordered.flatMap(g => g.items.map(it => ({ it, g }))).map(({ it, g }) => (
                                <tr key={it.key} className="border-t border-slate-100 align-top">
                                    {nameCell(it, g)}
                                    {colours.map(c => (
                                        <td key={c.id} className="px-3 py-2 text-right tabular-nums">
                                            {it.by_colour[c.id] ? <button type="button" className="text-indigo-700 hover:underline" onClick={() => onCell(it, c)}>{fmt(it.by_colour[c.id], it.uom)}</button> : <span className="text-slate-300">—</span>}
                                        </td>
                                    ))}
                                    {reqCell(it)}
                                    <td className="px-3 py-2"><StatusBar it={it} /></td>
                                    {showActions && <td className="px-3 py-2 text-right"><Actions it={it} orderId={data.order.id} can={canAct(it.kind)} onAllocate={onAllocate} onRelease={onRelease} /></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!approved && <p className="text-xs text-amber-700">Estimate — the order is not approved yet.</p>}
        </div>
    );
}

// Order BOM → Fabric and Trims tabs (one layout for both, 16 Oct 2026; replaces the Fabric list of the same day and
// the old trim status grid). A one-line summary (one chip per item: covered / free stock / to raise / on requisition / on
// PO and late — 25 Oct 2026; bulk actions); rows grouped
// by fabric line + article, or by trim type; a List (item · garment colours · required · one status · actions) or the
// item × colour matrix ("By colour"). Both scroll in their own box with the heading and the item column frozen.
// Under each status: the purchase orders reserved for this order as chips (PO · qty · due) — red when due after the
// item's needed-by date, dashed while not issued; tap for the details (25 Oct 2026). Fabric spelled two ways on one order (two fabric records) is flagged.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FileDown, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadLetterhead, drawPdfLetterhead } from '../components/letterhead';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const dmy = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
const ROLE_ORDER = ['Shell fabric', 'Contrast fabric', 'Lining fabric', 'Pocketing fabric', 'Other fabric'];
const onPr = (it) => (it.pr_pending || 0) + (it.pr_approved || 0);
// On a purchase order that arrives after the date cutting needs it.
const latePo = (it) => (it.incoming_pos || []).some(p => p.late);
// Summary chips (25 Oct 2026, owner: "9 + 54 = 63 … confusing … ignore minor quantity on other po in summary"): each
// item counts in ONE chip — covered, or where the largest part of what's missing sits (free stock / to raise / on a
// requisition without PO / on PO). Smaller parts elsewhere are not counted (still on the row: bar and PO chip).
// Ties go to the stage furthest behind (to raise, requisition, PO, free stock).
const BUCKETS = ['COVERED', 'FREE', 'RAISE', 'REQ', 'PO'];
const mainOf = (it) => {
    if (it.shortfall <= 0) return 'COVERED';
    const po = (it.incoming_pos || []).reduce((n, p) => n + (p.qty || 0), 0);
    const parts = [['RAISE', it.to_raise || 0], ['REQ', Math.max(onPr(it) - po, 0)], ['PO', po], ['FREE', it.from_stock || 0]];
    const best = parts.reduce((a, b) => (b[1] > a[1] + 1e-9 ? b : a));
    return best[1] > 0 ? best[0] : 'RAISE';
};
const isLateMain = (it) => mainOf(it) === 'PO' && latePo(it);
const STICKY_COL = 'sticky left-0 z-[1]';
// Status cell (25 Oct 2026, owner: "too much text … suggest some better ui" → bar + status + PO chips): whole numbers
// in the cell (one decimal under 10); the exact figures are in the tooltip / the PO chip's tap view.
const fmtS = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const isDraftPo = (p) => p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL';

function statusOf(it) {
    const u = it.uom;
    if (it.shortfall <= 0) return { text: it.issued > 0 ? `Covered · ${fmtS(it.issued)} issued` : 'Covered', cls: 'text-emerald-700' };
    // still short and the needed-by date has passed → red, whatever the stage
    const overdue = it.needed_by && it.needed_by < todayIso();
    if (it.from_stock > 0) return { text: `${fmtS(it.from_stock)} ${u} in free stock — allocate`, cls: overdue ? 'text-rose-700' : 'text-blue-900' };
    if (it.to_raise > 0) return { text: `${fmtS(it.to_raise)} ${u} to raise`, cls: 'text-rose-700' };
    if (it.incoming_pos?.length) return { text: `${fmtS(it.shortfall)} ${u} short · on PO`, cls: overdue ? 'text-rose-700' : 'text-sky-700' };
    // light blue, the bar's requisition colour (17 Oct 2026; was amber)
    if (onPr(it) > 0) return { text: `${fmtS(it.shortfall)} ${u} short · on requisition`, cls: overdue ? 'text-rose-700' : 'text-sky-500' };
    return { text: `${fmtS(it.shortfall)} ${u} short`, cls: 'text-rose-700' };
}

// One purchase order as a small chip: short no. · qty · due. Red = due after the needed-by date; dashed = not issued
// (draft / waiting approval). Tap (or hover) for the full sentence and the link to the PO.
function PoChip({ p, it }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const u = it.uom;
    const draft = isDraftPo(p);
    const full = `${p.po_no} · ${fmt(p.qty, u)} ${u} · due ${p.due ? dmy(p.due) : '—'}${it.needed_by ? ` · needed by ${dmy(it.needed_by)}` : ''}${p.late ? ' — arrives late' : ''}${draft ? ' · draft — not sent to the supplier' : ''}`;
    return (
        <span ref={box} className="relative inline-block">
            <button type="button" onClick={() => setOpen(o => !o)} title={full}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-bold whitespace-nowrap border ${draft ? 'border-dashed' : ''} ${p.late ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-sky-50 text-sky-800 border-sky-200'}`}>
                {String(p.po_no).split('/').pop()} · {fmtS(p.qty)} {u} · {p.due ? dmy(p.due) : '—'}{p.late && <AlertTriangle size={10} />}
            </button>
            {open && (
                <span className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-lg whitespace-normal">
                    <Link to={`/v3/purchasing/orders/${p.po_id}`} className="font-bold text-indigo-700 hover:underline">{p.po_no}</Link>
                    <span className="block">{fmt(p.qty, u)} {u} for this order · due {p.due ? dmy(p.due) : '—'}</span>
                    {it.needed_by && <span className={`block ${p.late ? 'font-bold text-rose-700' : ''}`}>needed by {dmy(it.needed_by)}{p.late ? ' — the PO arrives after it' : ''}</span>}
                    {draft && <span className="block font-semibold text-amber-800">Draft — not sent to the supplier yet</span>}
                </span>
            )}
        </span>
    );
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
            {it.incoming_pos?.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                    {it.incoming_pos.slice(0, 2).map(p => <PoChip key={p.po_id} p={p} it={it} />)}
                    {it.incoming_pos.length > 2 && <span className="text-[11px] font-bold text-slate-500" title={it.incoming_pos.slice(2).map(p => `${p.po_no} · ${fmt(p.qty, u)} ${u} · due ${p.due ? dmy(p.due) : '—'}`).join('\n')}>+{it.incoming_pos.length - 2}</span>}
                </div>
            )}
        </div>
    );
}

// Raise: the planner of the kind. Allocate: the store of the kind (19 Oct 2026) — fabric in whole rolls (Assign opens
// the roll list; Rolls shows what the order holds and gives rolls back), trims by quantity.
function Actions({ it, canRaise, canAlloc, onAllocate, onRelease, onRolls, onRaise }) {
    const fabric = it.kind === 'FABRIC' && !it.by_metres;   // pocketing / lining (20 Oct 2026): by metres, like trims
    return (
        <span className="whitespace-nowrap">
            {/* Raise opens the dialog here (25 Oct 2026; was a link to the buy list) */}
            {canRaise && it.to_raise > 0 && <button type="button" className="text-xs font-bold text-amber-700 hover:underline mr-3" onClick={() => onRaise([it])}>Raise</button>}
            {fabric && canAlloc && it.shortfall > 0 && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline mr-3" onClick={() => onRolls(it)}>Assign rolls</button>}
            {fabric && it.allocated > 0 && !(canAlloc && it.shortfall > 0) && <button type="button" className="text-xs font-bold text-slate-600 hover:underline" onClick={() => onRolls(it)}>Rolls</button>}
            {!fabric && canAlloc && it.shortfall > 0 && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline mr-3" onClick={() => onAllocate(it)}>Allocate</button>}
            {!fabric && canAlloc && it.allocated > 0 && <button type="button" className="text-xs font-bold text-slate-600 hover:underline" onClick={() => onRelease(it)}>Release</button>}
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

// Item lines to Excel / PDF (25 Oct 2026, owner: "add download button with dropdown option to download trim item line
// details with covered and all trim item line" → "remove Description / use … if covered then show only Allocated and in
// purchase unit Allocated and issued … remove On requisition … Detail … add pdf option also"). One row per item, the
// order on top, a Total row (quantities summed only when the items share one unit).
//   All / As shown: group, item, garment colours, unit, required, buy, allocated, issued
//   Covered:        group, item, garment colours, unit, allocated, issued, and both in the purchase unit
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
function exportColumns(kind, covered) {
    // In the purchase unit (reels, cones, packets …) — whole packs, rounded UP: a pack can't be split, so 8,160 m at
    // 1,000 m a reel is 9 reels (25 Oct 2026, owner: "there cannot be 8.16 reel"). Items not bought in packs stay as is.
    const inBuy = (it, q) => {
        const f = Number(it.usage_per_purchase_uom);
        if (!it.purchase_uom || !f || f === 1) return { v: r2(q), u: it.uom };
        return { v: Math.ceil((q || 0) / f - 1e-9), u: it.purchase_uom };
    };
    // Covered: grouped by trim type (fabric: line + article) as heading rows, no type column (25 Oct 2026, owner: "group
    // by item type and remove trim type from column" → "… in covered trim pdf and excel not in all trims"). All / As
    // shown: a type column, no heading rows.
    const cols = [
        ...(covered ? [] : [{ h: kind === 'FABRIC' ? 'Fabric line' : 'Trim type', w: 26, get: (it) => { const g = groupOf(it); return g.sub ? `${g.title} — ${g.sub}` : g.title; } }]),
        { h: 'Item', w: 36, get: (it) => nameOf(it) },
        { h: 'Garment colours', w: 30, get: (it, ctx) => Object.keys(it.by_colour || {}).filter(k => it.by_colour[k]).map(k => ctx.colourName[k] || k).join(', ') },
        { h: 'Unit', w: 6, get: (it) => it.uom },
    ];
    if (!covered) cols.push(
        { h: 'Required', w: 11, num: true, get: (it) => it.required_display },
        { h: 'Buy', w: 12, get: (it) => (it.kind === 'TRIM' && it.purchase_qty != null && it.purchase_uom ? `${it.purchase_qty} ${it.purchase_uom}` : '') },
        { h: 'Allocated', w: 11, num: true, get: (it) => it.allocated || 0 },
        { h: 'Issued', w: 10, num: true, get: (it) => it.issued || 0 },
    );
    else cols.push(
        { h: 'Allocated', w: 11, num: true, get: (it) => it.allocated || 0 },
        { h: 'Issued', w: 10, num: true, get: (it) => it.issued || 0 },
        { h: 'Allocated (purchase unit)', w: 16, buy: true, get: (it) => inBuy(it, it.allocated) },
        { h: 'Issued (purchase unit)', w: 16, buy: true, get: (it) => inBuy(it, it.issued) },
    );
    return cols;
}
function exportTable({ data, kind, items, covered }) {
    const cols = exportColumns(kind, covered);
    const ctx = { colourName: Object.fromEntries((data.colours || []).map(c => [c.id, c.name])) };
    // groups in the page's order (trim type / fabric line + article), each item under its group
    const groups = new Map();
    for (const it of items) { const g = groupOf(it); if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] }); groups.get(g.key).items.push(it); }
    const ordered = [...groups.values()].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title) || a.sub.localeCompare(b.sub));
    const cell = (c, v) => (c.buy ? `${v.v} ${v.u}` : v);
    const raw = [];
    const body = [];   // { group: 'TKT 120 (2)' } or { cells: [...] }
    for (const g of ordered) {
        if (covered) body.push({ group: `${g.sub ? `${g.title} — ${g.sub}` : g.title} (${g.items.length})` });
        for (const it of g.items) { const r = cols.map(c => c.get(it, ctx)); raw.push(r); body.push({ cells: r.map((v, i) => cell(cols[i], v)) }); }
    }
    const units = [...new Set(items.map(i => i.uom))];
    const total = cols.map((c, i) => {
        if (i === 0) return `Total · ${items.length} item${items.length === 1 ? '' : 's'}`;
        if (i === 1) return units.length > 1 ? `units differ (${units.join(', ')}) — not added` : '';
        if (c.num && units.length === 1) return Math.round(raw.reduce((n, r) => n + (Number(r[i]) || 0), 0) * 1000) / 1000;
        if (c.buy) { const us = [...new Set(raw.map(r => r[i].u))]; return us.length === 1 ? `${r2(raw.reduce((n, r) => n + r[i].v, 0))} ${us[0]}` : ''; }
        if (c.h === 'Unit' && units.length === 1) return units[0];
        return '';
    });
    return { cols, body, total };
}
const titleOf = (data, kind, which, n) => {
    const o = data.order;
    return `Order ${o.order_no} · ${o.customer_name || ''}${o.buyer_po_no ? ` · buyer PO ${o.buyer_po_no}` : ''} · ${kind === 'FABRIC' ? 'Fabric' : 'Trims'} — ${which.label} (${n} of ${data.items.filter(i => i.kind === kind).length}) · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
};
const fileOf = (data, kind, which, ext) => `${kind === 'FABRIC' ? 'Fabric' : 'Trims'}-${which.file}-${data.order.order_no.replace(/[^\w-]+/g, '-')}.${ext}`;

async function exportItemsExcel({ data, kind, items, which }) {
    const lh = await loadLetterhead().catch(() => null);
    const { cols, body, total } = exportTable({ data, kind, items, covered: which.file === 'covered' });
    const last = cols.length - 1;   // the order no. in the top-right cell (25 Oct 2026, owner: "show so number on top right in bold")
    const top = Array(cols.length).fill(''); top[0] = lh?.name || ''; top[last] = `ORDER BOM — ${kind === 'FABRIC' ? 'FABRIC' : 'TRIMS'}`;
    const top2 = Array(cols.length).fill(''); top2[0] = lh?.sub || ''; top2[last] = data.order.order_no;
    const ws = XLSX.utils.aoa_to_sheet([top, top2, [], [titleOf(data, kind, which, items.length)], [],
        cols.map(c => c.h), ...body.map(b => (b.group ? [b.group] : b.cells)), total]);
    ws['!cols'] = cols.map(c => ({ wch: c.w }));
    // group heading rows across the table
    const first = 6;   // header row index (0-based) is 5; data starts at 6
    ws['!merges'] = body.map((b, i) => (b.group ? { s: { r: first + i, c: 0 }, e: { r: first + i, c: cols.length - 1 } } : null)).filter(Boolean);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind === 'FABRIC' ? 'Fabric' : 'Trims');
    XLSX.writeFile(wb, fileOf(data, kind, which, 'xlsx'));
}

async function exportItemsPdf({ data, kind, items, which }) {
    const lh = await loadLetterhead().catch(() => null);
    const { cols, body, total } = exportTable({ data, kind, items, covered: which.file === 'covered' });
    const doc = new jsPDF({ orientation: 'landscape' });
    let y = drawPdfLetterhead(doc, lh, { title: `ORDER BOM — ${kind === 'FABRIC' ? 'FABRIC' : 'TRIMS'}` });
    // the order no., bold, top right under the title (25 Oct 2026, owner: "show so number on top right in bold")
    { const W = doc.internal.pageSize.getWidth(); doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.text(data.order.order_no, W - 8, (lh && (lh.name || lh.logo) ? 6 : 0) + 13.5, { align: 'right' }); doc.setFont(undefined, 'normal'); y = Math.max(y, 18); }
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text(titleOf(data, kind, which, items.length), 8, y + 4);
    doc.setFont(undefined, 'normal');
    autoTable(doc, {
        startY: y + 7, margin: { left: 8, right: 8, bottom: 12 }, rowPageBreak: 'avoid',
        // numbers Indian style on paper (8,160 · 692.58); the Excel keeps real numbers
        head: [cols.map(c => c.h)],
        body: body.map(b => (b.group
            ? [{ content: b.group, colSpan: cols.length, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [51, 65, 85] } }]
            : b.cells.map((v, i) => (cols[i].num && typeof v === 'number' ? fmt(v, 'm') : v)))),
        foot: [total.map((v, i) => (cols[i].num && typeof v === 'number' ? fmt(v, 'm') : v))], showFoot: 'lastPage',
        styles: { fontSize: 7.5, cellPadding: 1.4, lineColor: [210, 214, 220], lineWidth: 0.1, valign: 'middle' },
        headStyles: { fillColor: [238, 242, 255], textColor: [30, 41, 59], fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.num || c.buy ? { halign: 'right' } : {}])),
        didDrawPage: () => { const H = doc.internal.pageSize.getHeight(); const W = doc.internal.pageSize.getWidth(); doc.setFontSize(7); doc.setTextColor(120); doc.text(`${data.order.order_no} · page ${doc.internal.getNumberOfPages()}`, W - 8, H - 5, { align: 'right' }); doc.setTextColor(0); },
    });
    doc.save(fileOf(data, kind, which, 'pdf'));
}

function DownloadMenu({ options }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const btn = 'px-2 py-0.5 rounded border text-xs font-bold disabled:opacity-40';
    return (
        <span ref={box} className="relative inline-block">
            <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-indigo-700"><FileDown size={13} /> Download <ChevronDown size={12} /></button>
            {open && (
                <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {options.map(op => (
                        <div key={op.label} className={`flex items-center gap-2 rounded px-3 py-1.5 ${op.disabled ? 'opacity-40' : 'hover:bg-slate-50'}`}>
                            <span className="flex-1">
                                <span className="block text-sm font-semibold text-slate-800">{op.label}</span>
                                {op.hint && <span className="block text-[11px] text-slate-500">{op.hint}</span>}
                            </span>
                            <button type="button" disabled={op.disabled} onClick={() => { setOpen(false); op.run('xlsx'); }} className={`${btn} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}>Excel</button>
                            <button type="button" disabled={op.disabled} onClick={() => { setOpen(false); op.run('pdf'); }} className={`${btn} border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100`}>PDF</button>
                        </div>
                    ))}
                </div>
            )}
        </span>
    );
}

export default function MaterialRequirements({ data, kind, approved, showActions, canRaise, canAlloc, filter, view, onCell, onAllocate, onRelease, onRolls, onAllocateFree, onRaise, busy }) {
    const items = data.items.filter(i => i.kind === kind);
    const colours = data.colours;
    // Filters (16 Oct 2026): the tab bar's All / Short / Covered, plus a clicked count chip (covered / part / none),
    // a group (trim type, or fabric line + article) and a search on name, code and description.
    const [coverPick, setCoverPick] = useState('');
    const [groupPick, setGroupPick] = useState('');
    const [q, setQ] = useState('');
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = items.filter(i => (filter === 'short' ? i.shortfall > 0 : filter === 'covered' ? i.shortfall <= 0 : true)
        && (!coverPick || (coverPick === 'PO_LATE' ? isLateMain(i) : mainOf(i) === coverPick))
        && (!groupPick || groupOf(i).key === groupPick)
        && (!words.length || words.every(w => `${i.label} ${nameOf(i)} ${i.info?.description || ''} ${i.usage.join(' ')}`.toLowerCase().includes(w))));
    const groupChoices = [...new Map(items.map(i => { const g = groupOf(i); return [g.key, g]; })).values()]
        .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title) || a.sub.localeCompare(b.sub));
    const noun = kind === 'FABRIC' ? 'fabric' : 'trims';

    const bucket = Object.fromEntries(BUCKETS.map(k => [k, 0]));
    items.forEach(i => { bucket[mainOf(i)] += 1; });
    const freeToTake = items.filter(i => i.shortfall > 0 && i.free > 0);
    const toRaise = items.filter(i => i.to_raise > 0);
    const late = items.filter(isLateMain);
    // 25 Oct 2026 (owner: the metre / piece totals and "N items on a PO due after needed-by" were "irrelevant data"):
    // the totals added unlike items together (thread metres + fabric metres), so they're gone; what's left is what to
    // act on — items still to raise, and items whose PO arrives too late — as count chips that filter the list.
    const lateText = late.map(it => `${nameOf(it)}: ${it.incoming_pos.filter(p => p.late).map(p => `${p.po_no} due ${p.due ? dmy(p.due) : '—'}`).join(', ')} — needed by ${dmy(it.needed_by)}`).join('\n');
    const chip = (key, n, cls, label, title) => (
        <button type="button" onClick={() => setCoverPick(coverPick === key ? '' : key)} title={coverPick === key ? 'Show all again' : title}
            className={`px-1.5 py-0.5 rounded border ${cls} ${coverPick === key ? 'ring-2 ring-offset-1 ring-indigo-500' : coverPick ? 'opacity-50 hover:opacity-100' : 'hover:brightness-95'}`}>{n} {label}</button>
    );

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
                {/* one chip per item (adds up to the item count); a chip filters the list */}
                <span className="flex flex-wrap items-center gap-1 font-bold">
                    {chip('COVERED', bucket.COVERED, 'bg-emerald-50 text-emerald-700 border-emerald-200', 'covered', 'Allocated or issued in full — nothing missing')}
                    {bucket.FREE > 0 && chip('FREE', bucket.FREE, 'bg-blue-50 text-blue-900 border-blue-200', 'free stock', 'Mostly in free stock in the store — allocate it')}
                    {chip('RAISE', bucket.RAISE, 'bg-rose-50 text-rose-800 border-rose-200', 'to raise', 'Mostly on no requisition and no PO — raise it')}
                    {chip('REQ', bucket.REQ, 'bg-sky-50 text-sky-800 border-sky-200', 'on requisition', 'Mostly on a requisition with no purchase order yet — for purchasing')}
                    {chip('PO', bucket.PO, 'bg-sky-100 text-sky-900 border-sky-300', 'on PO', 'Mostly on a purchase order for this order')}
                    {late.length > 0 && chip('PO_LATE', late.length, 'bg-rose-600 text-white border-rose-700', 'of them late', `On PO, due after the date cutting needs it:\n${lateText}`)}
                    <span className="font-normal text-slate-400" title="Each item counts once, where most of what's missing sits; smaller parts show on the item's row">= {items.length}</span>
                </span>
                <span className="ml-auto flex items-center gap-3">
                    <DownloadMenu options={[
                        { label: `All ${noun} (${items.length})`, hint: 'required, buy, allocated, issued', disabled: !items.length, run: (f) => (f === 'pdf' ? exportItemsPdf : exportItemsExcel)({ data, kind, items, which: { label: 'all', file: 'all' } }) },
                        { label: `Covered ${noun} (${bucket.COVERED})`, hint: 'allocated and issued, also in the purchase unit', disabled: !bucket.COVERED, run: (f) => (f === 'pdf' ? exportItemsPdf : exportItemsExcel)({ data, kind, items: items.filter(i => mainOf(i) === 'COVERED'), which: { label: 'covered', file: 'covered' } }) },
                        ...(shown.length !== items.length ? [{ label: `As shown (${shown.length})`, hint: 'the list with the current filters', disabled: !shown.length, run: (f) => (f === 'pdf' ? exportItemsPdf : exportItemsExcel)({ data, kind, items: shown, which: { label: 'filtered', file: 'filtered' } }) }] : []),
                    ]} />
                {showActions && (canRaise(kind) || canAlloc(kind)) && (
                    <span className="flex items-center gap-3">
                        {canAlloc(kind) && freeToTake.length > 0 && <button type="button" disabled={busy} onClick={onAllocateFree} className="font-bold text-emerald-700 hover:underline disabled:opacity-50">Allocate free stock ({freeToTake.length})</button>}
                        {canRaise(kind) && toRaise.length > 0 && <button type="button" onClick={() => onRaise(toRaise)} className="font-bold text-amber-700 hover:underline">Raise all short ({toRaise.length})</button>}
                    </span>
                )}
                </span>
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
                                // 25 Oct 2026 (owner: "grouping of trim item line was correct only 881.28 m i asked to remove"):
                                // the group row keeps its name, count and "to raise / covered" — no total required.
                                return [
                                    <tr key={`g:${g.key}`} className="bg-slate-50 border-t border-slate-200">
                                        <td colSpan={2} className={`px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-600 bg-slate-50 ${STICKY_COL}`}>{g.title}{g.sub && <> — <span className="normal-case tracking-normal">{g.sub}</span></>} <span className="font-semibold text-slate-400 normal-case tracking-normal">({g.items.length})</span></td>
                                        <td />
                                        <td className="px-3 py-1.5 text-xs font-bold">{same && sum(i => i.to_raise) > 0 ? <span className="text-rose-700">{fmtS(sum(i => i.to_raise))} {u} to raise</span> : same && sum(i => i.shortfall) <= 0 ? <span className="text-emerald-700">covered</span> : ''}</td>
                                        {showActions && <td />}
                                    </tr>,
                                    ...g.items.map(it => (
                                        <tr key={it.key} className="border-t border-slate-100 align-top">
                                            {nameCell(it, g)}
                                            <td className="px-3 py-2 text-xs text-slate-700">{colourLinks(it)}</td>
                                            {reqCell(it)}
                                            <td className="px-3 py-2"><StatusBar it={it} /></td>
                                            {showActions && <td className="px-3 py-2 text-right"><Actions it={it} canRaise={canRaise(it.kind)} canAlloc={canAlloc(it.kind)} onAllocate={onAllocate} onRelease={onRelease} onRolls={onRolls} onRaise={onRaise} /></td>}
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
                                    {showActions && <td className="px-3 py-2 text-right"><Actions it={it} canRaise={canRaise(it.kind)} canAlloc={canAlloc(it.kind)} onAllocate={onAllocate} onRelease={onRelease} onRolls={onRolls} onRaise={onRaise} /></td>}
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

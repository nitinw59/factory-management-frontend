// Pocketing & lining (20 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Pocketing and lining fabric"). Pocketing / lining is
// issued by metres and laid once per sales order per tone in its own lay (own marker: layer length, plies, pieces per ply
// per part × size). Its pieces go into the order's pocket stock per size and are handed over with each shell batch
// (batch page). Here: the orders, and per order per fabric — what is at cutting, the stock per part × size against the
// order's need, the lays (new / cancel), and writing off what is left.
// 21 Oct 2026: Add to return slip — what is left at cutting goes onto the order's draft return slip (Material returns:
// submitted by the cutting manager, received by the fabric store); it must be back (or written off) before the order's
// fabric reconciliation. Metres on a slip are reserved (not left to lay / write off).
// 6 Nov 2026: a lay in two steps — the cut plan (marker as garments per ply per size, parts ticked, plies), printable, then the cut
// recorded with what changed; the screen sums up what the batches already cut need. Nothing kept for replacements.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Ban, Trash2, Scissors, Undo2, ClipboardList, Pencil, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPdfLetterhead, loadLetterhead } from '../components/letterhead';
import Modal from '../../shared/Modal';
import { cuttingApi } from '../api/cuttingApi';
import { materialReturnsApi } from '../api/materialReturnsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmt, useCuttingPermissions } from './cutShared';

const IN_TO = { m: 0.0254, yd: 1 / 36 };
const r3 = (n) => Math.round(n * 1000) / 1000;

// Suggested plies and waste for a lay (20 Oct 2026; 6 Nov 2026: nothing kept for replacements): as soon as the layer length is
// typed. Plies = the fewest that cover what the order still needs with the marker, but no more than the pocketing at cutting
// allows; waste = plies × the end allowance at both ends (Settings → Production & quality). perCells: pieces per ply by part|size.
function suggestLay({ fabric, suggest, layer, perCells }) {
    const perIn = IN_TO[fabric.uom] || 0;
    const L = Number(layer);
    if (!(L > 0) || !perIn) return null;
    const allow = Number(suggest?.end_allowance_in ?? 1);
    const endPerPly = 2 * allow * perIn;                       // waste per ply (fabric unit)
    const left = Number(fabric.balance.left || 0);
    const maxPlies = Math.max(0, Math.floor(left / (L * perIn + endPerPly) + 1e-9));
    let needPlies = 0;
    for (const c of fabric.cells) {
        const per = Number(perCells[`${c.part_id}|${c.size_id}`]);
        if (per > 0 && c.to_cut > 0) needPlies = Math.max(needPlies, Math.ceil(c.to_cut / per));
    }
    const plies = needPlies ? Math.min(needPlies, maxPlies) : maxPlies;
    const short = needPlies > maxPlies ? r3((needPlies - maxPlies) * (L * perIn + endPerPly)) : 0;
    return { plies, maxPlies, needPlies, waste: r3(plies * endPerPly), allow, short };
}

// A number with how it was worked out, on mouse hover (6 Nov 2026, owner).
const Why = ({ why, children, className = '' }) => <span title={why} className={`cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2 ${className}`}>{children}</span>;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// The cut plan on paper for the cutting table: order, lay no., layer, marker in garments per size, pieces per part, plies per fabric.
async function printPlan({ order, layNo, layer, notes, sizes, garments, parts, rows }) {
    const lh = await loadLetterhead().catch(() => null);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = drawPdfLetterhead(doc, lh, { title: 'POCKETING CUT PLAN', note: 'To cut, then record the cut' });
    if (y < 10) { doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.text('POCKETING CUT PLAN', W / 2, 14, { align: 'center' }); y = 20; }
    doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text(`${order.order_no} · lay ${layNo}`, 8, y + 2); doc.setFont(undefined, 'normal');
    doc.setFontSize(9); doc.text(`${order.customer_name} · layer length ${layer} in${notes ? ` · ${notes}` : ''}`, 8, y + 7);
    const used = sizes.filter(sz => Number(garments[sz.id]) > 0);
    const T = { theme: 'grid', styles: { fontSize: 9, cellPadding: 1.5 }, headStyles: { fillColor: [226, 232, 240], textColor: 20 }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' }, margin: { left: 8, right: 8 } };
    autoTable(doc, { ...T, startY: y + 11, head: [['Marker: garments per ply', ...used.map(sz => sz.name), 'Total']],
        body: [['Garments', ...used.map(sz => Number(garments[sz.id])), used.reduce((a, sz) => a + Number(garments[sz.id]), 0)],
            ...parts.map(pp => [`${pp.part_name} (${pp.per_garment} per garment)`, ...used.map(sz => Number(garments[sz.id]) * pp.per_garment), used.reduce((a, sz) => a + Number(garments[sz.id]) * pp.per_garment, 0)])] });
    autoTable(doc, { ...T, startY: doc.lastAutoTable.finalY + 5, head: [['Fabric', 'Plies', 'Planned metres', 'Pieces this lay', 'Plies cut', 'Notes']],
        body: rows.map(r => [r.label, r.plies, `${fmt(r.metres)} ${r.uom}`, r.pieces, '', '']),
        foot: [['Total', rows.reduce((a, r) => a + Number(r.plies), 0), '', rows.reduce((a, r) => a + r.pieces, 0), '', '']] });
    const by = doc.lastAutoTable.finalY + 22;
    doc.setDrawColor(120); [['Planned by', 8], ['Cut by', W / 2 + 4]].forEach(([t, x]) => { doc.line(x, by, x + W / 2 - 16, by); doc.text(t, x, by + 4); });
    doc.save(`CutPlan-${order.order_no.replace(/[^\w-]+/g, '-')}-lay${layNo}.pdf`);
}

// A saved plan back on paper: its marker as garments per size, its parts and every fabric stacked in it.
function printSavedPlan(order, fabrics, sizes, l) {
    const allParts = [...new Map(fabrics.flatMap(x => x.parts).map(pp => [pp.part_id, pp])).values()];
    const garments = {};
    for (const c of l.cells) { const pp = allParts.find(x => x.part_id === c.part_id); if (pp && !garments[c.size_id]) garments[c.size_id] = Math.round(c.per_ply / (pp.per_garment || 1)); }
    const parts = allParts.filter(pp => l.cells.some(c => c.part_id === pp.part_id));
    const rows = fabrics.flatMap(x => x.lays.filter(y => y.lay_no === l.lay_no && y.status === 'PLANNED').map(y => ({ label: x.label, uom: x.uom, plies: y.plies, metres: y.laid, pieces: y.cells.reduce((a, c) => a + c.pieces, 0) })));
    return printPlan({ order, layNo: l.lay_no, layer: l.layer_length_in, notes: l.notes, sizes, garments, parts, rows });
}

// ── Order view pieces (17 Nov 2026, owner: "improve ui and ux with summary information of each table") ──────────────────
const LAY_STATUS = {
    CUT: { label: 'Cut', cls: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
    PLANNED: { label: 'Planned', cls: 'border-amber-300 bg-amber-100 text-amber-900' },
    CANCELLED: { label: 'Cancelled', cls: 'border-slate-300 bg-slate-50 text-slate-500' },
};
const nI = (v) => Number(v || 0).toLocaleString("en-IN");   // piece counts: 12,000
const sumBy = (list, k) => list.reduce((a, c) => a + (Number(c[k]) || 0), 0);
// A fabric's pieces over every part × size.
const fabricTotals = (f) => ({ need: sumBy(f.cells, 'need'), batch_need: sumBy(f.cells, 'batch_need'), cut: sumBy(f.cells, 'cut'), handed: sumBy(f.cells, 'handed'),
    replaced: sumBy(f.cells, 'replaced'), left: sumBy(f.cells, 'left'), to_cut: sumBy(f.cells, 'to_cut') });
const shortLabel = (f) => (f.label || '').split(' · ').slice(-1)[0] || f.label;
const layBySize = (l, sizes) => {
    const by = new Map();
    for (const c of l.cells) by.set(c.size_id, (by.get(c.size_id) || 0) + c.pieces);
    return sizes.filter(s => by.has(s.id)).map(s => `${s.name}: ${by.get(s.id)}`).join(' · ') || 'no pieces';
};

// Top of the order: one row per pocketing / lining fabric — pieces against the order, metres at cutting, lays. Click to open it.
function OrderSummary({ d, active, onPick }) {
    const rows = d.fabrics.map(f => ({ f, t: fabricTotals(f), cut: f.lays.filter(l => l.status === 'CUT').length, planned: f.lays.filter(l => l.status === 'PLANNED').length }));
    const tot = rows.reduce((a, r) => { for (const k of Object.keys(r.t)) a[k] = (a[k] || 0) + r.t[k]; return a; }, {});
    const uoms = [...new Set(d.fabrics.map(f => f.uom))];
    const num = 'px-2 py-2 text-right tabular-nums';
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
            <p className="px-4 pt-3 pb-1 text-xs font-black uppercase tracking-wider text-slate-500">Summary — pieces of every pocket / lining part</p>
            <table className="w-full text-sm min-w-[820px]">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr><th className="px-4 py-2">Fabric</th><th className="px-2 py-2 text-right">Order needs</th><th className="px-2 py-2 text-right" title="What the shell batches already cut need">Batches cut need</th><th className="px-2 py-2 text-right">Cut</th><th className="px-2 py-2 text-right">Handed</th><th className="px-2 py-2 text-right">In stock</th><th className="px-2 py-2 text-right">Still to cut</th><th className="px-2 py-2 text-right">At cutting</th><th className="px-4 py-2 text-right">Lays</th></tr>
                </thead>
                <tbody>{rows.map(({ f, t, cut, planned }) => (
                    <tr key={f.item_id} onClick={() => onPick(f.item_id)} className={`border-t border-slate-100 cursor-pointer hover:bg-indigo-50/40 ${active === f.item_id && d.fabrics.length > 1 ? 'bg-indigo-50/60' : ''}`}>
                        <td className="px-4 py-2 font-semibold">{f.label}</td>
                        <td className={num}>{nI(t.need)}</td><td className={num}>{nI(t.batch_need)}</td><td className={num}>{nI(t.cut)}</td><td className={num}>{nI(t.handed)}</td>
                        <td className={`${num} font-semibold`}>{nI(t.left)}</td>
                        <td className={`${num} font-bold ${t.to_cut ? 'text-rose-700' : 'text-emerald-700'}`}>{t.to_cut ? nI(t.to_cut) : '✓'}</td>
                        <td className={`${num} whitespace-nowrap`}>{fmt(f.balance.left)} {f.uom}</td>
                        <td className="px-4 py-2 text-right text-xs whitespace-nowrap">{cut} cut{planned ? <span className="ml-1 font-bold text-amber-800">· {planned} planned</span> : ''}</td>
                    </tr>
                ))}</tbody>
                {rows.length > 1 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-black text-slate-700">
                        <tr><td className="px-4 py-2">Total · {rows.length} fabrics</td>
                            {['need', 'batch_need', 'cut', 'handed', 'left'].map(k => <td key={k} className={num}>{nI(tot[k])}</td>)}
                            <td className={`${num} ${tot.to_cut ? 'text-rose-700' : 'text-emerald-700'}`}>{tot.to_cut ? nI(tot.to_cut) : '✓'}</td>
                            <td className={`${num} whitespace-nowrap`}>{uoms.length === 1 ? `${fmt(sumBy(d.fabrics.map(f => f.balance), 'left'))} ${uoms[0]}` : '—'}</td>
                            <td className="px-4 py-2 text-right">{rows.reduce((a, r) => a + r.cut, 0)} cut{rows.some(r => r.planned) ? ` · ${rows.reduce((a, r) => a + r.planned, 0)} planned` : ''}</td></tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}

// Stock per part × size as a grid: sizes across, figures down, a Total column. Parts with the same figures (front and back
// pockets, as a rule) share one block — "each".
function StockGrid({ f, sizes }) {
    const partIds = [...new Set(f.cells.map(c => c.part_id))];
    const sig = (pid) => JSON.stringify(f.cells.filter(c => c.part_id === pid).map(c => [c.size_id, c.need, c.batch_need, c.cut, c.handed, c.replaced, c.left, c.to_cut]));
    const groups = [];
    for (const pid of partIds) {
        const g = groups.find(x => x.sig === sig(pid));
        const name = f.cells.find(c => c.part_id === pid)?.part_name;
        if (g) g.names.push(name); else groups.push({ sig: sig(pid), pid, names: [name] });
    }
    const sizeList = sizes.filter(s => f.cells.some(c => c.size_id === s.id));
    const rows = [
        ['need', 'Order needs'], ['batch_need', 'Batches cut need'], ['cut', 'Cut'], ['handed', 'Handed with batches'],
        ...(f.cells.some(c => c.replaced) ? [['replaced', 'Replaced']] : []), ['left', 'In stock'], ['to_cut', 'Still to cut'],
    ];
    if (!f.cells.length) return <p className="text-sm text-slate-400">No pocket / lining parts for this fabric on the order.</p>;
    return (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-1.5 text-left">Pieces</th>{sizeList.map(s => <th key={s.id} className="px-2 py-1.5 text-right">{s.name}</th>)}<th className="px-3 py-1.5 text-right">Total</th></tr></thead>
                {groups.map(g => {
                    const cellOf = (sid) => f.cells.find(c => c.part_id === g.pid && c.size_id === sid);
                    return (
                        <tbody key={g.pid}>
                            <tr className="border-t-2 border-slate-200 bg-indigo-50/50"><td className="px-3 py-1.5 font-bold text-slate-800" colSpan={sizeList.length + 2}>{g.names.join(' · ')}{g.names.length > 1 && <span className="ml-1 text-xs font-normal text-slate-500">(each — same figures)</span>}</td></tr>
                            {rows.map(([k, label]) => {
                                const total = sizeList.reduce((a, s) => a + (cellOf(s.id)?.[k] || 0), 0);
                                const strong = k === 'left' || k === 'to_cut';
                                return (
                                    <tr key={k} className={`border-t border-slate-100 tabular-nums ${k === 'to_cut' ? 'bg-slate-50/60' : ''}`}>
                                        <td className={`px-3 py-1 text-left whitespace-nowrap ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{label}</td>
                                        {sizeList.map(s => {
                                            const c = cellOf(s.id);
                                            const v = c?.[k] || 0;
                                            if (k === 'to_cut') return <td key={s.id} className={`px-2 py-1 text-right ${v ? 'font-bold text-rose-700' : 'text-emerald-700'}`}>{c ? (v || '✓') : '—'}</td>;
                                            if (k === 'batch_need' && c?.batches?.length) return <td key={s.id} className="px-2 py-1 text-right"><Why why={c.batches.map(b => `#${b.floor_no}: ${b.garments} garments → ${b.need} needed, ${b.handed} handed${b.finalised ? '' : ' (cutting)'}`).join('\n')}>{v}</Why></td>;
                                            return <td key={s.id} className={`px-2 py-1 text-right ${strong ? 'font-semibold' : ''} ${!c ? 'text-slate-300' : ''}`}>{c ? nI(v) : '—'}</td>;
                                        })}
                                        <td className={`px-3 py-1 text-right font-bold ${k === 'to_cut' ? (total ? 'text-rose-700' : 'text-emerald-700') : ''}`}>{k === 'to_cut' && !total ? '✓' : nI(total)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    );
                })}
            </table>
        </div>
    );
}

function OrderList() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { cuttingApi.pocketing().then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))); }, []);
    return (
        <div>
            <PageHeader title="Pocketing & lining" subtitle="Issued by metres, laid once per order per tone in its own lay; its pieces are counted per size and handed over with each shell batch." />
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No approved order has pocketing / lining fabric (BOM lines cutting Pocket / Lining parts).</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Fabric</th><th className="px-3 py-2 text-right">At cutting</th><th className="px-3 py-2 text-right">Pieces cut</th><th className="px-3 py-2 text-right">Handed</th><th className="px-3 py-2 text-right">In stock</th></tr></thead>
                        <tbody>{rows.flatMap(o => o.fabrics.map((f, i) => (
                            <tr key={`${o.id}|${f.id}`} className="border-t border-slate-100">
                                <td className="px-3 py-2">{i === 0 && <Link to={`/v3/cutting/pocketing?order=${o.id}`} className="font-bold text-indigo-700 hover:underline">{o.order_no}</Link>}{i === 0 && <span className="block text-xs text-slate-500">{o.customer_name}</span>}</td>
                                <td className="px-3 py-2">{f.label}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(f.balance.left)} {f.uom}<span className="block text-[11px] text-slate-400">of {fmt(f.balance.issued)} issued</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{f.cut}</td><td className="px-3 py-2 text-right tabular-nums">{f.handed}</td><td className="px-3 py-2 text-right tabular-nums font-semibold">{f.left}</td>
                            </tr>
                        )))}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// One lay (20 Oct 2026): one layer length and marker; one or several of the order's pocketing / lining fabrics stacked in it
// (e.g. Black + Fawn plies together) — per fabric its plies and waste (suggested, editable). 6 Nov 2026: the marker in garments per
// ply per size (pieces worked out per part), parts ticked, a summary against the order and the batches already cut; saved as a
// cut plan (new / change), or its cut recorded (edit.mode 'record') — only then do metres and pieces move.
function LayDialog({ order, fabrics, startId, sizes, suggest, edit, onClose, onSaved }) {
    const planned = edit ? fabrics.flatMap(x => x.lays.filter(l => l.lay_no === edit.layNo && l.status === 'PLANNED').map(l => ({ fab: x, l }))) : [];
    const first = planned[0]?.l;
    const allParts = [...new Map(fabrics.flatMap(x => x.parts).map(pp => [pp.part_id, pp])).values()];
    // a planned lay back as garments per size and the parts it cuts
    const initial = () => {
        if (!first) return { layer: '', notes: '', garments: {}, parts: new Set(allParts.map(pp => pp.part_id)) };
        const garments = {}; const parts = new Set();
        for (const c of first.cells) { const pp = allParts.find(x => x.part_id === c.part_id); parts.add(c.part_id); if (pp && !garments[c.size_id]) garments[c.size_id] = String(Math.round(c.per_ply / (pp.per_garment || 1))); }
        return { layer: String(first.layer_length_in), notes: first.notes || '', garments, parts };
    };
    const [f, setF] = useState(initial);
    const [rows, setRows] = useState(() => Object.fromEntries(fabrics.map(x => {
        const p = planned.find(y => y.fab.item_id === x.item_id);
        return [x.item_id, p ? { on: true, plies: String(p.l.plies), waste: String(p.l.waste || ''), tp: true, tw: true } : { on: !edit && x.item_id === startId, plies: '', waste: '', tp: false, tw: false }];
    })));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const on = fabrics.filter(x => rows[x.item_id]?.on);
    const perIn = (fab) => IN_TO[fab.uom] || 0;
    const parts = [...new Map(on.flatMap(x => x.parts).map(pp => [pp.part_id, pp])).values()];
    const ticked = parts.filter(pp => f.parts.has(pp.part_id));
    // pieces per ply by part|size: garments × the part's pieces per garment
    const perCellsOf = (nf) => Object.fromEntries(parts.filter(pp => nf.parts.has(pp.part_id)).flatMap(pp => sizes.map(sz => [`${pp.part_id}|${sz.id}`, (Number(nf.garments[sz.id]) || 0) * (pp.per_garment || 1)])));
    // Plies / waste of each stacked fabric filled in from its suggestion (unless typed by hand).
    const refill = (nextF, nextRows) => {
        const out = { ...nextRows };
        for (const fab of fabrics) {
            const rw = out[fab.item_id];
            if (!rw?.on) continue;
            const sg = suggestLay({ fabric: fab, suggest, layer: nextF.layer, perCells: perCellsOf(nextF) });
            if (!sg) continue;
            const plies = rw.tp ? rw.plies : (sg.plies > 0 ? String(sg.plies) : '');
            const waste = rw.tw ? rw.waste : (Number(plies) > 0 ? String(r3(Number(plies) * 2 * sg.allow * perIn(fab))) : '');
            out[fab.item_id] = { ...rw, plies, waste };
        }
        return out;
    };
    const change = (nextF, nextRows = rows) => { setF(nextF); setRows(refill(nextF, nextRows)); };
    const setRow = (id, patch) => setRows({ ...rows, [id]: { ...rows[id], ...patch } });
    const togglePart = (pid) => { const nx = new Set(f.parts); if (nx.has(pid)) nx.delete(pid); else nx.add(pid); change({ ...f, parts: nx }); };
    const laidOf = (fab) => { const rw = rows[fab.item_id]; return Number(f.layer) > 0 && Number(rw.plies) > 0 ? r3(Number(f.layer) * Number(rw.plies) * perIn(fab)) : 0; };
    const garmentsPerPly = sizes.reduce((a, sz) => a + (Number(f.garments[sz.id]) || 0), 0);
    const piecesOf = (fab) => fab.parts.filter(pp => f.parts.has(pp.part_id)).reduce((a, pp) => a + sizes.reduce((b2, sz) => b2 + (Number(f.garments[sz.id]) || 0) * (pp.per_garment || 1), 0), 0) * (Number(rows[fab.item_id].plies) || 0);
    const ready = Number(f.layer) > 0 && on.length > 0 && on.every(x => Number(rows[x.item_id].plies) > 0) && garmentsPerPly > 0 && ticked.length > 0;
    const body = () => ({ layer_length_in: Number(f.layer), notes: f.notes || undefined, garments: sizes.filter(sz => Number(f.garments[sz.id]) > 0).map(sz => ({ size_id: sz.id, per_ply: Number(f.garments[sz.id]) })),
        parts: ticked.map(pp => pp.part_id), fabrics: on.map(x => ({ fabric_item_id: x.item_id, plies: Number(rows[x.item_id].plies), waste_m: rows[x.item_id].waste === '' ? 0 : Number(rows[x.item_id].waste) })) });
    const mode = edit?.mode || 'new';
    const save = async () => {
        setBusy(true); setError('');
        try {
            const r = mode === 'record' ? await cuttingApi.recordCut(edit.layId, body()) : mode === 'change' ? await cuttingApi.changePlan(edit.layId, body()) : await cuttingApi.createLay(order.id, { ...body(), plan: true });
            onSaved(r.data, mode);
        } catch (err) { setError(apiError(err, 'Failed to save the lay.')); setBusy(false); }
    };
    const print = () => printPlan({ order, layNo: edit?.layNo || '(not saved yet)', layer: f.layer, notes: f.notes, sizes, garments: f.garments, parts: ticked,
        rows: on.map(x => ({ label: x.label, uom: x.uom, plies: rows[x.item_id].plies, metres: laidOf(x), pieces: piecesOf(x) })) });
    const title = mode === 'record' ? `Record the cut — lay ${edit.layNo}, ${order.order_no}` : mode === 'change' ? `Change the plan — lay ${edit.layNo}, ${order.order_no}` : `New lay — ${order.order_no}`;
    return (
        <Modal title={title} onClose={onClose}>
            <div className="space-y-3 w-[min(940px,95vw)] max-h-[84vh] overflow-y-auto">
                <p className="text-sm text-slate-600">{mode === 'record' ? 'Correct anything that changed on the table: plies, waste, garments per size. Recording the cut takes the metres from cutting and puts the pockets into the order\'s pocket stock.' : 'Save the cut plan for the table; nothing moves yet. After cutting, open the plan and record the cut with what changed.'} Tick every pocketing / lining fabric laid together (e.g. Black and Fawn plies stacked).</p>
                <div className="flex flex-wrap gap-2">{fabrics.map(x => (
                    <label key={x.item_id} className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${rows[x.item_id]?.on ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                        <input type="checkbox" className="w-4 h-4" checked={Boolean(rows[x.item_id]?.on)} onChange={e => change(f, { ...rows, [x.item_id]: { ...rows[x.item_id], on: e.target.checked } })} />
                        <span className="font-semibold">{x.label}</span><span className="text-xs text-slate-500">{fmt(x.balance.left)} {x.uom} at cutting</span>
                    </label>
                ))}</div>
                <div className="grid sm:grid-cols-3 gap-3">
                    <Field label="Layer length (in) *"><input className={inputCls} type="number" min="0" step="0.01" value={f.layer} onChange={e => change({ ...f, layer: e.target.value })} autoFocus /></Field>
                    <div className="sm:col-span-2"><Field label="Notes"><input className={inputCls} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="e.g. marker no." /></Field></div>
                </div>
                {parts.length > 0 && (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase"><tr><th className="px-2 py-1.5 text-left">Marker</th>{sizes.map(sz => <th key={sz.id} className="px-2 py-1.5 text-center">{sz.name}</th>)}<th className="px-2 py-1.5 text-right">Total</th></tr></thead>
                            <tbody>
                                <tr className="border-t border-slate-100 bg-indigo-50/40">
                                    <td className="px-2 py-1.5 font-black whitespace-nowrap">Garments per ply *</td>
                                    {sizes.map(sz => <td key={sz.id} className="px-1 py-1.5 text-center"><input type="number" min="0" step="1" className="w-16 px-2 py-1 text-right border border-indigo-300 rounded font-bold" value={f.garments[sz.id] ?? ''} aria-label={`Garments per ply ${sz.name}`} onChange={e => change({ ...f, garments: { ...f.garments, [sz.id]: e.target.value } })} /></td>)}
                                    <td className="px-2 py-1.5 text-right font-black tabular-nums">{garmentsPerPly}</td>
                                </tr>
                                {parts.map(pp => {
                                    const inMarker = f.parts.has(pp.part_id);
                                    return (
                                        <tr key={pp.part_id} className={`border-t border-slate-100 ${inMarker ? '' : 'opacity-50'}`}>
                                            <td className="px-2 py-1.5 whitespace-nowrap"><label className="inline-flex items-center gap-1.5 font-semibold"><input type="checkbox" checked={inMarker} onChange={() => togglePart(pp.part_id)} aria-label={`${pp.part_name} in this marker`} />{pp.part_name}</label><span className="block pl-5 text-[11px] text-slate-500">{pp.per_garment} per garment · pieces per ply</span></td>
                                            {sizes.map(sz => <td key={sz.id} className="px-2 py-1.5 text-center tabular-nums text-slate-700">{inMarker && Number(f.garments[sz.id]) > 0 ? Number(f.garments[sz.id]) * (pp.per_garment || 1) : '—'}</td>)}
                                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{inMarker ? garmentsPerPly * (pp.per_garment || 1) : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {on.map(fab => {
                    const rw = rows[fab.item_id];
                    const sg = suggestLay({ fabric: fab, suggest, layer: f.layer, perCells: perCellsOf(f) });
                    const laid = laidOf(fab);
                    const take = r3(laid + (Number(rw.waste) || 0));
                    const plies = Number(rw.plies) || 0;
                    const cells = fab.cells.filter(c => f.parts.has(c.part_id));
                    const thisOf = (c) => (Number(f.garments[c.size_id]) || 0) * (c.per_garment || 1) * plies;
                    const sum = (fn) => cells.reduce((a, c) => a + fn(c), 0);
                    const forBatches = (c) => c.left + thisOf(c) - Math.max(0, c.batch_need - c.batch_handed);
                    // against the whole order (6 Nov 2026, owner): what is left to cut after this lay, or how far over — counting what
                    // was already cut over before this lay, not only this lay's extra
                    const forOrder = (c) => c.need - c.cut - thisOf(c);
                    const overBefore = (c) => Math.max(0, c.cut - c.need);
                    // How each figure of a row was worked out, in the row's own numbers.
                    const per = (c) => c.per_garment || 1;
                    const garmentsTyped = (c) => Number(f.garments[c.size_id]) || 0;
                    const owed = (c) => Math.max(0, c.batch_need - c.batch_handed);
                    const cutLays = (c) => fab.lays.filter(l => l.status === 'CUT').map(l => ({ l, n: l.cells.filter(x => x.part_id === c.part_id && x.size_id === c.size_id).reduce((a, x) => a + x.pieces, 0) })).filter(x => x.n);
                    const why = {
                        need: (c) => `${plural(c.need / per(c), 'garment')} ordered in size ${c.size} × ${per(c)} ${c.part_name.toLowerCase()} per garment = ${c.need}`,
                        cut: (c) => { const ls = cutLays(c); return ls.length ? `${ls.map(x => `Lay ${x.l.lay_no}: ${x.l.plies} plies × ${x.n / x.l.plies} per ply = ${x.n}`).join('\n')}\nTotal ${c.cut}` : 'No lay cut yet'; },
                        batchNeed: (c) => (c.batches.length ? `${c.batches.map(b => `#${b.floor_no ?? '—'} ${b.batch_code}${b.finalised ? '' : ' (cutting)'}: ${plural(b.garments, 'garment')} cut × ${per(c)} = ${b.need}`).join('\n')}\nTotal ${c.batch_need}` : 'No batch of this order cut yet'),
                        handed: (c) => (c.batches.length ? `${c.batches.map(b => `#${b.floor_no ?? '—'} ${b.batch_code}: ${b.handed}${b.finalised ? '' : ' (not finalised yet: pockets go with the batch at finalise)'}`).join('\n')}\nTotal ${c.batch_handed}` : 'Nothing handed: no batch cut yet'),
                        stock: (c) => `Cut ${c.cut} − handed ${c.handed} − replacements ${c.replaced}${c.adjusted ? ` ${c.adjusted > 0 ? '+' : '−'} adjusted ${Math.abs(c.adjusted)}` : ''} = ${c.left}`,
                        lay: (c) => (plies ? `${plural(garmentsTyped(c), 'garment')} per ply × ${per(c)} per garment × ${plural(plies, 'ply').replace('plys', 'plies')} = ${thisOf(c)}` : 'Enter the plies'),
                        batches: (c) => `In stock ${c.left} + this lay ${thisOf(c)} − still owed to cut batches (${c.batch_need} need − ${c.batch_handed} handed = ${owed(c)}) = ${forBatches(c)}${forBatches(c) < 0 ? ': short — a batch can\'t be finalised' : ': spare'}`,
                        order: (c) => `Order needs ${c.need} − cut so far ${c.cut} − this lay ${thisOf(c)} = ${forOrder(c)}${forOrder(c) < 0 ? ` → ${-forOrder(c)} over${overBefore(c) ? ` (${overBefore(c)} were over before this lay)` : ''}` : forOrder(c) > 0 ? ' still to cut' : ': exactly'}`,
                    };
                    return (
                        <div key={fab.item_id} className="rounded-lg border border-slate-200 p-3">
                            <p className="font-black text-slate-800 mb-2">{fab.label} <span className="text-xs font-normal text-slate-500">{fmt(fab.balance.left)} {fab.uom} at cutting</span></p>
                            <div className="grid sm:grid-cols-3 gap-3 items-end">
                                <Field label={mode === 'record' ? 'Plies cut *' : 'Plies *'}><input className={inputCls} type="number" min="1" step="1" value={rw.plies}
                                    onChange={e => { const v = e.target.value; setRow(fab.item_id, { plies: v, tp: true, ...(rw.tw || !sg ? {} : { waste: Number(v) > 0 ? String(r3(Number(v) * 2 * sg.allow * perIn(fab))) : '' }) }); }} /></Field>
                                <Field label={`Waste at the lay (${fab.uom})`}><input className={inputCls} type="number" min="0" step="any" value={rw.waste} onChange={e => setRow(fab.item_id, { waste: e.target.value, tw: true })} /></Field>
                                <p className={`text-sm pb-2 ${take > fab.balance.left + 1e-9 ? 'text-rose-700 font-bold' : 'text-slate-600'}`}>Takes <b>{fmt(take)} {fab.uom}</b> ({fmt(laid)} laid{Number(rw.waste) ? ` + ${fmt(Number(rw.waste))} waste` : ''})</p>
                            </div>
                            {sg && mode !== 'record' && (
                                <p className={`mt-2 text-sm rounded-lg border px-3 py-2 ${sg.short ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
                                    <b>Suggested {sg.plies} plies</b>: at most {sg.maxPlies} fit the fabric at cutting{sg.needPlies ? ` · ${sg.needPlies} cover what the order still needs` : ' · enter the garments per ply to fit the order'}. Waste = plies × {fmt(sg.allow)} in at each end.
                                    {sg.short > 0 && <span className="block font-bold">To cut the whole order: {sg.needPlies - sg.maxPlies} plies are missing — issue about {fmt(sg.short)} {fab.uom} of this fabric to cutting.</span>}
                                    {(rw.tp || rw.tw) && <button type="button" className="ml-1 underline font-semibold" onClick={() => change(f, { ...rows, [fab.item_id]: { ...rw, tp: false, tw: false } })}>Use the suggestion</button>}
                                </p>
                            )}
                            {cells.length > 0 && (
                                <div className="mt-2 overflow-x-auto border border-slate-200 rounded-lg">
                                    <table className="w-full text-xs min-w-[720px]">
                                        <thead className="bg-slate-50 font-bold text-slate-500 uppercase"><tr className="text-right"><th className="px-2 py-1.5 text-left">Pockets · size</th><th className="px-2 py-1.5">Order needs</th><th className="px-2 py-1.5">Cut so far</th><th className="px-2 py-1.5">Cut batches need</th><th className="px-2 py-1.5">Handed to them</th><th className="px-2 py-1.5">In stock</th><th className="px-2 py-1.5 bg-indigo-50">This lay</th><th className="px-2 py-1.5">After: for cut batches</th><th className="px-2 py-1.5">After: order still to cut / over</th></tr></thead>
                                        <tbody>{cells.map(c => (
                                            <tr key={`${c.part_id}|${c.size_id}`} className="border-t border-slate-100 text-right tabular-nums">
                                                <td className="px-2 py-1 text-left">{c.part_name} · <b>{c.size}</b></td>
                                                <td className="px-2 py-1"><Why why={why.need(c)}>{c.need}</Why></td><td className="px-2 py-1"><Why why={why.cut(c)}>{c.cut}</Why></td>
                                                <td className="px-2 py-1"><Why why={why.batchNeed(c)}>{c.batch_need}</Why></td><td className="px-2 py-1"><Why why={why.handed(c)}>{c.batch_handed}</Why></td><td className="px-2 py-1"><Why why={why.stock(c)}>{c.left}</Why></td>
                                                <td className="px-2 py-1 font-black bg-indigo-50"><Why why={why.lay(c)}>{thisOf(c)}</Why></td>
                                                <td className={`px-2 py-1 font-bold ${forBatches(c) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}><Why why={why.batches(c)}>{forBatches(c) < 0 ? `${-forBatches(c)} short` : `${forBatches(c)} spare`}</Why></td>
                                                <td className={`px-2 py-1 ${forOrder(c) > 0 ? 'text-slate-700' : forOrder(c) < 0 ? 'text-amber-700 font-bold' : 'text-emerald-700'}`}><Why why={why.order(c)}>{forOrder(c) > 0 ? `${forOrder(c)} to cut` : forOrder(c) < 0 ? <>{-forOrder(c)} over{overBefore(c) > 0 && <span className="block text-[11px] font-normal">{overBefore(c)} before this lay</span>}</> : '✓'}</Why></td>
                                            </tr>
                                        ))}</tbody>
                                        <tfoot className="border-t-2 border-slate-200 font-black text-right tabular-nums"><tr><td className="px-2 py-1 text-left">Total</td><td className="px-2 py-1">{sum(c => c.need)}</td><td className="px-2 py-1">{sum(c => c.cut)}</td><td className="px-2 py-1">{sum(c => c.batch_need)}</td><td className="px-2 py-1">{sum(c => c.batch_handed)}</td><td className="px-2 py-1">{sum(c => c.left)}</td><td className="px-2 py-1 bg-indigo-50">{sum(thisOf)}</td><td className={`px-2 py-1 ${sum(forBatches) < 0 ? 'text-rose-700' : ''}`}>{sum(c => Math.min(0, forBatches(c))) < 0 ? `${-sum(c => Math.min(0, forBatches(c)))} short` : 'covered'}</td><td className="px-2 py-1">{[sum(c => Math.max(0, forOrder(c))) > 0 ? `${sum(c => Math.max(0, forOrder(c)))} to cut` : null, sum(c => Math.max(0, -forOrder(c))) > 0 ? `${sum(c => Math.max(0, -forOrder(c)))} over` : null].filter(Boolean).join(' · ') || '✓'}</td></tr></tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
                <ErrorBox text={error} />
                <div className="flex flex-wrap justify-end gap-2"><SecondaryButton onClick={onClose}>Back</SecondaryButton>
                    <SecondaryButton onClick={print} disabled={!ready}><Printer size={14} /> Print cut plan</SecondaryButton>
                    <PrimaryButton onClick={save} busy={busy} disabled={busy || !ready}>{mode === 'record' ? <><Scissors size={14} /> Record the cut</> : <><ClipboardList size={14} /> {mode === 'change' ? 'Save the plan' : 'Save cut plan'}</>}</PrimaryButton></div>
            </div>
        </Modal>
    );
}

function OrderView({ orderId }) {
    const navigate = useNavigate();
    const perms = useCuttingPermissions();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [lay, setLay] = useState(null);         // { fabric, edit? } for the lay dialog
    const [ask, setAsk] = useState(null);         // { title, fields, run }
    const [vals, setVals] = useState({});
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const load = useCallback(() => cuttingApi.pocketingOrder(orderId).then(r => { setD(r.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load.'))), [orderId]);
    useEffect(() => { load(); }, [load]);
    const sizes = useMemo(() => d?.sizes || [], [d]);
    // One fabric at a time (17 Nov 2026, owner: "so much information in long vertical scroll"): ?fabric= keeps the choice.
    const [sp, setSp] = useSearchParams();
    const [showCancelled, setShowCancelled] = useState(false);
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const active = d.fabrics.find(f => f.item_id === sp.get('fabric')) || d.fabrics.find(f => fabricTotals(f).to_cut > 0 || f.lays.some(l => l.status === 'PLANNED')) || d.fabrics[0];
    const pickFabric = (id) => { const n = new URLSearchParams(sp); n.set('fabric', id); setSp(n, { replace: true }); };
    const runAsk = async () => {
        setBusy(true); setFormError('');
        try { const r = await ask.run(vals); if (r) setD(r.data); setAsk(null); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <div>
            <Link to="/v3/cutting/pocketing" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Pocketing & lining</Link>
            <PageHeader title={`${d.order.order_no} — pocketing & lining`} subtitle={`${d.order.customer_name}. Laid once per tone for the order; pieces counted per size and handed over with each shell batch (batch page).`} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{msg}</p>}
            {d.fabrics.length === 0 && <p className="text-sm text-slate-500">This order has no pocketing / lining fabric.</p>}
            {d.fabrics.length > 0 && <OrderSummary d={d} active={active?.item_id} onPick={pickFabric} />}
            {d.fabrics.length > 1 && (
                <div className="flex flex-wrap gap-1 mb-0 border-b border-slate-200">
                    {d.fabrics.map(f => {
                        const t = fabricTotals(f);
                        return (
                            <button key={f.item_id} type="button" onClick={() => pickFabric(f.item_id)}
                                className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${active?.item_id === f.item_id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                                {shortLabel(f)} <span className={`ml-1 text-[11px] font-black px-1.5 py-0.5 rounded ${t.to_cut ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{t.to_cut ? `${t.to_cut} to cut` : 'complete'}</span>
                            </button>
                        );
                    })}
                </div>
            )}
            {[active].filter(Boolean).map(f => {
                const lays = f.lays.filter(l => showCancelled || l.status !== 'CANCELLED');
                const cancelled = f.lays.filter(l => l.status === 'CANCELLED').length;
                const live = f.lays.filter(l => l.status !== 'CANCELLED');
                const piecesOf = (l) => l.cells.reduce((a, c) => a + c.pieces, 0);
                return (
                    <section key={f.item_id} className={`bg-white border border-slate-200 p-4 mb-4 ${d.fabrics.length > 1 ? 'rounded-b-xl border-t-0' : 'rounded-xl'}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h2 className="font-black text-slate-900">{f.label}</h2>
                            <span className="ml-auto flex flex-wrap gap-2">
                                {perms.cut && <PrimaryButton onClick={() => { setMsg(''); setLay({ fabric: f }); }}><Plus size={14} /> New lay</PrimaryButton>}
                                {perms.manage && f.balance.left > 0 && <SecondaryButton onClick={() => { setFormError(''); setVals({ metres: String(f.balance.left), reason: '' }); setAsk({ title: `Add ${f.label} to the return slip`, hint: `What is left at cutting (${fmt(f.balance.left)} ${f.uom}) goes onto this order's draft return slip. You submit the slip; it is back in the store once the fabric store receives it. It must be back (or written off) before the fabric reconciliation.`, fields: [['metres', `How much (${f.uom})`, 'number']], run: async (v) => { const r = await materialReturnsApi.draft(orderId, [{ kind: 'SUPPORT', fabric_item_id: f.item_id, qty: Number(v.metres) }]); navigate(`/v3/material-returns/${r.data.id}`); return null; } }); }}><Undo2 size={14} /> Add to return slip</SecondaryButton>}
                                {perms.manage && f.balance.left > 0 && <SecondaryButton onClick={() => { setFormError(''); setVals({ metres: String(f.balance.left), reason: '' }); setAsk({ title: `Write off ${f.label}`, hint: `What is left at cutting (${fmt(f.balance.left)} ${f.uom}) and won't be used — it shows on the fabric reconciliation.`, fields: [['metres', `How much (${f.uom})`, 'number'], ['reason', 'Reason', 'text']], run: (v) => cuttingApi.writeOffPocketing(orderId, { fabric_item_id: f.item_id, metres: Number(v.metres), reason: v.reason }) }); }}><Trash2 size={14} /> Write off what is left</SecondaryButton>}
                            </span>
                        </div>
                        {/* Fabric at cutting, one line */}
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-sm">
                            {[['Issued', f.balance.issued], ['Laid', f.balance.laid], ['Waste', f.balance.waste], ['Written off', f.balance.written_off], ...(f.balance.on_return > 0 ? [['On a return slip', f.balance.on_return]] : []), ['At cutting', f.balance.left]].map(([k, v]) => (
                                <span key={k} className={k === 'At cutting' ? 'font-black text-indigo-800' : 'text-slate-600'}>{k} <b className="tabular-nums">{fmt(v)} {f.uom}</b></span>
                            ))}
                        </div>
                        <StockGrid f={f} sizes={sizes} />
                        <div className="flex flex-wrap items-baseline gap-2 mt-4 mb-1">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Lays</p>
                            {cancelled > 0 && <button type="button" className="text-xs font-semibold text-indigo-700 hover:underline" onClick={() => setShowCancelled(v => !v)}>{showCancelled ? 'Hide' : 'Show'} {plural(cancelled, 'cancelled lay')}</button>}
                        </div>
                        {f.lays.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
                            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                <table className="w-full text-sm min-w-[860px]">
                                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-2 py-1.5">Lay</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5 text-right">Plies</th><th className="px-2 py-1.5 text-right">Layer</th><th className="px-2 py-1.5 text-right">Laid</th><th className="px-2 py-1.5 text-right">Pieces</th><th className="px-2 py-1.5">Who · when</th><th className="px-2 py-1.5" /></tr></thead>
                                    <tbody>{lays.map(l => (
                                        <tr key={l.id} className={`border-t border-slate-100 align-top ${l.status === 'CANCELLED' ? 'text-slate-400' : l.status === 'PLANNED' ? 'bg-amber-50/60' : ''}`}>
                                            <td className="px-2 py-1.5 font-bold whitespace-nowrap">Lay {l.lay_no}{l.stacked_with && <span className="block text-[11px] font-semibold text-indigo-700">+ {l.stacked_with}</span>}</td>
                                            <td className="px-2 py-1.5"><span className={`text-[11px] font-black px-1.5 py-0.5 rounded border ${LAY_STATUS[l.status]?.cls || ''}`}>{LAY_STATUS[l.status]?.label || l.status}</span>{l.cancel_reason && <span className="block text-[11px] mt-0.5">{l.cancel_reason}</span>}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{l.plies}{l.status === 'CUT' && l.planned_plies && l.planned_plies !== l.plies ? <span className="block text-[11px] text-slate-500">planned {l.planned_plies}</span> : ''}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(l.layer_length_in)} in</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmt(l.laid)} {f.uom}{l.waste ? <span className="block text-[11px] text-slate-500">+ {fmt(l.waste)} waste</span> : ''}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums"><Why why={layBySize(l, sizes)} className="font-semibold">{nI(piecesOf(l))}</Why></td>
                                            <td className="px-2 py-1.5 text-xs text-slate-500">{l.planned_by_name ? `planned by ${l.planned_by_name}` : l.created_by_name}{l.cut_by_name ? ` · cut by ${l.cut_by_name}` : ''}<span className="block">{new Date(l.cut_at || l.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{l.notes ? ` · ${l.notes}` : ''}</span></td>
                                            <td className="px-2 py-1.5 text-right">
                                {perms.cut && l.status === 'PLANNED' && (
                                    <span className="flex flex-wrap justify-end gap-2">
                                        <PrimaryButton onClick={() => { setMsg(''); setLay({ fabric: f, edit: { mode: 'record', layNo: l.lay_no, layId: l.id } }); }}><Scissors size={14} /> Record the cut</PrimaryButton>
                                        <SecondaryButton onClick={() => { setMsg(''); setLay({ fabric: f, edit: { mode: 'change', layNo: l.lay_no, layId: l.id } }); }}><Pencil size={14} /> Change plan</SecondaryButton>
                                        <SecondaryButton onClick={() => printSavedPlan(d.order, d.fabrics, sizes, l)}><Printer size={14} /> Print plan</SecondaryButton>
                                        <button type="button" className="text-xs font-bold text-rose-700 hover:underline" onClick={() => { setFormError(''); setVals({ reason: '' }); setAsk({ title: `Drop the plan for lay ${l.lay_no}`, hint: 'Nothing was cut from it, so nothing moves. The plan stays listed, marked cancelled.', fields: [['reason', 'Reason', 'text']], run: (v) => cuttingApi.dropPlan(l.id, v.reason) }); }}><Ban size={12} className="inline" /> Drop plan</button>
                                    </span>
                                )}
                                {perms.manage && l.status === 'CUT' && (l.cancel_blocked
                                    ? <span title={l.cancel_blocked} className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 cursor-help"><Ban size={12} /> Can't undo</span>
                                    : <button type="button" className="text-xs font-bold text-rose-700 hover:underline" onClick={() => { setFormError(''); setVals({ reason: '' }); setAsk({ title: `Undo lay ${l.lay_no}`, hint: `Its pieces come out of the pocket stock and its metres go back to At cutting. Only if this lay wasn't really cut: if it was, record it again straight away, or the metres will show as fabric that no longer exists. The order's fabric report is marked outdated.${l.stacked_with ? ` The whole lay is undone — ${l.stacked_with} too.` : ''}`, fields: [['reason', 'Reason', 'text']], run: (v) => cuttingApi.cancelLay(l.id, v.reason) }); }}><Ban size={12} className="inline" /> Undo lay</button>)}
                                            </td>
                                        </tr>
                                    ))}</tbody>
                                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-bold text-slate-700">
                                        <tr><td className="px-2 py-1.5" colSpan={2}>Total · {plural(live.filter(l => l.status === 'CUT').length, 'lay')} cut{live.some(l => l.status === 'PLANNED') ? `, ${live.filter(l => l.status === 'PLANNED').length} planned` : ''}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{live.reduce((a, l) => a + l.plies, 0)}</td><td />
                                            <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmt(live.reduce((a, l) => a + l.laid, 0))} {f.uom}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{nI(live.reduce((a, l) => a + piecesOf(l), 0))}</td><td colSpan={2} /></tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                        {f.writeoffs.length > 0 && <p className="text-xs text-slate-500 mt-2">Written off: {f.writeoffs.map(w => `${fmt(w.metres)} ${f.uom} (${w.reason})`).join(' · ')}</p>}
                    </section>
                );
            })}
            {d.batches.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <p className="px-4 pt-3 pb-1 font-black text-slate-800">Shell batches — pieces handed over with each <span className="text-xs font-normal text-slate-500">(finalised batches; a batch still cutting takes its pieces when finalised)</span></p>
                    <table className="w-full text-sm min-w-[520px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-4 py-1.5">Batch</th><th className="px-2 py-1.5 text-right">Pieces needed</th><th className="px-2 py-1.5 text-right">Handed</th><th className="px-4 py-1.5 text-right">Short</th></tr></thead>
                        <tbody>{[...d.batches].sort((a, b) => (a.floor_no || 0) - (b.floor_no || 0)).map(b => (
                            <tr key={b.id} className="border-t border-slate-100">
                                <td className="px-4 py-1.5"><Link to={`/v3/cutting/batches/${b.id}`} className="font-semibold text-indigo-700 hover:underline"><b className="text-slate-900">#{b.floor_no}</b> {b.batch_code}</Link></td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{nI(b.need)}</td><td className="px-2 py-1.5 text-right tabular-nums">{nI(b.handed)}</td>
                                <td className={`px-4 py-1.5 text-right tabular-nums font-bold ${b.handed < b.need ? 'text-rose-700' : 'text-emerald-700'}`}>{b.handed < b.need ? nI(b.need - b.handed) : '✓'}</td>
                            </tr>
                        ))}</tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-xs font-bold text-slate-700"><tr><td className="px-4 py-1.5">Total · {d.batches.length} batch{d.batches.length === 1 ? '' : 'es'}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{nI(d.batches.reduce((a, b) => a + b.need, 0))}</td><td className="px-2 py-1.5 text-right tabular-nums">{nI(d.batches.reduce((a, b) => a + b.handed, 0))}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums">{nI(d.batches.reduce((a, b) => a + Math.max(0, b.need - b.handed), 0)) === '0' ? '✓' : nI(d.batches.reduce((a, b) => a + Math.max(0, b.need - b.handed), 0))}</td></tr></tfoot>
                    </table>
                </section>
            )}
            {lay && <LayDialog order={d.order} fabrics={d.fabrics} startId={lay.fabric.item_id} edit={lay.edit} sizes={sizes} suggest={d.suggest} onClose={() => setLay(null)}
                onSaved={(r, mode) => { setLay(null); setD(r); setMsg([mode === 'record' ? `Lay ${r.lay_no}: cut recorded.` : `Lay ${r.lay_no}: cut plan saved. Print plan for the table; after cutting, Record the cut.`, r.warning, r.outdated?.length ? `The order's fabric report (run ${r.outdated.join(', ')}) is now outdated — generate it again.` : ''].filter(Boolean).join(' ')); }} />}
            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(460px,92vw)]">
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        {ask.fields.map(([k, label, type]) => <Field key={k} label={label}><input className={inputCls} type={type} value={vals[k] ?? ''} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></Field>)}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton><PrimaryButton onClick={runAsk} busy={busy} disabled={busy || ask.fields.some(([k]) => !(ask.optional || []).includes(k) && !String(vals[k] ?? '').trim())}>Save</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

export default function PocketingPage() {
    const [sp] = useSearchParams();
    const order = sp.get('order');
    return order ? <OrderView orderId={order} /> : <OrderList />;
}

// Shared bits for 3.0 cutting: status labels, the order grid (planned / cut / to cut per colour × size).
// The lay sheet and cut sheet PDFs are in cutPrint.js (17 Oct 2026).
import { useEffect, useState } from 'react';
import { cuttingApi } from '../api/cuttingApi';
import { TONE } from '../components/Section';

export const CUT_STATUS = {
    DRAFT:     { label: 'Draft',     cls: 'bg-slate-50 text-slate-600 border-slate-300' },
    CUTTING:   { label: 'Cutting',   cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    CUT:       { label: 'Cut — to numbering', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-300' },
};
// Layer length is in inches; a roll counts in its fabric's unit (m or yd; kg has no lay length).
export const LEN_PER_IN = { m: 0.0254, yd: 1 / 36 };
export const IN_TO_M = LEN_PER_IN.m;
export const perLay = (inches, uom) => (LEN_PER_IN[uom] && Number(inches) > 0 ? Number(inches) * LEN_PER_IN[uom] : null);
export const layerText = (inches) => `${fmt(inches * LEN_PER_IN.m, 2)} m = ${fmt(inches * LEN_PER_IN.yd, 2)} yd`;
export const fmt = (v, d = 3) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: d });

export function useCuttingPermissions() {
    const [p, setP] = useState({ manage: false, cut: false, view: false, priority: false });
    useEffect(() => { cuttingApi.permissions().then(res => setP(res.data)).catch(() => {}); }, []);
    return p;
}

// Batch priority (17 Oct 2026): 1 = most urgent … 5 = lowest, 3 = normal (shown only when not normal).
export const PRIORITY = { 1: ['P1 urgent', 'bg-rose-600 text-white border-rose-600'], 2: ['P2 high', 'bg-orange-100 text-orange-800 border-orange-300'], 3: ['P3 normal', 'bg-slate-50 text-slate-600 border-slate-300'], 4: ['P4 low', 'bg-slate-50 text-slate-500 border-slate-200'], 5: ['P5 lowest', 'bg-slate-50 text-slate-400 border-slate-200'] };
export const PriorityBadge = ({ p, note, always = false }) => (p && (always || Number(p) !== 3)
    ? <span title={note || ''} className={`inline-block text-[10px] font-black px-1.5 py-0.5 rounded border align-middle ${PRIORITY[p]?.[1] || ''}`}>{PRIORITY[p]?.[0] || `P${p}`}</span> : null);

// Page sections (Section / TONE) now live in ../components/Section.jsx — re-exported for the cutting pages.
export { TONE, Section } from '../components/Section';

// Done bar for a total cell: green when complete, red when over the plan.
const DoneBar = ({ cut, planned }) => {
    const pct = planned ? Math.round((cut / planned) * 100) : 0;
    return (
        <span className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className="w-14 h-1.5 rounded-full bg-slate-200 overflow-hidden"><span className={`block h-full ${cut > planned ? 'bg-rose-500' : cut === planned && planned ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></span>
            <span className="text-[11px] font-semibold text-slate-500 w-9 text-right">{pct}%</span>
        </span>
    );
};

// planned / cut per colour × size for the order line (all batches) — 20 Oct 2026: a summary first (garments cut per
// size with the plan in grey, a Total column with % done, a Total row); tap a colour for its breakdown per size —
// planned, this batch / earlier batches (`mine`: this batch's garments per `colour|size`, already inside `cut`),
// the projection of a batch being made (`extra`, added on top) and the balance still to cut.
// `tone` tints its header / totals row; `bare` drops its own card (when it sits inside a Section).
export function OrderGrid({ grid, extra = null, mine = null, tone = 'slate', bare = false }) {
    const t0 = TONE[tone];
    const [openColour, setOpenColour] = useState(null);
    const cell = (c, s) => grid.cells.find(x => x.colour_id === c && x.size_id === s);
    const colours = grid.colours.filter(c => grid.cells.some(x => x.colour_id === c.id));
    const key = (c, s) => `${c}|${s}`;
    const numsOf = (c, s) => {
        const x = cell(c, s);
        const add = extra?.[key(c, s)] || 0;
        const own = mine?.[key(c, s)] || 0;
        const planned = x?.planned || 0;
        const cut = (x?.cut || 0) + add;
        return { has: Boolean(x || add), planned, cut, add, own, earlier: (x?.cut || 0) - own, balance: planned - cut };
    };
    const sum = (list, f) => list.reduce((s, v) => s + f(v), 0);
    const rowTotal = (c) => { const n = grid.sizes.map(s => numsOf(c, s.id)); return { cut: sum(n, x => x.cut), planned: sum(n, x => x.planned), add: sum(n, x => x.add), own: sum(n, x => x.own) }; };
    const colTotal = (s) => { const n = colours.map(c => numsOf(c.id, s)); return { cut: sum(n, x => x.cut), planned: sum(n, x => x.planned) }; };
    const all = colours.map(c => rowTotal(c.id));
    const grand = { cut: sum(all, x => x.cut), planned: sum(all, x => x.planned), add: sum(all, x => x.add), own: sum(all, x => x.own) };
    const cellTone = (cut, planned) => (cut > planned ? 'text-rose-700 font-bold' : cut === planned && planned ? 'text-emerald-700 font-semibold' : '');
    // Breakdown lines under an opened colour: [label, value per size, total, class]
    const detail = (c) => {
        const per = (f) => grid.sizes.map(s => { const n = numsOf(c, s.id); return n.has ? f(n) : null; });
        const lines = [['Planned', per(n => n.planned)]];
        if (mine) lines.push(['This batch', per(n => n.own)], ['Earlier batches', per(n => n.earlier)]);
        else lines.push(['Cut so far', per(n => n.cut - n.add)]);
        if (extra) lines.push(['This new batch', per(n => n.add), 'text-indigo-700 font-semibold']);
        lines.push(['Balance to cut', per(n => n.balance), 'font-semibold']);
        return lines.map(([label, vals, cls = '']) => [label, vals, vals.reduce((s, v) => s + (v || 0), 0), cls]);
    };
    const fmtBal = (v) => (v < 0 ? `${fmt(-v)} over` : fmt(v));
    return (
        <div className={bare ? 'overflow-x-auto' : 'bg-white border border-slate-200 rounded-xl overflow-x-auto'}>
            <table className="w-full text-sm">
                <thead className={`${t0.head} text-xs font-bold uppercase tracking-wider`}>
                    <tr><th className="px-3 py-2 text-left">Colour</th>{grid.sizes.map(s => <th key={s.id} className="px-3 py-2 text-right">{s.name}</th>)}<th className="px-3 py-2 text-right border-l border-slate-200">Total</th></tr>
                </thead>
                <tbody>
                    {colours.map((c, i) => {
                        const t = all[i];
                        const isOpen = openColour === c.id;
                        return [
                            <tr key={c.id} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => setOpenColour(isOpen ? null : c.id)}>
                                <td className="px-3 py-2 font-semibold whitespace-nowrap">
                                    <button type="button" className="inline-flex items-center gap-1 text-left" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} ${c.name} by batch`}>
                                        <span className={`inline-block text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>{c.name}
                                    </button>
                                </td>
                                {grid.sizes.map(s => {
                                    const n = numsOf(c.id, s.id);
                                    if (!n.has) return <td key={s.id} className="px-3 py-2 text-right text-slate-300">—</td>;
                                    return <td key={s.id} className={`px-3 py-2 text-right tabular-nums ${cellTone(n.cut, n.planned)} ${n.add ? 'bg-indigo-50/60' : ''}`}>{fmt(n.cut)}<span className="text-[11px] font-normal text-slate-400"> /{fmt(n.planned)}</span></td>;
                                })}
                                <td className={`px-3 py-2 text-right tabular-nums border-l border-slate-200 whitespace-nowrap ${cellTone(t.cut, t.planned)}`}>
                                    {fmt(t.cut)}<span className="text-[11px] font-normal text-slate-400"> /{fmt(t.planned)}</span>
                                    {t.add > 0 && <span className="block text-[11px] font-semibold text-indigo-700">+{fmt(t.add)} new batch</span>}
                                    <DoneBar cut={t.cut} planned={t.planned} />
                                </td>
                            </tr>,
                            ...(isOpen ? detail(c.id).map(([label, vals, total, cls]) => (
                                <tr key={`${c.id}-${label}`} className={`bg-slate-50 text-xs ${cls}`}>
                                    <td className="pl-8 pr-3 py-1 text-slate-500 font-semibold whitespace-nowrap">{label}</td>
                                    {vals.map((v, j) => <td key={j} className={`px-3 py-1 text-right tabular-nums ${label === 'Balance to cut' && v < 0 ? 'text-rose-700' : ''}`}>{v == null ? '' : label === 'Balance to cut' ? fmtBal(v) : fmt(v)}</td>)}
                                    <td className={`px-3 py-1 text-right tabular-nums border-l border-slate-200 ${label === 'Balance to cut' && total < 0 ? 'text-rose-700' : ''}`}>{label === 'Balance to cut' ? fmtBal(total) : fmt(total)}</td>
                                </tr>
                            )) : []),
                        ];
                    })}
                </tbody>
                <tfoot className={`${t0.foot} border-t-2 font-bold`}>
                    <tr>
                        <td className="px-3 py-2">Total</td>
                        {grid.sizes.map(s => { const t = colTotal(s.id); return <td key={s.id} className={`px-3 py-2 text-right tabular-nums ${cellTone(t.cut, t.planned)}`}>{fmt(t.cut)}<span className="block text-[11px] font-normal text-slate-400">of {fmt(t.planned)}</span></td>; })}
                        <td className={`px-3 py-2 text-right tabular-nums border-l border-slate-200 whitespace-nowrap ${cellTone(grand.cut, grand.planned)}`}>
                            {fmt(grand.cut)}<span className="text-[11px] font-normal text-slate-400"> /{fmt(grand.planned)}</span>
                            {mine && grand.own > 0 && <span className="block text-[11px] font-semibold text-slate-500">{fmt(grand.own)} this batch</span>}
                            {grand.add > 0 && <span className="block text-[11px] font-semibold text-indigo-700">+{fmt(grand.add)} new batch</span>}
                            <DoneBar cut={grand.cut} planned={grand.planned} />
                        </td>
                    </tr>
                </tfoot>
            </table>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Garments cut / planned (ordered + {grid.allowance_pct}% cut allowance) — tap a colour for planned, by batch and balance to cut. Red = over-cut (allowed, with a warning).</p>
        </div>
    );
}

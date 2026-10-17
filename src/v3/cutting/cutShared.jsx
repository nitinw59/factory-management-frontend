// Shared bits for 3.0 cutting: status labels, the order grid (planned / cut / to cut per colour × size).
// The lay sheet and cut sheet PDFs are in cutPrint.js (17 Oct 2026).
import { useEffect, useState } from 'react';
import { cuttingApi } from '../api/cuttingApi';

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

// planned / cut per colour × size, with an optional projection (extra garments per colour × size).
export function OrderGrid({ grid, extra = null }) {
    const cell = (c, s) => grid.cells.find(x => x.colour_id === c && x.size_id === s);
    const colours = grid.colours.filter(c => grid.cells.some(x => x.colour_id === c.id));
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr><th className="px-3 py-2 text-left">Colour</th>{grid.sizes.map(s => <th key={s.id} className="px-3 py-2 text-right">{s.name}</th>)}</tr>
                </thead>
                <tbody>
                    {colours.map(c => (
                        <tr key={c.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold">{c.name}</td>
                            {grid.sizes.map(s => {
                                const x = cell(c.id, s.id);
                                const add = extra?.[`${c.id}|${s.id}`] || 0;
                                if (!x && !add) return <td key={s.id} className="px-3 py-2 text-right text-slate-300">—</td>;
                                const cut = (x?.cut || 0) + add;
                                const planned = x?.planned || 0;
                                return (
                                    <td key={s.id} className={`px-3 py-2 text-right tabular-nums ${cut > planned ? 'text-rose-700 font-bold' : cut === planned && planned ? 'text-emerald-700 font-semibold' : ''}`}>
                                        {cut} / {planned}{add > 0 && <span className="block text-[11px] text-indigo-700">+{add} this batch</span>}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Garments cut / planned (ordered + {grid.allowance_pct}% cut allowance). Red = over-cut (allowed, with a warning).</p>
        </div>
    );
}

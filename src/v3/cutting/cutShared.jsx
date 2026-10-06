// Shared bits for 3.0 cutting: status labels, the order grid (planned / cut / to cut per colour × size), cut sheet PDF.
import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cuttingApi } from '../api/cuttingApi';

export const CUT_STATUS = {
    DRAFT:     { label: 'Draft',     cls: 'bg-slate-50 text-slate-600 border-slate-300' },
    CUTTING:   { label: 'Cutting',   cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    CUT:       { label: 'Cut — to numbering', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-300' },
};
export const IN_TO_M = 0.0254;
export const fmt = (v, d = 3) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: d });

export function useCuttingPermissions() {
    const [p, setP] = useState({ manage: false, cut: false, view: false });
    useEffect(() => { cuttingApi.permissions().then(res => setP(res.data)).catch(() => {}); }, []);
    return p;
}

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

export function exportCutSheet(b) {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(`CUT SHEET  ${b.batch_code}`, 14, 16); doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`Order ${b.line.order_no} line ${b.line.line_no} · ${b.line.customer_name} · style ${b.line.style_code} ${b.line.style_name}`, 14, 23);
    doc.text(`Numbering ${b.numbering_mode === 'MODE_2' ? 'continuous across rolls (MODE 2)' : 'per roll (MODE 1)'} · layer ${b.layer_length_in} in (${fmt(b.layer_length_in * IN_TO_M, 2)} m) · ratio ${b.ratios.map(r => `${r.size}:${r.ratio}`).join('  ')}`, 14, 28);
    autoTable(doc, {
        startY: 33, head: [['#', 'Roll', 'Lot', 'Fabric', 'Colour', 'Parts', 'Metres', 'Lays', 'End bit', 'Pieces']],
        body: b.rolls.map(r => [r.roll_sequence, r.roll_no, r.dye_lot || '', r.fabric_label, r.colour, r.parts.map(p => p.part_name).join(', '), fmt(r.metres), r.lays ?? '', r.end_bit_m ? fmt(r.end_bit_m) : '', r.pieces || '']),
        styles: { fontSize: 7.5 }, headStyles: { fillColor: [79, 70, 229] },
    });
    autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6, head: [['Colour', 'Part', 'Size', 'Pieces', 'Numbers']],
        body: b.piece_summary.map(p => [p.colour, p.part_name, p.size, p.pieces, `${p.first_no}–${p.last_no}`]),
        styles: { fontSize: 7.5 }, headStyles: { fillColor: [79, 70, 229] },
    });
    const y = doc.lastAutoTable.finalY + 18;
    doc.text('Cutting manager', 14, y); doc.text('Cutter', 90, y); doc.text('Checked by', 160, y);
    doc.save(`CutSheet-${b.batch_code.replace(/[^\w-]+/g, '-')}.pdf`);
}

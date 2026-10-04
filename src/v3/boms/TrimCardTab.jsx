// Trim card: every BOM line × garment colour, with the item each cell
// resolves to and where it came from; unresolved cells are highlighted.
// Same data gates submit / approve. Exports to PDF and Excel.
import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { SOURCE_LABEL, consumptionText, lineDetail, exportTrimCardPdf, exportTrimCardExcel } from './trimCardExport';

const SOURCE_CLS = { EXACT: 'bg-violet-100 text-violet-700', TONE: 'bg-sky-100 text-sky-700', ALL: 'bg-slate-100 text-slate-600' };

export function ProblemList({ problems, max = 50 }) {
    return (
        <ul className="text-xs text-rose-800 list-disc pl-5 space-y-0.5">
            {problems.slice(0, max).map((p, i) => (
                <li key={i}>{[p.line, p.colour].filter(Boolean).join(' / ')}{p.line || p.colour ? ': ' : ''}{p.reason}</li>
            ))}
            {problems.length > max && <li>… and {problems.length - max} more</li>}
        </ul>
    );
}

export default function TrimCardTab({ bomId, refreshKey }) {
    const [card, setCard] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        setCard(null);
        stylesApi.trimCard(bomId).then(res => setCard(res.data)).catch(err => setError(apiError(err, 'Failed to load the trim card.')));
    }, [bomId, refreshKey]);

    if (!card) return error ? <ErrorBox text={error} /> : <Loading />;
    const sizeName = new Map(card.sizes.map(s => [s.id, s.name]));

    const cell = (l, c) => {
        const x = l.cells[c.id];
        if (!x) return <td key={c.id} className="p-2 border border-slate-200" />;
        const bad = x.problems.length > 0;
        return (
            <td key={c.id} className={`p-2 border border-slate-200 align-top text-xs ${bad ? 'bg-rose-50' : ''}`}>
                {x.groups.map((g, i) => (
                    <div key={i} className={`mb-1 ${g.active ? 'text-slate-800' : 'text-rose-700 line-through'}`}>
                        {g.size_ids && <b className="text-slate-500">{g.size_ids.map(s => sizeName.get(s) || '?').join(', ')}: </b>}
                        {g.label}
                    </div>
                ))}
                {x.source && <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${SOURCE_CLS[x.source]}`}>{SOURCE_LABEL[x.source]}</span>}
                {x.problems.map((p, i) => <div key={i} className="text-rose-700 font-semibold mt-1">⚠ {p}</div>)}
            </td>
        );
    };

    const section = (title, lines) => (
        <>
            <tr><td colSpan={2 + card.colours.length} className="bg-slate-100 px-2 py-1.5 text-xs font-black uppercase tracking-wide text-slate-600 border border-slate-200">{title} ({lines.length})</td></tr>
            {lines.map(l => (
                <tr key={`${l.kind}${l.id}`}>
                    <td className="p-2 border border-slate-200 align-top">
                        <p className="text-sm font-bold text-slate-800">{l.title}</p>
                        {lineDetail(l) && <p className="text-[11px] text-slate-500">{lineDetail(l)}</p>}
                        {l.line_problems.map((p, i) => <p key={i} className="text-[11px] text-rose-700 font-semibold">⚠ {p}</p>)}
                    </td>
                    <td className="p-2 border border-slate-200 align-top text-xs text-slate-600 whitespace-nowrap">{consumptionText(l)}</td>
                    {card.colours.map(c => cell(l, c))}
                </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={2 + card.colours.length} className="p-2 text-xs text-slate-400 border border-slate-200">No lines.</td></tr>}
        </>
    );

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start gap-2">
                {card.ready ? (
                    <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} /> Every colour and size resolves to one active item.</p>
                ) : (
                    <div className="flex-1 min-w-[260px] bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-rose-800 mb-1"><AlertTriangle size={15} /> {card.problems.length} problem(s) — the BOM can't be submitted or approved until they're fixed.</p>
                        <ProblemList problems={card.problems} max={8} />
                    </div>
                )}
                <div className="ml-auto flex gap-2">
                    <SecondaryButton onClick={() => exportTrimCardPdf(card)}><FileDown size={14} /> PDF</SecondaryButton>
                    <SecondaryButton onClick={() => exportTrimCardExcel(card)}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                </div>
            </div>
            {card.warnings.map((w, i) => <p key={i} className="text-xs font-semibold text-amber-700">{w}</p>)}
            <p className="text-xs text-slate-500">Sizes: {card.sizes.map(s => s.name).join(', ') || '—'}</p>
            {card.colours.length === 0 ? <p className="text-sm text-slate-400">No garment colours on this BOM yet.</p> : (
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                        <thead>
                            <tr>
                                <th className="p-2 border border-slate-200 bg-slate-50 text-left text-xs font-bold text-slate-600 min-w-[180px]">Line</th>
                                <th className="p-2 border border-slate-200 bg-slate-50 text-left text-xs font-bold text-slate-600">Consumption</th>
                                {card.colours.map(c => (
                                    <th key={c.id} className="p-2 border border-slate-200 bg-slate-50 text-left text-xs min-w-[170px]">
                                        <span className="font-black text-slate-800">{c.name}</span>
                                        <span className="block font-normal text-slate-500">{c.tone_name ? `${c.tone_name}${c.tone_source === 'OVERRIDE' ? ' (this BOM)' : ''}` : 'no tone'}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {section('Fabric', card.fabric)}
                            {section('Trims', card.trims)}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

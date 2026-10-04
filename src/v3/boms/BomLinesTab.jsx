// BOM Lines tab: fabric lines and trim lines, each with its consumption, rule
// and item picks; colours / sizes still missing an item are flagged as gaps.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { stylesApi } from '../api/stylesApi';
import { mastersApi, apiError } from '../api/mastersApi';
import { SecondaryButton, ErrorBox, Loading, fmtQty } from '../components/ui';
import { roleLabel, ruleLabel, lineGaps } from './bomRules';
import BomLineEditor from './BomLineEditor';

const matchLabel = (it, tones, colours) => {
    if (it.match === 'ALL') return 'All';
    if (it.match === 'TONE') return tones.find(t => String(t.id) === String(it.tone_group_id))?.name || 'Tone';
    return colours.find(c => String(c.garment_colour_id) === String(it.garment_colour_id))?.name || 'Colour';
};

export default function BomLinesTab({ bom, editable, tones }) {
    const [lines, setLines] = useState(null);
    const [ref, setRef] = useState(null); // style + masters
    const [editing, setEditing] = useState(null); // { kind, line }
    const [error, setError] = useState('');

    const load = useCallback(() => stylesApi.bomLines(bom.id)
        .then(res => setLines(res.data))
        .catch(err => setError(apiError(err, 'Failed to load lines.'))), [bom.id]);

    useEffect(() => { load(); }, [load, bom.colours]);
    useEffect(() => {
        Promise.all([stylesApi.style(bom.style_id), mastersApi.fabricItems(), mastersApi.trimTypes(), mastersApi.trimItems()])
            .then(([s, fi, tt, ti]) => setRef({ style: s.data, fabricItems: fi.data, trimTypes: tt.data, trimItems: ti.data }))
            .catch(err => setError(apiError(err, 'Failed to load style and masters.')));
    }, [bom.style_id]);

    if (!lines || !ref) return error ? <ErrorBox text={error} /> : <Loading />;
    const sizeIds = ref.style.sizes.map(s => String(s.size_id));
    const sizeName = new Map(ref.style.sizes.map(s => [String(s.size_id), s.size_name]));
    const partName = new Map(ref.style.parts.map(p => [String(p.id), p.part_name]));

    const save = async (payload) => {
        const { kind, line } = editing;
        if (kind === 'fabric') await stylesApi.saveFabricLine(bom.id, line?.id, payload);
        else await stylesApi.saveTrimLine(bom.id, line?.id, payload);
        setEditing(null);
        await load();
    };
    const remove = async (kind, line) => {
        if (!window.confirm('Delete this line?')) return;
        setError('');
        try {
            if (kind === 'fabric') await stylesApi.deleteFabricLine(bom.id, line.id);
            else await stylesApi.deleteTrimLine(bom.id, line.id);
            await load();
        } catch (err) { setError(apiError(err, 'Failed to delete the line.')); }
    };

    const consumptionText = (l) => (l.consumption_basis === 'PER_GARMENT'
        ? `${fmtQty(l.qty_per_garment)} ${l.uom} / garment`
        : l.sizes.map(s => `${sizeName.get(String(s.size_id)) || '?'} ${fmtQty(s.qty)}`).join(' · ') + ` ${l.uom}`)
        + (Number(l.wastage_pct) ? ` + ${fmtQty(l.wastage_pct)}% wastage` : '');

    const lineCard = (kind, l) => {
        const gaps = lineGaps(l, bom.colours, sizeIds);
        return (
            <div key={l.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800">
                            {kind === 'fabric' ? roleLabel(l.role) : l.trim_type_name}
                            {kind === 'trim' && l.placement && <span className="font-normal text-slate-500"> · {l.placement}</span>}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {consumptionText(l)}
                            {' · '}{ruleLabel(l.colour_rule)}
                            {kind === 'trim' && l.size_rule === 'BY_SIZE' && ' · by size'}
                            {kind === 'trim' && <> · issued at <b>{l.issue_stage_name}</b></>}
                        </p>
                        {kind === 'fabric' && l.part_ids.length > 0 && (
                            <p className="text-xs text-slate-500 mt-0.5">Parts: {l.part_ids.map(p => partName.get(String(p)) || '?').join(', ')}</p>
                        )}
                    </div>
                    {editable && (
                        <div className="flex gap-1">
                            <button type="button" onClick={() => setEditing({ kind, line: l })} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label="Edit line"><Pencil size={15} /></button>
                            <button type="button" onClick={() => remove(kind, l)} className="p-1.5 rounded text-rose-500 hover:bg-rose-50" aria-label="Delete line"><Trash2 size={15} /></button>
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {l.items.map(it => (
                        <span key={it.id} className={`text-xs px-2 py-1 rounded-md border ${it.match === 'COLOUR' && l.colour_rule === 'BY_TONE' ? 'border-violet-200 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}>
                            <b className="text-slate-700">{matchLabel(it, tones, bom.colours)}</b>
                            {it.size_ids && <span className="text-slate-500"> [{it.size_ids.map(s => sizeName.get(String(s)) || '?').join(', ')}]</span>}
                            <span className="text-slate-600"> → {it.label}</span>
                        </span>
                    ))}
                    {l.items.length === 0 && <span className="text-xs text-slate-400">No items picked yet.</span>}
                </div>
                {gaps.length > 0 && (
                    <p className="mt-2 text-xs font-semibold text-amber-700 flex items-start gap-1">
                        <AlertTriangle size={13} className="mt-px shrink-0" /> No item yet for: {gaps.join(', ')}
                    </p>
                )}
            </div>
        );
    };

    const section = (kind, title, list) => (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">{title} <span className="text-slate-400 font-bold">({list.length})</span></h3>
                {editable && <div className="ml-auto"><SecondaryButton onClick={() => setEditing({ kind, line: null })}><Plus size={14} /> Add {kind} line</SecondaryButton></div>}
            </div>
            <div className="space-y-2">
                {list.map(l => lineCard(kind, l))}
                {list.length === 0 && <p className="text-sm text-slate-400">No {kind} lines yet.</p>}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <ErrorBox text={error} />
            {bom.colours.length === 0 && <p className="text-xs font-semibold text-amber-700">Pick garment colours in the Colours tab first; by-tone and by-colour lines need them.</p>}
            {section('fabric', 'Fabric', lines.fabric)}
            {section('trim', 'Trims', lines.trims)}
            {editing && (
                <BomLineEditor kind={editing.kind} line={editing.line} bom={bom} style={ref.style} tones={tones}
                    fabricItems={ref.fabricItems} trimTypes={ref.trimTypes} trimItems={ref.trimItems}
                    onSave={save} onClose={() => setEditing(null)} />
            )}
        </div>
    );
}

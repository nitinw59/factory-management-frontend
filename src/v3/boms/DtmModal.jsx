// Make DTM items (dyed to match) for one BOM trim line: pick the base quality (e.g. 24L 4-hole
// polyester button) and the fabric line it matches; for each garment colour the reference is that
// colour's fabric shade — or a buyer reference typed for the colour (TCX / Pantone). Preview shows
// which shade items exist (reused, with their approval) and which will be created; Apply maps the
// line by colour. A DTM item is approved once made.
import { useEffect, useMemo, useState } from 'react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';

export default function DtmModal({ bom, line, fabricLines, trimItems, onDone, onClose }) {
    const bases = useMemo(() => trimItems.filter(t => String(t.trim_type_id) === String(line.trim_type_id) && !t.dtm_base_item_id && t.is_active && t.usage_uom === line.uom), [trimItems, line]);
    const shellId = (fabricLines.find(f => f.role === 'SHELL') || fabricLines[0])?.id;
    const [baseId, setBaseId] = useState(line.dtm_base_item_id ? String(line.dtm_base_item_id) : bases.length === 1 ? String(bases[0].id) : '');
    const [fabricLineId, setFabricLineId] = useState(String(line.dtm_fabric_line_id || shellId || ''));
    const [overrides, setOverrides] = useState(line.dtm_overrides || {});
    const [typing, setTyping] = useState(() => new Set(Object.keys(line.dtm_overrides || {})));
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);

    const body = { base_item_id: baseId, fabric_line_id: fabricLineId, overrides: Object.fromEntries(Object.entries(overrides).filter(([k, v]) => typing.has(k) && String(v).trim())) };
    const key = JSON.stringify(body);
    useEffect(() => {
        if (!baseId || !fabricLineId) { setPreview(null); return undefined; }
        const t = setTimeout(() => {
            setError('');
            stylesApi.dtmPreview(bom.id, line.id, JSON.parse(key)).then(res => setPreview(res.data)).catch(err => { setPreview(null); setError(apiError(err, 'Failed to preview.')); });
        }, 300);
        return () => clearTimeout(t);
    }, [key, bom.id, line.id, baseId, fabricLineId]);

    const apply = async () => {
        setBusy(true); setError('');
        try { setDone((await stylesApi.dtmApply(bom.id, line.id, body)).data); } catch (err) { setError(apiError(err, 'Failed to make DTM items.')); } finally { setBusy(false); }
    };
    const problems = (preview?.rows || []).filter(r => r.problem);

    return (
        <Modal title={`Make DTM items — ${line.trim_type_name}${line.placement ? ` (${line.placement})` : ''}`} onClose={done ? onDone : onClose}>
            <div className="space-y-4 w-[min(760px,92vw)]">
                {done ? (
                    <div className="space-y-3">
                        <p className="text-sm font-bold text-emerald-700">Done — line mapped by colour. {done.created.length} new shade item(s), {done.reused.length} reused.</p>
                        <table className="w-full text-sm"><tbody>
                            {done.rows.map(r => <tr key={r.code + r.colour} className="border-t border-slate-100"><td className="py-1.5 font-semibold">{r.colour}</td><td className="py-1.5 text-slate-600">{r.reference}</td><td className="py-1.5 font-mono text-xs">{r.code}</td></tr>)}
                        </tbody></table>
                        <div className="flex justify-end"><PrimaryButton onClick={onDone}>Close</PrimaryButton></div>
                    </div>
                ) : <>
                    <p className="text-sm text-slate-600">The supplier dyes one base quality to each fabric shade. Each shade becomes its own trim item — ordered, received, stocked and issued per shade — and is reused on repeat orders.</p>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Base quality *" hint={bases.length ? 'A plain (not DTM) item of this trim type and unit.' : 'Add the base item in Trim items first.'}>
                            <select className={inputCls} value={baseId} onChange={e => setBaseId(e.target.value)}>
                                <option value="">Choose…</option>
                                {bases.map(b => <option key={b.id} value={b.id}>{b.brand} · {b.code}{b.description ? ` — ${b.description}` : ''}</option>)}
                            </select>
                        </Field>
                        <Field label="Match to fabric *" hint="The fabric of the part the trim sits on — usually the shell.">
                            <select className={inputCls} value={fabricLineId} onChange={e => setFabricLineId(e.target.value)}>
                                {fabricLines.map(f => <option key={f.id} value={f.id}>{f.role.charAt(0) + f.role.slice(1).toLowerCase()} fabric</option>)}
                            </select>
                        </Field>
                    </div>
                    {preview && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wide"><tr><th className="py-1.5">Colour</th><th className="py-1.5">Matched to</th><th className="py-1.5">Shade item</th></tr></thead>
                                <tbody>
                                    {preview.rows.map(r => (
                                        <tr key={r.colour_id} className="border-t border-slate-100 align-top">
                                            <td className="py-2 font-semibold whitespace-nowrap">{r.colour}</td>
                                            <td className="py-2 pr-3 min-w-[220px]">
                                                {typing.has(r.colour_id) ? (
                                                    <input className={`${inputCls} !py-1`} value={overrides[r.colour_id] || ''} maxLength={100} placeholder="e.g. TCX 19-4052 or Pantone 296C"
                                                        onChange={e => setOverrides({ ...overrides, [r.colour_id]: e.target.value })} aria-label={`Reference for ${r.colour}`} />
                                                ) : <span className={r.problem ? 'text-rose-700' : 'text-slate-700'}>{r.reference || '—'}</span>}
                                                <button type="button" className="block text-[11px] font-bold text-indigo-700 mt-0.5"
                                                    onClick={() => { const n = new Set(typing); if (n.has(r.colour_id)) n.delete(r.colour_id); else n.add(r.colour_id); setTyping(n); }}>
                                                    {typing.has(r.colour_id) ? 'Use the fabric shade instead' : 'Buyer reference (TCX / Pantone) instead'}
                                                </button>
                                            </td>
                                            <td className="py-2">
                                                {r.problem ? <span className="text-xs font-semibold text-rose-700">{r.problem}</span>
                                                    : r.item ? <span><span className="font-mono text-xs">{r.item.code}</span> <span className="text-xs text-slate-500">exists — reused</span></span>
                                                        : <span><span className="font-mono text-xs">{r.new_code}</span> <span className="text-xs font-bold text-indigo-700">new</span></span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <ErrorBox text={error} />
                    <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                        <PrimaryButton onClick={apply} busy={busy} disabled={busy || !preview || problems.length > 0}>Make DTM items and map the line</PrimaryButton>
                    </div>
                </>}
            </div>
        </Modal>
    );
}

// DTM (dyed to match) for one BOM trim line (reworked 3 Nov 2026: trim items are supplier codes): pick or add the quality, e.g.
// TKT 120, with no base item and no stock, and the fabric line it matches. The real item comes later: the purchase manager's code
// on the PO, or in-house stock the merchandiser approves. Until then a hidden stand-in holds the need; for each garment colour the reference is that
// colour's fabric shade — or a buyer reference typed for the colour (TCX / Pantone). Preview shows
// which shade items exist (reused, with their approval) and which will be created; Apply maps the
// line by colour. A DTM item is approved once made.
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';

export default function DtmModal({ bom, line, fabricLines, trimItems, onDone, onClose }) {
    const [added, setAdded] = useState([]);   // qualities added here, until the page's list reloads
    const bases = useMemo(() => [...trimItems, ...added].filter(t => t.is_dtm_quality && String(t.trim_type_id) === String(line.trim_type_id) && t.is_active && t.usage_uom === line.uom), [trimItems, added, line]);
    const [adding, setAdding] = useState(null);   // { name, brand, purchase_uom, usage_per_purchase_uom, hsn_code, gst_pct }
    const shellId = (fabricLines.find(f => f.role === 'SHELL') || fabricLines[0])?.id;
    // Only a quality of this type and unit can start selected: an older line may still point at a plain item.
    const [baseId, setBaseId] = useState(() => {
        if (line.dtm_base_item_id && bases.some(b => String(b.id) === String(line.dtm_base_item_id))) return String(line.dtm_base_item_id);
        return bases.length === 1 ? String(bases[0].id) : '';
    });
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
    const addQuality = async () => {
        setBusy(true); setError('');
        try {
            const q = (await stylesApi.createDtmQuality({ ...adding, trim_type_id: line.trim_type_id, usage_uom: line.uom })).data;
            setAdded(cur => [...cur, q]); setBaseId(String(q.id)); setAdding(null);
        } catch (err) { setError(apiError(err, 'Failed to add the quality.')); } finally { setBusy(false); }
    };

    return (
        <Modal title={`Make DTM items — ${line.trim_type_name}${line.placement ? ` (${line.placement})` : ''}`} onClose={done ? onDone : onClose}>
            <div className="space-y-4 w-[min(760px,92vw)]">
                {done ? (
                    <div className="space-y-3">
                        <p className="text-sm font-bold text-emerald-700">Done: DTM set on this line. The real trim item comes with the supplier's code on the PO, or from in-house stock.</p>
                        <table className="w-full text-sm"><tbody>
                            {done.rows.map(r => <tr key={r.code + r.colour} className="border-t border-slate-100"><td className="py-1.5 font-semibold">{r.colour}</td><td className="py-1.5 text-slate-600">{r.reference}</td><td className="py-1.5 font-mono text-xs">{r.code}</td></tr>)}
                        </tbody></table>
                        <div className="flex justify-end"><PrimaryButton onClick={onDone}>Close</PrimaryButton></div>
                    </div>
                ) : <>
                    <p className="text-sm text-slate-600">The supplier dyes this quality to each fabric. Planning can raise the need now; the real trim item, such as TKT 120 33445, is made when the purchase manager enters the code on the PO, or when in-house stock is approved. A match stays for repeat orders of the same fabric.</p>
                    {!adding && (
                        <div className="flex justify-end">
                            <SecondaryButton onClick={() => setAdding({ name: '', brand: '', purchase_uom: '', usage_per_purchase_uom: '', hsn_code: '', gst_pct: '' })}><Plus size={14} /> Create DTM quality</SecondaryButton>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="DTM quality *" hint={bases.length ? `Only DTM qualities of ${line.trim_type_name} in ${line.uom}.` : `No DTM quality of ${line.trim_type_name} in ${line.uom} yet: create one.`}>
                            <select className={inputCls} value={baseId} onChange={e => setBaseId(e.target.value)} disabled={!bases.length}>
                                <option value="">{bases.length ? 'Choose…' : 'None yet'}</option>
                                {bases.map(b => <option key={b.id} value={b.id}>{b.brand} · {b.dtm_name || b.code}</option>)}
                            </select>
                        </Field>
                        <Field label="Match to fabric *" hint="The fabric of the part the trim sits on — usually the shell.">
                            <select className={inputCls} value={fabricLineId} onChange={e => setFabricLineId(e.target.value)}>
                                {fabricLines.map(f => <option key={f.id} value={f.id}>{f.role.charAt(0) + f.role.slice(1).toLowerCase()} fabric</option>)}
                            </select>
                        </Field>
                    </div>
                    {adding && (
                        <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 space-y-2">
                            <p className="text-sm font-bold text-slate-800">New DTM quality for {line.trim_type_name}</p>
                            <div className="grid grid-cols-3 gap-2">
                                <Field label="Name *" hint="e.g. TKT 120"><input className={inputCls} maxLength={60} value={adding.name} onChange={e => setAdding({ ...adding, name: e.target.value })} /></Field>
                                <Field label="Brand *"><input className={inputCls} maxLength={80} value={adding.brand} onChange={e => setAdding({ ...adding, brand: e.target.value })} /></Field>
                                <Field label="Purchase unit *" hint="e.g. CONE, GROSS"><input className={inputCls} maxLength={20} value={adding.purchase_uom} onChange={e => setAdding({ ...adding, purchase_uom: e.target.value })} /></Field>
                                <Field label={`${line.uom} per purchase unit *`}><input className={inputCls} type="number" min="0" step="any" value={adding.usage_per_purchase_uom} onChange={e => setAdding({ ...adding, usage_per_purchase_uom: e.target.value })} /></Field>
                                <Field label="HSN"><input className={inputCls} inputMode="numeric" value={adding.hsn_code} onChange={e => setAdding({ ...adding, hsn_code: e.target.value })} /></Field>
                                <Field label="GST %"><input className={inputCls} type="number" min="0" max="40" step="0.01" value={adding.gst_pct} onChange={e => setAdding({ ...adding, gst_pct: e.target.value })} /></Field>
                            </div>
                            <div className="flex justify-end gap-2">
                                <SecondaryButton onClick={() => setAdding(null)}>Cancel</SecondaryButton>
                                <PrimaryButton busy={busy} disabled={busy || !adding.name.trim() || !adding.brand.trim() || !adding.purchase_uom.trim() || !(Number(adding.usage_per_purchase_uom) > 0)} onClick={addQuality}>Create quality</PrimaryButton>
                            </div>
                        </div>
                    )}
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
                                                    : r.item ? <span><span className="font-mono text-xs">{r.item.code}</span> {r.item.matched_code ? <b className="text-xs text-emerald-800"> matched: {r.item.matched_code}</b> : <span className="text-xs text-slate-500"> to match</span>}</span>
                                                        : <span><span className="font-mono text-xs">{r.new_code}</span> <span className="text-xs text-slate-500">to match</span></span>}
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
                        <PrimaryButton onClick={apply} busy={busy} disabled={busy || !preview || problems.length > 0}>Set DTM on this line</PrimaryButton>
                    </div>
                </>}
            </div>
        </Modal>
    );
}

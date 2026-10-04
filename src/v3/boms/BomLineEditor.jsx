// Add / edit one BOM line (fabric or trim). The item-picker area follows the
// colour rule (all / by tone + exceptions / by colour) and, for trims, the
// size rule (one item, or size groups).
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';
import { apiError } from '../api/mastersApi';
import { FABRIC_ROLES, COLOUR_RULES, colourKeys, itemKey } from './bomRules';

const fromLine = (line, kind) => (line?.items || []).map(i => ({
    match: i.match, tone_group_id: i.tone_group_id || null, garment_colour_id: i.garment_colour_id || null,
    size_ids: i.size_ids ? i.size_ids.map(String) : null, item_id: String(kind === 'fabric' ? i.fabric_item_id : i.trim_item_id),
}));

export default function BomLineEditor({ kind, line, bom, style, tones, fabricItems, trimTypes, trimItems, onSave, onClose }) {
    const isTrim = kind === 'trim';
    const sizeName = useMemo(() => new Map(style.sizes.map(s => [String(s.size_id), s.size_name])), [style]);
    const styleSizeIds = style.sizes.map(s => String(s.size_id));
    const [f, setF] = useState(() => ({
        role: line?.role || 'SHELL',
        trim_type_id: line?.trim_type_id ? String(line.trim_type_id) : '',
        placement: line?.placement || '',
        issue_stage_id: line?.issue_stage_id ? String(line.issue_stage_id) : '',
        uom: line?.uom || (isTrim ? 'pcs' : 'm'),
        consumption_basis: line?.consumption_basis || 'PER_GARMENT',
        qty_per_garment: line?.qty_per_garment ? Number(line.qty_per_garment) : '',
        size_qty: Object.fromEntries((line?.sizes || []).map(s => [String(s.size_id), Number(s.qty)])),
        wastage_pct: line ? Number(line.wastage_pct) : 0,
        colour_rule: line?.colour_rule || 'ALL',
        size_rule: line?.size_rule || 'ALL',
        part_ids: new Set((line?.part_ids || []).map(String)),
        notes: line?.notes || '',
        items: fromLine(line, kind),
    }));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const set = (patch) => setF(prev => ({ ...prev, ...patch }));

    const itemOptions = isTrim
        ? trimItems.filter(t => t.is_active && String(t.trim_type_id) === f.trim_type_id && t.usage_uom === f.uom)
        : fabricItems.filter(x => x.is_active && x.usage_uom === f.uom);
    const itemLabel = (it) => (isTrim ? `${it.brand} · ${it.code}${it.description ? ` — ${it.description}` : ''}` : `${it.mill} · ${it.article_code} · ${it.shade_code}${it.shade_name ? ` ${it.shade_name}` : ''}`);

    const keys = colourKeys(f.colour_rule, bom.colours, tones);
    const exceptionKeys = f.colour_rule === 'BY_TONE'
        ? [...new Set(f.items.filter(i => i.match === 'COLOUR').map(i => i.garment_colour_id))]
            .map(cid => ({ match: 'COLOUR', key: `COLOUR:${cid}`, garment_colour_id: cid, label: bom.colours.find(c => String(c.garment_colour_id) === cid)?.name || 'Colour' }))
        : [];

    const rowsFor = (key) => f.items.map((it, idx) => ({ it, idx })).filter(({ it }) => itemKey(it) === key.key);
    const setItem = (idx, patch) => set({ items: f.items.map((it, j) => (j === idx ? { ...it, ...patch } : it)) });
    const removeItem = (idx) => set({ items: f.items.filter((_, j) => j !== idx) });
    const addRow = (key, extra = {}) => set({ items: [...f.items, { match: key.match, tone_group_id: key.tone_group_id || null, garment_colour_id: key.garment_colour_id || null, size_ids: f.size_rule === 'BY_SIZE' ? [] : null, item_id: '', ...extra }] });
    // One-item mode: pick / clear the single row of a key.
    const pickSingle = (key, itemId) => {
        const rows = rowsFor(key);
        if (!itemId) return set({ items: f.items.filter((it) => itemKey(it) !== key.key) });
        if (rows.length) return setItem(rows[0].idx, { item_id: itemId });
        addRow(key, { item_id: itemId });
    };

    const itemSelect = (value, onChange, label) => (
        <select className={`${inputCls} flex-1 min-w-[200px]`} value={value || ''} onChange={e => onChange(e.target.value)} aria-label={label}>
            <option value="">— no item yet —</option>
            {itemOptions.map(o => <option key={o.id} value={o.id}>{itemLabel(o)}</option>)}
        </select>
    );

    const keyPicker = (k, removable) => {
        const rows = rowsFor(k);
        if (f.size_rule !== 'BY_SIZE') {
            return (
                <div key={k.key} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="w-44 shrink-0 text-sm font-bold text-slate-700">{k.label}{k.members?.length ? <span className="block text-[11px] font-normal text-slate-400">{k.members.join(', ')}</span> : null}</span>
                    {itemSelect(rows[0]?.it.item_id, v => pickSingle(k, v), `Item for ${k.label}`)}
                    {removable && <button type="button" onClick={() => set({ items: f.items.filter(it => itemKey(it) !== k.key) })} className="p-1.5 rounded text-rose-500 hover:bg-rose-50" aria-label="Remove exception"><Trash2 size={15} /></button>}
                </div>
            );
        }
        const usedBy = (idx) => new Set(rows.filter(r => r.idx !== idx).flatMap(r => r.it.size_ids || []));
        return (
            <div key={k.key} className="py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-700">{k.label}</span>
                    {k.members?.length ? <span className="text-[11px] text-slate-400">{k.members.join(', ')}</span> : null}
                    {removable && <button type="button" onClick={() => set({ items: f.items.filter(it => itemKey(it) !== k.key) })} className="ml-auto p-1 rounded text-rose-500 hover:bg-rose-50" aria-label="Remove exception"><Trash2 size={14} /></button>}
                </div>
                {rows.map(({ it, idx }) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2 pl-3 py-1">
                        <div className="flex flex-wrap gap-1">
                            {styleSizeIds.map(sid => {
                                const on = (it.size_ids || []).includes(sid);
                                const taken = !on && usedBy(idx).has(sid);
                                return (
                                    <button key={sid} type="button" disabled={taken}
                                        onClick={() => setItem(idx, { size_ids: on ? it.size_ids.filter(x => x !== sid) : [...(it.size_ids || []), sid] })}
                                        className={`min-w-[38px] px-2 py-1 rounded border text-xs font-black ${on ? 'bg-indigo-600 border-indigo-600 text-white' : taken ? 'bg-slate-100 border-slate-200 text-slate-300' : 'bg-white border-slate-300 text-slate-600'}`}>
                                        {sizeName.get(sid)}
                                    </button>
                                );
                            })}
                        </div>
                        {itemSelect(it.item_id, v => setItem(idx, { item_id: v }), `Item for ${k.label} size group`)}
                        <button type="button" onClick={() => removeItem(idx)} className="p-1.5 rounded text-rose-500 hover:bg-rose-50" aria-label="Remove size group"><Trash2 size={14} /></button>
                    </div>
                ))}
                <button type="button" onClick={() => addRow(k)} className="ml-3 mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600"><Plus size={12} /> Add size group</button>
            </div>
        );
    };

    const save = async () => {
        setSaving(true); setError('');
        const payload = {
            uom: f.uom, consumption_basis: f.consumption_basis,
            qty_per_garment: f.consumption_basis === 'PER_GARMENT' ? f.qty_per_garment : null,
            sizes: f.consumption_basis === 'PER_SIZE' ? styleSizeIds.filter(sid => f.size_qty[sid] !== '' && f.size_qty[sid] != null).map(sid => ({ size_id: sid, qty: f.size_qty[sid] })) : [],
            wastage_pct: f.wastage_pct, colour_rule: f.colour_rule, notes: f.notes,
            items: f.items.filter(i => i.item_id).map(i => ({
                match: i.match, tone_group_id: i.tone_group_id, garment_colour_id: i.garment_colour_id,
                ...(isTrim ? { trim_item_id: i.item_id, size_ids: f.size_rule === 'BY_SIZE' ? i.size_ids : null } : { fabric_item_id: i.item_id }),
            })),
        };
        if (isTrim) Object.assign(payload, { trim_type_id: f.trim_type_id, placement: f.placement, issue_stage_id: f.issue_stage_id, size_rule: f.size_rule });
        else Object.assign(payload, { role: f.role, part_ids: [...f.part_ids] });
        try {
            await onSave(payload);
        } catch (err) {
            setError(apiError(err, 'Failed to save the line.'));
            setSaving(false);
        }
    };

    const freeExceptionColours = bom.colours.filter(c => !exceptionKeys.some(k => k.garment_colour_id === String(c.garment_colour_id)));

    return (
        <Modal title={`${line ? 'Edit' : 'Add'} ${isTrim ? 'trim' : 'fabric'} line`} onClose={onClose}>
            <div className="space-y-4 w-[min(820px,90vw)] max-h-[75vh] overflow-y-auto pr-1">
                {isTrim ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Trim type *">
                            <select className={inputCls} value={f.trim_type_id} onChange={e => {
                                const t = trimTypes.find(x => String(x.id) === e.target.value);
                                set({ trim_type_id: e.target.value, uom: t?.default_usage_uom || f.uom, items: [] });
                            }}>
                                <option value="">— pick —</option>
                                {trimTypes.filter(t => t.is_active || String(t.id) === f.trim_type_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Placement" hint="e.g. waistband, back pocket."><input className={inputCls} value={f.placement} onChange={e => set({ placement: e.target.value })} /></Field>
                        <Field label="Issued at *" hint="A stage in the style's route.">
                            <select className={inputCls} value={f.issue_stage_id} onChange={e => set({ issue_stage_id: e.target.value })}>
                                <option value="">— pick —</option>
                                {style.route.map(r => <option key={r.stage_type_id} value={r.stage_type_id}>{r.stage_name}</option>)}
                            </select>
                        </Field>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Role *">
                            <select className={inputCls} value={f.role} onChange={e => set({ role: e.target.value })}>
                                {FABRIC_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Unit *">
                            <select className={inputCls} value={f.uom} onChange={e => set({ uom: e.target.value, items: [] })}>
                                <option value="m">metres</option><option value="kg">kg</option>
                            </select>
                        </Field>
                        <div className="sm:col-span-2">
                            <span className="block text-xs font-bold text-slate-600 mb-1">Parts cut from this fabric</span>
                            <div className="flex flex-wrap gap-1.5">
                                {style.parts.filter(p => p.is_active).map(p => {
                                    const on = f.part_ids.has(String(p.id));
                                    return (
                                        <button key={p.id} type="button" onClick={() => { const n = new Set(f.part_ids); if (on) n.delete(String(p.id)); else n.add(String(p.id)); set({ part_ids: n }); }}
                                            className={`text-xs font-bold px-2.5 py-1 rounded-md border ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-600'}`}>
                                            {p.part_name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                    <Field label="Consumption *">
                        <select className={inputCls} value={f.consumption_basis} onChange={e => set({ consumption_basis: e.target.value })}>
                            <option value="PER_GARMENT">Same for every size</option><option value="PER_SIZE">Per size</option>
                        </select>
                    </Field>
                    {f.consumption_basis === 'PER_GARMENT' && (
                        <Field label={`Quantity per garment (${f.uom}) *`}><input className={inputCls} type="number" min="0" step="any" value={f.qty_per_garment} onChange={e => set({ qty_per_garment: e.target.value })} /></Field>
                    )}
                    <Field label="Wastage %"><input className={inputCls} type="number" min="0" max="100" step="any" value={f.wastage_pct} onChange={e => set({ wastage_pct: e.target.value })} /></Field>
                </div>
                {f.consumption_basis === 'PER_SIZE' && (
                    <div className="flex flex-wrap gap-2">
                        {style.sizes.map(s => (
                            <label key={s.size_id} className="flex items-center gap-1 text-xs font-bold text-slate-600">
                                {s.size_name}
                                <input className={`${inputCls} w-20`} type="number" min="0" step="any" value={f.size_qty[String(s.size_id)] ?? ''}
                                    onChange={e => set({ size_qty: { ...f.size_qty, [String(s.size_id)]: e.target.value } })} aria-label={`Quantity for size ${s.size_name}`} />
                            </label>
                        ))}
                        <span className="text-xs text-slate-400 self-center">{f.uom} per garment</span>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Which item, by colour *" hint={COLOUR_RULES.find(r => r.key === f.colour_rule)?.hint}>
                        <select className={inputCls} value={f.colour_rule} onChange={e => set({ colour_rule: e.target.value, items: [] })}>
                            {COLOUR_RULES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                    </Field>
                    {isTrim && (
                        <Field label="Which item, by size *" hint="By size: e.g. polybag 12×16 for S–L, 16×20 for XXXL.">
                            <select className={inputCls} value={f.size_rule} onChange={e => set({ size_rule: e.target.value, items: [] })}>
                                <option value="ALL">Same for all sizes</option><option value="BY_SIZE">By size</option>
                            </select>
                        </Field>
                    )}
                </div>

                <div className="border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-bold text-slate-600 mb-1">Items</p>
                    {isTrim && !f.trim_type_id ? <p className="text-sm text-slate-400">Pick the trim type first.</p>
                        : itemOptions.length === 0 ? <p className="text-sm text-amber-700">No active {isTrim ? 'trim items of this type' : 'fabric items'} in {f.uom}. Add them under Masters.</p>
                        : f.colour_rule !== 'ALL' && bom.colours.length === 0 ? <p className="text-sm text-amber-700">Add garment colours in the Colours tab first.</p>
                        : <>
                            {keys.map(k => keyPicker(k, false))}
                            {f.colour_rule === 'BY_TONE' && (
                                <div className="mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-xs font-bold text-slate-500 mb-1">Exceptions: a colour that doesn't follow its tone</p>
                                    {exceptionKeys.map(k => keyPicker(k, true))}
                                    {freeExceptionColours.length > 0 && (
                                        <select className={`${inputCls} w-56 mt-1`} value="" onChange={e => e.target.value && addRow({ match: 'COLOUR', key: `COLOUR:${e.target.value}`, garment_colour_id: e.target.value })} aria-label="Add an exception">
                                            <option value="">+ Add exception…</option>
                                            {freeExceptionColours.map(c => <option key={c.garment_colour_id} value={c.garment_colour_id}>{c.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            )}
                        </>}
                    <p className="text-[11px] text-slate-400 mt-2">Gaps are allowed while drafting; the BOM can't be submitted until every colour and size has an item.</p>
                </div>

                <Field label="Notes"><textarea className={`${inputCls} min-h-[56px]`} value={f.notes} onChange={e => set({ notes: e.target.value })} /></Field>
                <ErrorBox text={error} />
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={save} busy={saving} disabled={saving || (isTrim && (!f.trim_type_id || !f.issue_stage_id))}>Save line</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}

// Import lines from a template BOM (23 Nov 2026, owner: "import trim lines and fabric lines from any bom user choose just
// like template"): pick any style's BOM version (the same buyer's styles first; approved, archived or draft), tick its
// fabric and trim lines, bring its colours / trim card settings if wanted, add to or replace this draft's lines. Preview
// first (the server does the import and rolls it back); every line goes through the same checks as one made by hand.
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import BomStatusBadge from './BomStatusBadge';

const CHECKED = ['APPROVED', 'ARCHIVED'];
const num = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const fabricLabel = (l) => `${l.role.toLowerCase()} · ${l.consumption_basis === 'PER_SIZE' ? 'per size' : `${num(l.qty_per_garment)} ${l.uom}`}${Number(l.wastage_pct) ? ` +${num(l.wastage_pct)}%` : ''} · ${l.colour_rule.replace('_', ' ').toLowerCase()}`;
const itemsText = (l) => [...new Set((l.items || []).map(i => i.label))].join('; ') || 'no item';

export default function ImportLinesModal({ bom, hasLines, onClose, onDone }) {
    const [q, setQ] = useState('');
    const [styles, setStyles] = useState(null);
    const [fromId, setFromId] = useState('');
    const [lines, setLines] = useState(null);
    const [fabric, setFabric] = useState(new Set());
    const [trims, setTrims] = useState(new Set());
    const [colours, setColours] = useState(true);
    const [card, setCard] = useState(false);
    const [mode, setMode] = useState('ADD');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => {
            stylesApi.bomImportSources(bom.id, q).then(res => setStyles(res.data)).catch(err => setError(apiError(err, 'Could not load the templates.')));
        }, 250);
        return () => clearTimeout(t);
    }, [bom.id, q]);
    useEffect(() => {
        setLines(null); setPreview(null);
        if (!fromId) return;
        stylesApi.bomLines(fromId).then(res => {
            setLines(res.data);
            setFabric(new Set(res.data.fabric.map(l => String(l.id))));
            setTrims(new Set(res.data.trims.map(l => String(l.id))));
        }).catch(err => setError(apiError(err, 'Could not load the template\'s lines.')));
    }, [fromId]);
    const source = useMemo(() => styles?.flatMap(s => s.versions.map(v => ({ ...v, style: s }))).find(v => v.id === fromId), [styles, fromId]);
    const body = (dry) => ({ from_bom_id: fromId, fabric_line_ids: [...fabric], trim_line_ids: [...trims], colours, card_settings: card, mode, dry_run: dry });
    const toggle = (set, setter, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n); setPreview(null); };
    const go = async (dry) => {
        setBusy(true); setError('');
        try {
            const { data } = await stylesApi.importBomLines(bom.id, body(dry));
            if (dry) setPreview(data.report); else onDone(data.report);
        } catch (err) { setError(apiError(err, dry ? 'Preview failed.' : 'Import failed.')); } finally { setBusy(false); }
    };
    const nothing = !fabric.size && !trims.size && !colours && !card;

    return (
        <Modal title={`Import lines into ${bom.style_code} v${bom.version_no}`} onClose={onClose}>
            <div className="space-y-3 text-sm">
                <p className="text-slate-600">Copy fabric and trim lines from any style's BOM, like a template. Parts are matched by name, per-size quantities kept only for this style's sizes; anything that doesn't fit is shown in the preview. Nothing is approved here — the BOM is still submitted and approved as usual.</p>
                {/* 1. Template */}
                <div>
                    <p className="mb-1 text-xs font-bold text-slate-600">1. Template — {styles ? `${styles.length} style${styles.length === 1 ? '' : 's'}` : '…'} (this buyer's first)</p>
                    <SearchInput value={q} onChange={setQ} placeholder="Search style code, name or buyer" />
                    <div className="mt-1 max-h-56 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
                        {!styles ? <Loading /> : styles.length === 0 ? <p className="px-3 py-2 text-slate-400">No style with a BOM matches.</p> : styles.map(s => (
                            <div key={s.style_id} className="px-3 py-1.5">
                                <p className="text-xs font-bold text-slate-800">{s.style_code} <span className="font-normal text-slate-500">{s.name}{s.buyer ? ` · ${s.buyer}` : ''}</span>{s.same_buyer && <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[11px] font-bold text-emerald-700">same buyer</span>}</p>
                                {s.versions.map(v => (
                                    <label key={v.id} className={`mt-1 flex cursor-pointer gap-2 rounded px-1.5 py-1 ${fromId === v.id ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'}`}>
                                        <input type="radio" name="import-from" className="mt-0.5" checked={fromId === v.id} onChange={() => setFromId(v.id)} />
                                        <span className="text-xs">
                                            <span className="font-bold text-slate-800">v{v.version_no}</span> <BomStatusBadge status={v.status} />
                                            {!CHECKED.includes(v.status) && <span className="ml-1 font-semibold text-amber-700">not checked</span>}
                                            <span className="text-slate-500"> · {v.fabric_lines} fabric, {v.trim_lines} trim line{v.trim_lines === 1 ? '' : 's'}, {v.colours} colour{v.colours === 1 ? '' : 's'}</span>
                                            {v.shell_fabrics && <span className="block text-slate-500">Shell: {v.shell_fabrics}</span>}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
                {/* 2. Lines */}
                {fromId && (!lines ? <Loading /> : (
                    <div>
                        <p className="mb-1 text-xs font-bold text-slate-600">2. Lines from {source?.style.style_code} v{source?.version_no} — {fabric.size + trims.size} of {lines.fabric.length + lines.trims.length} ticked
                            <button type="button" className="ml-2 font-semibold text-indigo-700 hover:underline" onClick={() => { setFabric(new Set(lines.fabric.map(l => String(l.id)))); setTrims(new Set(lines.trims.map(l => String(l.id)))); setPreview(null); }}>all</button>
                            <button type="button" className="ml-2 font-semibold text-indigo-700 hover:underline" onClick={() => { setFabric(new Set()); setTrims(new Set()); setPreview(null); }}>none</button>
                        </p>
                        <div className="max-h-60 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100 text-xs">
                            {lines.fabric.map(l => (
                                <label key={`f${l.id}`} className="flex cursor-pointer gap-2 px-2 py-1.5 hover:bg-slate-50">
                                    <input type="checkbox" checked={fabric.has(String(l.id))} onChange={() => toggle(fabric, setFabric, String(l.id))} />
                                    <span><b>Fabric</b> · {fabricLabel(l)}<span className="block text-slate-500">{itemsText(l)}</span></span>
                                </label>
                            ))}
                            {lines.trims.map(l => (
                                <label key={`t${l.id}`} className="flex cursor-pointer gap-2 px-2 py-1.5 hover:bg-slate-50">
                                    <input type="checkbox" checked={trims.has(String(l.id))} onChange={() => toggle(trims, setTrims, String(l.id))} />
                                    <span><b>{l.trim_type_name}</b>{l.placement ? ` · ${l.placement}` : ''} · {l.consumption_basis === 'PER_SIZE' ? 'per size' : `${num(l.qty_per_garment)} ${l.uom}`} · at {l.issue_stage_name}{l.dtm_base_item_id ? ' · DTM' : ''}<span className="block text-slate-500">{itemsText(l)}</span></span>
                                </label>
                            ))}
                            {lines.fabric.length + lines.trims.length === 0 && <p className="px-2 py-1.5 text-slate-400">This BOM has no lines.</p>}
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500">Total · {lines.fabric.length} fabric + {lines.trims.length} trim line(s) on the template</p>
                        {/* 3. Options */}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <label className="flex items-center gap-1.5"><input type="checkbox" checked={colours} onChange={e => { setColours(e.target.checked); setPreview(null); }} /> Bring its colours ({source?.colours}) — needed for its colour-wise items</label>
                            <label className="flex items-center gap-1.5"><input type="checkbox" checked={card} onChange={e => { setCard(e.target.checked); setPreview(null); }} /> Trim card print settings</label>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
                            <label className="flex items-center gap-1.5"><input type="radio" name="import-mode" checked={mode === 'ADD'} onChange={() => { setMode('ADD'); setPreview(null); }} /> Add to the lines already here</label>
                            <label className={`flex items-center gap-1.5 ${hasLines ? 'text-rose-700' : ''}`}><input type="radio" name="import-mode" checked={mode === 'REPLACE'} onChange={() => { setMode('REPLACE'); setPreview(null); }} /> Replace this BOM's lines{hasLines ? ' (its present lines are removed)' : ''}</label>
                        </div>
                    </div>
                ))}
                {/* Preview */}
                {preview && <ImportReport report={preview} />}
                {error && <ErrorBox text={error} />}
                <div className="flex flex-wrap justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Close</SecondaryButton>
                    <SecondaryButton onClick={() => go(true)} disabled={busy || !fromId || nothing}><Eye size={14} /> Preview</SecondaryButton>
                    <PrimaryButton onClick={() => go(false)} disabled={busy || !preview}><Download size={14} /> Import</PrimaryButton>
                </div>
                {fromId && !preview && !nothing && <p className="text-right text-xs text-slate-500">Preview first — then Import.</p>}
            </div>
        </Modal>
    );
}

export function ImportReport({ report: r, done = false }) {
    const rows = [...r.fabric.map(x => ({ ...x, kind: 'Fabric' })), ...r.trims.map(x => ({ ...x, kind: 'Trim' }))];
    return (
        <div className={`rounded border px-3 py-2 text-xs ${done ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'}`}>
            <p className="font-bold text-slate-800">{done ? 'Imported' : 'Preview'} from {r.template}{r.template_status && !CHECKED.includes(r.template_status) ? ` (${r.template_status.toLowerCase().replace('_', ' ')} — not checked)` : ''}:{' '}
                {r.totals.fabric_imported} fabric + {r.totals.trims_imported} trim line(s){r.totals.fabric_skipped + r.totals.trims_skipped ? `, ${r.totals.fabric_skipped + r.totals.trims_skipped} skipped` : ''}{r.totals.colours_added ? `, ${r.totals.colours_added} colour(s) added` : ''}
                {r.replaced ? ` — replaces ${r.replaced.fabric} fabric + ${r.replaced.trims} trim line(s)` : ''}</p>
            {r.buyer_colours?.length > 0 && <p className="mt-1 text-amber-800">Buyer-only colours brought in: {r.buyer_colours.join(', ')} — keep them only if this style is for that buyer.</p>}
            {r.card_settings_note && <p className="mt-1 text-slate-600">{r.card_settings_note}</p>}
            <ul className="mt-1 space-y-0.5">
                {rows.map(x => (
                    <li key={`${x.kind}${x.id}`} className={x.imported ? 'text-slate-700' : 'text-rose-700'}>
                        <b>{x.imported ? '✓' : '✗'} {x.kind}</b> · {x.label}{x.notes.length ? ` — ${x.notes.join('; ')}` : ''}
                    </li>
                ))}
            </ul>
            <p className="mt-1 font-bold text-slate-600">Total · {rows.filter(x => x.imported).length} of {rows.length} line(s) {done ? 'imported' : 'will be imported'}</p>
        </div>
    );
}

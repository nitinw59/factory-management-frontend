// Import a style's setup (23 Nov 2026, owner: "can user import parts and size range also for style?"): pick any style (the
// same buyer's first) and tick its size range, parts, route and details (SAM, fit, brand, category). Parts are added by name
// (the ones here stay), the route's skipped parts are matched by name. Preview first; sizes, parts and route are refused once
// the style is on a sales order.
import { useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';

const WHAT = [['sizes', 'Size range (replaces this style\'s)'], ['parts', 'Parts (added by name)'], ['route', 'Route (replaces this style\'s)'], ['details', 'Details: SAM, fit, brand, category']];

export default function ImportStyleModal({ style, onClose, onDone }) {
    const [q, setQ] = useState('');
    const [data, setData] = useState(null);
    const [fromId, setFromId] = useState('');
    const [want, setWant] = useState({ sizes: true, parts: true, route: true, details: true });
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const t = setTimeout(() => {
            stylesApi.styleImportSources(style.id, q).then(res => setData(res.data)).catch(err => setError(apiError(err, 'Could not load the styles.')));
        }, 250);
        return () => clearTimeout(t);
    }, [style.id, q]);
    const locked = data?.on_orders;
    const ticks = locked ? { ...want, sizes: false, parts: false, route: false } : want;
    const go = async (dry) => {
        setBusy(true); setError('');
        try {
            const { data: out } = await stylesApi.importStyleSetup(style.id, { from_style_id: fromId, ...ticks, dry_run: dry });
            if (dry) setPreview(out.report); else onDone(out.style, out.report);
        } catch (err) { setError(apiError(err, dry ? 'Preview failed.' : 'Import failed.')); } finally { setBusy(false); }
    };
    const r = preview;

    return (
        <Modal title={`Import setup into ${style.style_code}`} onClose={onClose}>
            <div className="space-y-3 text-sm">
                <p className="text-slate-600">Copy another style's size range, parts, route and details, then make the BOM and use Import lines. This style's code, name and buyer stay as they are.</p>
                {locked && <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{style.style_code} is already on a sales order — only its details can be imported; change sizes, parts and route by hand.</p>}
                <div>
                    <p className="mb-1 text-xs font-bold text-slate-600">1. Style to copy from — {data ? `${data.styles.length}` : '…'} (this buyer's first)</p>
                    <SearchInput value={q} onChange={setQ} placeholder="Search style code, name or buyer" />
                    <div className="mt-1 max-h-64 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
                        {!data ? <Loading /> : data.styles.length === 0 ? <p className="px-3 py-2 text-slate-400">No style matches.</p> : data.styles.map(s => (
                            <label key={s.style_id} className={`flex cursor-pointer gap-2 px-3 py-1.5 text-xs ${fromId === s.style_id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                                <input type="radio" name="import-style" className="mt-0.5" checked={fromId === s.style_id} onChange={() => { setFromId(s.style_id); setPreview(null); }} />
                                <span>
                                    <span className="font-bold text-slate-800">{s.style_code}</span> <span className="text-slate-500">{s.name}{s.buyer ? ` · ${s.buyer}` : ''}</span>
                                    {s.same_buyer && <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[11px] font-bold text-emerald-700">same buyer</span>}
                                    <span className="block text-slate-500">Sizes: {s.sizes.join(', ') || '—'} · Parts: {s.parts.map(p => `${p.name}${p.per_garment > 1 ? ` ×${p.per_garment}` : ''}`).join(', ') || '—'}</span>
                                    <span className="block text-slate-500">Route: {s.route.join(' → ') || '—'}{s.sam ? ` · SAM ${s.sam}` : ''}{s.fit ? ` · ${s.fit}` : ''}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="font-bold text-slate-600">2. Bring:</span>
                    {WHAT.map(([k, label]) => (
                        <label key={k} className={`flex items-center gap-1.5 ${locked && k !== 'details' ? 'opacity-40' : ''}`}>
                            <input type="checkbox" disabled={locked && k !== 'details'} checked={ticks[k]} onChange={e => { setWant(w => ({ ...w, [k]: e.target.checked })); setPreview(null); }} /> {label}
                        </label>
                    ))}
                </div>
                {r && (
                    <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs space-y-0.5">
                        <p className="font-bold text-slate-800">Preview from {r.template}:</p>
                        {r.sizes && <p><b>Sizes</b>: {r.sizes.before.join(', ') || 'none'} → {r.sizes.after.join(', ') || 'none'}{r.sizes.bom_quantities_outside ? ` — ${r.sizes.bom_quantities_outside} BOM per-size quantities fall outside the new range` : ''}</p>}
                        {r.parts && <p><b>Parts</b>: {r.parts.added.length ? `added ${r.parts.added.join(', ')}` : 'nothing to add'}{r.parts.kept.length ? `; kept ${r.parts.kept.join(', ')}` : ''}</p>}
                        {r.route && <p><b>Route</b>: {r.route.stages.join(' → ') || 'none'}{r.route.notes.length ? ` — ${r.route.notes.join('; ')}` : ''}</p>}
                        {r.details && <p><b>Details</b>: SAM {r.details.before.sam ?? '—'} → {r.details.after.sam ?? '—'}, fit {r.details.before.fit || '—'} → {r.details.after.fit || '—'}, brand {r.details.before.brand || '—'} → {r.details.after.brand || '—'}, category {r.details.before.product_type || '—'} → {r.details.after.product_type || '—'}</p>}
                    </div>
                )}
                {error && <ErrorBox text={error} />}
                <div className="flex flex-wrap justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Close</SecondaryButton>
                    <SecondaryButton onClick={() => go(true)} disabled={busy || !fromId || !Object.values(ticks).some(Boolean)}><Eye size={14} /> Preview</SecondaryButton>
                    <PrimaryButton onClick={() => go(false)} disabled={busy || !preview}><Download size={14} /> Import</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}

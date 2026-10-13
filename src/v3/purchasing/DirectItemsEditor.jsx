// Items with no requisition on a purchase order (13 Oct 2026): fabric, trims, spares or general items picked
// straight from the masters, with a quantity in purchase units and a reason per line. A PO holding any is
// issued only after factory admin approval. Used by New purchase order and "Add item (no requisition)".
import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { inputCls } from '../components/ui';
import { EXTRA_REASONS } from './poShared';

const KINDS = [
    { key: 'FABRIC', label: 'Fabric', params: { kind: 'FABRIC' } },
    { key: 'TRIM', label: 'Trims', params: { kind: 'TRIM' } },
    { key: 'SPARE', label: 'Spares', params: { kind: 'STORE', group: 'SPARE' } },
    { key: 'GENERAL', label: 'General items', params: { kind: 'STORE', group: 'GENERAL' } },
];

// What is missing before these items can be saved (null when fine).
export function directProblem(items) {
    for (const it of items) {
        if (!(Number(it.qty) > 0)) return `${it.label}: enter a quantity.`;
        if (!it.extra_reason) return `${it.label}: pick why it is ordered with no requisition.`;
        if (it.extra_reason === 'OTHER' && !String(it.extra_note || '').trim()) return `${it.label}: reason "Other" — describe it.`;
    }
    return null;
}
export const directPayload = (items) => items.map(it => ({ kind: it.kind, item_id: it.item_id, qty: Number(it.qty), extra_reason: it.extra_reason, extra_note: it.extra_note || null }));

export default function DirectItemsEditor({ items, setItems, supplierId, defaultReason = '' }) {
    const [kind, setKind] = useState('FABRIC');
    const [q, setQ] = useState('');
    const [found, setFound] = useState(null);
    useEffect(() => {
        const k = KINDS.find(x => x.key === kind);
        let live = true;
        const t = setTimeout(() => {
            purchasingApi.items({ ...k.params, q: q.trim() || undefined, supplier_id: supplierId || undefined })
                .then(res => { if (live) setFound(res.data); }).catch(() => { if (live) setFound([]); });
        }, 250);
        return () => { live = false; clearTimeout(t); };
    }, [kind, q, supplierId]);

    const taken = new Set(items.map(it => `${it.kind}:${it.item_id}`));
    const add = (f) => setItems([...items, { ...f, qty: '', extra_reason: defaultReason || (f.kind === 'STORE' ? 'STOCK' : ''), extra_note: '' }]);
    const set = (i, patch) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {KINDS.map(k => (
                    <button key={k.key} type="button" onClick={() => { setKind(k.key); setFound(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${kind === k.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{k.label}</button>
                ))}
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input className={`${inputCls} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name, mill, shade, brand…" aria-label="Search items" />
                </div>
            </div>
            <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                {!found ? <p className="px-3 py-2 text-sm text-slate-400">Searching…</p> : found.length === 0 ? <p className="px-3 py-2 text-sm text-slate-400">No active item matches.</p> : found.map(f => {
                    const on = taken.has(`${f.kind}:${f.item_id}`);
                    return (
                        <button key={f.item_id} type="button" disabled={on} onClick={() => add(f)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 disabled:opacity-50 disabled:hover:bg-transparent">
                            <span className="font-semibold text-sm text-slate-800">{f.label}</span>
                            <span className="block text-xs text-slate-500">{f.type_name} · bought in {f.purchase_uom}{f.factor !== 1 ? ` of ${f.factor} ${f.uom}` : ''}{f.gst_pct != null ? ` · GST ${f.gst_pct}%` : ''}{f.last_rate ? ` · last rate ₹${f.last_rate}` : ''}{on ? ' · added' : ''}</span>
                        </button>
                    );
                })}
            </div>
            {items.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/40 rounded-lg divide-y divide-amber-100">
                    {items.map((it, i) => (
                        <div key={`${it.kind}:${it.item_id}`} className="p-3 grid gap-2 sm:grid-cols-[1fr_9rem_14rem] items-start">
                            <div className="min-w-0">
                                <p className="font-semibold text-sm text-slate-800">{it.label}</p>
                                <p className="text-xs text-slate-500">{it.type_name}{Number(it.qty) > 0 && it.factor !== 1 ? ` · = ${Number(it.qty) * it.factor} ${it.uom}` : ''}</p>
                            </div>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600">
                                <input className="w-24 px-2 py-1.5 text-sm text-right border border-slate-300 rounded" type="number" min="0" step="any" value={it.qty}
                                    onChange={e => set(i, { qty: e.target.value })} aria-label={`Quantity of ${it.label}`} /> {it.purchase_uom}
                            </label>
                            <div className="flex items-start gap-1.5">
                                <div className="flex-1 space-y-1">
                                    <select className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" value={it.extra_reason} onChange={e => set(i, { extra_reason: e.target.value })} aria-label={`Why ${it.label} is ordered`}>
                                        <option value="">— why? —</option>
                                        {EXTRA_REASONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                    </select>
                                    {(it.extra_reason === 'OTHER' || it.extra_reason === 'ADVANCE') && (
                                        <input className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded" value={it.extra_note} onChange={e => set(i, { extra_note: e.target.value })}
                                            placeholder={it.extra_reason === 'ADVANCE' ? 'Which buyer / order? (optional)' : 'Describe the reason'} aria-label="Reason note" />
                                    )}
                                </div>
                                <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} className="p-1.5 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${it.label}`}><X size={14} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

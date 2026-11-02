// The DTM line's item on a PO (3 Nov 2026). Type the supplier's code: it makes a new item of this quality, e.g. TKT 120 33445, and
// the same brand's existing item with that code is used instead of a duplicate. Or pick an existing item of any brand, with its
// free stock: buying it needs no approval, but stock that is free can be used instead, through In-house on the order page.
import { useEffect, useState } from 'react';
import { purchasingApi } from '../api/purchasingApi';
import { inputCls } from '../components/ui';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const labelOf = (f) => `${f.brand} · ${f.code}`;

export default function DtmCodeField({ itemId, value, matchedId, matchedLabel, onChange, label }) {
    const [picking, setPicking] = useState(false);
    const [q, setQ] = useState('');
    const [found, setFound] = useState([]);
    const [free, setFree] = useState(0);
    const typed = String(value || '').trim();
    const search = picking ? q.trim() : typed;
    useEffect(() => {
        if (!picking && (matchedId || search.length < 2)) { setFound([]); return undefined; }
        const t = setTimeout(() => purchasingApi.dtmCandidates({ item_id: itemId, code: search || undefined }).then(r => setFound(r.data)).catch(() => setFound([])), 300);
        return () => clearTimeout(t);
    }, [itemId, search, picking, matchedId]);
    const pick = (f) => { setFree(f.free); setPicking(false); setQ(''); onChange('', f.id, labelOf(f)); };
    const row = (f) => (
        <button type="button" key={f.id} onClick={() => pick(f)} className="block w-full text-left text-xs rounded border px-2 py-1 bg-white border-slate-200 text-slate-700 hover:border-indigo-300">
            <b>{labelOf(f)}</b>{f.description ? ` — ${f.description}` : ''} <span className="text-slate-500">· {fmt(f.free)} free</span>
        </button>
    );
    if (matchedId) {
        return (
            <div className="text-xs">
                <p className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 font-bold text-emerald-800">{matchedLabel}</p>
                {free > 0 && <p className="mt-1 text-amber-800">{fmt(free)} is free in stock. To use it instead of buying, use In-house on the order page.</p>}
                <button type="button" className="mt-1 font-bold text-slate-600 hover:underline" onClick={() => { setFree(0); onChange('', null, null); }}>Change</button>
            </div>
        );
    }
    return (
        <div>
            {picking
                ? <input className={inputCls} autoFocus value={q} placeholder="Search brand or code" aria-label="Search existing items" onChange={e => setQ(e.target.value)} />
                : <input className={inputCls} maxLength={60} value={value || ''} placeholder="e.g. 33445" aria-label={label || 'Supplier code'} onChange={e => onChange(e.target.value, null, null)} />}
            <button type="button" className="mt-1 text-xs font-bold text-indigo-700 hover:underline" onClick={() => { setPicking(p => !p); setQ(''); }}>{picking ? 'Type a supplier code instead' : 'Pick existing item'}</button>
            {picking && found.length === 0 && <p className="mt-1 text-xs text-slate-500">No item found.</p>}
            {found.length > 0 && (
                <div className="mt-1 space-y-1 max-h-48 overflow-auto">
                    {!picking && <p className="text-[11px] font-bold text-amber-800">Already in trim items: is it one of these?</p>}
                    {found.map(row)}
                </div>
            )}
        </div>
    );
}

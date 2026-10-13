// Style picker for "Add style line": type part of the code, name, buyer, brand or category; matches
// show as you type (server search, so it stays fast with thousands of styles). Before typing: the
// recently ordered styles. The order's customer's styles come first. A style without an approved
// style BOM is listed greyed out with the reason; arrow keys + Enter pick.
import { useEffect, useRef, useState } from 'react';
import { Search, CheckCircle2, X } from 'lucide-react';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { inputCls } from '../components/ui';

export default function StylePicker({ customerId, value, onChange, autoFocus }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState(null);
    const [active, setActive] = useState(0);
    const [error, setError] = useState('');
    const list = useRef(null);
    useEffect(() => {
        const t = setTimeout(() => {
            salesOrdersApi.styleOptions({ q: q.trim() || undefined, customer_id: customerId || undefined, limit: 30 })
                .then(res => { setRows(res.data); setActive(res.data.findIndex(r => r.pickable)); setError(''); })
                .catch(() => setError('Could not load styles.'));
        }, q ? 250 : 0);
        return () => clearTimeout(t);
    }, [q, customerId]);
    useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

    const pick = (r) => { if (r?.pickable) onChange(r); };
    const move = (d) => {
        if (!rows?.length) return;
        let i = active;
        for (let k = 0; k < rows.length; k++) { i = (i + d + rows.length) % rows.length; if (rows[i].pickable) break; }
        setActive(i);
    };

    if (value) {
        return (
            <div className="flex items-start gap-3 border border-indigo-300 bg-indigo-50/50 rounded-lg px-3 py-2">
                <CheckCircle2 size={18} className="text-indigo-600 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">{value.style_code} <span className="font-normal text-slate-600">— {value.name}</span></p>
                    <p className="text-xs text-slate-500">{[value.brand, value.product_type, value.fit, value.sam ? `SAM ${value.sam}` : null].filter(Boolean).join(' · ')}{value.bom_version ? ` · style BOM v${value.bom_version}, ${value.colour_count} colours, ${value.size_count} sizes` : ''}</p>
                </div>
                <button type="button" onClick={() => onChange(null)} className="p-1 rounded text-slate-500 hover:bg-white" aria-label="Choose another style"><X size={15} /></button>
            </div>
        );
    }
    return (
        <div>
            <div className="relative">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={`${inputCls} pl-8`} value={q} onChange={e => setQ(e.target.value)} autoFocus={autoFocus} autoComplete="off"
                    placeholder="Type style code, name, buyer, brand or category…" aria-label="Search styles"
                    onKeyDown={e => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
                        else if (e.key === 'Enter') { e.preventDefault(); pick(rows?.[active]); }
                    }} />
            </div>
            {error && <p className="text-xs text-rose-700 mt-1">{error}</p>}
            <p className="text-[11px] text-slate-400 mt-1">{q.trim() ? `Styles matching "${q.trim()}"` : 'Recently ordered styles — type to search all'}{customerId ? '; this customer\'s styles first' : ''}.</p>
            <div ref={list} className="mt-1 max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {!rows ? <p className="px-3 py-2 text-sm text-slate-400">Loading…</p>
                    : rows.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">{q.trim() ? 'No style matches.' : 'No style ordered yet — type to search.'}</p>
                        : rows.map((r, i) => (
                            <button key={r.id} type="button" disabled={!r.pickable} data-active={i === active} onMouseEnter={() => r.pickable && setActive(i)} onClick={() => pick(r)}
                                className={`w-full text-left px-3 py-2 ${!r.pickable ? 'opacity-60 cursor-not-allowed' : i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                                <span className="flex flex-wrap items-baseline gap-x-2">
                                    <b className="text-slate-800">{r.style_code}</b><span className="text-sm text-slate-600">{r.name}</span>
                                    {r.for_customer && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1">this customer</span>}
                                    {r.last_ordered && <span className="text-[10px] text-slate-400">last ordered {r.last_ordered.split('-').reverse().join('-')}</span>}
                                </span>
                                <span className="block text-xs text-slate-500">
                                    {[r.buyer, r.brand, r.product_type, r.fit, r.sam ? `SAM ${r.sam}` : null].filter(Boolean).join(' · ')}
                                    {r.pickable ? ` · style BOM v${r.bom_version}, ${r.colour_count} colours, ${r.size_count} sizes` : ''}
                                </span>
                                {!r.pickable && <span className="block text-[11px] font-semibold text-amber-700">Can't order: {r.why_not}</span>}
                                {r.pickable && r.warning && <span className="block text-[11px] text-amber-700">{r.warning}</span>}
                            </button>
                        ))}
            </div>
        </div>
    );
}

// Search + trim type filter for a trim order's / kit's items (26 Nov 2026, owner on /v3/trim-orders/34: "add search button
// even on kit page add search button and filter for trim type"). Matches the item (brand · code — description), its trim
// type and its line no.; the trim type list is the types on the page.
import { Search, X } from 'lucide-react';

export const itemMatcher = (q, type) => {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return (g) => (!type || (g.type_name || '') === type)
        && words.every(w => `${g.label || ''} ${g.type_name || ''} #${g.line_no ?? ''} ${g.line_no ?? ''}`.toLowerCase().includes(w));
};

// q / setQ, type / setType: the filter; types: the trim types to choose from; shown / total: items matching / all.
export default function ItemFilter({ q, setQ, type, setType, types, shown, total, big = false }) {
    const on = Boolean(q.trim() || type);
    return (
        <div className={`flex flex-wrap items-center gap-2 ${big ? 'mb-3' : 'mb-3'}`}>
            <div className="relative">
                <Search size={big ? 18 : 15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item, code, line no." aria-label="Search items"
                    className={`pl-9 pr-3 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 ${big ? 'py-2.5 text-base w-72' : 'py-2 text-sm w-64'}`} />
            </div>
            <select value={type} onChange={e => setType(e.target.value)} aria-label="Trim type"
                className={`border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-500 ${big ? 'px-3 py-2.5 text-base' : 'px-3 py-2 text-sm'} ${type ? 'font-bold text-indigo-800 border-indigo-400' : 'text-slate-700'}`}>
                <option value="">All trim types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {on && (
                <>
                    <span className="text-sm text-slate-600"><b>{shown}</b> of {total} item{total === 1 ? '' : 's'}</span>
                    <button type="button" onClick={() => { setQ(''); setType(''); }} className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-indigo-700"><X size={14} /> Clear</button>
                </>
            )}
        </div>
    );
}

// Search box over active store items; picking one calls onPick(item).
import { useEffect, useState } from 'react';
import { storeApi } from '../api/storeApi';
import { inputCls } from '../components/ui';
import { fmt } from './storeShared';

export default function StoreItemPicker({ onPick, exclude = [], placeholder = 'Search item: name, code, make…' }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!q.trim()) { setRows([]); return undefined; }
        const t = setTimeout(() => storeApi.items({ q: q.trim(), active: 'true' }).then(res => setRows(res.data.slice(0, 30))).catch(() => setRows([])), 200);
        return () => clearTimeout(t);
    }, [q]);
    const shown = rows.filter(r => !exclude.includes(String(r.id)));
    return (
        <div className="relative">
            <input className={inputCls} value={q} placeholder={placeholder} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Search store item" />
            {open && shown.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                    {shown.map(r => (
                        <button key={r.id} type="button" className="block w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-slate-50"
                            onClick={() => { onPick(r); setQ(''); setRows([]); setOpen(false); }}>
                            <span className="font-semibold text-slate-800">{r.label}</span>
                            <span className="block text-xs text-slate-500">{r.group_label} · {r.category_name} · on hand {fmt(r.on_hand, r.usage_uom)} {r.usage_uom}{r.location ? ` · ${r.location}` : ''}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

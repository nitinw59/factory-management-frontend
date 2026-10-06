// Recent 3.0 changes to a shared master (v3.shared_master_log): who changed what, before → after.
import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';

const fmt = (t) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const diff = (b, a) => {
    if (!b) return a ? Object.entries(a).filter(([k, v]) => k !== 'id' && v != null).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
    if (!a) return Object.entries(b).filter(([k, v]) => k !== 'id' && v != null).map(([k, v]) => `${k}: ${v}`).join(' · ');
    return Object.keys(a).filter(k => k !== 'id' && a[k] !== b[k] && k in b).map(k => `${k}: ${b[k] ?? '—'} → ${a[k] ?? '—'}`).join(' · ');
};

export default function SharedLog({ entity, refresh }) {
    const [rows, setRows] = useState([]);
    useEffect(() => { adminApi.log(entity).then(res => setRows(res.data)).catch(() => setRows([])); }, [entity, refresh]);
    return (
        <section className="mt-6">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Changes made in 3.0</p>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]"><tbody>
                    {rows.length === 0 ? <tr><td className="px-3 py-4 text-slate-400">No changes yet.</td></tr> : rows.slice(0, 50).map(r => (
                        <tr key={r.id} className="border-t border-slate-100 first:border-0">
                            <td className="px-3 py-1.5 text-xs whitespace-nowrap text-slate-500">{fmt(r.created_at)}</td>
                            <td className="px-3 py-1.5 text-xs font-bold">{r.action.toLowerCase()}</td>
                            <td className="px-3 py-1.5 text-xs">{(r.after || r.before)?.name || (r.after || r.before)?.email || `#${r.entity_id}`}</td>
                            <td className="px-3 py-1.5 text-xs text-slate-600">{diff(r.before, r.after)}</td>
                            <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">{r.by_name || '—'}</td>
                        </tr>
                    ))}
                </tbody></table>
            </div>
        </section>
    );
}

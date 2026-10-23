// Line filter for the line loader dashboards, 2.0 (/line-loader/dashboard) and 3.0 (/v3/production/loading) —
// 23 Oct 2026 ("add filter button which filter show batches which are active on selected line and render wip";
// "loader must see all lines"). A "Line" button opens every active line grouped by stage with its WIP; picking one
// narrows the batch list to the batches active on it (the page does that) and shows the line's WIP panel — WIP /
// limit, room left, and the batches it counts. "All lines" clears it. The choice is remembered on this device.
// The button sits in the page header next to History ("add filter next to history button"); the panel goes below it.
// WIP is one count for the physical line across 2.0 and 3.0 (23 Oct 2026, migration 63); each batch is tagged 2.0 / 3.0.
import { useEffect, useRef, useState } from 'react';
import { Filter, ChevronDown, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

const wipCls = (cur, lim) => (lim != null && cur >= lim ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200');
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// Per-device memory of the picked line (a convenience only — the page works without it).
export const readLineFilter = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
export const saveLineFilter = (key, v) => { try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch { /* ignore */ } };

/** The header button. lines: [{ id, name, type, current, limit }]   value: line id ('' = all)   onChange(id) */
export function LineFilterButton({ lines, value, onChange, compact = false }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const picked = lines.find(l => String(l.id) === String(value));
    const groups = [];
    for (const l of lines) {
        let g = groups.find(x => x.type === l.type);
        if (!g) { g = { type: l.type, lines: [] }; groups.push(g); }
        g.lines.push(l);
    }
    return (
        <div className="flex items-center gap-2">
                <div className="relative" ref={ref}>
                    <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
                        className={`flex items-center gap-2 text-sm font-bold border shadow-sm active:scale-95 transition-all ${compact ? 'px-3 py-1.5 rounded-lg' : 'px-4 py-2.5 rounded-xl'} ${picked ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                        <Filter size={14} /> {picked ? picked.name : 'All lines'} <ChevronDown size={14} />
                    </button>
                    {open && (
                        <div role="listbox" className="absolute right-0 z-40 mt-1 w-[min(360px,90vw)] max-h-[70vh] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                            <button type="button" role="option" aria-selected={!picked} onClick={() => { onChange(''); setOpen(false); }}
                                className={`w-full text-left px-3 py-2 text-sm font-bold hover:bg-slate-50 ${!picked ? 'text-indigo-700' : 'text-slate-700'}`}>All lines</button>
                            {groups.map(g => (
                                <div key={g.type} className="border-t border-slate-100">
                                    <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{g.type}</p>
                                    {g.lines.map(l => (
                                        <button key={l.id} type="button" role="option" aria-selected={String(l.id) === String(value)} onClick={() => { onChange(String(l.id)); setOpen(false); }}
                                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${String(l.id) === String(value) ? 'bg-indigo-50 font-bold text-indigo-800' : 'text-slate-700'}`}>
                                            <span className="font-semibold">{l.name}</span>
                                            <span className={`text-[11px] font-black px-2 py-0.5 rounded-md border tabular-nums ${wipCls(l.current, l.limit)}`}>WIP {l.current}/{l.limit ?? '∞'}</span>
                                        </button>
                                    ))}
                                </div>
                            ))}
                            {lines.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">No active lines.</p>}
                        </div>
                    )}
                </div>
                {picked && <button type="button" onClick={() => onChange('')} title="Show all lines" aria-label="Show all lines" className={`${compact ? 'p-1.5 rounded-lg' : 'p-2.5 rounded-xl'} border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-sm`}><X size={14} /></button>}
        </div>
    );
}

/**
 * The selected line's WIP panel (below the header).
 * panel: null | { loading, error, line: { name, type, current, limit, v2, v3 }, batches: [{ key, version, code, sub, stage, status, since, inProgress, done, unitLabel }] }
 */
export function LineWipPanel({ panel }) {
    const P = panel;
    if (!P) return null;
    const room = P?.line && P.line.limit != null ? Math.max(0, P.line.limit - P.line.current) : null;
    return (
        <div className="mb-5">
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {P.loading && !P.line ? <div className="p-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading the line's WIP…</div>
                        : P.error ? <p className="p-4 text-sm font-bold text-rose-700">{P.error}</p> : (
                            <>
                                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b ${P.line.limit != null && P.line.current >= P.line.limit ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <span className="text-lg font-black text-slate-900">{P.line.name}</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{P.line.type}</span>
                                    <span className={`text-sm font-black px-2.5 py-1 rounded-lg border tabular-nums ${wipCls(P.line.current, P.line.limit)}`}>WIP {P.line.current} / {P.line.limit ?? '∞'} batches</span>
                                    {P.line.limit != null && (P.line.current >= P.line.limit
                                        ? <span className="flex items-center gap-1 text-sm font-bold text-rose-700"><AlertTriangle size={14} /> At its limit — no new batch until one finishes here</span>
                                        : <span className="flex items-center gap-1 text-sm font-bold text-emerald-700"><CheckCircle2 size={14} /> Room for {room} more batch{room === 1 ? '' : 'es'}</span>)}
                                    {(P.line.v2 > 0 && P.line.v3 > 0) || P.line.other ? <span className="text-xs font-bold text-slate-600">{[P.line.v2 ? `${P.line.v2} from 2.0` : '', P.line.v3 ? `${P.line.v3} from 3.0` : ''].filter(Boolean).join(' · ')}</span> : null}
                                    {P.loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
                                </div>
                                {P.batches.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">Nothing on this line right now.</p> : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[640px]">
                                            <thead className="text-[11px] font-black uppercase tracking-wider text-slate-500 text-left">
                                                <tr><th className="px-4 py-2">Batch</th><th className="px-4 py-2">Stage</th><th className="px-4 py-2 text-right">In progress</th><th className="px-4 py-2 text-right">Done</th><th className="px-4 py-2">On the line since</th></tr>
                                            </thead>
                                            <tbody>
                                                {P.batches.map(b => (
                                                    <tr key={b.key} className="border-t border-slate-100">
                                                        <td className="px-4 py-2">{b.version && <span className={`mr-1.5 text-[10px] font-black px-1.5 py-0.5 rounded border ${b.version === '3.0' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-sky-50 text-sky-700 border-sky-200'}`}>{b.version}</span>}<b className="text-slate-900">{b.code}</b>{b.sub && <span className="block text-xs text-slate-500">{b.sub}</span>}</td>
                                                        <td className="px-4 py-2 text-xs font-bold text-slate-600">{b.stage}{b.status && b.status !== 'IN_PROGRESS' ? <span className="ml-1 font-normal text-slate-400">({b.status.toLowerCase().replace('_', ' ')})</span> : null}</td>
                                                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-amber-700">{b.inProgress} <span className="text-[11px] font-normal text-slate-400">{b.unitLabel}</span></td>
                                                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">{b.done} <span className="text-[11px] font-normal text-slate-400">{b.unitLabel}</span></td>
                                                        <td className="px-4 py-2 text-xs text-slate-500">{when(b.since)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="border-t-2 border-slate-200 bg-slate-50 font-black text-slate-700">
                                                    <td className="px-4 py-2" colSpan={2}>{new Set(P.batches.map(b => `${b.version}:${b.code}`)).size} batch(es) on the line</td>
                                                    <td className="px-4 py-2 text-right text-xs font-bold text-slate-500" colSpan={2}>{P.batches.some(b => b.version === '2.0') && P.batches.some(b => b.version === '3.0') ? 'units differ by version' : `${P.batches.reduce((a, b) => a + b.inProgress, 0)} in progress · ${P.batches.reduce((a, b) => a + b.done, 0)} done`}</td>
                                                    <td className="px-4 py-2" />
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                </div>
        </div>
    );
}

// The line WIP API (2.0 /line-loader/line-wip/:id and 3.0 /production/line-wip/:id share utils/lineWip.js) → panel data.
export const toLinePanel = (d) => ({
    line: { name: d.line.name, type: d.line.line_type, current: d.line.wip, limit: d.line.wip_limit, v2: d.line.wip_v2, v3: d.line.wip_v3 },
    batches: d.batches.map(b => ({ key: `${b.version}-${b.batch_id}-${b.stage}`, version: b.version, code: b.label, sub: [b.order_no, b.customer_name, b.product_name].filter(Boolean).join(' · '),
        stage: b.stage, status: b.status, since: b.since, inProgress: b.in_progress, done: b.done, unitLabel: b.unit })),
});

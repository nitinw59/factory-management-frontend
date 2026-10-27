// Batches × stages on the order tracker (27 Oct 2026, owner: "how can merchandiser track batches on each stage for
// sales order like we had production workflow in 2.0" → "build all"). One table per order line: a row per cut batch,
// a column per route stage — % done there (pieces, or garments at garment stages), the line, garments through,
// rework / rejected, and ⏱ when work on the line has had no check for a shift. Tap a stage for its rolls (MODE_1)
// or sizes (MODE_2): state, done, line, on the line since, what it waits for — the line loader's board, read only.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { trackerApi } from '../api/trackerApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading, fmtQty } from '../components/ui';
import { Section, TONE } from '../components/Section';
import { PriorityBadge } from '../cutting/cutShared';

const TH = 'px-2 py-2 text-[11px] font-bold uppercase tracking-wider';
const stageName = (s) => (s.name === 'Cutting' ? 'Numbering' : s.name);
const pctOf = (d, t) => (t > 0 ? Math.floor((d / t) * 100) : 0);
const unitShort = (s) => (s.unit === 'GARMENT' ? 'gmt' : 'pcs');
const hrs = (h) => (h == null ? '' : h < 24 ? `${Math.round(h)} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`);
const when = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const complete = (s) => s.items > 0 && s.done >= s.items;
const started = (s) => s.done > 0 || s.on_line > 0 || s.rework > 0 || s.rejected > 0;
const cellTone = (s) => (complete(s) ? 'bg-emerald-50' : s.stuck ? 'bg-rose-50' : s.rework > 0 ? 'bg-amber-50' : started(s) ? 'bg-sky-50' : '');
const barCls = (s) => (complete(s) ? 'bg-emerald-500' : s.stuck ? 'bg-rose-500' : 'bg-sky-500');
const STATE = {
    WAITING: ['waiting', 'bg-slate-100 text-slate-500'],
    READY: ['ready to load', 'bg-indigo-50 text-indigo-700'],
    ON_LINE: ['on line', 'bg-sky-100 text-sky-800'],
    DONE: ['done', 'bg-emerald-100 text-emerald-800'],
};

function StageCell({ s, stuckHours, onOpen }) {
    const pct = pctOf(s.done, s.items);
    return (
        <td className={`px-1.5 py-1 align-top border-l border-slate-100 ${cellTone(s)}`}>
            <button type="button" onClick={onOpen} title={`${stageName(s)} — tap for the ${s.units[0]?.kind === 'size' ? 'sizes' : 'rolls'}`}
                className="w-full min-w-[6.5rem] text-left rounded px-1 py-0.5 hover:ring-2 hover:ring-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {!started(s) ? (
                    <span className="text-xs text-slate-400">{s.units.some(u => u.state === 'READY') ? 'ready to load' : 'not started'}</span>
                ) : (
                    <>
                        <span className="flex items-baseline gap-1">
                            <b className={`tabular-nums ${complete(s) ? 'text-emerald-700' : s.stuck ? 'text-rose-700' : 'text-slate-900'}`}>{pct}%</b>
                            <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{fmtQty(s.done)}/{fmtQty(s.items)}</span>
                        </span>
                        <span className="block h-1 bg-slate-200 rounded-full overflow-hidden my-0.5"><span className={`block h-full ${barCls(s)}`} style={{ width: `${pct}%` }} /></span>
                        {s.line && <span className="block text-[11px] text-slate-600 truncate">{s.line.name}</span>}
                        <span className="flex flex-wrap gap-x-1.5 text-[11px] font-semibold">
                            {s.unit !== 'GARMENT' && s.garments.done > 0 && <span className="text-emerald-700" title="garments with every piece this stage checks cleared">✓{fmtQty(s.garments.done)} gmt</span>}
                            {s.rework > 0 && <span className="text-amber-700" title={`in rework${s.rework_old ? ` — ${s.rework_old} for more than ${stuckHours} h` : ''}`}>↻{s.rework}{s.rework_old ? '!' : ''}</span>}
                            {s.rejected > 0 && <span className="text-rose-700" title="rejected">✗{s.rejected}</span>}
                            {s.stuck && <span className="text-rose-700" title={`work on the line, no check for ${hrs(s.idle_hours)}`}>⏱ {hrs(s.idle_hours)}</span>}
                        </span>
                    </>
                )}
            </button>
        </td>
    );
}

function StageDetail({ b, s, stuckHours, onClose }) {
    useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);
    const kind = b.numbering_mode === 'MODE_2' ? 'Size' : 'Roll';
    const t = s.units.reduce((a, u) => ({ items: a.items + u.items, done: a.done + u.done, rework: a.rework + u.rework, rejected: a.rejected + u.rejected }), { items: 0, done: 0, rework: 0, rejected: 0 });
    const facts = [
        s.line ? `line ${s.line.name}` : null,
        s.since ? `on the line since ${when(s.since)}` : null,
        s.last_check ? `last check ${when(s.last_check)}` : 'no check yet',
        s.rework ? `${s.rework} in rework${s.rework_age_hours != null ? `, oldest ${hrs(s.rework_age_hours)}` : ''}` : null,
    ].filter(Boolean);
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={`Batch #${b.floor_no} at ${stageName(s)}`} onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50 rounded-t-xl">
                    <div className="min-w-0">
                        <h3 className="font-black text-slate-900">#{b.floor_no} · {stageName(s)} <span className="text-sm font-semibold text-slate-500">{b.batch_code}</span></h3>
                        <p className="text-xs text-slate-600">{pctOf(s.done, s.items)}% done · {fmtQty(s.done)} of {fmtQty(s.items)} {s.unit === 'GARMENT' ? 'garments' : 'pieces'}{s.unit !== 'GARMENT' ? ` · ${fmtQty(s.garments.done)} garments through` : ''} · {facts.join(' · ')}</p>
                        {s.stuck && <p className="text-xs font-bold text-rose-700 mt-0.5">⏱ Work is on the line and nothing was checked for {hrs(s.idle_hours)} (more than {stuckHours} h).</p>}
                    </div>
                    <button type="button" onClick={onClose} className="ml-auto p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-slate-500 sticky top-0"><tr>
                            <th className={TH}>{kind}</th><th className={TH}>State</th><th className={`${TH} text-right`}>Done</th><th className={`${TH} text-right`}>Rework</th><th className={`${TH} text-right`}>Rejected</th>
                            <th className={TH}>Line</th><th className={TH}>On the line since</th><th className={TH}>{kind === 'Roll' ? 'Sizes · waiting for' : 'Waiting for'}</th>
                        </tr></thead>
                        <tbody>{s.units.map(u => {
                            const [label, cls] = STATE[u.state] || STATE.WAITING;
                            return (
                                <tr key={u.key} className="border-t border-slate-100 align-top">
                                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{u.label.replace(/^(Roll|Size) /, '')}</td>
                                    <td className="px-2 py-1.5"><span className={`text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${cls}`}>{label}</span>{u.forwarded && <span className="block text-[11px] text-slate-500">sent to next stage</span>}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(u.done)}/{fmtQty(u.items)}</td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${u.rework ? 'text-amber-700 font-bold' : 'text-slate-300'}`}>{u.rework || '—'}</td>
                                    <td className={`px-2 py-1.5 text-right tabular-nums ${u.rejected ? 'text-rose-700 font-bold' : 'text-slate-300'}`}>{u.rejected || '—'}</td>
                                    <td className="px-2 py-1.5 text-xs">{u.line || (s.first ? s.line?.name : null) || '—'}</td>
                                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">{u.loaded_at ? when(u.loaded_at) : '—'}{u.completed_at && <span className="block text-slate-500">done {when(u.completed_at)}</span>}</td>
                                    <td className="px-2 py-1.5 text-xs text-slate-600">
                                        {u.sizes && <span className="block">{u.sizes.map(z => `${z.size}: ${z.done}/${z.items}`).join(' · ')}</span>}
                                        {u.waiting > 0 && <span className="block text-amber-700">{u.waiting} waiting for {u.blockers.join(', ') || 'the stage before'}</span>}
                                    </td>
                                </tr>
                            );
                        })}</tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold"><tr>
                            <td className="px-2 py-2 whitespace-nowrap">Total · {s.units.length}</td><td />
                            <td className="px-2 py-2 text-right tabular-nums">{fmtQty(t.done)}/{fmtQty(t.items)}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.rework}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.rejected}</td>
                            <td colSpan={3} className="px-2 py-2 text-xs font-semibold text-slate-600">{s.units.filter(u => u.state === 'DONE').length} done · {s.units.filter(u => u.state === 'ON_LINE').length} on line · {s.units.filter(u => u.state === 'READY').length} ready · {s.units.filter(u => u.state === 'WAITING').length} waiting</td>
                        </tr></tfoot>
                    </table>
                </div>
                <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">Read only — the line loader loads {kind === 'Roll' ? 'rolls' : 'sizes'} and checkers check them on their own screens.</p>
            </div>
        </div>
    );
}

export default function BatchStages({ orderId, can }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(null);   // { b, s }
    useEffect(() => {
        setD(null);
        trackerApi.orderProduction(orderId).then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load the batches.')));
    }, [orderId]);
    const { hash } = useLocation();
    useEffect(() => {   // opened from the tracker's Production view (…#batches): straight to the batches once loaded
        if (d && hash === '#batches') document.getElementById('batches')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [d, hash]);
    const t0 = TONE.emerald;
    const L = ({ to, k, children }) => (can(k) ? <Link to={to} className="text-indigo-700 hover:underline">{children}</Link> : <span>{children}</span>);

    if (!d) return <Section tone="emerald" title="Batches × stages">{error ? <div className="p-3"><ErrorBox text={error} /></div> : <Loading />}</Section>;
    const lines = [...new Map(d.batches.map(b => [b.line_id, { line_id: b.line_id, line_no: b.line_no, style: `${b.style_code} — ${b.style_name}`, batches: [] }])).values()];
    for (const b of d.batches) lines.find(l => l.line_id === b.line_id).batches.push(b);

    return (
        <div id="batches">
            {!lines.length && <Section tone="emerald" title="Batches × stages"><p className="px-4 py-3 text-sm text-slate-500">No cut batches yet.</p></Section>}
            {lines.map(l => {
                const cols = (l.batches.find(b => b.stages.length) || { stages: [] }).stages;
                const tot = cols.map(c => l.batches.reduce((a, b) => {
                    const s = b.stages.find(x => x.stage_type_id === c.stage_type_id);
                    return s ? { g: a.g + s.garments.done, rework: a.rework + s.rework, rejected: a.rejected + s.rejected, on: a.on + (s.on_line ? 1 : 0) } : a;
                }, { g: 0, rework: 0, rejected: 0, on: 0 }));
                const garments = l.batches.reduce((a, b) => a + (b.garments || 0), 0);
                const all = l.batches.reduce((a, b) => b.stages.reduce((x, s) => ({ done: x.done + s.done, items: x.items + s.items }), a), { done: 0, items: 0 });
                const stuck = l.batches.filter(b => b.stages.some(s => s.stuck)).length;
                return (
                    <Section key={l.line_id} tone="emerald" title={`Batches × stages · line ${l.line_no} · ${l.style}`}
                        subtitle="tap a stage for its rolls / sizes" right={`${l.batches.length} batch${l.batches.length === 1 ? '' : 'es'}${stuck ? ` · ⏱ ${stuck} stuck (no check for ${d.stuck_hours} h)` : ''}`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className={`${t0.head} text-left`}><tr>
                                    <th className={`${TH} pl-3 sticky left-0 z-10 bg-emerald-50`}>Batch</th><th className={`${TH} text-right`}>Garments</th>
                                    {cols.map(c => <th key={c.stage_type_id} className={`${TH} border-l border-slate-100`}>{stageName(c)} <span className="normal-case font-semibold text-slate-400">{unitShort(c)}</span></th>)}
                                    <th className={`${TH} text-right border-l border-slate-200`}>Overall</th>
                                </tr></thead>
                                <tbody>{l.batches.map(b => {
                                    const ov = b.stages.reduce((x, s) => ({ done: x.done + s.done, items: x.items + s.items }), { done: 0, items: 0 });
                                    return (
                                        <tr key={b.id} className="border-t border-slate-100">
                                            <td className="px-3 py-1.5 align-top whitespace-nowrap sticky left-0 z-10 bg-white">
                                                <L to={`/v3/cutting/batches/${b.id}`} k="production.cutting"><b>#{b.floor_no}</b></L> <PriorityBadge p={b.priority} note={b.priority_note} />
                                                {b.finished && <span className="ml-1 text-[11px] font-bold text-emerald-700">✓ finished</span>}
                                                <span className="block text-[11px] text-slate-500">{b.batch_code}</span><span className="hidden sm:block text-[11px] text-slate-500">{b.numbering_mode === 'MODE_2' ? 'size by size' : 'roll by roll'}</span>
                                                {b.colours && <span className="hidden sm:block text-[11px] text-slate-500 max-w-[11rem] truncate" title={b.colours}>{b.colours}</span>}
                                                {(b.recuts_open > 0 || b.replacements_open > 0) && (
                                                    <span className="block text-[11px] font-semibold text-amber-700">{[b.recuts_open ? `${b.recuts_open} re-cut open` : '', b.replacements_open ? `${b.replacements_open} replacement waiting` : ''].filter(Boolean).join(' · ')}</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums align-top">{fmtQty(b.garments)}</td>
                                            {b.stages.length ? cols.map(c => {
                                                const s = b.stages.find(x => x.stage_type_id === c.stage_type_id);
                                                return s ? <StageCell key={c.stage_type_id} s={s} stuckHours={d.stuck_hours} onOpen={() => setOpen({ b, s })} /> : <td key={c.stage_type_id} className="border-l border-slate-100" />;
                                            }) : (
                                                <td colSpan={cols.length || 1} className="px-2 py-1.5 text-xs text-slate-500 border-l border-slate-100">Cutting {String(b.status).toLowerCase()} — the stages start when the batch is finalised.</td>
                                            )}
                                            <td className="px-2 py-1.5 text-right tabular-nums align-top border-l border-slate-200 font-bold">{ov.items ? `${pctOf(ov.done, ov.items)}%` : '—'}</td>
                                        </tr>
                                    );
                                })}</tbody>
                                <tfoot className={`${t0.foot} border-t-2 font-bold`}><tr>
                                    <td className="px-3 py-2 sticky left-0 z-10 bg-emerald-50">Total · {l.batches.length} batch{l.batches.length === 1 ? '' : 'es'}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{fmtQty(garments)}</td>
                                    {tot.map((x, i) => (
                                        <td key={cols[i].stage_type_id} className="px-2 py-2 text-xs border-l border-slate-100 whitespace-nowrap" title="garments through this stage">
                                            {fmtQty(x.g)} gmt{x.rework ? <span className="ml-1 text-amber-700">↻{x.rework}</span> : null}{x.rejected ? <span className="ml-1 text-rose-700">✗{x.rejected}</span> : null}
                                            {x.on > 0 && <span className="block font-semibold text-sky-700">{x.on} on line</span>}
                                        </td>
                                    ))}
                                    {!cols.length && <td />}
                                    <td className="px-2 py-2 text-right tabular-nums border-l border-slate-200">{all.items ? `${pctOf(all.done, all.items)}%` : '—'}</td>
                                </tr></tfoot>
                            </table>
                        </div>
                        <p className="px-4 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">
                            % done at each stage (pieces; garments at garment stages) · ✓ garments through · ↻ rework (! = older than {d.stuck_hours} h) · ✗ rejected · ⏱ work on the line with no check for {d.stuck_hours} h. Overall: all stages together. Totals: garments through each stage.
                        </p>
                    </Section>
                );
            })}
            {open && <StageDetail b={open.b} s={open.s} stuckHours={d.stuck_hours} onClose={() => setOpen(null)} />}
        </div>
    );
}

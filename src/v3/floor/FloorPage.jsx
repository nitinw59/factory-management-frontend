// Floor in-charge portal — the floor picture (19 Oct 2026, phase 4; docs/PRODUCTION_V3_PLAN.md → "Floor in-charge
// portal"): WIP per line, rolls / sizes waiting to be loaded, rework piling up per station against the limits,
// replacements waiting for pickup and their progress, batch priorities (view only — the factory admin sets them), and
// the floor in-charge's own override password. Live; each block links to the page that owns the action.
// 20 Oct 2026 (line accountability): who answers for each line — responsible supervisor and line loader (red when
// missing), and in the last 7 days how many overrides / loads were by them or by others covering.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Layers, Clock, AlertTriangle, Package, ListOrdered, UserCheck } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading } from '../components/ui';
import { useV3Live } from '../live';
import { PriorityBadge } from '../cutting/cutShared';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import SupervisorPinCard from './SupervisorPinCard';

const ago = (t) => {
    if (!t) return '—';
    const h = (Date.now() - new Date(t).getTime()) / 3600000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
};
const REP = { REQUESTED: ['To pick up', 'bg-violet-100 text-violet-800'], PICKED_UP: ['Picked up', 'bg-sky-100 text-sky-800'], ACCEPTED: ['At cutting', 'bg-indigo-100 text-indigo-800'] };
const LEVEL = { BLOCK: 'bg-rose-50 border-rose-300 text-rose-800', WARN: 'bg-amber-50 border-amber-300 text-amber-900', OK: 'bg-white border-slate-200 text-slate-700' };

function Block({ icon: Icon, title, count, to, toLabel, children }) {
    return (
        <section className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <Icon size={17} className="text-indigo-600" /><h2 className="font-black text-slate-800">{title}</h2>
                {count != null && <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{count}</span>}
                {to && <Link to={to} className="ml-auto text-xs font-bold text-indigo-700 hover:underline">{toLabel}</Link>}
            </div>
            <div className="p-3">{children}</div>
        </section>
    );
}

export default function FloorPage() {
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [perms, setPerms] = useState({});
    const load = useCallback(() => productionApi.floor().then(r => { setD(r.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load the floor.'))), []);
    useEffect(() => { load(); productionApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, [load]);
    const live = useV3Live(load);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const types = [...new Set(d.lines.map(l => l.line_type))];
    const full = d.lines.filter(l => l.wip_limit && l.open_batches >= l.wip_limit).length;
    const over = d.rework.filter(r => r.level !== 'OK').length;
    const toPick = d.replacements.filter(r => r.status === 'REQUESTED').length;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">Floor</h1><p className="text-sm text-slate-500">Lines, loading, rework and replacements — the whole floor at a glance.</p></div>
                <span className="ml-auto flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest ${live ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />{live ? 'Live' : 'Offline'}</span>
                    <button type="button" onClick={load} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-700 text-sm font-bold"><RefreshCw size={15} /> Refresh</button>
                </span>
            </div>
            <ErrorBox text={error} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[['Lines at their WIP limit', full, full ? 'text-rose-700' : 'text-slate-800'], ['Waiting to be loaded', d.waiting.reduce((s, w) => s + w.units.length, 0), 'text-slate-800'],
                    ['Stations over the rework limit', over, over ? 'text-amber-700' : 'text-slate-800'], ['Replacements to pick up', toPick, toPick ? 'text-violet-700' : 'text-slate-800']].map(([k, v, c]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className={`text-2xl font-black ${c}`}>{v}</p></div>
                ))}
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
                <Block icon={Layers} title="WIP per line" to="/v3/production/loading" toLabel="Line loader →">
                    {types.map(t => (
                        <div key={t} className="mb-2">
                            <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">{t}</p>
                            {d.lines.filter(l => l.line_type === t).map(l => {
                                const pct = l.wip_limit ? Math.min(100, (l.open_batches / l.wip_limit) * 100) : 0;
                                const tone = !l.wip_limit ? 'bg-slate-300' : pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
                                return (
                                    <div key={l.id} className="flex items-center gap-3 py-1 text-sm">
                                        <span className="w-40 font-semibold text-slate-700 truncate">{l.name}</span>
                                        <span className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden"><span className={`block h-full ${tone}`} style={{ width: `${l.wip_limit ? pct : 0}%` }} /></span>
                                        <span className="w-20 text-right tabular-nums font-bold">{l.open_batches}{l.wip_limit ? ` / ${l.wip_limit}` : ''}</span>
                                        <span className="w-24 text-right text-xs text-slate-500">{l.oldest_open ? `oldest ${ago(l.oldest_open)}` : 'empty'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </Block>
                <Block icon={Clock} title="Waiting to be loaded" count={d.waiting.length} to="/v3/production/loading" toLabel="Load →">
                    {d.waiting.length === 0 ? <p className="text-sm text-slate-400">Nothing ready and waiting.</p> : (
                        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">{d.waiting.map(w => (
                            <Link key={`${w.batch_id}|${w.stage_type_id}`} to={`/v3/production/loading?batch=${w.batch_id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm hover:bg-slate-50">
                                <span className="font-black text-slate-900">#{w.floor_no}</span><PriorityBadge p={w.priority} />
                                <span className="font-semibold">{w.stage}</span><span className="text-xs text-slate-500">{w.units.join(', ')}</span>
                                <span className="ml-auto text-xs text-slate-500">waiting {ago(w.since)}{w.ship_date ? ` · ships ${fmtDate(w.ship_date)}` : ''}</span>
                            </Link>
                        ))}</div>
                    )}
                </Block>
                <Block icon={AlertTriangle} title="Rework piling up" count={d.rework.length} to="/v3/floor/rework" toLabel="Rework & replacement →">
                    {d.rework.length === 0 ? <p className="text-sm text-slate-400">No rework waiting.</p> : (
                        <div className="space-y-1.5 max-h-80 overflow-y-auto">{d.rework.map(r => (
                            <Link key={`${r.line_id}|${r.stage_type_id}`} to={`/v3/floor/rework?stage=${r.stage_type_id}${r.line_id ? `&line=${r.line_id}` : ''}`} className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-sm ${LEVEL[r.level]}`}>
                                <b>{r.line || '—'}</b><span>{r.stage}</span>
                                <span className="ml-auto tabular-nums font-black">{r.pending}{r.block ? ` / ${r.block}` : ''}</span>
                                <span className="w-full text-xs opacity-80">{r.rework} in rework{r.replacement ? ` · ${r.replacement} waiting for replacement` : ''} · oldest {ago(r.oldest)}{r.level === 'BLOCK' ? ' · approvals blocked' : r.level === 'WARN' ? ' · over the warning' : ''}</span>
                            </Link>
                        ))}</div>
                    )}
                </Block>
                <Block icon={Package} title="Material replacement" count={d.replacements.length} to="/v3/floor/rework?status=REPLACEMENT" toLabel="All →">
                    {d.replacements.length === 0 ? <p className="text-sm text-slate-400">No pieces waiting for new material.</p> : (
                        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">{d.replacements.map(r => (
                            <div key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                                <span className="font-black">#{r.floor_no}</span><span><b>{r.part_name} · {r.size} #{r.no}</b> <span className="text-xs text-slate-500">roll #{r.roll_no ?? '—'} · {r.stage}{r.line ? ` · ${r.line}` : ''}</span></span>
                                <span className={`ml-auto text-[11px] font-black px-2 py-0.5 rounded ${REP[r.status][1]}`}>{REP[r.status][0]}</span>
                                <span className="text-xs text-slate-500 w-20 text-right">{ago(r.created_at)}</span>
                            </div>
                        ))}</div>
                    )}
                </Block>
                <Block icon={ListOrdered} title="Priorities" count={d.priorities.length}>
                    <p className="text-xs text-slate-500 mb-1.5">Set by the factory admin — view only.</p>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">{d.priorities.map(b => (
                        <div key={b.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                            <span className="font-black w-12">#{b.floor_no}</span><PriorityBadge p={b.priority} note={b.priority_note} always />
                            <span className="text-slate-700">{b.order_no} · {b.style_code}</span>
                            <span className="ml-auto text-xs text-slate-500">{b.at_stage || (b.status === 'CUT' ? '' : 'at cutting')}{b.ship_date ? ` · ships ${fmtDate(b.ship_date)}` : ''}</span>
                        </div>
                    ))}</div>
                </Block>
                <Block icon={UserCheck} title="Who answers for each line" count={d.lines.filter(l => !l.supervisor_id || !l.loader_id).length || null} to="/v3/production/floor-layout" toLabel="Floor layout →">
                    <p className="text-xs text-slate-500 mb-1.5">Anyone may cover; the responsible supervisor and line loader answer for their line. Last 7 days: overrides and loads, of them by others covering.</p>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">{d.lines.map(l => (
                        <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm">
                            <span className="w-32 font-semibold text-slate-700 truncate">{l.name}</span>
                            <span className={l.supervisor_id ? 'text-slate-700' : 'text-rose-700 font-bold'}>{l.supervisor_name || 'No supervisor'}</span>
                            <span className="text-slate-300">·</span>
                            <span className={l.loader_id ? 'text-slate-700' : 'text-rose-700 font-bold'}>{l.loader_name || 'No line loader'}</span>
                            <span className="ml-auto text-xs text-slate-500 tabular-nums">overrides {l.overrides_7d}{l.overrides_covered_7d ? <b className="text-amber-700"> ({l.overrides_covered_7d} covering)</b> : ''} · loads {l.loads_7d}{l.loads_covered_7d ? <b className="text-amber-700"> ({l.loads_covered_7d} covering)</b> : ''}</span>
                        </div>
                    ))}</div>
                </Block>
                {perms.supervisorPin && <SupervisorPinCard />}
            </div>
        </div>
    );
}

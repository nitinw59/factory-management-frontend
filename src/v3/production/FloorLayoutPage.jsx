// Floor layout board (20 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Line accountability" §C — replaces 2.0's Factory
// layout planner for 3.0). Every line with its workstations in order (operator, process role, approval rights, checked
// today), its responsible supervisor and line loader (anyone may cover; they answer for the line — red when missing),
// and its live load. Tap a workstation to pick it, then "Place here" on a line (or "Take off line"); arrows set the
// order. Each change is saved at once, all or nothing, and logged. Factory admin and production manager change it; the
// floor in-charge views. Works on a tablet (no dragging).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, X, RefreshCw, MapPin, History, UserCheck, Truck, CircleDot } from 'lucide-react';
import { floorLayoutApi } from '../api/floorLayoutApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading, SecondaryButton, PrimaryButton } from '../components/ui';

const ROLE = { loader: ['Loader', 'bg-sky-50 text-sky-800 border-sky-300'], regular: ['Inline', 'bg-slate-50 text-slate-700 border-slate-300'], unloader: ['Unloader', 'bg-violet-50 text-violet-800 border-violet-300'] };
const pretty = (r) => String(r || '').replace(/_/g, ' ');

function Chip({ w, picked, onPick, editable, onUp, onDown, first, last }) {
    const role = ROLE[w.process_role] || [w.process_role || '—', 'bg-slate-50 text-slate-600 border-slate-200'];
    return (
        <div className={`flex items-stretch rounded-lg border bg-white ${picked ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-slate-200'}`}>
            <button type="button" onClick={editable ? onPick : undefined} className={`flex-1 min-w-0 text-left px-2.5 py-2 ${editable ? 'hover:bg-slate-50' : 'cursor-default'}`} aria-pressed={picked}>
                <span className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-800 truncate">{w.name}</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${role[1]}`}>{role[0]}</span>
                    {w.checked_today && <span title="Checked work today" className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CircleDot size={11} /> today</span>}
                </span>
                <span className={`block text-xs truncate ${w.operator ? 'text-slate-600' : 'text-rose-700 font-semibold'}`}>{w.operator ? `${w.operator} · ${pretty(w.operator_role)}` : 'No operator'}</span>
                <span className="block text-[10px] text-slate-400">{[w.multi && 'many pieces', w.whole_bundle && 'whole bundle', w.whole_roll && 'whole roll'].filter(Boolean).join(' · ') || 'one piece at a time'}{w.is_active ? '' : ' · archived'}</span>
            </button>
            {editable && onUp && (
                <span className="flex flex-col border-l border-slate-100">
                    <button type="button" aria-label={`Move ${w.name} up`} disabled={first} onClick={onUp} className="flex-1 px-2 text-slate-500 hover:text-indigo-700 disabled:opacity-30"><ArrowUp size={15} /></button>
                    <button type="button" aria-label={`Move ${w.name} down`} disabled={last} onClick={onDown} className="flex-1 px-2 text-slate-500 hover:text-indigo-700 disabled:opacity-30"><ArrowDown size={15} /></button>
                </span>
            )}
        </div>
    );
}

function Responsible({ line, kind, people, editable, onSet }) {
    const id = kind === 'SUPERVISOR' ? line.supervisor_id : line.loader_id;
    const name = kind === 'SUPERVISOR' ? line.supervisor_name : line.loader_name;
    const Icon = kind === 'SUPERVISOR' ? UserCheck : Truck;
    const label = kind === 'SUPERVISOR' ? 'Supervisor' : 'Line loader';
    return (
        <label className={`flex items-center gap-1.5 min-w-0 text-xs rounded-lg border px-2 py-1 ${id ? 'border-slate-200 bg-white' : 'border-rose-300 bg-rose-50'}`}>
            <Icon size={13} className={id ? 'text-slate-500' : 'text-rose-600'} />
            <span className="font-bold text-slate-500 whitespace-nowrap">{label}</span>
            {editable ? (
                <select className={`min-w-0 flex-1 bg-transparent text-sm font-semibold ${id ? 'text-slate-800' : 'text-rose-700'}`} value={id || ''} onChange={e => onSet(kind, e.target.value || null)} aria-label={`${label} of ${line.name}`}>
                    <option value="">{`— none —`}</option>
                    {id && !people.some(p => p.id === id) && <option value={id}>{name} (not eligible now)</option>}
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}{['line_supervisor', 'line_loader'].includes(p.role) ? '' : ` · ${pretty(p.role)}`}</option>)}
                </select>
            ) : <span className={`font-semibold ${id ? 'text-slate-800' : 'text-rose-700'}`}>{name || 'none'}</span>}
        </label>
    );
}

export default function FloorLayoutPage() {
    const [d, setD] = useState(null);
    const [perm, setPerm] = useState({ edit: false });
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [pick, setPick] = useState(null);       // workstation id picked to place
    const [type, setType] = useState('');         // line type filter
    const [inactive, setInactive] = useState(false);
    const [log, setLog] = useState(null);
    const load = useCallback(() => floorLayoutApi.board().then(r => { setD(r.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load the floor layout.'))), []);
    useEffect(() => { load(); floorLayoutApi.permissions().then(r => setPerm(r.data)).catch(() => {}); }, [load]);
    const wsById = useMemo(() => {
        const m = new Map();
        if (d) { for (const l of d.lines) for (const w of l.workstations) m.set(w.id, w); for (const w of d.unplaced) m.set(w.id, w); }
        return m;
    }, [d]);
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const edit = perm.edit;
    const types = [...new Set(d.lines.map(l => l.line_type))];
    const shown = d.lines.filter(l => (inactive || l.is_active) && (!type || l.line_type === type));
    const missing = d.lines.filter(l => l.is_active && l.missing.length);
    const picked = pick ? wsById.get(pick) : null;
    const pickedLine = picked ? d.lines.find(l => l.workstations.some(w => w.id === pick)) : null;

    // Save one change; a 409 that needs a confirm asks, then sends it again with confirm.
    const save = async (fn, done) => {
        setBusy(true); setError(''); setMsg('');
        try { await fn(false); done && setMsg(done); }
        catch (err) {
            if (err?.response?.status === 409 && err.response.data?.confirm_needed) {
                if (window.confirm(err.response.data.error)) {
                    try { await fn(true); done && setMsg(done); } catch (e2) { setError(apiError(e2, 'Failed.')); }
                }
            } else setError(apiError(err, 'Failed.'));
        } finally { setBusy(false); setPick(null); await load(); if (log) floorLayoutApi.log().then(r => setLog(r.data)).catch(() => {}); }
    };
    const place = (lineId) => { const w = picked; save((c) => floorLayoutApi.place(w.id, lineId, null, c), lineId ? `${w.name} placed on ${d.lines.find(l => l.id === lineId).name}.` : `${w.name} taken off its line.`); };
    const move = (line, i, dir) => {
        const ids = line.workstations.map(w => w.id); const [x] = ids.splice(i, 1); ids.splice(i + dir, 0, x);
        save(() => floorLayoutApi.order(line.id, ids));
    };
    const setResp = (line) => (kind, userId) => save((c) => floorLayoutApi.setResponsible(line.id, kind, userId, c), `${kind === 'SUPERVISOR' ? 'Supervisor' : 'Line loader'} of ${line.name} saved.`);
    const nameOf = (id) => (id ? (d.supervisors.find(p => p.id === id) || d.loaders.find(p => p.id === id))?.name || `user ${id}` : 'none');
    const changeText = (g) => {
        const b = g.before || {}, a = g.after || {}; const out = [];
        if (b.line_manager_user_id !== a.line_manager_user_id) out.push(`supervisor ${nameOf(b.line_manager_user_id)} → ${nameOf(a.line_manager_user_id)}`);
        if (b.line_loader_user_id !== a.line_loader_user_id) out.push(`line loader ${nameOf(b.line_loader_user_id)} → ${nameOf(a.line_loader_user_id)}`);
        if (JSON.stringify(b.layout) !== JSON.stringify(a.layout)) out.push(`workstations: ${(a.layout || []).map(id => wsById.get(id)?.name || id).join(', ') || 'none'}`);
        return out.join(' · ') || 'details changed';
    };

    return (
        <div>
            <PageHeader title="Floor layout" subtitle="Lines, their workstations in order, and who answers for each line. Anyone may cover a line; the responsible supervisor and line loader answer for it. Shared with 2.0 — every change is logged."
                actions={<span className="flex gap-2">
                    <SecondaryButton onClick={() => (log ? setLog(null) : floorLayoutApi.log().then(r => setLog(r.data)).catch(err => setError(apiError(err, 'Failed.'))))}><History size={14} /> {log ? 'Hide changes' : 'Recent changes'}</SecondaryButton>
                    <SecondaryButton onClick={load}><RefreshCw size={14} /> Refresh</SecondaryButton></span>} />
            {!edit && <p className="mb-3 text-sm text-slate-500">View only — the factory admin and the production manager change the layout.</p>}
            {missing.length > 0 && <div className="mb-3 text-sm rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900"><b>{missing.length} line(s) without a responsible person:</b> {missing.map(l => `${l.name} (${l.missing.map(m => (m === 'SUPERVISOR' ? 'supervisor' : 'line loader')).join(', ')})`).join(' · ')}. Work goes on; set them below.</div>}
            {d.on_several_lines.length > 0 && <div className="mb-3 text-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"><b>On more than one line (from 2.0):</b> {d.on_several_lines.map(w => w.name).join(', ')} — pick it and place it on the one line it belongs to.</div>}
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm font-semibold text-emerald-700">{msg}</p>}
            {log && (
                <div className="mb-4 bg-white border border-slate-200 rounded-xl p-3 max-h-72 overflow-y-auto">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Recent changes</p>
                    {log.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : log.map(g => (
                        <p key={g.id} className="py-1 text-sm border-t border-slate-100 first:border-0"><span className="text-xs text-slate-400 mr-2">{new Date(g.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><b>{g.line || `line ${g.line_id}`}</b> · {changeText(g)} <span className="text-slate-500">— {g.user_name || '—'}</span></p>
                    ))}
                </div>
            )}

            {/* picked workstation: what you can do with it */}
            {picked && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(760px,94vw)] flex flex-wrap items-center gap-2 rounded-xl border-2 border-indigo-400 bg-indigo-50 px-3 py-2 text-sm shadow-lg">
                    <MapPin size={16} className="text-indigo-700" /><span>Picked <b>{picked.name}</b>{pickedLine ? <> on <b>{pickedLine.name}</b></> : ' (not on a line)'} — tap <b>Place here</b> on a line.</span>
                    <span className="ml-auto flex gap-2">
                        {pickedLine && <SecondaryButton onClick={() => place(null)} disabled={busy}><X size={14} /> Take off line</SecondaryButton>}
                        <SecondaryButton onClick={() => setPick(null)}>Cancel</SecondaryButton>
                    </span>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1 mb-3">
                {[['', 'All lines'], ...types.map(t => [t, t])].map(([k, l]) => (
                    <button key={l} type="button" onClick={() => setType(k)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${type === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l}</button>
                ))}
                <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={inactive} onChange={e => setInactive(e.target.checked)} /> show inactive lines</label>
            </div>

            <div className="mb-4 bg-white border border-dashed border-slate-300 rounded-xl p-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Not on a line ({d.unplaced.length})</p>
                {d.unplaced.length === 0 ? <p className="text-sm text-slate-400">Every active workstation is on a line.</p> : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{d.unplaced.map(w => <Chip key={w.id} w={w} picked={pick === w.id} editable={edit} onPick={() => setPick(pick === w.id ? null : w.id)} />)}</div>
                )}
            </div>

            <div className={`grid lg:grid-cols-2 gap-4 ${picked ? 'pb-24' : ''}`}>
                {shown.map(l => {
                    const pct = l.wip_limit_used ? Math.min(100, (l.batches_loaded / l.wip_limit_used) * 100) : 0;
                    const canPlace = edit && picked && picked.is_active && l.is_active && pickedLine?.id !== l.id;
                    return (
                        <section key={l.id} className={`bg-white border rounded-xl ${l.missing.length && l.is_active ? 'border-rose-200' : 'border-slate-200'} ${l.is_active ? '' : 'opacity-60'}`}>
                            <div className="px-3 pt-3 pb-2 border-b border-slate-100">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-black text-slate-900">{l.name}</h2>
                                    <span className="text-xs text-slate-500">{l.line_type}{l.is_job_work ? ' · job work' : ''}{l.is_active ? '' : ' · inactive'}{l.used_by_v3 ? '' : ' · not used by 3.0'}</span>
                                    {canPlace && <PrimaryButton onClick={() => place(l.id)} busy={busy} disabled={busy}><MapPin size={14} /> Place here</PrimaryButton>}
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
                                    <span className="w-28 h-2 rounded-full bg-slate-100 overflow-hidden"><span className={`block h-full ${pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></span>
                                    <span className="tabular-nums font-bold">{l.batches_loaded}{l.wip_limit_used ? ` / ${l.wip_limit_used}` : ''} batch(es)</span>
                                    {l.batch_nos.length > 0 && <span className="truncate">#{l.batch_nos.join(', #')}</span>}
                                    <span className="ml-auto">{l.checkers_today} checker(s) today</span>
                                </div>
                                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                                    <Responsible line={l} kind="SUPERVISOR" people={d.supervisors} editable={edit && !busy} onSet={setResp(l)} />
                                    <Responsible line={l} kind="LOADER" people={d.loaders} editable={edit && !busy} onSet={setResp(l)} />
                                </div>
                            </div>
                            <div className="p-3 space-y-2">
                                {l.workstations.length === 0 ? <p className="text-sm text-slate-400">No workstations — pick one and place it here.</p> : l.workstations.map((w, i) => (
                                    <div key={w.id} className="flex items-center gap-2">
                                        <span className="w-5 text-right text-xs font-black text-slate-400">{i + 1}</span>
                                        <div className="flex-1 min-w-0"><Chip w={w} picked={pick === w.id} editable={edit} onPick={() => setPick(pick === w.id ? null : w.id)}
                                            onUp={() => move(l, i, -1)} onDown={() => move(l, i, 1)} first={i === 0} last={i === l.workstations.length - 1} /></div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
